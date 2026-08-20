// ═══════════════════════════════════════════════════════════════
//  WAY OF BOATS — 02b-merge.js
//  Reconciling one person across many devices.
//
//  THE BUG THIS EXISTS TO FIX
//  --------------------------
//  Sync stores one row per person, with the whole person object as its
//  payload — fish, streaks, stars, logs, notebook, purchases, all of it.
//  When a row arrived, applyItemRow did:
//
//      arr[idx] = data;          // whole-object replace
//
//  That is last-writer-wins across an ENTIRE person. Two devices editing
//  different things about the same person would silently discard each
//  other's work: your laptop catches a fish (22), your phone still thinks
//  you have 21 and checks in a streak, the phone writes 21-fish-plus-streak,
//  and the fish is gone. Repeat across nine people on two devices each and
//  you get 21 / 22 / 23 on three machines and streaks reading zero.
//
//  The earlier `scoreEpoch` guard did NOT cover this. It only fires when the
//  incoming epoch is OLDER than ours, and the epoch is bumped by admin
//  actions alone. In ordinary play both devices carry the same epoch, the
//  guard evaluates false, and the wholesale replace happened anyway. It
//  solved "a stale device undoes an admin reset". It never solved "two
//  devices edit the same person".
//
//  THE FIX
//  -------
//  Merge field by field instead of replacing wholesale, using a declared
//  policy per field:
//
//    · Ledgers  (fish, purchases, stickers, logs) — union, keyed by a stable
//      id. A catch recorded anywhere survives everywhere. Union is
//      order-independent, so every device lands on the same answer no matter
//      what sequence the rows arrive in.
//    · Streaks  — per category, the record with the newer check-in wins, and
//      month tallies take the higher count.
//    · Scalars  (stars, focus minutes, name, colour…) — last write wins by an
//      explicit per-field timestamp, not by whoever's row happened to land
//      last. This also lets an admin set a value DOWN and have it stick.
//
//  Timestamps are stamped centrally at push time by diffing against the last
//  known snapshot, so no mutation site anywhere else has to remember to do it.
// ═══════════════════════════════════════════════════════════════

/** How two versions of a single field get reconciled. */
class MergeStrategy {
  constructor(name, fn) { this.name = name; this.apply = fn; }

  /** Union two arrays of objects, keyed by a stable identity. */
  static unionById(identity) {
    return new MergeStrategy('unionById', (a, b) => {
      const out = [], seen = new Set();
      [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].forEach(item => {
        if (!item) return;
        const k = identity(item);
        if (seen.has(k)) return;
        seen.add(k);
        out.push(item);
      });
      return out;
    });
  }

  /** Union two arrays of primitives. */
  static unionSet() {
    return new MergeStrategy('unionSet', (a, b) =>
      [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])]);
  }

  /** Merge two maps key by key, handing collisions to `resolve`. */
  static byKey(resolve) {
    return new MergeStrategy('byKey', (a, b) => {
      const A = a && typeof a === 'object' ? a : {};
      const B = b && typeof b === 'object' ? b : {};
      const out = {};
      new Set([...Object.keys(A), ...Object.keys(B)]).forEach(k => {
        out[k] = (k in A && k in B) ? resolve(A[k], B[k], k) : (k in A ? A[k] : B[k]);
      });
      return out;
    });
  }

  /** Whichever number is larger. Only for values that climb in normal use. */
  static maxNumber() {
    return new MergeStrategy('maxNumber', (a, b) => Math.max(Number(a) || 0, Number(b) || 0));
  }

  /**
   * Last write wins, decided by the field's own timestamp rather than by row
   * arrival order. Ties break on the larger serialisation so that every
   * device reaches the same answer independently.
   */
  static lastWrite() {
    return new MergeStrategy('lastWrite', (a, b, ta = 0, tb = 0) => {
      if (tb > ta) return b;
      if (ta > tb) return a;
      const sa = JSON.stringify(a === undefined ? null : a);
      const sb = JSON.stringify(b === undefined ? null : b);
      return sb > sa ? b : a;
    });
  }
}

// ── identities ──────────────────────────────────────────────
// Legacy records carry no uid, so it's derived from their contents. Two
// devices holding the same old fish derive the same key and dedupe correctly.
/**
 * What a record IS, ignoring any id already written to it.
 *
 * Returns null when the record carries nothing identifying at all. Two such
 * records would otherwise produce the same key and one would be deleted as a
 * duplicate — dropping real data to fix a duplication bug is a worse outcome
 * than leaving a duplicate in place, so anything unidentifiable is kept.
 */
function fishContentKey(f) {
  if (!f) return null;
  const bits = [f.emoji, f.name, f.minutes, f.at].filter(v => v !== undefined && v !== null && v !== '');
  if (!bits.length) return null;
  return ['f', f.emoji, f.name, f.minutes, f.at].join('|');
}
function purchaseContentKey(x) {
  // one purchase per shop item, so the item id is the identity
  return 'p|' + String((x && x.id) || [x && x.name, x && x.at].join('|'));
}
let unidentifiedSeq = 0;
function fishIdentity(f) { return (f && f.uid) || fishContentKey(f) || ('f?' + (++unidentifiedSeq)); }
function purchaseIdentity(x) { return (x && x.uid) || purchaseContentKey(x); }

/**
 * Give every catch a stable id so unions can dedupe it. Safe to re-run.
 *
 * ⚠️ The id must depend ONLY on the record's contents — never on its position.
 * An earlier version appended the array index, which meant the same purchase
 * got `…|0` on one device and `…|3` on another. The union saw two different
 * keys and kept both; the array grew, indices shifted, and the next merge
 * produced more mismatches again. That compounding is what duplicated
 * everyone's purchases eight times over.
 */
function ensureRecordUids(p) {
  if (!p) return p;
  if (Array.isArray(p.fish)) {
    p.fish.forEach(f => { if (f && !f.uid) f.uid = fishIdentity(f); });
  }
  if (Array.isArray(p.purchases)) {
    p.purchases.forEach(x => { if (x && !x.uid) x.uid = purchaseIdentity(x); });
  }
  return p;
}

/**
 * Collapse duplicates that the index-suffix bug already wrote to people's
 * accounts. Runs on load; harmless once everything is clean.
 *
 *  · purchases — one per shop item, always. buyMarketItem already refuses a
 *    second copy, so any repeat is corruption.
 *  · stickers  — a set of ids.
 *  · fish      — by content. Two real catches never share a millisecond, so
 *    matching `at` means it's the same catch written twice.
 */
function repairDuplicates(p) {
  if (!p) return 0;
  let removed = 0;

  // Repair deliberately keys on CONTENT and ignores whatever uid is stored,
  // because the records already corrupted carry index-suffixed ids — trusting
  // those would let the duplicates survive the very pass meant to remove them.
  if (Array.isArray(p.purchases)) {
    const seen = new Set(), keep = [];
    p.purchases.forEach(x => {
      const k = purchaseContentKey(x);
      if (seen.has(k)) { removed++; return; }
      seen.add(k);
      if (x) x.uid = k;                     // rewrite the bad id while we're here
      keep.push(x);
    });
    p.purchases = keep;
  }

  if (Array.isArray(p.stickers)) {
    const before = p.stickers.length;
    p.stickers = [...new Set(p.stickers)];
    removed += before - p.stickers.length;
  }
  if (Array.isArray(p.activeStickers)) {
    p.activeStickers = [...new Set(p.activeStickers)];
  }

  if (Array.isArray(p.fish)) {
    const seen = new Set(), keep = [];
    p.fish.forEach(f => {
      const k = fishContentKey(f);
      if (k === null) { keep.push(f); return; }   // unidentifiable — never drop it
      if (seen.has(k)) { removed++; return; }
      seen.add(k);
      f.uid = k;
      keep.push(f);
    });
    p.fish = keep;
  }

  ensureRecordUids(p);
  return removed;
}

/** Sweep every person once, and report what it cleaned. */
function repairAllPeople() {
  let total = 0;
  (state.people || []).forEach(p => { total += repairDuplicates(p); });
  return total;
}

// ── streaks ─────────────────────────────────────────────────
/**
 * One World Cup category, seen by two devices.
 *
 * The record with the more recent check-in is the more current one; month
 * tallies only ever climb, so they take the higher of the two; and the streak
 * takes the higher figure, because a device that is behind can only ever
 * under-report it. reconcileStreaks() still zeroes a genuinely broken streak
 * afterwards, using `last` — which the merge has just made correct.
 */
function mergeWcCategory(a, b) {
  if (!a) return b;
  if (!b) return a;
  const aLast = a.last || '', bLast = b.last || '';
  const base = bLast > aLast ? { ...b } : bLast < aLast ? { ...a }
             : ((a.streak || 0) >= (b.streak || 0) ? { ...a } : { ...b });

  const counts = { ...(a.monthCounts || {}) };
  Object.entries(b.monthCounts || {}).forEach(([k, v]) => {
    counts[k] = Math.max(counts[k] || 0, Number(v) || 0);
  });
  base.monthCounts = counts;
  base.monthFish = { ...(a.monthFish || {}), ...(b.monthFish || {}) };
  // NOT max: after a lapse and a fresh check-in the true streak is legitimately
  // SMALLER (12 → 1), and taking the bigger number would resurrect the old run.
  // The record with the more recent check-in is the one that knows.
  base.streak = (bLast > aLast) ? (b.streak || 0)
              : (aLast > bLast) ? (a.streak || 0)
              : Math.max(a.streak || 0, b.streak || 0);
  base.last = bLast > aLast ? bLast : aLast;
  if (Array.isArray(a.fixedOn) || Array.isArray(b.fixedOn)) {
    base.fixedOn = [...new Set([...(a.fixedOn || []), ...(b.fixedOn || [])])];
  }
  return base;
}

/** One day's log, seen by two devices: union the entries by id. */
function mergeLogDay(a, b) {
  if (!a) return b;
  if (!b) return a;
  const entries = [], seen = new Set();
  [...(a.entries || []), ...(b.entries || [])].forEach(e => {
    const k = String(e && e.id);
    if (seen.has(k)) return;
    seen.add(k);
    entries.push(e);
  });
  entries.sort((x, y) => (x.startMin || 0) - (y.startMin || 0));
  const edited = !!(a.edited || b.edited);
  return { ...(b.editedAt > a.editedAt ? b : a), entries, edited };
}

/**
 * Some singletons are maps keyed by personId — everyone's World Cup categories
 * in one object, everyone's meeting templates in another. They were being
 * replaced wholesale on arrival, so a device holding a stale or empty copy
 * could wipe out categories other people had carefully customised.
 *
 * Each person owns their own entry: we keep ours for ourselves and accept
 * theirs for everyone else. Nothing is ever deleted — a key missing from the
 * incoming copy stays put.
 */
function mergePersonKeyedMap(local, incoming) {
  // the legacy shape was a flat array shared by everyone; prefer whichever
  // side has already moved to the per-person object
  if (Array.isArray(local) && !Array.isArray(incoming)) return incoming || local;
  if (Array.isArray(incoming) && !Array.isArray(local)) return local || incoming;
  if (Array.isArray(local) && Array.isArray(incoming)) return incoming.length ? incoming : local;

  const me = (typeof myPersonId === 'function') ? myPersonId() : null;
  const admin = (typeof isAdmin === 'function') && isAdmin();
  const out = { ...(local || {}) };
  Object.entries(incoming || {}).forEach(([pid, val]) => {
    if (!admin && me && String(pid) === String(me) && out[pid]) return;  // mine
    out[pid] = val;
  });
  return out;
}

/** Singletons that must never be replaced wholesale. */
const PERSON_KEYED_SINGLETONS = { wcCategories: true, personTemplates: true };

// ── the policy ──────────────────────────────────────────────
/** Fields carrying a per-field timestamp, stamped centrally at push time. */
const TS_FIELDS = ['name', 'color', 'stars', 'pomoMinutes', 'pomoSessions',
                   'pointsAdjust', 'activeStickers', 'planning', 'streakFixers',
                   'socks', 'scoreEpoch', 'timerLock'];

const PERSON_POLICY = {
  fish:        MergeStrategy.unionById(fishIdentity),
  purchases:   MergeStrategy.unionById(purchaseIdentity),
  stickers:    MergeStrategy.unionSet(),
  pendingCatches: MergeStrategy.unionById(c => String(c && c.id)),
  // ids of catches already reeled in — the tombstones that stop a union from
  // handing an opened catch back
  openedCatches: MergeStrategy.unionSet(),
  // uids of catches already spent in the shop or sold to the bank. Union, so a
  // purchase can never be reversed by a device that hasn't heard about it.
  spentFish:     MergeStrategy.unionSet(),
  wc:          MergeStrategy.byKey(mergeWcCategory),
  logs:        MergeStrategy.byKey(mergeLogDay),
};

class PersonMerger {
  constructor(policy, tsFields) {
    this.policy = policy;
    this.tsFields = tsFields;
    this.fallback = MergeStrategy.lastWrite();
  }

  /**
   * Note what changed on this person, so the other side can tell which of two
   * conflicting values is actually the newer one. Called once at push time
   * rather than at every mutation site.
   */
  stamp(person, previousJson) {
    if (!person) return person;
    let prev = null;
    try { prev = previousJson ? JSON.parse(previousJson) : null; } catch (e) {}
    const now = Date.now();
    if (!person._ts || typeof person._ts !== 'object') person._ts = {};
    this.tsFields.forEach(f => {
      const cur = JSON.stringify(person[f] === undefined ? null : person[f]);
      const old = prev ? JSON.stringify(prev[f] === undefined ? null : prev[f]) : undefined;
      if (cur !== old) person._ts[f] = now;
    });
    return person;
  }

  /**
   * A row stamped BEFORE our copy is a ghost from a device that hasn't heard
   * about an admin correction yet. Take its harmless parts — logs, notebook,
   * name — but keep our scores, or the union would quietly restore whatever
   * the admin just took away. (A streak set down to 14 was losing to a stale
   * device still claiming 99, because the merge takes the higher of the two.)
   */
  mergeStale(local, incoming) {
    const merged = this.merge(local, incoming);
    PersonMerger.SCORE_FIELDS.forEach(f => {
      if (local && Object.prototype.hasOwnProperty.call(local, f)) merged[f] = local[f];
      else delete merged[f];
    });
    return merged;
  }

  /** Reconcile our copy of a person with one that arrived from elsewhere. */
  merge(local, incoming) {
    if (!local) return ensureRecordUids({ ...incoming });
    if (!incoming) return local;

    const out = { ...local, ...incoming };   // unknown//new fields follow the sender
    const lts = local._ts || {}, its = incoming._ts || {};

    Object.entries(this.policy).forEach(([field, strategy]) => {
      out[field] = strategy.apply(local[field], incoming[field]);
    });

    this.tsFields.forEach(f => {
      out[f] = this.fallback.apply(local[f], incoming[f], lts[f] || 0, its[f] || 0);
    });

    out._ts = {};
    new Set([...Object.keys(lts), ...Object.keys(its)]).forEach(k => {
      out._ts[k] = Math.max(lts[k] || 0, its[k] || 0);
    });

    // A catch opened on one device was being resurrected by the union from a
    // device that hadn't seen it opened — so it reappeared on the line and
    // could be reeled in a second time, paying out twice. Tombstones win.
    if (Array.isArray(out.openedCatches) && out.openedCatches.length) {
      const gone = new Set(out.openedCatches.map(String));
      out.pendingCatches = (out.pendingCatches || []).filter(c => !gone.has(String(c && c.id)));
      if (out.openedCatches.length > 300) out.openedCatches = out.openedCatches.slice(-300);
    }

    repairDuplicates(out);
    return out;
  }
}

/** What an admin correction owns outright. */
PersonMerger.SCORE_FIELDS = ['fish', 'stars', 'pomoMinutes', 'pomoSessions', 'wc',
                             'pointsAdjust', 'scoreEpoch', 'streakFixers', 'socks',
                             'stickers', 'activeStickers', 'purchases'];

const PEOPLE_MERGER = new PersonMerger(PERSON_POLICY, TS_FIELDS);

// ═══════════════════════════════════════════════════════════════
//  ID-KEYED LISTS  (projects, timeline points, shop items, activity
//  types, meeting templates, project statuses)
//
//  These sync as SINGLETONS — one row holding the whole array — and were
//  being replaced wholesale on arrival, exactly like person rows used to be.
//  Two people adding books at the same time meant one array overwrote the
//  other and somebody's project simply vanished.
//
//  They now merge item by item:
//    · union by id, so nothing is lost
//    · when both sides hold the same id, the one edited more recently wins
//    · a deleted item stays deleted, via a tombstone — otherwise the union
//      would helpfully hand back everything anyone ever removed
// ═══════════════════════════════════════════════════════════════

/** Deletions we must not undo. `{ "projects:pj1": 1699999999999 }` */
function tombstones() {
  if (!state._graves || typeof state._graves !== 'object') state._graves = {};
  return state._graves;
}
function markDeleted(kind, id) {
  tombstones()[kind + ':' + id] = Date.now();
  pruneTombstones();
}
function isDeleted(kind, id) {
  return Object.prototype.hasOwnProperty.call(tombstones(), kind + ':' + id);
}
/** Forget graves older than 90 days so the record can't grow without bound. */
function pruneTombstones() {
  const cutoff = Date.now() - 90 * 86400000;
  const g = tombstones();
  Object.keys(g).forEach(k => { if ((g[k] || 0) < cutoff) delete g[k]; });
}
function mergeTombstones(local, incoming) {
  const out = { ...(local || {}) };
  Object.entries(incoming || {}).forEach(([k, v]) => {
    out[k] = Math.max(out[k] || 0, Number(v) || 0);
  });
  return out;
}

/**
 * Note which items changed, so the far end can tell a newer edit from an older
 * one. Stamped centrally at push time, the same way person scalars are.
 */
function stampIdList(kind, arr, previousJson) {
  if (!Array.isArray(arr)) return arr;
  let prev = null;
  try { prev = previousJson ? JSON.parse(previousJson) : null; } catch (e) {}
  const prevById = {};
  if (Array.isArray(prev)) prev.forEach(it => { if (it && it.id != null) prevById[String(it.id)] = it; });
  const now = Date.now();
  arr.forEach(it => {
    if (!it || it.id == null) return;
    const old = prevById[String(it.id)];
    const a = JSON.stringify({ ...it, _ts: 0 });
    const b = old ? JSON.stringify({ ...old, _ts: 0 }) : null;
    if (a !== b) it._ts = now;
    else if (!it._ts && old) it._ts = old._ts || 0;
  });
  return arr;
}

function mergeIdList(kind, local, incoming) {
  const byId = new Map();
  const consider = arr => (Array.isArray(arr) ? arr : []).forEach(it => {
    if (!it || it.id == null) return;
    const key = String(it.id);
    if (isDeleted(kind, key)) return;               // someone removed it; stay removed
    const held = byId.get(key);
    if (!held || (it._ts || 0) > (held._ts || 0)) byId.set(key, it);
  });
  consider(local);
  consider(incoming);
  return [...byId.values()];
}

/** Singletons that are id-keyed lists rather than single values. */
const ID_LIST_SINGLETONS = {
  projects: true, tlPoints: true, storeItems: true,
  activityTypes: true, templates: true, projectStatuses: true,
};
