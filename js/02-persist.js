// ═══════════════════════════════════════════════════════════════
//  WAY OF BOATS — 02-persist.js
//  Saving, app-update checks, and the Supabase sync engine
//
//  Loaded in numbered order by index.html. These are classic scripts,
//  not ES modules, so every function stays global and the inline
//  onclick= handlers in the markup keep working unchanged.
// ═══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════
// PERSIST  (local + optional Supabase live sync, PER-ITEM rows)
// ══════════════════════════════════════════════
let sb = null;            // supabase client
let sbChannel = null;     // realtime channel
let sbConfig = null;      // { url, key, room }
let applyingRemote = false; // guard so remote writes don't echo back
let pushTimer = null;

// ═══════════════════════════════════════════════════════════════
//  EXPLICIT SAVE
//
//  Autosave pushed on a debounce, and every push is billed once per connected
//  client — 18 of them here. Ordinary typing was costing thousands of messages
//  a day to tell seventeen people about a note they can't see.
//
//  save() still writes to localStorage every time, so nothing is ever lost.
//  What it no longer does is tell the room. That happens when you press Save,
//  when something touches money or score (those go at once), or after a few
//  minutes idle as a backstop.
// ═══════════════════════════════════════════════════════════════
let pendingPush = false;
const IDLE_PUSH_MS = 180000;   // 3 minutes — a safety net, not the mechanism
let idlePushTimer = null;

function markUnsaved() {
  pendingPush = true;
  renderSaveButton();
  clearTimeout(idlePushTimer);
  idlePushTimer = setTimeout(() => { if (pendingPush) pushNow(true); }, IDLE_PUSH_MS);
}

/** Send everything that has changed. Called by the Save button and by pushNow. */
function pushNow(quiet) {
  clearTimeout(idlePushTimer);
  clearTimeout(pushTimer);
  pendingPush = false;
  renderSaveButton();
  pushChangedItems();
  if (!quiet) showToast('☁️ Saved for everyone');
}

/**
 * For anything that moves money or score — a catch, a purchase, a check-in, an
 * admin correction. Waiting on a button for these would be a bug, not a saving.
 */
function saveNow() {
  save();
  pushNow(true);
}

function renderSaveButton() {
  const btn = document.getElementById('save-btn');
  if (!btn) return;
  btn.classList.toggle('dirty', pendingPush);
  btn.textContent = pendingPush ? '☁️ Save changes' : '✓ All saved';
  btn.title = pendingPush
    ? 'You have changes only on this device. Press to send them to everyone.'
    : 'Everything on this device has been shared with the room.';
}

// ═══════════════════════════════════════════════════════════════
//  A BACKGROUND TAB COSTS THE WHOLE TEAM
//
//  Billing counts one message per LISTENING client. A tab sitting behind
//  another window, doing nothing, is still a listener — so every edit anyone
//  makes is billed for it. With nine people on two devices, roughly half the
//  clients are idle background tabs at any moment, and they were quietly
//  doubling everyone's bill.
//
//  So an idle hidden tab leaves the channel. It stops receiving, stops being
//  counted, and gives back a concurrent connection. It rejoins and pulls fresh
//  the moment you look at it again.
//
//  A tab running a pomodoro stays connected, because it has a session to
//  report when the timer ends.
// ═══════════════════════════════════════════════════════════════
const IDLE_UNSUB_MS = 60000;   // a minute out of sight before we hang up
let idleUnsubTimer = null;
let napping = false;

function tabIsBusy() {
  try { if (typeof pomoRunning !== 'undefined' && pomoRunning) return true; } catch (e) {}
  return false;
}

/** Called when a timer ends, so a hidden tab can report in and then sleep. */
function releaseTabIfIdle() {
  if (document.hidden && !tabIsBusy() && sbConfig) {
    clearTimeout(idleUnsubTimer);
    idleUnsubTimer = setTimeout(napChannel, 5000);
  }
}

async function napChannel() {
  if (napping || !sbChannel || tabIsBusy()) return;
  if (pendingPush) { try { pushChangedItems(); } catch (e) {} }  // don't sleep on unsent work
  napping = true;
  try { await sb.removeChannel(sbChannel); } catch (e) {}
  sbChannel = null;
  renderSyncStatus('napping');
}

async function wakeChannel() {
  clearTimeout(idleUnsubTimer);
  if (!napping) return;
  napping = false;
  renderSyncStatus('waking');
  try {
    // A hard refresh, not a reconnect.
    //
    // Coming back after an hour, this tab may be holding a half-dragged
    // sticker, an open book that someone has since deleted, a modal over a
    // meeting that no longer exists. Forgetting what we thought the server had
    // forces a clean pull, and clearing the transient UI means nothing from
    // before the nap can survive into the new picture.
    lastSnapshot = {};
    resetTransientUI();
    await startSync();
    renderAll();
    renderSyncStatus('');
    showToast('↻ Caught up');
  } catch (e) { renderSyncStatus(''); }
}

document.addEventListener('visibilitychange', () => {
  if (!sbConfig) return;
  if (document.hidden) {
    clearTimeout(idleUnsubTimer);
    idleUnsubTimer = setTimeout(napChannel, IDLE_UNSUB_MS);
  } else {
    wakeChannel();
  }
});

/**
 * Drop anything half-finished before redrawing from fresh data.
 *
 * Every one of these is a handle onto something that may no longer exist:
 * a book that was deleted while we slept, a point being edited, a sticker
 * mid-drag. Left alone they render as ghosts.
 */
function resetTransientUI() {
  document.querySelectorAll('.modal-overlay').forEach(m => { m.style.display = 'none'; });
  const safe = fn => { try { fn(); } catch (e) {} };
  safe(() => { if (typeof bookOpenId !== 'undefined') bookOpenId = null; });
  safe(() => { if (typeof editingProjectId !== 'undefined') editingProjectId = null; });
  safe(() => { if (typeof editingPointId !== 'undefined') editingPointId = null; });
  safe(() => { if (typeof editingTaskId !== 'undefined') editingTaskId = null; });
  safe(() => { if (typeof armedItem !== 'undefined') armedItem = null; });
  safe(() => { if (typeof decorDrag !== 'undefined') decorDrag = null; });
  safe(() => { if (typeof decorMode !== 'undefined') decorMode = false; });
  safe(() => { if (typeof pendingOffer !== 'undefined') pendingOffer = null; });
  safe(() => { if (typeof tlPan !== 'undefined') tlPan = null; });
  safe(() => { if (typeof streakEditPid !== 'undefined') streakEditPid = null; });
  // ⚠️ NOT every .remote-cursor — my own boat uses that class too, and wiping
  // it left people unable to see their own pointer. Drop other people's only.
  safe(() => document.querySelectorAll('.remote-cursor').forEach(el => {
    if (el !== (typeof myLabelEl !== 'undefined' ? myLabelEl : null)) el.remove();
  }));
  safe(() => document.body.classList.remove('decor-dragging'));
}

/** Small helper so the sidebar can say what the connection is doing. */
function renderSyncStatus(mode) {
  const el = document.getElementById('sync-nap');
  if (!el) return;
  el.textContent = mode === 'napping' ? '😴 sleeping (saves messages)'
                 : mode === 'waking'  ? '↻ reconnecting…' : '';
  el.style.display = (mode === 'napping' || mode === 'waking') ? 'block' : 'none';
}

// don't let someone close the tab on unsent work
window.addEventListener('beforeunload', (e) => {
  if (!pendingPush) return;
  try { pushChangedItems(); } catch (err) {}
});
// 300ms meant a flurry of typing became a flurry of separate pushes, and every
// push is fanned out to every connected client. Two seconds coalesces a burst
// into one message; nobody notices the extra second and a half.
const PUSH_DEBOUNCE_MS = 2000;

// Collections stored one-row-per-element (keyed by their .id).
// Bump this string on every deploy — the update checker compares it against the
// copy sitting on the server to tell a phone its cached build is out of date.
// Mirrors <meta name="app-version"> in index.html, so the loader's cache-bust
// query and the update checker always agree. Bump the meta tag on deploy.
const APP_VERSION = (document.querySelector('meta[name="app-version"]') || {}).content || '0.0.0';

const ITEM_COLLECTIONS = ['people', 'tasks', 'meetings', 'events', 'posts', 'messages'];
// Singletons stored as a single row each.
const SINGLETONS = ['_graves', 'templates', 'activityTypes', 'wcCategories', 'personTemplates', 'wsName', 'wsSub', 'scoreEpoch', 'storeItems', 'storeEnabled'];

// A snapshot of what we last saw, so save() can push only what changed.
let lastSnapshot = {};
function snapshotOf(obj) { return JSON.stringify(obj); }

// ══════════════════════════════════════════════
// APP UPDATES  (phones can't hard-refresh)
// ══════════════════════════════════════════════
// A phone will happily keep serving a cached copy of this file forever. There's
// no reload-ignoring-cache gesture on mobile Safari, so instead we (a) ask the
// server for our own file with cache:'no-store', (b) compare the APP_VERSION
// baked into it against the one running, and (c) offer a one-tap reload that
// clears every cache we can reach and busts the URL with a fresh query string.
async function checkForUpdate(announce) {
  try {
    // Strip any existing query/hash rather than using location.pathname —
    // on a GitHub project site (/user.github.io/repo) pathname can lose the
    // trailing slash and the fetch 404s or redirects.
    const base = location.href.split('#')[0].split('?')[0];
    const url = base + (base.includes('?') ? '&' : '?') + '_cb=' + Date.now();
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return false;
    const txt = await res.text();
    // read the version straight out of the served index.html's meta tag
    const m = txt.match(/name="app-version"\s+content="([^"]+)"/);
    if (!m) return false;
    if (m[1] !== APP_VERSION) {
      // Try to just... fix it. Reload straight into the new build rather than
      // waiting for someone to notice a banner.
      //
      // The guard matters: if the host is still handing out the old file, the
      // reload won't change anything, and without this we'd loop forever. We
      // only auto-reload ONCE per version per tab; the second time we admit
      // defeat and show the banner with an explanation.
      let tried = null;
      try { tried = sessionStorage.getItem('boats_autoupdate'); } catch (e) {}
      const banner = document.getElementById('update-banner');
      const msg = document.getElementById('update-msg');

      if (tried !== m[1]) {
        try { sessionStorage.setItem('boats_autoupdate', m[1]); } catch (e) {}
        showToast('⟳ New version (' + m[1] + ') found — updating…');
        setTimeout(forceUpdate, 700);
        return true;
      }

      if (msg) {
        msg.textContent = `Version ${m[1]} is on the server but this device keeps loading ${APP_VERSION}. ` +
                          `Your host is caching index.html — tap Update, or see cache-headers in the folder.`;
      }
      if (banner) banner.style.display = 'flex';
      return true;
    }
    if (announce) showToast('✅ You already have the newest version (' + APP_VERSION + ')');
    return false;
  } catch (e) { return false; }
}

// Wipe every cache this device might be holding, then reload from a URL the
// cache has never seen.
async function forceUpdate() {
  showToast('Fetching the newest version…');
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  } catch (e) {}
  try {
    if (window.caches && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch (e) {}
  // Note: app DATA in localStorage is deliberately left alone — this clears the
  // cached program, not the crew's work.
  const base = location.href.split('#')[0].split('?')[0];
  setTimeout(() => { location.replace(base + '?v=' + Date.now()); }, 250);
}

/**
 * Every module this build expects. If one is missing the loader list in
 * index.html is out of step with the js/ folder — which breaks features in
 * confusing, scattered ways rather than failing loudly.
 */
// Sentinels must be FUNCTION declarations — those land on `window`. A
// top-level `const` lives in script scope and would look missing when it isn't.
const REQUIRED_GLOBALS = {
  '02b-merge': 'repairAllPeople', '04-meetings': 'renderMeetings',
  '07-worldcup': 'wcEffectiveStreak', '13-pomodoro': 'rollGacha',
  '17-focus-bank': 'openCatch', '18b-timeline': 'renderTlBoard',
  '20-bank': 'bankBalance', '21-decor': 'decorLayer',
};
function checkBuildIntegrity() {
  const missing = Object.entries(REQUIRED_GLOBALS)
    .filter(([, fn]) => typeof window[fn] === 'undefined')
    .map(([mod]) => mod);
  if (missing.length) {
    console.error('[boats] MODULES MISSING:', missing.join(', '),
      '\n  index.html\'s loader list does not match the js/ folder.');
    const el = document.getElementById('app-version');
    if (el) {
      el.innerHTML += `<div style="color:var(--sail-red);font-weight:800;margin-top:2px">
        ⚠️ ${missing.length} module(s) missing</div>`;
      el.title = 'Missing: ' + missing.join(', ');
    }
  }
  return missing;
}

/** What this device is actually running. Paste-able, for diagnosing remotely. */
function buildReport() {
  const r = {
    version: APP_VERSION,
    missingModules: checkBuildIntegrity(),
    meetingsLocal: (state.meetings || []).length,
    peopleLocal: (state.people || []).length,
    syncConfigured: !!sbConfig,
    syncReady: typeof syncReady !== 'undefined' ? syncReady : null,
    channel: sbChannel ? 'connected' : 'none',
    room: sbConfig ? sbConfig.room : null,
    privateRoom: sbConfig ? (typeof privateRoom === 'function' ? privateRoom() : 'n/a') : null,
    snapshotKeys: Object.keys(lastSnapshot).length,
    localStorageKB: Math.round((localStorage.getItem(STORAGE_KEY) || '').length / 1024),
  };
  console.log('%c[boats] build report', 'font-weight:bold', r);
  return JSON.stringify(r, null, 2);
}

function renderAppVersion() {
  // ⚠️ Do not remove or gate this. It is how anyone tells which build a device
  // is actually running, which has settled more arguments in this project than
  // any other single line. If the sidebar element is missing it is recreated.
  let el = document.getElementById('app-version');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-version';
    el.style.cssText = 'font-size:9px;font-weight:700;text-align:center;color:var(--ink-light);opacity:.7;margin-top:4px';
    (document.querySelector('.sidebar') || document.body).appendChild(el);
  }
  if (el) el.textContent = 'v' + APP_VERSION;
}

// ══════════════════════════════════════════════
// SYNC SAFETY: never let a stale device overwrite the room
// ══════════════════════════════════════════════
// Nothing is pushed until we've pulled the room once. Without this, a phone
// waking up with a month-old cache would fire its whole stale state at the
// server on the first save() — which is exactly how deleted tasks and cleared
// fish came back to life.
let syncReady = false;
let correctiveTimer = null;

// Fields the admin owns. A person row stamped with an older epoch than the
// room's current one is stale, and its scores are ignored.
const SCORE_FIELDS = ['fish', 'stars', 'pomoMinutes', 'pomoSessions', 'wc', 'pointsAdjust', 'scoreEpoch',
                      'streakFixers', 'stickers', 'activeStickers', 'purchases'];
// Personal work that a stale device must never overwrite. Logs and the notebook
// belong to whoever wrote them, so an old cached copy can only ADD days we don't
// have — never replace the ones we do. (This is what was wiping today's log.)
const PERSONAL_FIELDS = ['logs', 'planning'];
function currentEpoch() { return state.scoreEpoch || 0; }
function rowEpoch(d) { return (d && d.scoreEpoch) || 0; }
function isStaleScoreRow(d) { return rowEpoch(d) < currentEpoch(); }
function mergeKeepingLocalScores(localP, incoming) {
  const merged = { ...incoming };
  if (!localP) return merged;
  SCORE_FIELDS.forEach(f => { merged[f] = localP[f]; });
  // keep our own logs, but adopt any day the stale copy has that we don't
  const localLogs = localP.logs || {};
  const inLogs = (incoming && incoming.logs) || {};
  const logs = { ...localLogs };
  Object.keys(inLogs).forEach(k => { if (!logs[k]) logs[k] = inLogs[k]; });
  merged.logs = logs;
  merged.planning = localP.planning || (incoming && incoming.planning);
  return merged;
}
// Admin actions stamp a new epoch so every other device knows the old numbers
// are void, even if it reconnects days later.
function bumpScoreEpoch(people) {
  state.scoreEpoch = Date.now();
  (people || visiblePeople()).forEach(p => { p.scoreEpoch = state.scoreEpoch; });
}

// Item ids are timestamps, so we can tell genuinely-new offline work apart from
// zombies that a stale cache is holding on to.
function itemCreatedAt(el) {
  const digits = String((el && el.id) != null ? el.id : '').replace(/[^0-9]/g, '');
  const n = parseInt(digits.slice(0, 13), 10);
  return (n > 1420070400000 && n < 4102444800000) ? n : 0;   // 2015 … 2100
}
function lastSyncAt() { return parseInt(localStorage.getItem('boats_last_sync') || '0', 10) || 0; }

function scheduleCorrectivePush() {
  clearTimeout(correctiveTimer);
  correctiveTimer = setTimeout(() => { pushChangedItems(); }, 600);
}

function save() {
  // always keep a local copy (full state)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  localStorage.setItem(STORAGE_KEY + '_broadcast', Date.now());
  if (sb && !applyingRemote) {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushChangedItems, PUSH_DEBOUNCE_MS);
  }
}

/**
 * Write locally but say nothing yet.
 *
 * Only the notebook uses this. Planning is long-form typing that nobody else
 * is waiting on, so telling eighteen clients about every sentence is pure
 * waste — it waits for the Save button. Everything else still syncs on its own,
 * because a task or a check-in someone is watching for should just appear.
 */
function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  localStorage.setItem(STORAGE_KEY + '_broadcast', Date.now());
  if (sb && !applyingRemote) markUnsaved();
}

// ═══════════════════════════════════════════════════════════════
//  PRIVATE ROWS
//
//  Books and their timelines are yours alone — nobody else's screen ever shows
//  them. But they were stored in the shared room, so every edit was delivered
//  to all eighteen clients, seventeen of which threw it away. Billed all the
//  same.
//
//  Realtime filters run server-side and can only test equality, so there's no
//  way to say "everything except the private keys". What there IS is the room
//  value itself: private rows are written under `<room>#<personId>`, and a
//  client only ever subscribes to the shared room plus its own. Other people's
//  book edits are never delivered, so they are never counted.
//
//  Cost of a book edit, to everyone else: zero.
// ═══════════════════════════════════════════════════════════════
const PRIVATE_KEYS = ['single:projects', 'single:tlPoints'];

function isPrivateKey(k) { return PRIVATE_KEYS.includes(k); }
function privateRoom(pid) {
  const who = pid || (typeof myPersonId === 'function' ? myPersonId() : null);
  // ⚠️ NOT '#'. A hash is a URL fragment delimiter, so
  // `?room=in.(ourcrew,ourcrew#p1)` was silently truncated to
  // `?room=in.(ourcrew` — the query failed, sync fell back to local-only, and
  // every refresh looked like the connection had been lost.
  return who ? sbConfig.room + '__' + who : null;
}
/** Which room a given row belongs in. */
function roomFor(itemKey) {
  if (!isPrivateKey(itemKey)) return sbConfig.room;
  return privateRoom() || sbConfig.room;   // no name yet — keep it shared rather than lose it
}

// Build the map of item_key -> data for the whole state.
function buildItemMap() {
  const map = {};
  ITEM_COLLECTIONS.forEach(coll => {
    (state[coll] || []).forEach(el => {
      if (el && el.id != null) map[coll + ':' + el.id] = el;
    });
  });
  SINGLETONS.forEach(key => { map['single:' + key] = state[key]; });
  return map;
}

/**
 * May this device write this row?
 *
 * Person rows belong to the person. Yours is yours to change; everyone else's
 * is read-only here, however out of date your copy is. The admin account is the
 * exception, since resets and corrections have to reach every account.
 * Non-person rows (tasks, meetings, posts) stay shared.
 */
function mayWriteRow(itemKey) {
  if (!itemKey.startsWith('people:')) return true;
  if (typeof isAdmin === 'function' && isAdmin()) return true;
  const me = (typeof myPersonId === 'function') ? myPersonId() : null;
  if (!me) return false;                       // no name set — read-only
  return itemKey === 'people:' + me;
}

// Push only the rows whose JSON changed since last push (per-item last-write-wins).
async function pushChangedItems() {
  if (!sb || !sbConfig) return;
  if (!syncReady) return;        // we haven't seen the room yet — say nothing
  const now = Date.now();
  // Note WHEN each scalar last changed on our copy, before we diff. Doing it
  // in one place means no mutation site anywhere else has to remember to, and
  // it's what lets the other end tell a newer value from an older one.
  // These helpers live in 02b-merge.js. If that module isn't loaded — a loader
  // list out of step with the js/ folder — the whole push used to throw here,
  // silently, on every save. Degrade instead: sync plainly rather than not at all.
  if (typeof PEOPLE_MERGER !== 'undefined' && typeof ensureRecordUids === 'function') {
    (state.people || []).forEach(p => {
      ensureRecordUids(p);
      PEOPLE_MERGER.stamp(p, lastSnapshot['people:' + p.id]);
    });
  }
  if (typeof ID_LIST_SINGLETONS !== 'undefined' && typeof stampIdList === 'function') {
    Object.keys(ID_LIST_SINGLETONS).forEach(k => {
      if (Array.isArray(state[k])) stampIdList(k, state[k], lastSnapshot['single:' + k]);
    });
  }
  const map = buildItemMap();
  const rows = [];
  for (const k in map) {
    const snap = snapshotOf(map[k]);
    if (lastSnapshot[k] === snap) continue;
    // A device speaks for its own player and nobody else. Every device used to
    // push every person row it happened to hold, so a stale copy of someone
    // else's account could overwrite their real fish and streaks. Only the
    // admin account may write on behalf of others.
    if (!mayWriteRow(k)) continue;
    rows.push({ room: roomFor(k), item_key: k, data: map[k], updated_at: now });
    lastSnapshot[k] = snap;
  }
  // deletions: keys we had before but not now
  // ⚠️ A deletion here removes the row from Supabase for everybody.
  //
  // If this device's state failed to load — a bad build, a cleared cache, a
  // module that didn't arrive — then `map` is empty and EVERY key in the
  // snapshot looks deleted. That is how a working room gets emptied by one
  // broken tab, and it is almost certainly what has been happening: meetings
  // appear from the pull, then this runs and wipes them.
  //
  // So: a collection may never be emptied wholesale. Losing every meeting at
  // once is not an edit anyone makes.
  const deletions = [];
  const remainingByKind = {};
  Object.keys(map).forEach(k => {
    const kind = k.split(':')[0];
    remainingByKind[kind] = (remainingByKind[kind] || 0) + 1;
  });
  const blocked = [];
  for (const k in lastSnapshot) {
    if (k in map) continue;
    const kind = k.split(':')[0];
    if (kind !== 'single' && !remainingByKind[kind]) { blocked.push(k); continue; }
    deletions.push(k);
    delete lastSnapshot[k];
  }
  if (blocked.length) {
    console.error('[boats] refusing to delete', blocked.length,
      'rows — this device holds none of that kind, which means it failed to load, not that you deleted them:', blocked);
    showToast('⚠️ Something looked wrong locally — nothing was deleted from the room.');
  }
  try {
    if (rows.length) await sb.from('boats_items').upsert(rows);
    if (deletions.length) {
      // private rows live in a different room, so delete them separately
      const sharedDel = deletions.filter(k => !isPrivateKey(k));
      const privDel = deletions.filter(isPrivateKey);
      if (sharedDel.length)
        await sb.from('boats_items').delete().eq('room', sbConfig.room).in('item_key', sharedDel);
      if (privDel.length && privateRoom())
        await sb.from('boats_items').delete().eq('room', privateRoom()).in('item_key', privDel);
    }
    if (rows.length || deletions.length) saveSyncedKeys();
  } catch (e) { console.error('push failed', e); }
}

function load() {
  let raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    for (let i = LEGACY_KEYS.length - 1; i >= 0; i--) {
      const legacy = localStorage.getItem(LEGACY_KEYS[i]);
      if (legacy) { raw = legacy; localStorage.setItem(STORAGE_KEY, legacy); break; }
    }
  }
  if (raw) {
    try { state = { ...state, ...JSON.parse(raw) }; } catch(e) {}
  }
  if (!state.templates || !state.templates.length) {
    state.templates = JSON.parse(JSON.stringify(DEFAULT_TEMPLATES));
  }
  if (!state.activityTypes || !state.activityTypes.length) {
    state.activityTypes = JSON.parse(JSON.stringify(DEFAULT_ACTIVITY_TYPES));
  }
  if (!state.wcCategories) {
    state.wcCategories = JSON.parse(JSON.stringify(DEFAULT_WC_CATEGORIES));
  }
  const savedName = localStorage.getItem('boats_myname');
  if (savedName) state.myName = savedName;
  try {
    const cfg = localStorage.getItem('boats_sync_cfg');
    if (cfg) sbConfig = JSON.parse(cfg);
  } catch(e) {}
}
function getTemplates() { return state.templates || DEFAULT_TEMPLATES; }

// cross-tab sync for the local-only case
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY && !sb) {
    load();
    renderAll();
  }
});

// ── SUPABASE ──
function setSyncStatus(text, color) {
  const el = document.getElementById('sync-status');
  if (el) { el.textContent = text; el.style.color = color || 'var(--ink-light)'; }
}

// Apply a single incoming row (from realtime or initial pull) into state.
let staleRowRejected = false;
function applyItemRow(item_key, data, isDelete) {
  // ⚠️ Everything below runs inside try/finally.
  //
  // If one row throws — a merge helper missing because 02b-merge.js didn't
  // load, a malformed payload — the old code left `applyingRemote` stuck at
  // true FOREVER. save() checks that flag before pushing, so the device went
  // permanently silent, the pull loop abandoned the remaining rows, and the
  // half-applied state got written to localStorage. That is the shape of
  // "meetings appear for a second and then they're gone".
  try {
    return applyItemRowInner(item_key, data, isDelete);
  } catch (err) {
    console.error('[boats] failed to apply', item_key, err);
    return;
  } finally {
    applyingRemote = false;
  }
}

function applyItemRowInner(item_key, data, isDelete) {
  applyingRemote = true;
  staleRowRejected = false;
  const [kind, ...rest] = item_key.split(':');
  const idPart = rest.join(':');
  if (kind === 'single') {
    if (!isDelete) {
      // Singletons come in three shapes and each needs different handling:
      //   · per-person maps  — merge key by key, each person owns their entry
      //   · id-keyed lists   — merge item by item, newest edit wins, deletions stick
      //   · plain values     — last write wins, which is right for a name or a flag
      const hasMerge = typeof mergeIdList === 'function';
      if (hasMerge && idPart === '_graves')                 state._graves = mergeTombstones(state._graves, data);
      else if (hasMerge && PERSON_KEYED_SINGLETONS[idPart]) state[idPart] = mergePersonKeyedMap(state[idPart], data);
      else if (hasMerge && ID_LIST_SINGLETONS[idPart])      state[idPart] = mergeIdList(idPart, state[idPart], data);
      else                                                  state[idPart] = data;
    }
  } else if (ITEM_COLLECTIONS.includes(kind)) {
    if (!state[kind]) state[kind] = [];
    const arr = state[kind];
    const idx = arr.findIndex(el => String(el.id) === idPart);
    if (isDelete) {
      if (idx > -1) arr.splice(idx, 1);
    } else if (idx > -1) {
      if (kind === 'people') {
        // An admin reset outranks everything: if the row carries a NEWER
        // epoch than ours, that person was deliberately rewritten and we
        // take it whole rather than merging our stale numbers back in.
        // Compare this person's stamp against OUR copy of the same person.
        // It used to compare against state.scoreEpoch — a separate synced
        // singleton — so any device whose singleton lagged saw every row as
        // "newer", took it whole, and never merged again. That's why streaks
        // stayed broken on some machines however many times they synced.
        if (rowEpoch(data) > rowEpoch(arr[idx])) {
          state.scoreEpoch = Math.max(currentEpoch(), rowEpoch(data));
          arr[idx] = (typeof ensureRecordUids === 'function') ? ensureRecordUids({ ...data }) : { ...data };
          lastSnapshot[item_key] = snapshotOf(arr[idx]);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          applyingRemote = false;
          return;
        }
        // A person is not one value — it's a ledger of catches, a set of
        // streaks, a pile of logs and a handful of scalars, each of which can
        // be edited on a different device. Replacing the object wholesale
        // threw away whatever the other device had touched. Merge per field.
        //
        // A row older than ours has missed an admin correction, so its scores
        // are not to be trusted; take only its personal fields.
        const stale = rowEpoch(data) < rowEpoch(arr[idx]);
        const merged = (typeof PEOPLE_MERGER === 'undefined')
          ? { ...arr[idx], ...data }                       // no merger loaded — plain overlay
          : stale ? PEOPLE_MERGER.mergeStale(arr[idx], data)
                  : PEOPLE_MERGER.merge(arr[idx], data);
        // if what we ended up with differs from what arrived, the row in the
        // database is now behind us and needs correcting
        if (snapshotOf(merged) !== snapshotOf(data)) staleRowRejected = true;
        arr[idx] = merged;
      } else if (kind === 'meetings') {
        // A meeting is a whole row, so two people decorating at once would
        // overwrite each other. The placements are an id-keyed list, merged
        // item by item with removals honoured, exactly like projects.
        const merged = { ...data };
        merged.decor = (typeof mergeIdList === 'function')
          ? mergeIdList('decor', (arr[idx] || {}).decor, data.decor)
          : (data.decor || (arr[idx] || {}).decor || []);
        arr[idx] = merged;
      } else {
        arr[idx] = data;
      }
    } else {
      arr.push((kind === 'people' && typeof ensureRecordUids === 'function')
        ? ensureRecordUids({ ...data }) : data);
    }
  }
  // keep our snapshot in sync so we don't echo this back
  if (isDelete) {
    delete lastSnapshot[item_key];
  } else {
    // record what we NOW hold. After a merge that differs from the incoming
    // row, this leaves a diff that the corrective push will send back up.
    const kindNow = item_key.split(':')[0];
    const held = ITEM_COLLECTIONS.includes(kindNow)
      ? (state[kindNow] || []).find(el => String(el.id) === item_key.split(':').slice(1).join(':'))
      : null;
    lastSnapshot[item_key] = snapshotOf(held || data);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  applyingRemote = false;
  // We kept our own values over theirs, so the row in the database is still
  // wrong — push the corrected version back so the room heals itself.
  if (staleRowRejected) { staleRowRejected = false; scheduleCorrectivePush(); }
}

// Re-render after remote changes, without yanking focus while typing.
function rerenderAfterRemote() {
  const active = document.activeElement;
  const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
  if (isTyping) {
    try { renderLeaderboard(); } catch(e){}
    if (typeof renderBoard === 'function') renderBoard();
    pendingRemoteRender = true;
  } else {
    renderAll();
  }
}
let pendingRemoteRender = false;
document.addEventListener('focusout', () => {
  if (pendingRemoteRender) {
    pendingRemoteRender = false;
    setTimeout(() => { if (!document.activeElement || (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA')) renderAll(); }, 150);
  }
});

// Pull all rows for the room; if empty, migrate from old single-blob table, else seed.
async function pullAllItems() {
  if (!sb || !sbConfig) return;
  try {
    // read the shared room AND my own private one
    const rooms = [sbConfig.room];
    const mine = privateRoom();
    if (mine) rooms.push(mine);
    const { data, error } = await sb.from('boats_items')
      .select('item_key,data,updated_at').in('room', rooms);
    if (error) throw error;
    if (data && data.length) {
      const remoteKeys = new Set(data.map(r => r.item_key));
      const newestRemote = data.reduce((m, r) => Math.max(m, r.updated_at || 0), 0);
      data.forEach(row => applyItemRow(row.item_key, row.data, false));
      // ⚠️ Only prune when the answer looks like the whole room.
      //
      // A malformed query or a half-delivered response reads as "the room has
      // deleted everything", and this device would then helpfully throw away
      // real work. That is how meeting notes disappeared: a broken URL returned
      // a short list, and pruning believed it.
      //
      // The rule is deliberately blunt — if the room is holding far less than
      // we are, assume the answer is wrong, keep everything, and say so.
      const localKeys = Object.keys(buildItemMap()).length;
      const shortfall = localKeys ? (localKeys - remoteKeys.size) / localKeys : 0;
      const trustworthy = shortfall < 0.3;
      const dropped = trustworthy ? pruneZombies(remoteKeys, newestRemote) : 0;
      if (!trustworthy) {
        console.warn(`[boats] room returned ${remoteKeys.size} of ${localKeys} items — pruning skipped`);
        showToast('⚠️ Partial sync — nothing removed. Everything is still here.');
      }
      seedSnapshot(remoteKeys);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      syncReady = true;
      localStorage.setItem('boats_last_sync', String(Date.now()));
      const fixed = (typeof repairAllPeople === 'function') ? repairAllPeople() : 0;
      if (fixed) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        showToast(`🧹 Cleared ${fixed} duplicated record(s)`);
      }
      renderAll();
      if (dropped) showToast(`🧹 Cleared ${dropped} stale item(s) from this device's cache`);
      // Anything we kept that the room doesn't have is genuine local work that
      // was never uploaded — send it up now that we're allowed to push.
      pushChangedItems();
      return;
    } else {
      // try migrating from the old single-document table
      let migrated = false;
      try {
        const old = await sb.from('boats_state').select('data').eq('room', sbConfig.room).maybeSingle();
        if (old.data && old.data.data) { mergeLegacyBlob(old.data.data); migrated = true; }
      } catch(e) { /* old table may not exist; fine */ }
      // Empty room: we're the first here, so seed it from local state.
      lastSnapshot = {};      // force a full push
      syncReady = true;
      await pushChangedItems();
      localStorage.setItem('boats_last_sync', String(Date.now()));
    }
  } catch (e) {
    console.error('pull failed', e);
    // Couldn't read the room — stay silent rather than risk pushing stale data.
    syncReady = false;
    setSyncStatus('🔴 Pull failed — not syncing', 'var(--sail-red)');
  }
}

// Which item keys THIS device has already uploaded. If a key is in here but is
// missing from the room, it was deleted by someone else — so we must not bring
// it back. If it isn't in here, we've never pushed it, so it's genuine local
// work and gets kept.
const SYNCED_KEYS_KEY = 'boats_synced_keys';
function loadSyncedKeys() {
  try {
    const arr = JSON.parse(localStorage.getItem(SYNCED_KEYS_KEY) || 'null');
    return Array.isArray(arr) ? new Set(arr) : null;   // null = this device predates the record
  } catch (e) { return null; }
}
function saveSyncedKeys() {
  try { localStorage.setItem(SYNCED_KEYS_KEY, JSON.stringify(Object.keys(lastSnapshot))); } catch (e) {}
}

// Drop anything this device is holding that the room no longer has.
function pruneZombies(remoteKeys, newestRemote) {
  // Private rows are pulled from a different room; if this device has no name
  // set yet they simply won't be in the result, and treating that as "the room
  // deleted them" would throw away someone's books.
  PRIVATE_KEYS.forEach(k => { if (!remoteKeys.has(k)) remoteKeys.add(k); });
  const known = loadSyncedKeys();
  let removed = 0;
  ITEM_COLLECTIONS.forEach(coll => {
    if (!Array.isArray(state[coll])) return;
    state[coll] = state[coll].filter(el => {
      if (!el || el.id == null) return false;
      const key = coll + ':' + el.id;
      if (remoteKeys.has(key)) return true;             // still in the room — keep
      if (known) {
        // we have a proper record: keep only what we've never uploaded
        if (!known.has(key)) return true;
      } else {
        // First run under the new sync. The old code pushed the whole state on
        // every save, so anything older than the room's last write was already
        // uploaded — and its absence means it was deleted. Only keep items made
        // after the room's most recent activity.
        const created = itemCreatedAt(el);
        if (created && created > (newestRemote || 0)) return true;
      }
      removed++;
      return false;
    });
  });
  return removed;
}

// Record what the server has, so save() only pushes real changes. Keys the room
// doesn't have are deliberately left out so genuine local work still uploads.
function seedSnapshot(remoteKeys) {
  lastSnapshot = {};
  const map = buildItemMap();
  for (const k in map) {
    if (!remoteKeys || remoteKeys.has(k)) lastSnapshot[k] = snapshotOf(map[k]);
  }
  saveSyncedKeys();
}

// Merge a legacy single-blob into current state (used once during migration).
function mergeLegacyBlob(data) {
  applyingRemote = true;
  ['people','meetings','tasks','events','messages','templates','activityTypes','wcCategories','personTemplates','wsName','wsSub'].forEach(k => {
    if (data[k] !== undefined) state[k] = data[k];
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  applyingRemote = false;
}

function openSyncModal() {
  if (sbConfig) {
    document.getElementById('sync-url').value = sbConfig.url || '';
    document.getElementById('sync-key').value = sbConfig.key || '';
    document.getElementById('sync-room').value = sbConfig.room || 'our-crew';
  }
  document.getElementById('sync-modal').style.display = 'flex';
}

async function connectSync() {
  const url = document.getElementById('sync-url').value.trim();
  const key = document.getElementById('sync-key').value.trim();
  const room = (document.getElementById('sync-room').value.trim() || 'our-crew').toLowerCase().replace(/\s+/g, '-');
  if (!url || !key) { showToast('Paste both URL and key ☁️'); return; }
  if (typeof window.supabase === 'undefined') { showToast('Supabase library not loaded (check connection)'); return; }

  sbConfig = { url, key, room };
  localStorage.setItem('boats_sync_cfg', JSON.stringify(sbConfig));
  setSyncStatus('🟡 Connecting…', 'var(--peach)');
  closeModal('sync-modal');
  await startSync();
}

async function startSync() {
  if (!sbConfig) return;
  try {
    sb = window.supabase.createClient(sbConfig.url, sbConfig.key);
    lastSnapshot = {};
    syncReady = false;          // hold all pushes until the room has been read
    await pullAllItems();

    if (sbChannel) { try { await sb.removeChannel(sbChannel); } catch(e){} }
    sbChannel = sb.channel('boats-' + sbConfig.room, { config: { broadcast: { self: false }, presence: { key: myUserId } } });

    // per-item realtime: apply just the changed/deleted row
    sbChannel.on('postgres_changes',
      { event: '*', schema: 'public', table: 'boats_items', filter: 'room=eq.' + sbConfig.room },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          const key = payload.old && payload.old.item_key;
          if (key) { applyItemRow(key, null, true); rerenderAfterRemote(); }
        } else {
          const row = payload.new;
          if (row && row.item_key) { applyItemRow(row.item_key, row.data, false); rerenderAfterRemote(); }
        }
      }
    );

    // My private room. Nobody else subscribes to it, so nobody else is billed
    // for my books — and I still get my own edits from my other devices.
    const myRoom = privateRoom();
    if (myRoom) {
      sbChannel.on('postgres_changes',
        { event: '*', schema: 'public', table: 'boats_items', filter: 'room=eq.' + myRoom },
        (payload) => {
          const row = payload.new || payload.old;
          if (!row || !row.item_key) return;
          applyItemRow(row.item_key, row.data, payload.eventType === 'DELETE');
          rerenderAfterRemote();
        }
      );
    }

    sbChannel.on('broadcast', { event: 'cursor' }, ({ payload }) => {
      // Ignore incoming cursors when the policy says they're off, so a device
      // that hasn't reloaded can't put ghosts on everyone else's screen.
      if (!cursorsOn() || cursorsSilenced()) return;
      if (payload.id !== myUserId) renderRemoteCursor(payload);
    });

    sbChannel.on('presence', { event: 'sync' }, () => {
      const stateP = sbChannel.presenceState();
      const users = [];
      Object.values(stateP).forEach(arr => arr.forEach(u => users.push(u)));
      renderOnlineFromPresence(users);
    });

    sbChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        setSyncStatus('🟢 Live · ' + sbConfig.room, 'var(--matcha)');
        showToast('Connected! Live sync on ☁️');
        await sbChannel.track({ id: myUserId, name: state.myName || 'Anonymous', color: myColor });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setSyncStatus('🔴 Connection error', 'var(--sail-red)');
      }
    });
  } catch (e) {
    console.error(e);
    setSyncStatus('🔴 Failed — check keys', 'var(--sail-red)');
    showToast('Connection failed — check your URL/key');
  }
}

async function disconnectSync() {
  if (sbChannel && sb) { try { await sb.removeChannel(sbChannel); } catch(e){} }
  sb = null; sbChannel = null; sbConfig = null;
  lastSnapshot = {};
  syncReady = false;
  localStorage.removeItem('boats_sync_cfg');
  setSyncStatus('⚪ Local only');
  closeModal('sync-modal');
  showToast('Disconnected — local only');
  document.querySelectorAll('.remote-cursor[data-remote]').forEach(el => el.remove());
  renderOnlineUsers();
}

let presentNames = new Set();
function renderOnlineFromPresence(users) {
  presentNames = new Set(users.map(u => (u.name || '').trim().toLowerCase()));
  renderOnlineUsers();
}
