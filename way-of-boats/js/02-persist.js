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

// Collections stored one-row-per-element (keyed by their .id).
// Bump this string on every deploy — the update checker compares it against the
// copy sitting on the server to tell a phone its cached build is out of date.
// Mirrors <meta name="app-version"> in index.html, so the loader's cache-bust
// query and the update checker always agree. Bump the meta tag on deploy.
const APP_VERSION = (document.querySelector('meta[name="app-version"]') || {}).content || '0.0.0';

const ITEM_COLLECTIONS = ['people', 'tasks', 'meetings', 'events', 'posts', 'messages'];
// Singletons stored as a single row each.
const SINGLETONS = ['templates', 'activityTypes', 'wcCategories', 'personTemplates', 'wsName', 'wsSub', 'scoreEpoch', 'storeItems', 'storeEnabled'];

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
    const url = location.pathname + '?_cb=' + Date.now();
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return false;
    const txt = await res.text();
    // read the version straight out of the served index.html's meta tag
    const m = txt.match(/name="app-version"\s+content="([^"]+)"/);
    if (!m) return false;
    if (m[1] !== APP_VERSION) {
      const msg = document.getElementById('update-msg');
      if (msg) msg.textContent = `New version available (${m[1]}) — you're running ${APP_VERSION}.`;
      const banner = document.getElementById('update-banner');
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
  const base = location.origin + location.pathname;
  setTimeout(() => { location.replace(base + '?v=' + Date.now()); }, 250);
}

function renderAppVersion() {
  const el = document.getElementById('app-version');
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
    pushTimer = setTimeout(pushChangedItems, 300);
  }
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

// Push only the rows whose JSON changed since last push (per-item last-write-wins).
async function pushChangedItems() {
  if (!sb || !sbConfig) return;
  if (!syncReady) return;        // we haven't seen the room yet — say nothing
  const now = Date.now();
  const map = buildItemMap();
  const rows = [];
  // changed or new items
  for (const k in map) {
    const snap = snapshotOf(map[k]);
    if (lastSnapshot[k] !== snap) {
      rows.push({ room: sbConfig.room, item_key: k, data: map[k], updated_at: now });
      lastSnapshot[k] = snap;
    }
  }
  // deletions: keys we had before but not now
  const deletions = [];
  for (const k in lastSnapshot) {
    if (!(k in map)) { deletions.push(k); delete lastSnapshot[k]; }
  }
  try {
    if (rows.length) await sb.from('boats_items').upsert(rows);
    if (deletions.length) {
      await sb.from('boats_items').delete().eq('room', sbConfig.room).in('item_key', deletions);
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
  applyingRemote = true;
  staleRowRejected = false;
  const [kind, ...rest] = item_key.split(':');
  const idPart = rest.join(':');
  if (kind === 'single') {
    if (!isDelete) state[idPart] = data;
  } else if (ITEM_COLLECTIONS.includes(kind)) {
    if (!state[kind]) state[kind] = [];
    const arr = state[kind];
    const idx = arr.findIndex(el => String(el.id) === idPart);
    if (isDelete) {
      if (idx > -1) arr.splice(idx, 1);
    } else if (idx > -1) {
      // An incoming person row stamped before the last admin reset is a ghost
      // from someone's stale cache. Take its harmless fields (name, colour,
      // notebook) but keep OUR scores — admin's numbers win.
      if (kind === 'people' && isStaleScoreRow(data)) {
        arr[idx] = mergeKeepingLocalScores(arr[idx], data);
        staleRowRejected = true;
      } else {
        arr[idx] = data;
      }
    } else {
      if (kind === 'people' && isStaleScoreRow(data)) {
        // a person the room already retired, arriving from an old device
        arr.push(mergeKeepingLocalScores(null, data));
        staleRowRejected = true;
      } else {
        arr.push(data);
      }
    }
  }
  // keep our snapshot in sync so we don't echo this back
  if (isDelete) delete lastSnapshot[item_key];
  else lastSnapshot[item_key] = snapshotOf(data);
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
    const { data, error } = await sb.from('boats_items').select('item_key,data,updated_at').eq('room', sbConfig.room);
    if (error) throw error;
    if (data && data.length) {
      const remoteKeys = new Set(data.map(r => r.item_key));
      const newestRemote = data.reduce((m, r) => Math.max(m, r.updated_at || 0), 0);
      data.forEach(row => applyItemRow(row.item_key, row.data, false));
      const dropped = pruneZombies(remoteKeys, newestRemote);   // the room is the source of truth
      seedSnapshot(remoteKeys);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      syncReady = true;
      localStorage.setItem('boats_last_sync', String(Date.now()));
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

    sbChannel.on('broadcast', { event: 'cursor' }, ({ payload }) => {
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
