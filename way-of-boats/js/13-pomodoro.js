// ═══════════════════════════════════════════════════════════════
//  WAY OF BOATS — 13-pomodoro.js
//  Fishing focus timer and the catchable fish
//
//  Loaded in numbered order by index.html. These are classic scripts,
//  not ES modules, so every function stays global and the inline
//  onclick= handlers in the markup keep working unchanged.
// ═══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════
// FISHING FOCUS TIMER
// ══════════════════════════════════════════════
// Fish you can catch (rarer ones for longer focus sessions)
const FISH_SPECIES = CONFIG.icons.fishSpecies;

// ═══════════════════════════════════════════════════════════════
//  POMODORO GACHA
//  Drop rules are documented in pomodoro-gacha-rules.pdf (admin only).
//  Everything cosmetic lives in the four arrays below — swap an emoji or a
//  name here and the whole game follows.
// ═══════════════════════════════════════════════════════════════

// 2 points each
const GACHA_SMALL = [
  { id: 'minnow',    emoji: '🐟', name: 'Minnow' },
  { id: 'goldfish',  emoji: '🐠', name: 'Goldfish' },
  { id: 'clownfish', emoji: '🎏', name: 'Clownfish' },
  { id: 'shrimp',    emoji: '🦐', name: 'Cleaner Shrimp' },
  { id: 'shrimp2',   emoji: '🍤', name: 'A Different Shrimp' },
  { id: 'snail',     emoji: '🐚', name: 'Sea Snail' },
];

// 3 points each
const GACHA_BIG = [
  { id: 'dolphin', emoji: '🐬', name: 'Dolphin' },
  { id: 'whale',   emoji: '🐋', name: 'Whale' },
  { id: 'shark',   emoji: '🦈', name: 'Shark' },
  { id: 'crab',    emoji: '🦀', name: 'Dungeness Crab' },
  { id: 'octopus', emoji: '🐙', name: 'Octopus' },
  { id: 'squid',   emoji: '🦑', name: 'Giant Squid' },
  { id: 'jelly',   emoji: '🪼', name: 'Jellyfish' },
];

// The rare one inside the big-fish pool: 10% of big pulls, worth 3 like any big fish.
const LUCKY_LOBSTER = { id: 'lobster', emoji: '🦞', name: 'Lucky Lobster' };
// The 0.01% pull on the shortest timer.
const POLITE_PUFFER = { id: 'puffer', emoji: '🐡', name: 'Polite Pufferfish' };
// Pity reward — never rolled directly.
const PITY_PUFFER   = { id: 'pity_puffer', emoji: '🦔', name: 'Proud Pity Puffer' };

const LUCKY_LOBSTER_SHARE = 0.10;   // share of big-fish pulls that are lobster
const PUFFER_ODDS         = 0.0001; // 0.01% on the 0-20 tier
const PITY_BASE           = 6;      // socks needed before pity fires
const PITY_PER_LOBSTER    = 2;      // +2 socks per Lucky Lobster owned

function gachaPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Which drop table a session uses. 96+ reuses the top tier.
function gachaTier(mins) {
  if (mins <= 20) return 0;
  if (mins <= 44) return 1;
  if (mins <= 50) return 2;
  if (mins <= 95) return 3;
  return 4;
}
const GACHA_TIER_LABEL = ['0-20 min', '21-44 min', '45-50 min', '51-95 min', '96+ min'];

function gachaSmall() { const f = gachaPick(GACHA_SMALL); return { ...f, kind: 'small' }; }
function gachaBig() {
  const f = Math.random() < LUCKY_LOBSTER_SHARE ? LUCKY_LOBSTER : gachaPick(GACHA_BIG);
  return { ...f, kind: 'big' };
}

/**
 * Roll one session's catch. Returns an array of items — an EMPTY array means
 * the roll came up dry, which is what earns a Sock.
 */
function rollGacha(mins) {
  const tier = gachaTier(mins);
  const out = [];
  if (tier === 0) {
    if (Math.random() < PUFFER_ODDS) out.push({ ...POLITE_PUFFER, kind: 'special' });
  } else if (tier === 1) {
    if (Math.random() < 0.10) out.push(gachaSmall());
  } else if (tier === 2) {
    if (Math.random() < 0.85) out.push(gachaSmall());
  } else if (tier === 3) {
    out.push(gachaSmall());
    // the 30% extra is a coin-flip between a big fish and a second small one
    if (Math.random() < 0.30) out.push(Math.random() < 0.5 ? gachaBig() : gachaSmall());
  } else {
    out.push(gachaSmall());
    if (Math.random() < 0.65) out.push(gachaBig());
  }
  return out;
}

// Point value per rarity. Change a number here and everything follows — the
// leaderboard, the reveal card, and the admin rules card all read from it.
const FISH_POINTS = { small: 2, big: 3, special: 2, sock: 0 };

/**
 * What a caught item is worth.
 *
 * Fish caught BEFORE the gacha existed carry no `kind` — old pomodoro catches,
 * World Cup consistency fish, admin-granted fish. They all fall through to the
 * small-fish value, so every fish already in the game counts exactly as a small
 * fish does. Nothing needed migrating, and if you ever change what a small fish
 * is worth, the old ones move with it.
 */
function fishValue(f) {
  if (!f) return 0;
  if (f.kind && FISH_POINTS[f.kind] != null) return FISH_POINTS[f.kind];
  return FISH_POINTS.small;
}

function pityThreshold(p) {
  const lobsters = (p && p.fish || []).filter(f => f.id === LUCKY_LOBSTER.id).length;
  return PITY_BASE + PITY_PER_LOBSTER * lobsters;
}

// ═══════════════════════════════════════════════════════════════
//  ONE TIMER PER PERSON, ACROSS DEVICES
//  A running timer publishes a heartbeat to localStorage (covers other tabs in
//  this browser) and onto the person record (covers other devices via sync).
//  A lock older than LOCK_STALE_MS is treated as abandoned, so a crashed tab
//  frees itself up rather than locking someone out forever.
// ═══════════════════════════════════════════════════════════════
const LOCK_KEY = 'boats_timer_lock';
const LOCK_STALE_MS = 45000;
const LOCK_BEAT_MS = 10000;
const LOCK_SYNC_BEAT_MS = 30000;

const INSTANCE_ID = (function () {
  let v = null;
  try { v = sessionStorage.getItem('boats_instance'); } catch (e) {}
  if (!v) {
    v = 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    try { sessionStorage.setItem('boats_instance', v); } catch (e) {}
  }
  return v;
})();

function myLockName() { return (state.myName || '').trim().toLowerCase(); }

function readTimerLocks() {
  const locks = [];
  try {
    const l = JSON.parse(localStorage.getItem(LOCK_KEY) || 'null');
    if (l) locks.push(l);
  } catch (e) {}
  const id = typeof myPersonId === 'function' ? myPersonId() : null;
  if (id) {
    const p = personById(id);
    if (p && p.timerLock) locks.push(p.timerLock);
  }
  return locks;
}

/** A live timer belonging to me, running somewhere that isn't this tab. */
function foreignTimerLock() {
  const me = myLockName();
  if (!me) return null;
  const now = Date.now();
  return readTimerLocks().find(l =>
    l && l.instance && l.instance !== INSTANCE_ID &&
    (l.name || '').trim().toLowerCase() === me &&
    (now - (l.at || 0)) < LOCK_STALE_MS
  ) || null;
}

let lastSyncBeat = 0;
function claimTimerLock(force) {
  const now = Date.now();
  const lock = { instance: INSTANCE_ID, name: state.myName || '', at: now,
                 device: navigator.platform || 'a device', minutes: pomoMinutes };
  try { localStorage.setItem(LOCK_KEY, JSON.stringify(lock)); } catch (e) {}
  const id = typeof myPersonId === 'function' ? myPersonId() : null;
  if (id && (force || now - lastSyncBeat > LOCK_SYNC_BEAT_MS)) {
    const p = personById(id);
    if (p) { p.timerLock = lock; lastSyncBeat = now; save(); }
  }
}

function releaseTimerLock() {
  try {
    const l = JSON.parse(localStorage.getItem(LOCK_KEY) || 'null');
    if (!l || l.instance === INSTANCE_ID) localStorage.removeItem(LOCK_KEY);
  } catch (e) {}
  const id = typeof myPersonId === 'function' ? myPersonId() : null;
  if (id) {
    const p = personById(id);
    if (p && p.timerLock && p.timerLock.instance === INSTANCE_ID) {
      p.timerLock = null;
      lastSyncBeat = 0;
      save();
    }
  }
}

let lastLocalBeat = 0;
function beatTimerLock() {
  const now = Date.now();
  if (now - lastLocalBeat < LOCK_BEAT_MS) return;
  lastLocalBeat = now;
  claimTimerLock(false);
}

// don't leave a stale lock behind when the tab goes away
window.addEventListener('beforeunload', () => { if (pomoRunning) releaseTimerLock(); });

let pomoMinutes = parseInt(localStorage.getItem('boats_pomo_min') || '25', 10);
let pomoRemaining = pomoMinutes * 60;
let pomoRunning = false;
let pomoInterval = null;
let pomoGoal = '';
let pomoEndTime = null;      // wall-clock ms timestamp when the session should end
let pomoTaskIds = [];        // ids of REAL board tasks pulled into this session
let userSetMinutes = false;  // did the user manually override the suggested time?

// caught fish stored per-person so it can feed the leaderboard
function myFishList() {
  const id = myPersonId();
  if (!id) {
    try { return JSON.parse(localStorage.getItem('boats_myfish') || '[]'); } catch(e){ return []; }
  }
  const p = personById(id);
  if (!p.fish) p.fish = [];
  return p.fish;
}
function saveMyFish(list) {
  const id = myPersonId();
  if (!id) { localStorage.setItem('boats_myfish', JSON.stringify(list)); return; }
  const p = personById(id);
  p.fish = list;
  save();
}
function myPersonId() {
  const n = (state.myName || '').trim().toLowerCase();
  if (!n) return null;
  const p = state.people.find(x => x.name.trim().toLowerCase() === n);
  return p ? p.id : null;
}
