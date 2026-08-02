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

function renderAll() {
  applyWorkspaceNames();
  renderMeetings();
  renderTasks();
  renderLeaderboard();
  renderOnlineUsers();
  renderAssigneeSelect();
  // these two read from tasks/people too, so keep them fresh after remote syncs.
  // Both guard against overwriting a field you're actively typing in.
  try { renderCalendar(); } catch(e) {}
  try { renderPlanning(); } catch(e) {}
  try { renderPie(); } catch(e) {}
  try { loadPomoSize(); } catch(e) {}
  try { refreshAdminVisibility(); } catch(e) {}
  try { renderAdmin(); } catch(e) {}
}
