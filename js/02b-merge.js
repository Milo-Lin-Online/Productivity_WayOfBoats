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
function fishIdentity(f) {
  if (f && f.uid) return f.uid;
  return ['f', f && f.emoji, f && f.name, f && f.minutes, f && f.at].join('|');
}
function purchaseIdentity(x) {
  if (x && x.uid) return x.uid;
  return ['p', x && x.id, x && x.at].join('|');
}

/** Give every catch a stable id so unions can dedupe it. Safe to re-run. */
function ensureRecordUids(p) {
  if (!p) return p;
  if (Array.isArray(p.fish)) {
    p.fish.forEach((f, i) => { if (f && !f.uid) f.uid = fishIdentity(f) + '|' + i; });
  }
  if (Array.isArray(p.purchases)) {
    p.purchases.forEach((x, i) => { if (x && !x.uid) x.uid = purchaseIdentity(x) + '|' + i; });
  }
  return p;
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
  base.streak = Math.max(a.streak || 0, b.streak || 0);
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

// ── the policy ──────────────────────────────────────────────
/** Fields carrying a per-field timestamp, stamped centrally at push time. */
const TS_FIELDS = ['name', 'color', 'stars', 'pomoMinutes', 'pomoSessions',
                   'pointsAdjust', 'activeStickers', 'planning', 'streakFixers',
                   'socks', 'scoreEpoch', 'wcCategories', 'timerLock'];

const PERSON_POLICY = {
  fish:        MergeStrategy.unionById(fishIdentity),
  purchases:   MergeStrategy.unionById(purchaseIdentity),
  stickers:    MergeStrategy.unionSet(),
  pendingCatches: MergeStrategy.unionById(c => String(c && c.id)),
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

    return ensureRecordUids(out);
  }
}

const PEOPLE_MERGER = new PersonMerger(PERSON_POLICY, TS_FIELDS);
