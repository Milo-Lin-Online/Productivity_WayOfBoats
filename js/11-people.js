// ═══════════════════════════════════════════════════════════════
//  WAY OF BOATS — 11-people.js
//  My name, online roster, shared utilities
//
//  Loaded in numbered order by index.html. These are classic scripts,
//  not ES modules, so every function stays global and the inline
//  onclick= handlers in the markup keep working unchanged.
// ═══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════
// MY NAME
// ══════════════════════════════════════════════
function openMyNameModal() {
  const inp = document.getElementById('myname-input');
  inp.maxLength = CONFIG.nameCharLimit;
  inp.value = state.myName;
  mynameCounter(inp);
  document.getElementById('myname-modal').style.display = 'flex';
}
function mynameCounter(inp) {
  document.getElementById('myname-counter').textContent = `${inp.value.length}/${CONFIG.nameCharLimit}`;
}

function saveWorkspaceName(el) {
  const v = el.textContent.trim() || 'WAY OF BOATS';
  el.textContent = v;
  state.wsName = v;
  document.title = '⚓ ' + v;
  save();
}
function saveWorkspaceSub(el) {
  const v = el.textContent.trim() || 'the immortal typhoon 🌊';
  el.textContent = v;
  state.wsSub = v;
  save();
}
function applyWorkspaceNames() {
  const t = document.querySelector('.ws-title');
  const s = document.querySelector('.ws-sub');
  if (t) t.textContent = state.wsName || 'WAY OF BOATS';
  if (s) s.textContent = state.wsSub || 'the immortal typhoon 🌊';
  document.title = '⚓ ' + (state.wsName || 'WAY OF BOATS');
}

function saveMyName() {
  state.myName = document.getElementById('myname-input').value.trim() || 'Anonymous';
  localStorage.setItem('boats_myname', state.myName);
  if (myLabelEl) myLabelEl.querySelector('.cursor-label').textContent = state.myName + ' (you)';
  // update presence so others see the new name
  if (sbChannel) { try { sbChannel.track({ id: myUserId, name: state.myName, color: myColor }); } catch(e){} }
  // save name without pushing whole doc unnecessarily
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  // anything done before a name was set now belongs to this profile
  claimLocalFocusMinutes();
  claimLocalPlanning();
  refreshAdminVisibility();
  closeModal('myname-modal');
  renderOnlineUsers();
  renderPlanning();
  showToast('Name saved! 🪪');
}

// ══════════════════════════════════════════════
// ONLINE USERS (simulated)
// ══════════════════════════════════════════════
function renderOnlineUsers() {
  const list = document.getElementById('online-users-list');
  // Build the roster: all crew members, plus me if I'm not in the list.
  const roster = visiblePeople().map(p => ({ name: p.name, color: p.color }));
  const myName = (state.myName || '').trim();
  if (myName && !isAdmin() && !roster.some(r => r.name.trim().toLowerCase() === myName.toLowerCase())) {
    roster.unshift({ name: myName, color: myColor });
  }
  if (roster.length === 0) {
    list.innerHTML = `<div style="font-size:11px; color:var(--ink-light); padding:4px 8px; font-weight:600;">Add crew or set your name →</div>`;
    return;
  }
  // I'm always considered online; others online if present via Supabase
  const isOnline = (name) => {
    const n = name.trim().toLowerCase();
    if (myName && n === myName.toLowerCase()) return true;
    return presentNames.has(n);
  };
  list.innerHTML = roster.map(u => {
    const online = isOnline(u.name);
    const icon = online ? '⛵' : '⚓';
    const me = myName && u.name.trim().toLowerCase() === myName.toLowerCase();
    return `<div class="online-user" style="${online ? '' : 'opacity:0.5;'}" title="${online ? 'On the page now' : 'Anchored (offline)'}">
      <span style="font-size:14px; width:18px; text-align:center;">${icon}</span>
      <span class="online-name" style="font-size:12px;font-weight:700; color:${u.color}">${escHtml(u.name)}${me ? ' (you)' : ''}</span>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s) { return String(s).replace(/"/g,'&quot;'); }
function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

function hexToHsl(hex) {
  let r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h, s, l = (max+min)/2;
  if (max === min) { h = s = 0; } else {
    const d = max - min;
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    switch(max) { case r: h = ((g-b)/d + (g<b?6:0))/6; break; case g: h=(b-r)/d/6+1/3; break; default: h=(r-g)/d/6+2/3; }
  }
  return [Math.round(h*360), Math.round(s*100), Math.round(l*100)];
}

/**
 * Draw everything — and never let one broken section take down the app.
 *
 * The first five of these used to run unguarded. A single throw in any of them
 * aborted renderAll, which aborted BOOT — so renderAppVersion(), the build
 * check, initCursors() and startSync() at the bottom of 19-boot.js never ran.
 *
 * That one fault produced three unrelated-looking symptoms at once: no version
 * number, never connecting to sync, and meetings that drew and then vanished as
 * the throw cut the render short. Each section is now isolated, and anything
 * that fails is named on screen instead of silently killing the page.
 */
const RENDER_STEPS = [
  ['workspace names', () => applyWorkspaceNames()],
  ['meetings',        () => renderMeetings()],
  ['tasks',           () => renderTasks()],
  ['leaderboard',     () => renderLeaderboard()],
  ['online list',     () => renderOnlineUsers()],
  ['assignee picker', () => renderAssigneeSelect()],
  ['calendar',        () => renderCalendar()],
  ['planning',        () => renderPlanning()],
  ['activity pie',    () => renderPie()],
  ['pomodoro size',   () => loadPomoSize()],
  ['admin visibility',() => refreshAdminVisibility()],
  ['admin panel',     () => renderAdmin()],
];

let lastRenderFailures = [];

function renderAll() {
  const failed = [];
  RENDER_STEPS.forEach(([name, fn]) => {
    try { fn(); }
    catch (e) { failed.push(name); console.error('[boats] render failed:', name, e); }
  });
  lastRenderFailures = failed;
  showRenderFailures(failed);
}

/** Put a broken section on screen rather than leaving a blank one. */
function showRenderFailures(failed) {
  let el = document.getElementById('render-fail');
  if (!failed.length) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'render-fail';
    el.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:400;' +
      'background:var(--sail-red);color:#fff;font:800 12px Nunito,sans-serif;' +
      'padding:8px 14px;text-align:center;box-shadow:0 -2px 10px rgba(0,0,0,.3)';
    document.body.appendChild(el);
  }
  el.innerHTML = `⚠️ ${failed.length} section(s) failed to draw: <b>${failed.join(', ')}</b>
    — open the console for the reason. Everything else still works.
    <button onclick="this.parentElement.remove()"
      style="margin-left:10px;border:2px solid #fff;background:transparent;color:#fff;
             border-radius:14px;padding:2px 10px;font:800 11px Nunito;cursor:pointer">dismiss</button>`;
}
