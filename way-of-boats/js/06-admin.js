// ═══════════════════════════════════════════════════════════════
//  WAY OF BOATS — 06-admin.js
//  Admin console: overrides, resets, shop management
//
//  Loaded in numbered order by index.html. These are classic scripts,
//  not ES modules, so every function stays global and the inline
//  onclick= handlers in the markup keep working unchanged.
// ═══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════
// ADMIN  (name yourself "adminmilo" to unlock)
// ══════════════════════════════════════════════
// The admin is deliberately invisible: never listed as crew, never on the
// leaderboard or World Cup, never in an assignee dropdown. It's a control
// account, not a player. Every display list goes through visiblePeople().
const ADMIN_NAME = 'adminmilo';

function isAdmin() {
  return (state.myName || '').trim().toLowerCase() === ADMIN_NAME;
}
function isHiddenPerson(p) {
  const n = (typeof p === 'string' ? p : (p && p.name) || '');
  return n.trim().toLowerCase() === ADMIN_NAME;
}
function visiblePeople() {
  return (state.people || []).filter(p => !isHiddenPerson(p));
}

function refreshAdminVisibility() {
  const btn = document.getElementById('nav-admin');
  if (btn) btn.style.display = isAdmin() ? 'flex' : 'none';
  // if we're sitting on the admin page and the name changed, bail out
  if (!isAdmin()) {
    const sec = document.getElementById('section-admin');
    if (sec && sec.classList.contains('active')) showSection('tasks');
  }
}

// ── admin panel ──
function renderAdmin() {
  if (!isAdmin()) return;
  renderAdminMeetings();
  renderAdminPlayers();
  renderAdminStore();
}

function renderAdminMeetings() {
  const sel = document.getElementById('admin-meeting');
  if (!sel) return;
  const ms = state.meetings || [];
  sel.innerHTML = ms.length
    ? ms.map(m => `<option value="${m.id}">${escHtml(m.title || 'Untitled')} · ${escHtml(m.date || '')}</option>`).join('')
    : `<option value="">No meetings yet</option>`;
  renderAdminMeetingCount();
}

function adminDoneTasksForMeeting(mid) {
  return state.tasks.filter(t => String(t.meetingId) === String(mid) && t.done);
}

function renderAdminMeetingCount() {
  const out = document.getElementById('admin-meeting-count');
  const sel = document.getElementById('admin-meeting');
  if (!out || !sel) return;
  if (!sel.value) { out.textContent = ''; return; }
  const n = adminDoneTasksForMeeting(sel.value).length;
  out.textContent = n ? `${n} done task${n === 1 ? '' : 's'} will be removed` : 'nothing done here yet';
}

function adminClearDoneFromMeeting() {
  if (!isAdmin()) return;
  const sel = document.getElementById('admin-meeting');
  if (!sel || !sel.value) return;
  const mid = sel.value;
  const doomed = adminDoneTasksForMeeting(mid);
  if (!doomed.length) { showToast('Nothing done to clear here.'); return; }
  const m = (state.meetings || []).find(x => String(x.id) === String(mid));
  askConfirm(`Delete ${doomed.length} completed task(s) from "${(m && m.title) || 'this meeting'}"?`,
    () => adminDoClearDone(doomed), 'Delete them');
}

function adminDoClearDone(doomed) {
  const ids = new Set(doomed.map(t => t.id));
  const links = new Set(doomed.map(t => t.linkedCheck).filter(Boolean));
  state.tasks = state.tasks.filter(t => !ids.has(t.id));
  // drop the matching meeting checklist rows so nothing dangles
  (state.meetings || []).forEach(mm => {
    if (!mm.checks) return;
    Object.keys(mm.checks).forEach(pid => {
      mm.checks[pid] = (mm.checks[pid] || []).filter(c => !(c.linkId && links.has(c.linkId)));
    });
  });
  // and unpin them from anyone's notebook / pomodoro session
  (state.people || []).forEach(p => {
    if (p.planning && Array.isArray(p.planning.links)) {
      p.planning.links = p.planning.links.filter(id => !ids.has(id));
    }
  });
  if (typeof pomoTaskIds !== 'undefined') pomoTaskIds = pomoTaskIds.filter(id => !ids.has(id));
  // record the deletion time so a stale device can't resurrect these tasks
  state.scoreEpoch = Date.now();
  save();
  refreshTaskSurfaces();
  renderAdmin();
  showToast(`🧹 Cleared ${doomed.length} done task(s).`);
}

// ── admin: store management ──
let pendingStoreImage = '';

function adminToggleStore(on) {
  if (!isAdmin()) return;
  state.storeEnabled = !!on;
  save();
  renderMarket();
  showToast(on ? '🛒 Shop opened for the crew' : '🔒 Shop closed');
}

// Shrink whatever they pick to a small square before storing. A raw phone photo
// is several megabytes as a data URL, which would bloat every sync payload.
function onStoreImagePick(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const S = 128;
      const c = document.createElement('canvas');
      c.width = S; c.height = S;
      const ctx = c.getContext('2d');
      // cover-crop to a square so nothing is squashed
      const side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S);
      pendingStoreImage = c.toDataURL('image/jpeg', 0.8);
      const prev = document.getElementById('store-new-preview');
      if (prev) prev.innerHTML = `<img src="${pendingStoreImage}" style="width:54px;height:54px;object-fit:cover;border-radius:10px;border:2px solid var(--ocean-pale)"> <span style="font-size:11px;font-weight:800;color:var(--matcha)">image ready (${Math.round(pendingStoreImage.length/1024)} KB)</span>`;
    };
    img.onerror = () => showToast("Couldn't read that image.");
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function adminAddStoreItem() {
  if (!isAdmin()) return;
  const name = (document.getElementById('store-new-name').value || '').trim();
  const cost = clampInt(document.getElementById('store-new-cost').value, 1, 99);
  const emoji = (document.getElementById('store-new-emoji').value || '').trim() || '🎁';
  if (!name) { showToast('Give the item a name first.'); return; }
  const list = Array.isArray(state.storeItems)
    ? state.storeItems.slice()
    : MARKET_ITEMS.filter(i => DEFAULT_SHELF_IDS.includes(i.id));
  if (list.length >= STORE_SLOTS - 1) {
    showToast(`The shop holds ${STORE_SLOTS} items — remove one first.`);
    return;
  }
  list.push({ id: 'cust_' + Date.now(), name, cost, emoji,
              image: pendingStoreImage || '', custom: true, special: !!pendingStoreImage });
  state.storeItems = list;
  save();
  pendingStoreImage = '';
  document.getElementById('store-new-name').value = '';
  document.getElementById('store-new-emoji').value = '';
  const prev = document.getElementById('store-new-preview'); if (prev) prev.innerHTML = '';
  const f = document.getElementById('store-new-file'); if (f) f.value = '';
  renderAdminStore(); renderMarket();
  showToast(`🛍️ Added "${name}" to the shop`);
}

function adminRemoveStoreItem(id) {
  if (!isAdmin() || id === STREAK_FIXER.id) return;
  const list = Array.isArray(state.storeItems)
    ? state.storeItems.slice()
    : MARKET_ITEMS.filter(i => DEFAULT_SHELF_IDS.includes(i.id));
  const item = list.find(i => i.id === id);
  askConfirm(`Remove "${(item && item.name) || 'this item'}" from the shop? Anyone who already bought it keeps it.`, () => {
    state.storeItems = list.filter(i => i.id !== id);
    save();
    renderAdminStore(); renderMarket();
  }, 'Remove it');
}

function renderAdminStore() {
  const box = document.getElementById('admin-store-list');
  const toggle = document.getElementById('admin-store-on');
  if (toggle) toggle.checked = storeIsOpen();
  if (!box) return;
  const items = getStoreItems();
  box.innerHTML = items.map(it => `
    <div class="admin-store-item ${it.permanent ? 'locked' : ''}">
      ${it.permanent ? '' : `<button class="admin-store-x" onclick="adminRemoveStoreItem('${it.id}')" title="Remove">×</button>`}
      ${it.image ? `<img src="${escAttr(it.image)}" alt="">` : `<div class="em">${it.emoji || '🎁'}</div>`}
      <div class="nm">${escHtml(it.name)}</div>
      <div class="ct">🎣 ${it.cost}${it.permanent ? ' · permanent' : ''}</div>
    </div>`).join('') +
    (items.length < STORE_SLOTS
      ? `<div class="admin-store-item" style="border-style:dashed;opacity:0.6;"><div class="em">➕</div><div class="nm">${STORE_SLOTS - items.length} slot(s) free</div></div>`
      : '');
}

function renderAdminPlayers() {
  const wrap = document.getElementById('admin-players');
  if (!wrap) return;
  const people = visiblePeople();
  if (!people.length) {
    wrap.innerHTML = `<div class="nb-empty">No crew to manage yet.</div>`;
    return;
  }
  wrap.innerHTML = people.map(p => {
    const fish = (p.fish || []).length;
    const realFish = (p.fish || []).filter(f => !f.fromAdmin).length;
    const checks = wcMonthChecks(p.id);
    return `<div class="admin-row">
      <div class="admin-row-head">
        <span class="admin-dot" style="background:${p.color || 'var(--ocean)'}"></span>
        <b>${escHtml(p.name)}</b>
        <span class="admin-meta">📅 ${checks} check-in${checks === 1 ? '' : 's'} this month · 🔥 ${totalStreakFor(p.id)} · ${Object.keys(personLogs(p.id)).length} log(s)</span>
      </div>
      <div class="admin-nums">
        <label class="admin-num">🎣 fish
          <input type="number" min="0" max="999" step="1" value="${fish}"
            onchange="adminSetFish('${p.id}', this.value)" onkeydown="if(event.key==='Enter') this.blur()">
        </label>
        <label class="admin-num">⭐ stars
          <input type="number" min="0" max="9999" step="1" value="${p.stars || 0}"
            onchange="adminSetStars('${p.id}', this.value)" onkeydown="if(event.key==='Enter') this.blur()">
        </label>
        <label class="admin-num">⏳ focus (min)
          <input type="number" min="0" max="999999" step="1" value="${focusMinutesFor(p.id)}"
            onchange="adminSetFocus('${p.id}', this.value)" onkeydown="if(event.key==='Enter') this.blur()">
        </label>
        <label class="admin-num">🎛️ points ±
          <input type="number" step="1" value="${p.pointsAdjust || 0}"
            onchange="adminSetAdjust('${p.id}', this.value)" onkeydown="if(event.key==='Enter') this.blur()">
        </label>
      </div>
      <div class="admin-row-acts">
        <span class="admin-hint">${realFish} earned${fish - realFish > 0 ? ` + ${fish - realFish} granted` : ''}</span>
        <button class="btn-secondary" onclick="adminClear('${p.id}','streaks')">clear streaks &amp; check-ins</button>
        <button class="btn-secondary" onclick="adminClear('${p.id}','logs')">clear logs</button>
      </div>
    </div>`;
  }).join('');
}

// ── in-app confirm ──
let pendingConfirm = null;
function askConfirm(message, fn, okLabel) {
  pendingConfirm = fn;
  const body = document.getElementById('confirm-body');
  const ok = document.getElementById('confirm-ok');
  if (!body || !ok) { if (typeof fn === 'function') fn(); return; }   // fail open
  body.textContent = message;
  ok.textContent = okLabel || 'Yes, do it';
  document.getElementById('confirm-modal').style.display = 'flex';
}
function runPendingConfirm() {
  const fn = pendingConfirm;
  pendingConfirm = null;
  closeModal('confirm-modal');
  if (typeof fn === 'function') fn();
}

// ── direct value setters (no dialog: typing a number IS the confirmation) ──
function clampInt(v, lo, hi) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return lo;
  return Math.max(lo, Math.min(n, hi));
}
function totalStreakFor(pid) {
  const p = personById(pid);
  if (!p) return 0;
  const wc = p.wc || {};
  return getWcCategories(pid).reduce((s, c) => s + ((wc[c.id] && wc[c.id].streak) || 0), 0);
}

// Set an exact fish count. Growing adds admin-granted fish (0 minutes, so they
// never inflate focus time); shrinking drops granted ones first so genuine
// catches survive as long as possible.
function adminSetFish(pid, val) {
  if (!isAdmin()) return;
  const p = personById(pid);
  if (!p) return;
  const n = clampInt(val, 0, 999);
  if (!Array.isArray(p.fish)) p.fish = [];
  while (p.fish.length > n) {
    const i = p.fish.findIndex(f => f.fromAdmin);
    p.fish.splice(i > -1 ? i : p.fish.length - 1, 1);
  }
  let seq = 0;
  while (p.fish.length < n) {
    p.fish.push({ emoji: '🐟', name: 'Granted by admin', minutes: 0, at: Date.now() + (seq++), fromAdmin: true });
  }
  bumpScoreEpoch([p]);
  save();
  adminAfterChange(`${p.name}: fish set to ${n}`);
}

function adminSetStars(pid, val) {
  if (!isAdmin()) return;
  const p = personById(pid);
  if (!p) return;
  p.stars = clampInt(val, 0, 9999);
  bumpScoreEpoch([p]);
  save();
  adminAfterChange(`${p.name}: stars set to ${p.stars}`);
}

function adminSetFocus(pid, val) {
  if (!isAdmin()) return;
  const p = personById(pid);
  if (!p) return;
  p.pomoMinutes = clampInt(val, 0, 999999);
  if (pid === myPersonId()) { try { localStorage.removeItem('boats_focus_mins'); } catch(e) {} }
  bumpScoreEpoch([p]);
  save();
  adminAfterChange(`${p.name}: focus time set to ${formatMinutes(p.pomoMinutes)}`);
}

function adminAfterChange(msg) {
  renderLeaderboard();
  try { renderWorldCup(); } catch(e) {}
  try { renderPomo(); } catch(e) {}
  try { renderLogPie(); } catch(e) {}
  renderAdmin();
  if (msg) showToast('✅ ' + msg);
}

function adminWipe(p, what) {
  if (what === 'fish')    p.fish = [];
  if (what === 'purchases') { p.purchases = []; p.stickers = []; p.activeStickers = []; p.streakFixers = 0; }
  if (what === 'stars')   p.stars = 0;
  if (what === 'focus')   { p.pomoMinutes = 0; p.pomoSessions = 0; }
  if (what === 'logs')    p.logs = {};
  if (what === 'adjust')  p.pointsAdjust = 0;
  if (what === 'streaks') {
    const wc = p.wc || {};
    Object.keys(wc).forEach(cid => {
      wc[cid] = { streak: 0, last: null, monthCounts: {}, monthFish: {} };
    });
    p.wc = wc;
  }
}

function adminClear(pid, what) {
  if (!isAdmin()) return;
  const p = personById(pid);
  if (!p) return;
  const label = { fish:'fish', streaks:'streaks and check-ins', stars:'stars', focus:'focus time', logs:'day logs' }[what] || what;
  askConfirm(`Clear ${p.name}'s ${label}?`, () => {
    adminWipe(p, what);
    bumpScoreEpoch([p]);
    save();
    adminAfterChange(`Cleared ${label} for ${p.name}`);
  }, 'Clear it');
}

function adminSetAdjust(pid, val) {
  if (!isAdmin()) return;
  const p = personById(pid);
  if (!p) return;
  const n = parseInt(val, 10);
  p.pointsAdjust = isNaN(n) ? 0 : n;
  bumpScoreEpoch([p]);
  save();
  adminAfterChange(`${p.name}: points adjustment set to ${p.pointsAdjust > 0 ? '+' : ''}${p.pointsAdjust}`);
}

function adminResetAll(what) {
  if (!isAdmin()) return;
  const people = visiblePeople();
  const labels = { fish:'all fish', streaks:'all streaks and check-ins', stars:'all stars',
    focus:'all focus time', logs:'all day logs', adjust:'all point adjustments',
    purchases:'all shop purchases, stickers and streak fixers',
    everything:'EVERYTHING — fish, streaks, stars, focus time and adjustments' };
  askConfirm(`Reset ${labels[what] || what} for all ${people.length} crew member(s)?`, () => {
    const kinds = what === 'everything' ? ['fish','streaks','stars','focus','adjust'] : [what];
    people.forEach(p => kinds.forEach(k => adminWipe(p, k)));
    bumpScoreEpoch(people);
    save();
    adminAfterChange(`Reset ${labels[what] || what}`);
  }, 'Reset them');
}

function toggleTask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  if (t.done) {
    playSound('ding');
    // ⭐ STAR: if this task had a due date and it's being completed on or before it,
    // award the assignee a star (once per task).
    if (t.due && !t.starAwarded) {
      const todayKey = estDateKey();
      if (todayKey <= t.due) {
        const p = personById(t.assigneeId);
        if (p) { p.stars = (p.stars || 0) + 1; t.starAwarded = true; showToast('⭐ On time! +1 star for ' + escHtml(p.name)); }
      }
    }
  } else {
    // un-completing a task takes back a star it granted
    if (t.starAwarded) {
      const p = personById(t.assigneeId);
      if (p && p.stars) p.stars = Math.max(0, p.stars - 1);
      t.starAwarded = false;
    }
  }
  if (t.linkedCheck) syncCheckFromTask(t);
  const el = document.getElementById('task-item-' + id);
  if (el) {
    el.classList.toggle('done', t.done);
    const chk = el.querySelector('.task-check');
    if (chk) { chk.classList.toggle('checked', t.done); chk.textContent = t.done ? '✓' : ''; }
  }
  save();
  requestAnimationFrame(refreshTaskSurfaces);
}

function deleteTask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (t && t.linkedCheck) removeLinkedCheck(t);
  state.tasks = state.tasks.filter(x => x.id !== id);
  save();
  renderTasks();
  renderLeaderboard();
  if (t && t.linkedCheck) renderMeetings();
}

function filterTasks(f, btn) {
  state.currentFilter = f;
  document.querySelectorAll('#task-filters .filter-chip').forEach(b => {
    if (['All','Open','Done'].includes(b.textContent.trim())) b.classList.remove('active');
  });
  btn.classList.add('active');
  renderTasks();
}

// ── BATCH EDIT ──
let batchMode = false;
let batchSelected = new Set();
function toggleBatchMode(btn) {
  batchMode = !batchMode;
  btn.classList.toggle('active', batchMode);
  btn.textContent = batchMode ? '☑️ Batch edit' : 'Batch edit';
  document.getElementById('batch-bar').style.display = batchMode ? 'flex' : 'none';
  if (!batchMode) batchSelected.clear();
  renderTasks();
}
let lastBatchIndex = null;
function currentTaskOrder() {
  // ids in the order currently shown in the list
  return Array.from(document.querySelectorAll('.task-item[data-id]')).map(el => parseInt(el.dataset.id, 10));
}
function setBatchSelected(id, on) {
  if (on) batchSelected.add(id); else batchSelected.delete(id);
  const el = document.getElementById('task-item-' + id);
  if (el) el.classList.toggle('batch-selected', on);
  const cb = el && el.querySelector('.batch-check'); if (cb) cb.checked = on;
}
function toggleBatchSelect(id, ev) {
  const order = currentTaskOrder();
  const idx = order.indexOf(id);
  // shift-click: select the range from the last clicked to here
  if (ev && ev.shiftKey && lastBatchIndex !== null) {
    const [a, b] = [lastBatchIndex, idx].sort((x,y)=>x-y);
    for (let i = a; i <= b; i++) setBatchSelected(order[i], true);
  } else {
    setBatchSelected(id, !batchSelected.has(id));
  }
  lastBatchIndex = idx;
  document.getElementById('batch-count').textContent = batchSelected.size;
}
// Drag across checkboxes to select a run of them
let batchDragging = false, batchDragValue = true;
function startBatchDrag(id, ev) {
  if (!batchMode) return;
  batchDragging = true;
  batchDragValue = !batchSelected.has(id); // set them all to the opposite of this one
  setBatchSelected(id, batchDragValue);
  lastBatchIndex = currentTaskOrder().indexOf(id);
  document.getElementById('batch-count').textContent = batchSelected.size;
  ev.preventDefault();
}
function overBatchDrag(id) {
  if (!batchDragging) return;
  setBatchSelected(id, batchDragValue);
  document.getElementById('batch-count').textContent = batchSelected.size;
}
document.addEventListener('mouseup', () => { batchDragging = false; });
function selectAllTasks() {
  document.querySelectorAll('.task-item[data-id]').forEach(el => {
    const id = parseInt(el.dataset.id, 10);
    batchSelected.add(id); el.classList.add('batch-selected');
    const cb = el.querySelector('.batch-check'); if (cb) cb.checked = true;
  });
  document.getElementById('batch-count').textContent = batchSelected.size;
}
function clearBatch() {
  batchSelected.clear();
  lastBatchIndex = null;
  document.getElementById('batch-count').textContent = 0;
  document.querySelectorAll('.task-item').forEach(el => el.classList.remove('batch-selected'));
  document.querySelectorAll('.batch-check').forEach(cb => cb.checked = false);
}
function applyBatch() {
  if (batchSelected.size === 0) { showToast('Select some tasks first'); return; }
  const pr = document.getElementById('batch-priority').value;
  const ty = document.getElementById('batch-type').value;
  const pe = document.getElementById('batch-person').value;
  state.tasks.forEach(t => {
    if (batchSelected.has(t.id)) {
      if (pr) t.priority = pr;
      if (ty) t.type = ty;
      if (pe) t.assigneeId = pe;
    }
  });
  save();
  renderTasks();
  renderLeaderboard();
  showToast(`Updated ${batchSelected.size} task(s) ✏️`);
}

// ── task search ──
// Matches the task title, its subtasks and its assignee's name, so you can find
// something by any of the words you'd actually remember about it.
function onTaskSearch(v) {
  state.taskSearch = v || '';
  const x = document.getElementById('task-search-x');
  if (x) x.style.display = state.taskSearch ? 'block' : 'none';
  renderTasks();
}
function clearTaskSearch() {
  state.taskSearch = '';
  const el = document.getElementById('task-search');
  if (el) el.value = '';
  const x = document.getElementById('task-search-x');
  if (x) x.style.display = 'none';
  renderTasks();
  if (el) el.focus();
}
function taskMatchesSearch(t, q) {
  if (!q) return true;
  const hay = [
    t.text || '',
    (t.subtasks || []).map(st => st.text || '').join(' '),
    (personById(t.assigneeId) || {}).name || '',
    typeMeta(t.type || getActivityTypes()[0].id).label || ''
  ].join(' ').toLowerCase();
  // every whitespace-separated term must appear somewhere
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(term => hay.includes(term));
}

function renderTasks() {
  renderAssigneeSelect();
  if (typeof renderPomoTodos === 'function') renderPomoTodos();
  // keep the due-date dropdown showing the sort that's actually applied (survives reloads)
  const dueSel = document.getElementById('sort-due');
  if (dueSel && dueSel.value !== (state.sortDue || '')) dueSel.value = state.sortDue || '';
  const sEl = document.getElementById('task-search');
  if (sEl && document.activeElement !== sEl && sEl.value !== (state.taskSearch || '')) sEl.value = state.taskSearch || '';
  const sX = document.getElementById('task-search-x');
  if (sX) sX.style.display = (state.taskSearch || '') ? 'block' : 'none';
  const list = document.getElementById('task-list');
  let tasks = state.tasks.slice();
  if (state.currentFilter === 'open') tasks = tasks.filter(t => !t.done);
  if (state.currentFilter === 'done') tasks = tasks.filter(t => t.done);

  // filter by person
  if (state.filterPerson) tasks = tasks.filter(t => t.assigneeId === state.filterPerson);
  // filter by activity type
  if (state.sortType) tasks = tasks.filter(t => (t.type || getActivityTypes()[0].id) === state.sortType);
  // free-text search
  const q = (state.taskSearch || '').trim();
  if (q) tasks = tasks.filter(t => taskMatchesSearch(t, q));

  // sort by priority
  if (state.sortPriority === 'high-first') {
    tasks.sort((a, b) => (PRIORITY_META[a.priority||'medium'].rank) - (PRIORITY_META[b.priority||'medium'].rank));
  } else if (state.sortPriority === 'low-first') {
    tasks.sort((a, b) => (PRIORITY_META[b.priority||'medium'].rank) - (PRIORITY_META[a.priority||'medium'].rank));
  }
  // sort by time estimate (uses subtask sum when present)
  if (state.sortTime === 'short-first') tasks.sort((a,b) => taskEffectiveMins(a) - taskEffectiveMins(b));
  else if (state.sortTime === 'long-first') tasks.sort((a,b) => taskEffectiveMins(b) - taskEffectiveMins(a));

  // sort by due date — tasks with no due date always sink to the bottom,
  // since "no deadline" isn't earlier OR later than a real one.
  if (state.sortDue === 'soon-first' || state.sortDue === 'late-first') {
    const dir = state.sortDue === 'soon-first' ? 1 : -1;
    tasks.sort((a, b) => {
      const ad = a.due || '', bd = b.due || '';
      if (!ad && !bd) return 0;
      if (!ad) return 1;
      if (!bd) return -1;
      return ad < bd ? -dir : (ad > bd ? dir : 0);
    });
  }

  if (tasks.length === 0) {
    const searching = !!(state.taskSearch || '').trim();
    list.innerHTML = `<div class="empty-state" style="padding:24px"><div class="empty-emoji">${searching ? '🔍' : '✅'}</div>
      <p>${searching
          ? `Nothing matches “${escHtml(state.taskSearch.trim())}”`
          : (state.currentFilter === 'done' ? 'No completed tasks yet!' : 'No tasks match — try clearing a filter!')}</p>
      ${searching ? `<small><button class="filter-chip" onclick="clearTaskSearch()">Clear search</button></small>` : ''}</div>`;
    return;
  }

  list.innerHTML = tasks.map(t => {
    const p = personById(t.assigneeId);
    const color = p?.color || '#999';
    const name = p?.name || 'Unassigned';
    const curPrio = t.priority || 'medium';
    const curType = t.type || getActivityTypes()[0].id;
    const mins = t.mins || 30;
    const subs = t.subtasks || [];
    const collapsed = t.collapsed;
    const hasSubs = subs.length > 0;
    // when there are subtasks, the parent's time is the SUM of subtask times
    const subTotal = subs.reduce((s, st) => s + (st.mins || 0), 0);
    const displayMins = hasSubs ? subTotal : mins;
    const prioOpts = PRIORITY_ORDER.map(k => `<option value="${k}" ${k===curPrio?'selected':''}>${PRIORITY_META[k].emoji} ${PRIORITY_META[k].label}</option>`).join('');
    const typeOpts = getActivityTypes().map(at => `<option value="${at.id}" ${at.id===curType?'selected':''}>${escHtml(at.label)}</option>`).join('');

    const subHtml = subs.map((st, si) => `
      <div class="subtask-row ${st.done?'done':''}">
        <div class="subtask-check ${st.done?'checked':''}" onclick="toggleSubtask(${t.id}, ${si})">${st.done?'✓':''}</div>
        <input class="subtask-text ${st.done?'done':''}" value="${escAttr(st.text)}" placeholder="subtask…"
          onkeydown="subtaskKey(event, ${t.id}, ${si})"
          onchange="editSubtask(${t.id}, ${si}, this.value)"
          onblur="cleanupEmptySubtask(${t.id}, ${si})">
        <input class="subtask-time" title="Subtask time — type 20m, 1h" value="${formatMinutes(st.mins||0)}"
          onchange="setSubtaskMins(${t.id}, ${si}, this.value)">
        <button class="pcheck-del" onclick="delSubtask(${t.id}, ${si})">×</button>
      </div>`).join('');

    return `<div class="task-item ${t.done ? 'done' : ''}" id="task-item-${t.id}" data-id="${t.id}">
      <div class="task-item-main">
        ${batchMode ? `<input type="checkbox" class="batch-check" onclick="toggleBatchSelect(${t.id}, event)" onmousedown="startBatchDrag(${t.id}, event)" onmouseenter="overBatchDrag(${t.id})" ${batchSelected.has(t.id)?'checked':''} title="Click, shift-click for a range, or drag across">` : ''}
        <div class="task-check ${t.done ? 'checked' : ''}" onclick="toggleTask(${t.id})">${t.done ? '✓' : ''}</div>
        ${hasSubs ? `<button class="sub-accordion" onclick="toggleCollapse(${t.id})" title="Show/hide subtasks">${collapsed?'▸':'▾'}</button>` : ''}
        <span class="task-text">${escHtml(t.text)}${t.linkedCheck ? ' <span style="font-size:11px;color:var(--ocean)" title="Linked to a meeting checkbox">🔗</span>' : ''}${hasSubs?` <span style="font-size:10px;opacity:0.6">(${subs.filter(s=>s.done).length}/${subs.length})</span>`:''}</span>
        <button class="add-sub-btn" onclick="addSubtask(${t.id})" title="Add subtask">＋sub</button>
        ${hasSubs
          ? `<span class="task-mini-select time-sum" title="Total of subtask times">Σ ${formatMinutes(displayMins)}</span>`
          : `<input class="task-mini-select time-input" title="Time estimate — type 30m, 90 min, 2h" value="${formatMinutes(mins)}" style="width:56px;text-align:center;" onchange="setTaskMins(${t.id}, this.value)">`}
        <select class="task-mini-select" title="Priority" onchange="setTaskPriority(${t.id}, this.value)">${prioOpts}</select>
        <span class="type-fish" title="${escAttr(typeMeta(curType).label)}">${fishIcon(typeMeta(curType).color, 18)}</span>
        <select class="task-mini-select" title="Activity" onchange="setTaskType(${t.id}, this.value)">${typeOpts}</select>
        <input class="task-mini-select task-due-input ${t.due ? (t.done && t.starAwarded ? 'due-met' : (t.due < estDateKey() && !t.done ? 'due-over' : '')) : ''}" type="date" value="${t.due || ''}" title="Due date — finish on time for a ⭐" onchange="setTaskDue(${t.id}, this.value)">
        <span class="task-assignee-pill" style="background:${color}">${escHtml(name)}</span>
        <button class="task-delete" onclick="deleteTask(${t.id})">×</button>
      </div>
      ${hasSubs && !collapsed ? `<div class="subtask-list">${subHtml}</div>` : ''}
    </div>`;
  }).join('');
}

function setTaskDue(id, value) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  t.due = value || '';
  // if it's already done, re-evaluate whether it earned/keeps its star
  if (t.done) {
    const onTime = t.due && estDateKey() <= t.due;
    const p = personById(t.assigneeId);
    if (onTime && !t.starAwarded) { if (p) p.stars = (p.stars||0)+1; t.starAwarded = true; }
    else if (!onTime && t.starAwarded) { if (p && p.stars) p.stars = Math.max(0, p.stars-1); t.starAwarded = false; }
  }
  save();
  renderTasks();
  renderLeaderboard();
  renderCalendar();          // the day chip moves with the date
  renderPlanningLinks();
}
function setTaskPriority(id, value) {
  const t = state.tasks.find(x => x.id === id);
  if (t) { t.priority = value; save(); if (state.sortPriority) renderTasks(); }
}
function setTaskType(id, value) {
  const t = state.tasks.find(x => x.id === id);
  if (t) { t.type = value; save(); if (state.sortType) renderTasks(); renderCalendar(); }
}
function setTaskMins(id, value) {
  const t = state.tasks.find(x => x.id === id);
  if (t) { t.mins = parseTimeToMinutes(value); save(); renderTasks(); }
}
function toggleCollapse(id) {
  const t = state.tasks.find(x => x.id === id);
  if (t) { t.collapsed = !t.collapsed; save(); renderTasks(); }
}

// ── SUBTASKS ──
function addSubtask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  if (!t.subtasks) t.subtasks = [];
  t.subtasks.push({ text: '', done: false, mins: 15 });
  t.collapsed = false;
  save();
  renderTasks();
  setTimeout(() => {
    const el = document.getElementById('task-item-' + id);
    if (el) { const ins = el.querySelectorAll('.subtask-text'); if (ins.length) ins[ins.length-1].focus(); }
  }, 40);
}
function setSubtaskMins(id, si, value) {
  const t = state.tasks.find(x => x.id === id);
  if (t && t.subtasks[si]) { t.subtasks[si].mins = parseTimeToMinutes(value); save(); renderTasks(); }
}
// Effective time of a task: sum of subtasks if any, else its own estimate.
function taskEffectiveMins(t) {
  if (t.subtasks && t.subtasks.length) return t.subtasks.reduce((s, st) => s + (st.mins || 0), 0);
  return t.mins || 30;
}
function subtaskKey(e, id, si) {
  if (e.key === 'Enter') {
    e.preventDefault();
    editSubtask(id, si, e.target.value);
    if (e.target.value.trim()) addSubtask(id);  // chain a new one only if this had text
  }
}
function editSubtask(id, si, value) {
  const t = state.tasks.find(x => x.id === id);
  if (t && t.subtasks[si]) { t.subtasks[si].text = value; save(); }
}
function toggleSubtask(id, si) {
  const t = state.tasks.find(x => x.id === id);
  if (t && t.subtasks[si]) { t.subtasks[si].done = !t.subtasks[si].done; if (t.subtasks[si].done) playSound('ding'); save(); refreshTaskSurfaces(); }
}
function delSubtask(id, si) {
  const t = state.tasks.find(x => x.id === id);
  if (t && t.subtasks) { t.subtasks.splice(si,1); save(); renderTasks(); }
}
// remove an empty subtask when the user clicks away
function cleanupEmptySubtask(id, si) {
  const t = state.tasks.find(x => x.id === id);
  if (t && t.subtasks && t.subtasks[si] && !t.subtasks[si].text.trim()) {
    // only auto-remove if it's the last one and empty (avoid index shifts mid-typing elsewhere)
    setTimeout(() => {
      const active = document.activeElement;
      const stillTyping = active && active.classList && active.classList.contains('subtask-text');
      if (!stillTyping && t.subtasks[si] && !t.subtasks[si].text.trim()) {
        t.subtasks.splice(si,1); save(); renderTasks();
      }
    }, 120);
  }
}

function getTaskCountsByPerson() {
  const counts = {};
  state.people.forEach(p => counts[p.id] = { done: 0, total: 0 });
  state.tasks.forEach(t => {
    if (!counts[t.assigneeId]) counts[t.assigneeId] = { done: 0, total: 0 };
    counts[t.assigneeId].total++;
    if (t.done) counts[t.assigneeId].done++;
  });
  return counts;
}
