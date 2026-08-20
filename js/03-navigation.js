// ═══════════════════════════════════════════════════════════════
//  WAY OF BOATS — 03-navigation.js
//  Section routing and live cursors
//
//  Loaded in numbered order by index.html. These are classic scripts,
//  not ES modules, so every function stays global and the inline
//  onclick= handlers in the markup keep working unchanged.
// ═══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════
function showSection(name) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.getElementById('section-' + name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('nav-' + name).classList.add('active');
  if (name === 'leaderboard') { renderLeaderboard(); renderPie(); }
  if (name === 'tasks') { renderTasks(); renderPostReminders(); }
  if (name === 'calendar') renderCalendar();
  if (name === 'worldcup') renderWorldCup();
  if (name === 'planning') renderPlanning();
  if (name === 'admin') renderAdmin();
  if (name === 'timeline') renderTimelineSection();
  if (name === 'bank') renderBank();
  if (name === 'tasks') { try { renderPie(); } catch(e) {} }
}

// ══════════════════════════════════════════════
// CURSORS (real, over Supabase broadcast when connected)
// ══════════════════════════════════════════════
const myUserId = 'u' + Math.random().toString(36).slice(2, 9);
const CURSOR_COLORS = ['#E8536A','#7AAF72','#C9B8E8','#F4A460','#3B9BD4','#F4823C','#2876B0','#E8A8D8'];
const myColor = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];

function boatCursorSvg(color) {
  return `<svg width="26" height="22" viewBox="0 0 26 22" fill="none">
    <polygon points="13,1 13,11 5,11" fill="${color}" stroke="white" stroke-width="1"/>
    <rect x="12.3" y="1" width="1.4" height="11" fill="#8B5E3C"/>
    <path d="M2,12 L24,12 L20,20 L6,20 Z" fill="white" stroke="${color}" stroke-width="1.3"/>
  </svg>`;
}

// ═══════════════════════════════════════════════════════════════
//  LIVE CURSORS — the expensive one
//
//  This used to broadcast every 60ms while the mouse moved: 16.7 messages a
//  second, per person. Nine people moving for 45 minutes a day is roughly
//  12 million messages a month against a 2 million free-tier cap — about 87%
//  of everything the app sent, for a decoration.
//
//  It is now OFF unless someone turns it on, and when on it is throttled hard,
//  stays quiet unless the pointer has actually travelled, sleeps when the tab
//  is hidden, and says nothing at all when nobody else is in the room.
// ═══════════════════════════════════════════════════════════════
const CURSOR_MS = 250;        // 4/sec at most, down from ~17
const CURSOR_MIN_MOVE = 0.02; // must have moved 2% of the screen to be worth sending

// ── when cursors are allowed to cost anything ────────────────
// Every cursor broadcast is billed once to send plus once per receiving
// client, so the cost climbs with the square of how many people are on. The
// policy below is what keeps that in a box; admin can retune it without a
// code change.
const CURSOR_DEFAULTS = {
  maxOnline: 3,              // silent once MORE than this many are connected
  offDays: [0, 2, 3, 4],     // Sun, Tue, Wed, Thu — your heaviest days
};
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function cursorPolicy() {
  const p = (state && state.cursorPolicy) || {};
  return {
    maxOnline: Number.isFinite(p.maxOnline) ? p.maxOnline : CURSOR_DEFAULTS.maxOnline,
    offDays: Array.isArray(p.offDays) ? p.offDays : CURSOR_DEFAULTS.offDays,
  };
}
function onlineCount() {
  try { return Object.keys(state.online || {}).length || 1; } catch (e) { return 1; }
}
/** An off day means nobody sends anything — so nobody receives anything either. */
function cursorsBlockedToday() {
  return cursorPolicy().offDays.includes(new Date().getDay());
}
function cursorsSilenced() {
  return cursorsBlockedToday() || onlineCount() > cursorPolicy().maxOnline;
}
/** Why cursors aren't showing, in words, for the sidebar. */
function cursorStatusText() {
  if (!cursorsOn()) return 'off';
  if (cursorsBlockedToday()) return `off on ${DAY_NAMES[new Date().getDay()]}s`;
  const n = onlineCount(), max = cursorPolicy().maxOnline;
  if (n > max) return `silent — ${n} online, limit ${max}`;
  return `live (${n}/${max})`;
}

function cursorsOn() { return localStorage.getItem('boats_cursors') === '1'; }
function setCursorsOn(on) {
  localStorage.setItem('boats_cursors', on ? '1' : '0');
  if (!on) document.querySelectorAll('.remote-cursor').forEach(el => el.remove());
  showToast(on
    ? '👀 Live cursors on — this is the app\'s biggest source of realtime traffic'
    : '👀 Live cursors off');
  const cb = document.getElementById('cursor-toggle');
  if (cb) cb.checked = on;
}

let lastCursorSend = 0, lastCx = -1, lastCy = -1;
function initCursors() {
  document.addEventListener('mousemove', (e) => {
    updateMyLabel(e.clientX, e.clientY);          // my own label is local, always free
    // Admin never broadcasts a position — not throttled, not reduced: never.
    if (typeof isAdmin === 'function' && isAdmin()) return;
    if (!sbChannel || !cursorsOn()) return;
    if (document.hidden) return;                  // nobody can see it anyway
    // An off day, or too many people connected: send nothing. Since nobody
    // sends, nobody receives — the whole group costs zero, which is what makes
    // an off day actually worth having.
    if (cursorsSilenced()) return;
    if (onlineCount() <= 1) return;               // alone; nobody to send to

    const xr = e.clientX / window.innerWidth, yr = e.clientY / window.innerHeight;
    if (Math.abs(xr - lastCx) < CURSOR_MIN_MOVE && Math.abs(yr - lastCy) < CURSOR_MIN_MOVE) return;
    const now = Date.now();
    if (now - lastCursorSend < CURSOR_MS) return;

    lastCursorSend = now; lastCx = xr; lastCy = yr;
    sbChannel.send({
      type: 'broadcast', event: 'cursor',
      payload: { id: myUserId, name: state.myName || 'Anonymous', color: myColor, xr, yr }
    });
  });
}

// render a remote person's cursor from a broadcast payload
const remoteCursors = {};
const remoteTimers = {};
function renderRemoteCursor(p) {
  const layer = document.getElementById('cursor-layer');
  let el = remoteCursors[p.id];
  if (!el) {
    el = document.createElement('div');
    el.className = 'remote-cursor';
    el.setAttribute('data-remote', p.id);
    el.innerHTML = `${boatCursorSvg(p.color)}<span class="cursor-label" style="background:${p.color}">${escHtml(p.name)}</span>`;
    layer.appendChild(el);
    remoteCursors[p.id] = el;
  }
  el.style.left = (p.xr * window.innerWidth) + 'px';
  el.style.top = (p.yr * window.innerHeight) + 'px';
  // auto-remove if they go quiet for 5s
  clearTimeout(remoteTimers[p.id]);
  remoteTimers[p.id] = setTimeout(() => {
    if (remoteCursors[p.id]) { remoteCursors[p.id].remove(); delete remoteCursors[p.id]; }
  }, 5000);
}

let myLabelEl = null;
/**
 * My own boat and name, drawn locally.
 *
 * This costs nothing — it never leaves the browser — so it is on whatever the
 * message budget says. Only the BROADCAST is rationed.
 *
 * The one exception is the admin account, which stays invisible: it isn't a
 * crew member and shouldn't appear on anyone's screen, including its own.
 */
function updateMyLabel(x, y) {
  if (!state.myName) return;
  if (typeof isAdmin === 'function' && isAdmin()) {
    if (myLabelEl) { myLabelEl.remove(); myLabelEl = null; }
    return;
  }
  if (!myLabelEl) {
    myLabelEl = document.createElement('div');
    myLabelEl.className = 'remote-cursor';
    myLabelEl.innerHTML = `${boatCursorSvg(myColor)}<span class="cursor-label" style="background:${myColor}">${escHtml(state.myName)} (you)</span>`;
    document.getElementById('cursor-layer').appendChild(myLabelEl);
  }
  myLabelEl.style.left = x + 'px';
  myLabelEl.style.top = y + 'px';
}
