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

let lastCursorSend = 0;
function initCursors() {
  document.addEventListener('mousemove', (e) => {
    updateMyLabel(e.clientX, e.clientY);
    // broadcast my cursor (throttled) when connected
    if (sbChannel && Date.now() - lastCursorSend > 60) {
      lastCursorSend = Date.now();
      sbChannel.send({
        type: 'broadcast', event: 'cursor',
        payload: { id: myUserId, name: state.myName || 'Anonymous', color: myColor,
                   xr: e.clientX / window.innerWidth, yr: e.clientY / window.innerHeight }
      });
    }
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
function updateMyLabel(x, y) {
  if (!state.myName) return;
  if (!myLabelEl) {
    myLabelEl = document.createElement('div');
    myLabelEl.className = 'remote-cursor';
    myLabelEl.innerHTML = `${boatCursorSvg(myColor)}<span class="cursor-label" style="background:${myColor}">${escHtml(state.myName)} (you)</span>`;
    document.getElementById('cursor-layer').appendChild(myLabelEl);
  }
  myLabelEl.style.left = x + 'px';
  myLabelEl.style.top = y + 'px';
}
