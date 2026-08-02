// ═══════════════════════════════════════════════════════════════
//  WAY OF BOATS — 04-meetings.js
//  Meetings, checklists and their linked tasks
//
//  Loaded in numbered order by index.html. These are classic scripts,
//  not ES modules, so every function stays global and the inline
//  onclick= handlers in the markup keep working unchanged.
// ═══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════
// MEETINGS
// ══════════════════════════════════════════════
function openNewMeetingModal() {
  playSound('seagull');
  // Set default date to today
  const d = new Date();
  document.getElementById('nm-date').value = d.toISOString().split('T')[0];
  document.getElementById('nm-title').value = '';
  renderTemplateGrid();
  document.getElementById('new-meeting-modal').style.display = 'flex';
}

function renderTemplateGrid() {
  const grid = document.getElementById('template-grid');
  const tints = ['var(--ocean-pale)','var(--matcha-pale)','var(--sky-light)','var(--butter-light)','var(--lavender-light)','var(--milk)'];
  if (!getTemplates().some(t => t.id === state.selectedTemplate)) state.selectedTemplate = getTemplates()[0]?.id;
  grid.innerHTML = getTemplates().map((t, i) => `
    <div class="template-card ${state.selectedTemplate === t.id ? 'selected' : ''}"
         onclick="selectTemplate('${t.id}')"
         style="background:${tints[i % tints.length]}">
      <div class="t-emoji">${t.emoji}</div>
      <div class="t-name">${escHtml(t.name)}</div>
    </div>`).join('');
}

function selectTemplate(id) {
  state.selectedTemplate = id;
  renderTemplateGrid();
}

function createMeeting() {
  const title = document.getElementById('nm-title').value.trim() || 'Team Meeting';
  // auto-default the date to today if the user didn't pick one
  const date = document.getElementById('nm-date').value || estDateKey();
  const tmpl = getTemplates().find(t => t.id === state.selectedTemplate);
  const notes = {};
  const pt = state.personTemplates || {};
  state.people.forEach(p => { if (pt[p.id]) notes[p.id] = pt[p.id]; });
  const meeting = {
    id: Date.now(),
    createdAt: Date.now(),   // when it was actually created (for ordering + auto date)
    title,
    date,
    template: state.selectedTemplate,
    prompt: tmpl?.prompt || '',
    notes,
    checks: {},
    things: {}
  };
  state.meetings.unshift(meeting);
  save();
  closeModal('new-meeting-modal');
  renderMeetings();
  showToast('Meeting created! 📋');
}

function renderNextTaskBanner() {
  const banner = document.getElementById('next-task-banner');
  if (!banner) return;
  const myId = myPersonId();
  let pool = state.tasks.filter(t => !t.done);
  if (myId) pool = pool.filter(t => t.assigneeId === myId);
  if (pool.length === 0) { banner.style.display = 'none'; return; }
  pool.sort((a, b) => {
    const pr = (PRIORITY_META[a.priority||'medium'].rank) - (PRIORITY_META[b.priority||'medium'].rank);
    if (pr !== 0) return pr;
    return taskEffectiveMins(a) - taskEffectiveMins(b);
  });
  const t = pool[0];
  const p = personById(t.assigneeId);
  const cat = typeMeta(t.type || getActivityTypes()[0].id);
  const whoLabel = myId ? 'You' : (p ? escHtml(p.name) : 'Someone');
  banner.style.display = 'flex';
  banner.innerHTML = `
    <span style="font-size:20px">🧭</span>
    <div style="flex:1;">
      <div style="font-size:11px; font-weight:800; color:var(--ocean-deep); text-transform:uppercase; letter-spacing:0.04em;">Next up</div>
      <div style="font-size:14px; font-weight:700;">${whoLabel} should tackle: "${escHtml(t.text || 'untitled task')}"
        <span style="font-weight:600; color:var(--ink-light);">· ${PRIORITY_META[t.priority||'medium'].emoji} ${PRIORITY_META[t.priority||'medium'].label} · ${formatMinutes(taskEffectiveMins(t))}</span>
        <span style="display:inline-flex; align-items:center; gap:3px; vertical-align:middle;">${fishIcon(cat.color, 14)} ${escHtml(cat.label)}</span>
      </div>
    </div>
    <button class="btn-primary" style="flex-shrink:0" onclick="showSection('tasks')">Go to board</button>`;
}

function renderMeetings() {
  renderNextTaskBanner();
  const container = document.getElementById('meeting-notes-container');
  const tabs = document.getElementById('week-tabs');

  if (state.meetings.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-emoji">📝</div><p>No meetings yet!</p><small>Click "New Meeting" to get started.</small></div>`;
    tabs.innerHTML = '';
    return;
  }

  // sort meetings newest → oldest (by date, then creation time)
  state.meetings.sort((a, b) => {
    const da = a.date || '', db = b.date || '';
    if (da !== db) return db.localeCompare(da);
    return (b.createdAt || b.id || 0) - (a.createdAt || a.id || 0);
  });

  // Week tabs, newest week first
  const weekMap = {};
  state.meetings.forEach(m => { const w = getWeekLabel(m.date); if (!(w in weekMap)) weekMap[w] = weekStartKey(m.date); });
  const weeks = Object.keys(weekMap).sort((a,b) => weekMap[b].localeCompare(weekMap[a]));
  tabs.innerHTML = `<button class="tab-btn active" onclick="filterWeek(null, this)">All</button>` +
    weeks.map(w => `<button class="tab-btn" onclick="filterWeek('${w}', this)">${w}</button>`).join('');

  renderMeetingCards(state.meetings);
}
// sortable key (YYYY-MM-DD of the week's Sunday) for ordering week tabs
function weekStartKey(dateStr) {
  if (!dateStr) return '0000-00-00';
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - d.getDay());
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function getWeekLabel(dateStr) {
  if (!dateStr) return 'Undated';
  const d = new Date(dateStr + 'T00:00:00');
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  return `Week of ${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function filterWeek(week, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const filtered = week ? state.meetings.filter(m => getWeekLabel(m.date) === week) : state.meetings;
  renderMeetingCards(filtered);
}

function renderMeetingCards(meetings) {
  const container = document.getElementById('meeting-notes-container');
  const taskCounts = getTaskCountsByPerson();
  container.innerHTML = meetings.map(m => {
    const tmpl = getTemplates().find(t => t.id === m.template);

    let peopleCols;
    if (state.people.length === 0) {
      peopleCols = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-emoji">⚓</div><p>No crew yet!</p><small>Add people in "Edit People" and they'll appear here as columns.</small></div>`;
    } else {
      peopleCols = visiblePeople().map(p => {
        const hsl = hexToHsl(p.color);
        const bg = `hsl(${hsl[0]},${hsl[1]}%,${Math.min(96, hsl[2] + 22)}%)`;
        const border = p.color;
        const c = taskCounts[p.id] || { done: 0, total: 0 };
        const pct = c.total > 0 ? Math.round((c.done / c.total) * 100) : 0;
        // linked tasks for THIS meeting + person (for time + completeness donut)
        const myMeetingTasks = state.tasks.filter(tk => tk.meetingId === m.id && tk.assigneeId === p.id);
        const mtTotalMins = myMeetingTasks.reduce((s, tk) => s + taskEffectiveMins(tk), 0);
        const mtDone = myMeetingTasks.filter(tk => tk.done).length;
        const mtTotal = myMeetingTasks.length;
        const mtPct = mtTotal > 0 ? Math.round((mtDone / mtTotal) * 100) : 0;

        const checks = (m.checks && m.checks[p.id]) || [];
        const checksHtml = checks.map((chk, ci) => `
          <div class="pcheck-row">
            <div class="pcheck-box ${chk.done ? 'checked' : ''}" style="color:${border}" onclick="togglePCheck(${m.id}, '${p.id}', ${ci})"></div>
            <input class="pcheck-text ${chk.done ? 'done' : ''}" value="${escAttr(chk.text)}"
              placeholder="task item…"
              onkeydown="pcheckKey(event, ${m.id}, '${p.id}', ${ci})"
              onchange="editPCheck(${m.id}, '${p.id}', ${ci}, this.value)">
            <button class="pcheck-del" onclick="delPCheck(${m.id}, '${p.id}', ${ci})">×</button>
          </div>`).join('');

        // 3 THINGS box — up to 6 bullet lines
        const things = (m.things && m.things[p.id]) || ['', '', ''];
        const thingsHtml = things.map((tval, ti) => `
          <div class="thing-row">
            <span class="thing-dot" style="color:${border}">•</span>
            <input class="thing-text" value="${escAttr(tval)}" placeholder="${ti < 3 ? 'thing ' + (ti+1) : 'more…'}"
              onchange="editThing(${m.id}, '${p.id}', ${ti}, this.value)">
          </div>`).join('');

        return `<div class="person-col" style="background:${bg}; border-color:${border}; border-width:2px; border-style:solid;">
          <div class="person-col-header" style="color:${border}; border-color:${border}">
            <span>${escHtml(p.name)}</span>
            <button class="col-expand-btn" style="color:${border}" title="Expand ${escAttr(p.name)}'s tasks" onclick="openPersonExpand(${m.id}, '${p.id}')">⤢</button>
          </div>
          ${tmpl && tmpl.prompt ? `<div style="font-size:11px; font-weight:700; color:var(--ink-light); margin-bottom:5px; font-style:italic">${escHtml(tmpl.prompt)}</div>` : ''}
          <textarea class="person-notes-area"
            placeholder="Notes for ${escAttr(p.name)}…  (type /checkbox)"
            oninput="handleSlashInput(event, ${m.id}, '${p.id}')"
            onkeydown="handleSlashKey(event, ${m.id}, '${p.id}')"
            onchange="updatePersonNote(${m.id}, '${p.id}', this.value)"
          >${escHtml(m.notes[p.id] || '')}</textarea>

          <div class="things-box" style="border-color:${border}">
            <div class="things-header" style="color:${border}">⭐ 3 THINGS</div>
            ${thingsHtml}
            ${things.length < 6 ? `<button class="thing-add" style="color:${border}" onclick="addThing(${m.id}, '${p.id}')">＋ add a thing</button>` : ''}
          </div>

          <div class="checks-label" style="color:${border}">✅ Tasks (sync to board)</div>
          <div class="person-checks" id="checks-${m.id}-${p.id}">${checksHtml}</div>
          <button class="thing-add" style="color:${border}" onclick="addPCheck(${m.id}, '${p.id}')">＋ add checkbox</button>

          <div class="meeting-stats">
            <div class="meeting-donut">${completenessDonut(mtDone, mtTotal, border)}</div>
            <div class="meeting-stats-text">
              <div style="font-weight:800; color:${border};">${mtPct}% done today</div>
              <div style="font-size:11px; color:var(--ink-light);">${mtDone}/${mtTotal} tasks · ⏱️ ${formatMinutes(mtTotalMins)} total</div>
            </div>
          </div>
        </div>`;
      }).join('');
    }

    // meeting-wide total time across everyone
    const meetingTasks = state.tasks.filter(tk => tk.meetingId === m.id);
    const meetingMins = meetingTasks.reduce((s, tk) => s + taskEffectiveMins(tk), 0);
    const meetingDone = meetingTasks.filter(tk => tk.done).length;
    const meetingTotal = meetingTasks.length;

    return `<div class="meeting-note-card" id="meeting-${m.id}">
      <div class="meeting-note-header">
        <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0">
          <span style="font-size:20px">${tmpl?.emoji || '📋'}</span>
          <input class="meeting-note-title" value="${escAttr(m.title)}"
            onchange="updateMeetingTitle(${m.id}, this.value)"
            placeholder="Meeting title…">
        </div>
        <div style="display:flex; align-items:center; gap:8px; flex-shrink:0">
          <span class="week-badge" title="Total estimated time across everyone's tasks">⏱️ ${formatMinutes(meetingMins)}</span>
          <span class="week-badge" title="Completed tasks in this meeting">✅ ${meetingDone}/${meetingTotal}</span>
          <span class="week-badge">📅 ${m.date ? new Date(m.date + 'T00:00:00').toLocaleDateString('en-US', {month:'short', day:'numeric'}) : 'No date'}</span>
          <button class="delete-note-btn" onclick="deleteMeeting(${m.id})" title="Delete meeting">🗑️</button>
        </div>
      </div>
      <div class="meeting-note-body">
        <div class="people-grid">${peopleCols}</div>
      </div>
    </div>`;
  }).join('');
}

function updatePersonNote(meetingId, personId, value) {
  const m = state.meetings.find(x => x.id === meetingId);
  if (m) { if (!m.notes) m.notes = {}; m.notes[personId] = value; save(); }
}

// ── SLASH COMMAND: /checkbox ──
let slashHintEl = null;
function showSlashHint(target) {
  hideSlashHint();
  slashHintEl = document.createElement('div');
  slashHintEl.className = 'slash-hint';
  slashHintEl.innerHTML = '➕ Add checkbox — press <kbd>Enter</kbd>';
  document.body.appendChild(slashHintEl);
  const r = target.getBoundingClientRect();
  slashHintEl.style.left = (window.scrollX + r.left + 8) + 'px';
  slashHintEl.style.top = (window.scrollY + r.top - 36) + 'px';
}
function hideSlashHint() {
  if (slashHintEl) { slashHintEl.remove(); slashHintEl = null; }
}
function handleSlashInput(e, meetingId, personId) {
  const val = e.target.value;
  const lastLine = val.split('\n').pop().trim().toLowerCase();
  if (lastLine === '/checkbox' || lastLine === '/check') {
    showSlashHint(e.target);
  } else {
    hideSlashHint();
  }
}
function handleSlashKey(e, meetingId, personId) {
  if (e.key === 'Enter') {
    const val = e.target.value;
    const lines = val.split('\n');
    const lastLine = lines[lines.length - 1].trim().toLowerCase();
    if (lastLine === '/checkbox' || lastLine === '/check') {
      e.preventDefault();
      lines.pop();
      e.target.value = lines.join('\n');
      updatePersonNote(meetingId, personId, e.target.value);
      addPCheck(meetingId, personId);
      hideSlashHint();
    }
  }
}

// ── PER-PERSON CHECKBOXES (linked to task board) ──
function ensureChecks(m, personId) {
  if (!m.checks) m.checks = {};
  if (!m.checks[personId]) m.checks[personId] = [];
  return m.checks[personId];
}
function addPCheck(meetingId, personId) {
  const m = state.meetings.find(x => x.id === meetingId);
  if (!m) return;
  // create the linked board task immediately, with a shared link id
  const linkId = 'lk' + Date.now() + Math.floor(Math.random()*999);
  const task = { id: Date.now() + Math.floor(Math.random()*999), text: '', assigneeId: personId, done: false, priority: 'medium', type: getActivityTypes()[0].id, mins: 30, subtasks: [], source: 'meeting', linkedCheck: linkId, meetingId };
  state.tasks.push(task);
  ensureChecks(m, personId).push({ text: '', done: false, linkId });
  save();
  renderMeetings();
  renderTasks();
  renderLeaderboard();
  // focus the new empty checkbox input within THIS person's column
  setTimeout(() => {
    const container = document.getElementById('checks-' + meetingId + '-' + personId);
    if (container) {
      const inputs = container.querySelectorAll('.pcheck-text');
      if (inputs.length) inputs[inputs.length - 1].focus();
    }
  }, 50);
}
// Pressing Enter inside a checkbox text field adds another checkbox
function pcheckKey(e, meetingId, personId, idx) {
  if (e.key === 'Enter') {
    e.preventDefault();
    editPCheck(meetingId, personId, idx, e.target.value);
    addPCheck(meetingId, personId);
  }
}
function findLinkedTask(linkId) {
  return state.tasks.find(t => t.linkedCheck === linkId);
}
function togglePCheck(meetingId, personId, idx) {
  const m = state.meetings.find(x => x.id === meetingId);
  const chk = m?.checks?.[personId]?.[idx];
  if (!chk) return;
  // If a board task is linked, drive it through toggleTask so the on-time ⭐,
  // the sync back to this checkbox, and every other surface all happen. Ticking
  // here used to set task.done directly, which silently skipped the star.
  const task = findLinkedTask(chk.linkId);
  if (task) { toggleTask(task.id); return; }
  chk.done = !chk.done;
  if (chk.done) playSound('ding');
  save();
  refreshTaskSurfaces();
}
function editPCheck(meetingId, personId, idx, value) {
  const m = state.meetings.find(x => x.id === meetingId);
  const chk = m?.checks?.[personId]?.[idx];
  if (!chk) return;
  chk.text = value;
  const task = findLinkedTask(chk.linkId);
  if (task) task.text = value;
  save();
  renderTasks();
}
function delPCheck(meetingId, personId, idx) {
  const m = state.meetings.find(x => x.id === meetingId);
  if (!m?.checks?.[personId]) return;
  const chk = m.checks[personId][idx];
  // remove linked board task
  if (chk?.linkId) state.tasks = state.tasks.filter(t => t.linkedCheck !== chk.linkId);
  m.checks[personId].splice(idx, 1);
  save();
  renderMeetings();
  renderTasks();
  renderLeaderboard();
}
// Called when a board task linked to a check is toggled/edited from the task page
function syncCheckFromTask(task) {
  const m = state.meetings.find(x => x.id === task.meetingId);
  const arr = m?.checks?.[task.assigneeId];
  if (!arr) return;
  const chk = arr.find(c => c.linkId === task.linkedCheck);
  if (chk) chk.done = task.done;
}
function removeLinkedCheck(task) {
  const m = state.meetings.find(x => x.id === task.meetingId);
  const arr = m?.checks?.[task.assigneeId];
  if (!arr) return;
  const i = arr.findIndex(c => c.linkId === task.linkedCheck);
  if (i > -1) arr.splice(i, 1);
}

// ── 3 THINGS box (up to 6) ──
function ensureThings(m, personId) {
  if (!m.things) m.things = {};
  if (!m.things[personId]) m.things[personId] = ['', '', ''];
  return m.things[personId];
}
function editThing(meetingId, personId, idx, value) {
  const m = state.meetings.find(x => x.id === meetingId);
  if (!m) return;
  const arr = ensureThings(m, personId);
  arr[idx] = value;
  save();
}
function addThing(meetingId, personId) {
  const m = state.meetings.find(x => x.id === meetingId);
  if (!m) return;
  const arr = ensureThings(m, personId);
  if (arr.length < 6) arr.push('');
  save();
  renderMeetings();
}

// ── PERSON EXPAND (Notion-style expanded view of a person's meeting tasks) ──
let peContext = { meetingId: null, personId: null };
function openPersonExpand(meetingId, personId) {
  peContext = { meetingId, personId };
  const p = personById(personId);
  document.getElementById('pe-title').textContent = (p ? p.name : 'Person') + ' — Tasks';
  document.getElementById('pe-add').onclick = () => { addPCheck(meetingId, personId); renderPersonExpand(); };
  document.getElementById('person-expand-modal').style.display = 'flex';
  renderPersonExpand();
}
function renderPersonExpand() {
  const { meetingId, personId } = peContext;
  const box = document.getElementById('pe-tasklist');
  if (!box) return;
  const tasks = state.tasks.filter(t => t.meetingId === meetingId && t.assigneeId === personId);
  if (tasks.length === 0) {
    box.innerHTML = `<div class="empty-state" style="padding:20px"><div class="empty-emoji">📝</div><p>No tasks yet — add one below!</p></div>`;
    return;
  }
  box.innerHTML = tasks.map(t => {
    const curPrio = t.priority || 'medium';
    const curType = t.type || getActivityTypes()[0].id;
    const subs = t.subtasks || [];
    const subTotal = subs.reduce((s, st) => s + (st.mins||0), 0);
    const hasSubs = subs.length > 0;
    const prioOpts = PRIORITY_ORDER.map(k => `<option value="${k}" ${k===curPrio?'selected':''}>${PRIORITY_META[k].emoji} ${PRIORITY_META[k].label}</option>`).join('');
    const typeOpts = getActivityTypes().map(at => `<option value="${at.id}" ${at.id===curType?'selected':''}>${escHtml(at.label)}</option>`).join('');
    const subHtml = subs.map((st, si) => `
      <div class="subtask-row ${st.done?'done':''}">
        <div class="subtask-check ${st.done?'checked':''}" onclick="toggleSubtask(${t.id}, ${si}); renderPersonExpand();">${st.done?'✓':''}</div>
        <input class="subtask-text ${st.done?'done':''}" value="${escAttr(st.text)}" placeholder="subtask…"
          onchange="editSubtask(${t.id}, ${si}, this.value)">
        <input class="subtask-time" value="${formatMinutes(st.mins||0)}" onchange="setSubtaskMins(${t.id}, ${si}, this.value); renderPersonExpand();">
        <button class="pcheck-del" onclick="delSubtask(${t.id}, ${si}); renderPersonExpand();">×</button>
      </div>`).join('');
    return `<div style="background:var(--ocean-pale); border-radius:14px; padding:12px;">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
        <div class="task-check ${t.done?'checked':''}" onclick="toggleTask(${t.id}); renderPersonExpand();">${t.done?'✓':''}</div>
        <input class="form-input" value="${escAttr(t.text)}" placeholder="Task…" style="flex:1"
          onchange="editTaskText(${t.id}, this.value)">
        <button class="pcheck-del" onclick="deleteTask(${t.id}); renderPersonExpand();">×</button>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:8px;">
        ${hasSubs
          ? `<span class="time-sum">Σ ${formatMinutes(subTotal)}</span>`
          : `<input class="task-mini-select" style="width:64px;text-align:center;background:white;border:2px solid var(--lavender);" value="${formatMinutes(t.mins||30)}" title="Time — type 30m, 2h" onchange="setTaskMins(${t.id}, this.value); renderPersonExpand();">`}
        <select class="task-mini-select" onchange="setTaskPriority(${t.id}, this.value)">${prioOpts}</select>
        <span class="type-fish">${fishIcon(typeMeta(curType).color, 18)}</span>
        <select class="task-mini-select" onchange="setTaskType(${t.id}, this.value); renderPersonExpand();">${typeOpts}</select>
      </div>
      <div class="subtask-list" style="margin-left:0">${subHtml}</div>
      <button class="add-sub-btn" onclick="addSubtask(${t.id}); renderPersonExpand();">＋ subtask</button>
    </div>`;
  }).join('');
}
function editTaskText(id, value) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  t.text = value;
  // keep linked meeting checkbox text in sync
  if (t.linkedCheck) {
    const m = state.meetings.find(x => x.id === t.meetingId);
    const arr = m && m.checks && m.checks[t.assigneeId];
    if (arr) { const chk = arr.find(c => c.linkId === t.linkedCheck); if (chk) chk.text = value; }
  }
  save();
  renderTasks();
}

// ── TEMPLATE EDITING ──
function openTemplatesModal() {
  const list = document.getElementById('templates-edit-list');
  list.innerHTML = getTemplates().map((t, i) => `
    <div style="display:flex; gap:8px; align-items:center; background:var(--ocean-pale); padding:10px; border-radius:12px;">
      <input class="form-input" style="width:54px; text-align:center; font-size:20px; padding:6px" value="${escAttr(t.emoji)}" id="tpl-emoji-${i}" maxlength="3">
      <div style="flex:1; display:flex; flex-direction:column; gap:6px;">
        <input class="form-input" value="${escAttr(t.name)}" id="tpl-name-${i}" placeholder="Template name">
        <input class="form-input" value="${escAttr(t.prompt)}" id="tpl-prompt-${i}" placeholder="Column prompt (e.g. Wins · Blockers · Next)">
      </div>
    </div>`).join('');
  document.getElementById('templates-modal').style.display = 'flex';
}
function saveTemplates() {
  getTemplates().forEach((t, i) => {
    t.emoji = document.getElementById('tpl-emoji-' + i).value.trim() || '📋';
    t.name = document.getElementById('tpl-name-' + i).value.trim() || t.name;
    t.prompt = document.getElementById('tpl-prompt-' + i).value.trim();
  });
  save();
  closeModal('templates-modal');
  renderMeetings();
  showToast('Templates saved! ✏️');
}
function resetTemplates() {
  state.templates = JSON.parse(JSON.stringify(DEFAULT_TEMPLATES));
  save();
  openTemplatesModal();
  showToast('Templates reset ↺');
}

// ── ACTIVITY TYPES EDITOR ──
function openTypesModal() {
  const list = document.getElementById('types-edit-list');
  list.innerHTML = getActivityTypes().map((t, i) => `
    <div style="display:flex; gap:8px; align-items:center; background:var(--ocean-pale); padding:8px; border-radius:12px;" data-tid="${t.id}">
      <span class="at-fish-preview" style="width:26px;display:flex;justify-content:center;">${fishIcon(t.color || '#3B9BD4', 22)}</span>
      <input type="color" class="color-input at-color" value="${t.color || '#3B9BD4'}" title="Fish color"
        oninput="previewTypeFish(this)">
      <input class="form-input at-label" style="flex:1" value="${escAttr(t.label)}" placeholder="Activity name">
      <button class="task-delete" onclick="removeActivityType('${t.id}')">×</button>
    </div>`).join('');
  document.getElementById('types-modal').style.display = 'flex';
}
function previewTypeFish(colorInput) {
  const row = colorInput.closest('[data-tid]');
  const prev = row.querySelector('.at-fish-preview');
  if (prev) prev.innerHTML = fishIcon(colorInput.value, 22);
}
function commitTypesInputs() {
  const rows = document.querySelectorAll('#types-edit-list [data-tid]');
  const updated = [];
  rows.forEach(row => {
    const id = row.getAttribute('data-tid');
    const color = row.querySelector('.at-color').value || '#3B9BD4';
    const label = row.querySelector('.at-label').value.trim();
    if (label) updated.push({ id, color, label });
  });
  return updated;
}
function addActivityType() {
  const current = commitTypesInputs();
  const pal = ['#E8536A','#3B9BD4','#7AAF72','#FF7A3C','#C9B8E8','#F4A460','#2876B0'];
  current.push({ id: 'a' + Date.now() + Math.floor(Math.random()*999), color: pal[current.length % pal.length], label: '' });
  state.activityTypes = current;
  openTypesModal();
  setTimeout(() => {
    const labels = document.querySelectorAll('.at-label');
    if (labels.length) labels[labels.length - 1].focus();
  }, 30);
}
function removeActivityType(id) {
  state.activityTypes = commitTypesInputs().filter(t => t.id !== id);
  if (state.activityTypes.length === 0) {
    state.activityTypes = [{ id: 'general', color: '#3B9BD4', label: 'General' }];
  }
  openTypesModal();
}
function saveActivityTypes() {
  const updated = commitTypesInputs();
  if (updated.length === 0) { showToast('Keep at least one activity!'); return; }
  state.activityTypes = updated;
  // any task pointing at a now-deleted type → reassign to first type
  const validIds = new Set(updated.map(t => t.id));
  state.tasks.forEach(t => { if (!validIds.has(t.type)) t.type = updated[0].id; });
  save();
  closeModal('types-modal');
  renderTasks();
  showToast('Activities saved! ⚙️');
}
function resetActivityTypes() {
  state.activityTypes = JSON.parse(JSON.stringify(DEFAULT_ACTIVITY_TYPES));
  save();
  openTypesModal();
  showToast('Activities reset ↺');
}


function updateMeetingTitle(meetingId, value) {
  const m = state.meetings.find(x => x.id === meetingId);
  if (m) { m.title = value; save(); }
}

function deleteMeeting(id) {
  const m = state.meetings.find(x => x.id === id);
  if (!m) return;
  showConfirm('Delete this meeting and its checkboxes?', () => {
    // remove tasks linked to this meeting
    state.tasks = state.tasks.filter(t => t.meetingId !== id);
    state.meetings = state.meetings.filter(mm => mm.id !== id);
    save();
    renderMeetings();
    renderTasks();
    renderLeaderboard();
    showToast('Meeting deleted 🗑️');
  });
}

// Custom in-app confirm (works in sandboxed iframes where window.confirm is blocked)
function showConfirm(message, onYes) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = 600;
  overlay.innerHTML = `<div class="modal" style="max-width:360px; text-align:center">
    <div style="font-size:40px; margin-bottom:8px">🗑️</div>
    <div style="font-weight:800; font-size:15px; margin-bottom:18px; color:var(--ink)">${escHtml(message)}</div>
    <div style="display:flex; gap:10px; justify-content:center">
      <button class="btn-secondary" id="cf-no">Cancel</button>
      <button class="btn-primary" id="cf-yes" style="background:var(--sail-red); box-shadow:0 3px 0 #b53b4e">Delete</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#cf-no').onclick = () => overlay.remove();
  overlay.querySelector('#cf-yes').onclick = () => { overlay.remove(); onYes(); };
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}
