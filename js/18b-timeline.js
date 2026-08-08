// ═══════════════════════════════════════════════════════════════
//  WAY OF BOATS — 18b-timeline.js
//  Timeline section: a scrollable/zoomable horizontal timeline, plus a
//  project "bookshelf" where each project is a book you can open.
//
//  Loaded after 18-calendar.js and BEFORE 19-boot.js, because boot starts
//  the sync and the collections below must be registered by then.
//
//  This module is self-contained on purpose: it defines its own date helpers
//  rather than borrowing from 07-worldcup.js or 15-logs.js, so edits to those
//  files can't break it.
//
//  ⚠️ NAMING: every module here is a classic script sharing ONE global scope,
//  so two files declaring the same function name silently clobber each other —
//  last one loaded wins. This file once declared `renderTimeline`, which
//  15-logs.js already used to draw the day timeline; the log view started
//  rendering the string "undefined". Everything public here is prefixed `tl`,
//  `book`, `project` or `status` to keep out of the way. Keep it that way.
// ═══════════════════════════════════════════════════════════════

// Register our two collections with the sync engine at runtime. `const` arrays
// are still mutable, so this avoids editing 02-persist.js just to add storage.
if (typeof SINGLETONS !== 'undefined') {
  ['projects', 'tlPoints', 'projectStatuses'].forEach(k => { if (!SINGLETONS.includes(k)) SINGLETONS.push(k); });
}

// Statuses are editable — name and colour both. These are only the defaults;
// once someone edits them the list lives in state.projectStatuses and syncs.
const DEFAULT_STATUSES = [
  { id: 'not_started',    label: 'Not started',    color: '#9FAEB8' },
  { id: 'in_progress',    label: 'In progress',    color: '#3B9BD4' },
  { id: 'under_approval', label: 'Under Approval', color: '#F4A261' },
  { id: 'submit_invoice', label: 'Submit invoice', color: '#C9B8E8' },
  { id: 'paid',           label: 'Paid',           color: '#7AAF72' },
];

function projectStatuses() {
  if (!Array.isArray(state.projectStatuses) || !state.projectStatuses.length) {
    state.projectStatuses = DEFAULT_STATUSES.map(s => ({ ...s }));
  }
  return state.projectStatuses;
}

// Accepts an id OR a legacy plain-text label, so projects saved before statuses
// became editable still resolve to the right colour.
function statusOf(value) {
  const list = projectStatuses();
  return list.find(s => s.id === value)
      || list.find(s => (s.label || '').toLowerCase() === String(value || '').toLowerCase())
      || list[0];
}
function statusOptions(selected) {
  const cur = statusOf(selected);
  return projectStatuses().map(s =>
    `<option value="${escAttr(s.id)}" ${s.id === cur.id ? 'selected' : ''}>${escHtml(s.label)}</option>`).join('');
}
const BOOK_COLORS = ['#3B9BD4', '#E8536A', '#7AAF72', '#F4A261', '#C9B8E8', '#2A9D8F', '#E9C46A', '#B5838D'];
const BOOK_EMOJI = ['📕', '📗', '📘', '📙', '📔', '📒', '📓', '📚'];

// ── dates (kept local so nothing else can shift under us) ──
function tlToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function tlParse(key) {
  const [y, m, d] = String(key || '').split('-').map(Number);
  return (y && m && d) ? new Date(y, m - 1, d) : null;
}
function tlKey(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
function tlAddDays(key, n) {
  const d = tlParse(key); if (!d) return key;
  d.setDate(d.getDate() + n); return tlKey(d);
}
function tlDaysBetween(a, b) {
  const da = tlParse(a), db = tlParse(b);
  if (!da || !db) return 0;
  return Math.round((db - da) / 86400000);
}
function tlLabel(key, withYear) {
  const d = tlParse(key); if (!d) return key || '';
  const mons = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${mons[d.getMonth()]} ${d.getDate()}` + (withYear ? ` ${d.getFullYear()}` : '');
}

// ── storage ──
function projects() {
  if (!Array.isArray(state.projects)) state.projects = [];
  return state.projects;
}
function projectById(id) { return projects().find(p => String(p.id) === String(id)) || null; }
function tlPoints() {
  if (!Array.isArray(state.tlPoints)) state.tlPoints = [];
  return state.tlPoints;
}
// A point is plotted where it's DUE. `date` is when the work starts, and the
// gap between the two is drawn as an era bar with a boat at the near end.
function pointDue(p) {
  return (p && p.endDate && p.endDate > p.date) ? p.endDate : (p ? p.date : '');
}

function pointsForProject(pid) {
  return tlPoints().filter(p => String(p.projectId) === String(pid))
                   .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

// Tasks belonging to a project are matched by the "Project: task" naming rule,
// so a task stays linked even if it's edited from the task board.
function projectTasks(proj) {
  if (!proj) return [];
  const prefix = (proj.name || '').trim().toLowerCase() + ':';
  return state.tasks.filter(t => (t.text || '').trim().toLowerCase().startsWith(prefix));
}
function projectProgress(proj) {
  const ts = projectTasks(proj);
  if (!ts.length) return { done: 0, total: 0, pct: 0 };
  const done = ts.filter(t => t.done).length;
  return { done, total: ts.length, pct: Math.round((done / ts.length) * 100) };
}

// ══════════════════════════════════════════════
//  SECTION SHELL
// ══════════════════════════════════════════════
let tlMode = 'timeline';          // 'timeline' | 'shelf'
let tlScale = 6;                  // pixels per day
let tlFilterProject = '';         // '' = every project
let bookOpenId = null;
let bookPage = 0;                 // 0 = notes spread, 1 = project timeline

function showTlMode(mode) {
  tlMode = mode;
  ['timeline', 'shelf'].forEach(m => {
    const pane = document.getElementById('tl-pane-' + m);
    const tab = document.getElementById('tl-tab-' + m);
    if (pane) pane.classList.toggle('active', m === mode);
    if (tab) tab.classList.toggle('active', m === mode);
  });
  renderTimelineSection();
}

function renderTimelineSection() {
  if (tlMode === 'shelf') renderBookshelf();
  else renderTlBoard();
  renderTlProjectFilter();
}

function renderTlProjectFilter() {
  const sel = document.getElementById('tl-project-filter');
  if (!sel) return;
  sel.innerHTML = `<option value="">All projects</option>` +
    projects().map(p => `<option value="${p.id}">${escHtml(p.name || 'Untitled')}</option>`).join('');
  sel.value = tlFilterProject;
}
function onTlFilterChange() {
  const sel = document.getElementById('tl-project-filter');
  tlFilterProject = sel ? sel.value : '';
  renderTlBoard();
}

// ══════════════════════════════════════════════
//  THE TIMELINE
//  One line down the middle, points alternating above and below it, eras
//  drawn as bars along it. Zoom is pixels-per-day; panning is just the
//  container's horizontal scroll.
// ══════════════════════════════════════════════
function tlVisiblePoints() {
  const all = tlPoints();
  const list = tlFilterProject
    ? all.filter(p => String(p.projectId) === String(tlFilterProject))
    : all;
  return list.slice().sort((a, b) => pointDue(a).localeCompare(pointDue(b)));
}

function tlRange(pts) {
  if (!pts.length) {
    const t = tlToday();
    return { start: tlAddDays(t, -30), end: tlAddDays(t, 60) };
  }
  let min = pts[0].date, max = pointDue(pts[0]);
  pts.forEach(p => {
    if (p.date < min) min = p.date;
    if (pointDue(p) > max) max = pointDue(p);
  });
  // a little air either side so the first and last markers aren't flush
  return { start: tlAddDays(min, -14), end: tlAddDays(max, 14) };
}

function setTlScale(v) {
  tlScale = Math.max(0.4, Math.min(60, v));
  renderTlBoard();
}
function zoomTl(mult) { setTlScale(tlScale * mult); }

function renderTlBoard() {
  const wrap = document.getElementById('tl-canvas');
  if (!wrap) return;
  const pts = tlVisiblePoints();
  const { start, end } = tlRange(pts);
  const days = Math.max(1, tlDaysBetween(start, end));
  // The strip is at least as wide as its window so the axis spans the view,
  // but content is always laid out at the true scale so zooming visibly
  // spreads the points apart.
  const winW = wrap.clientWidth || 900;
  // Don't let anyone zoom out past "the whole thing fits" — beyond that the
  // points just bunch against the left edge with dead space to the right.
  const minScale = Math.max(0.02, (winW - 40) / days);
  if (tlScale < minScale) tlScale = minScale;
  const width = Math.max(winW, days * tlScale);
  const x = key => tlDaysBetween(start, key) * tlScale;

  // ── ruler ticks ──
  // Aim for a tick roughly every 120px whatever the zoom, then snap that to a
  // calendar-friendly interval so labels land on sensible dates instead of
  // arbitrary ones. Fixed thresholds looked fine at some zooms and left the
  // ruler nearly empty at others.
  const NICE_STEPS = [1, 2, 3, 7, 14, 30, 61, 91, 182, 365, 730, 1825];
  const wanted = Math.max(1, (days * tlScale) / 120);
  const raw = Math.max(1, days / wanted);
  let stepDays = NICE_STEPS.reduce((best, n) =>
    Math.abs(n - raw) < Math.abs(best - raw) ? n : best, NICE_STEPS[0]);
  // hard ceiling on tick nodes so a decade at full zoom can't spray thousands
  // of divs into the DOM
  const MAX_TICKS = 400;
  while (days / stepDays > MAX_TICKS) stepDays *= 2;
  const fmt = stepDays >= 365 ? (k => { const d = tlParse(k); return d ? d.getFullYear() : k; })
            : stepDays >= 61  ? (k => tlLabel(k, true))
            : (k => tlLabel(k));

  let ticks = '';
  for (let d = 0; d <= days; d += stepDays) {
    const key = tlAddDays(start, d);
    ticks += `<div class="tl-tick" style="left:${(d * tlScale).toFixed(1)}px">
      <div class="tl-tick-line"></div><div class="tl-tick-label">${escHtml(String(fmt(key)))}</div>
    </div>`;
  }

  // today marker, when it falls inside the range
  const today = tlToday();
  const todayMark = (today >= start && today <= end)
    ? `<div class="tl-today" style="left:${x(today).toFixed(1)}px"><span>today</span></div>` : '';

  // ── eras: a bar spanning date → endDate ──
  const eras = pts.filter(p => p.endDate && p.endDate > p.date).map(p => {
    const proj = projectById(p.projectId);
    const col = (proj && proj.color) || 'var(--ocean)';
    const left = x(p.date), w = Math.max(6, x(p.endDate) - left);
    return `<div class="tl-era" style="left:${left.toFixed(1)}px;width:${w.toFixed(1)}px;background:${col}"
      title="${escAttr((proj ? proj.name + ' · ' : '') + p.title + ' · starts ' + tlLabel(p.date, true) + ', due ' + tlLabel(p.endDate, true))}"></div>`;
  }).join('');

  // ── points, alternating above / below the line ──
  const markers = pts.map((p, i) => {
    const proj = projectById(p.projectId);
    const col = (proj && proj.color) || 'var(--ocean)';
    const above = i % 2 === 0;
    const meta = p.type ? typeMeta(p.type) : null;
    const task = p.taskId ? state.tasks.find(t => t.id === p.taskId) : null;
    const due = pointDue(p);
    const dueX = x(due);
    // the boat is drawn relative to the marker, so it lands on the start date
    const boat = (due !== p.date)
      ? `<div class="tl-boat" style="left:${(x(p.date) - dueX).toFixed(1)}px;color:${col}"
           title="${escAttr('starts ' + tlLabel(p.date, true))}">⛵</div>` : '';
    return `<div class="tl-point ${above ? 'above' : 'below'}" data-pid="${p.id}" style="left:${dueX.toFixed(1)}px"
        onclick="openPointModal('${p.id}')" title="${escAttr('due ' + tlLabel(due, true))}">
      ${boat}
      <div class="tl-card" style="border-color:${col}">
        <div class="tl-card-date">${due !== p.date ? '⛵ ' + escHtml(tlLabel(p.date)) + ' → ' : ''}${escHtml(tlLabel(due, true))}</div>
        <div class="tl-card-title">${escHtml(p.title || 'Untitled')}</div>
        ${proj ? `<div class="tl-card-proj" style="color:${col}">${escHtml(proj.emoji || '📘')} ${escHtml(proj.name)}</div>` : ''}
        ${meta ? `<span class="tl-card-chip" style="background:${meta.color}">${escHtml(meta.label)}</span>` : ''}
        ${task ? `<span class="tl-card-chip ${task.done ? 'done' : ''}" style="background:var(--ink-light)">${task.done ? '✓ task done' : '◻ task'}</span>` : ''}
      </div>
      <div class="tl-stem" style="background:${col}"></div>
      <div class="tl-dot" style="background:${col}"></div>
    </div>`;
  }).join('');

  wrap.innerHTML = `<div class="tl-strip" style="width:${width.toFixed(0)}px">
      <div class="tl-ticks">${ticks}</div>
      <div class="tl-axis"></div>
      ${eras}${todayMark}${markers}
    </div>`;

  const empty = document.getElementById('tl-empty');
  if (empty) empty.style.display = pts.length ? 'none' : 'block';
  const rangeLabel = document.getElementById('tl-range');
  if (rangeLabel) {
    rangeLabel.textContent = pts.length
      ? `${tlLabel(start, true)} → ${tlLabel(end, true)} · ${pts.length} point${pts.length === 1 ? '' : 's'}`
      : 'nothing plotted yet';
  }
  const zl = document.getElementById('tl-zoom-label');
  if (zl) zl.textContent = tlScale >= 20 ? 'days' : tlScale >= 6 ? 'weeks' : tlScale >= 1.5 ? 'months' : 'years';
}

// ctrl/⌘ + wheel zooms, anchored on whatever is under the pointer
function tlWheel(e) {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  zoomTlAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX);
}

/**
 * Zoom while holding one moment in time still.
 *
 * The pixel under the cursor is converted to a day offset before the rescale,
 * then converted back afterwards and the scroll corrected — so the date you're
 * pointing at doesn't slide out from under you.
 */
function zoomTlAt(mult, clientX) {
  const wrap = document.getElementById('tl-canvas');
  if (!wrap) { zoomTl(mult); return; }
  const rect = wrap.getBoundingClientRect();
  const cursorX = (clientX == null) ? rect.width / 2 : (clientX - rect.left);
  const dayUnderCursor = (wrap.scrollLeft + cursorX) / Math.max(0.0001, tlScale);

  tlScale = Math.max(0.02, Math.min(60, tlScale * mult));
  renderTlBoard();                       // may clamp tlScale further

  wrap.scrollLeft = (dayUnderCursor * tlScale) - cursorX;
}

// ── drag anywhere on the canvas to travel along the timeline ──
let tlPan = null;
function tlPanDown(e) {
  if (e.button != null && e.button !== 0) return;
  const wrap = document.getElementById('tl-canvas');
  if (!wrap) return;
  // let cards keep their own click behaviour
  if (e.target.closest && e.target.closest('.tl-point')) return;
  tlPan = { x: e.clientX, scroll: wrap.scrollLeft, moved: 0, wrap,
            onAxis: !!(e.target.classList && (e.target.classList.contains('tl-axis') ||
                       e.target.classList.contains('tl-strip') || e.target.classList.contains('tl-era'))) };
  wrap.classList.add('panning');
  e.preventDefault();
}
function tlPanMove(e) {
  if (!tlPan) return;
  const dx = e.clientX - tlPan.x;
  tlPan.moved = Math.max(tlPan.moved, Math.abs(dx));
  tlPan.wrap.scrollLeft = tlPan.scroll - dx;
}
function tlPanUp(e) {
  if (!tlPan) return;
  const d = tlPan;
  tlPan = null;
  d.wrap.classList.remove('panning');
  // a click on the bare line (not a drag) drops a new point on that date
  if (d.moved <= 4 && d.onAxis && e && typeof e.clientX === 'number') {
    const rect = d.wrap.getBoundingClientRect();
    const contentX = d.wrap.scrollLeft + (e.clientX - rect.left);
    const pts = tlVisiblePoints();
    const { start } = tlRange(pts);
    const key = tlAddDays(start, Math.round(contentX / Math.max(0.0001, tlScale)));
    openPointModal(null, key);
  }
}
document.addEventListener('pointermove', tlPanMove);
document.addEventListener('pointerup', tlPanUp);
document.addEventListener('pointercancel', () => { if (tlPan) { tlPan.wrap.classList.remove('panning'); tlPan = null; } });

// ── arrow keys hop between points ──
let tlFocusIdx = -1;
function stepTlPoint(dir) {
  const pts = tlVisiblePoints();
  if (!pts.length) return;
  tlFocusIdx = Math.max(0, Math.min(pts.length - 1, tlFocusIdx + dir));
  if (tlFocusIdx < 0) tlFocusIdx = 0;
  const target = pts[tlFocusIdx];
  const wrap = document.getElementById('tl-canvas');
  const el = wrap && wrap.querySelector(`.tl-point[data-pid="${target.id}"]`);
  if (!wrap || !el) return;
  wrap.querySelectorAll('.tl-point.focused').forEach(n => n.classList.remove('focused'));
  el.classList.add('focused');
  const left = parseFloat(el.style.left) || 0;
  wrap.scrollTo({ left: left - wrap.clientWidth / 2, behavior: 'smooth' });
  const label = document.getElementById('tl-range');
  if (label) label.textContent = `${target.title} · due ${tlLabel(pointDue(target), true)}`;
}
document.addEventListener('keydown', e => {
  const sec = document.getElementById('section-timeline');
  if (!sec || !sec.classList.contains('active')) return;
  if (tlMode !== 'timeline') return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (document.querySelector('.modal-overlay[style*="flex"]')) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); stepTlPoint(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); stepTlPoint(-1); }
});

// ══════════════════════════════════════════════
//  ADD / EDIT A POINT
// ══════════════════════════════════════════════
let editingPointId = null;

function openPointModal(pointId, presetDate) {
  editingPointId = pointId || null;
  const p = pointId ? tlPoints().find(x => String(x.id) === String(pointId)) : null;

  document.getElementById('pt-modal-title').textContent = p ? '✏️ Edit point' : '📍 Add a point';
  document.getElementById('pt-title').value = p ? (p.title || '') : '';
  document.getElementById('pt-date').value = p ? (p.date || tlToday()) : (presetDate || tlToday());
  document.getElementById('pt-end').value = p && p.endDate ? p.endDate : '';

  const psel = document.getElementById('pt-project');
  psel.innerHTML = projects().length
    ? projects().map(x => `<option value="${x.id}">${escHtml(x.emoji || '📘')} ${escHtml(x.name || 'Untitled')}</option>`).join('')
    : `<option value="">No projects yet — add a book first</option>`;
  if (p) psel.value = p.projectId || '';
  else if (tlFilterProject) psel.value = tlFilterProject;

  const tsel = document.getElementById('pt-type');
  tsel.innerHTML = `<option value="">No category</option>` +
    getActivityTypes().map(a => `<option value="${a.id}">${escHtml(a.label)}</option>`).join('');
  tsel.value = p ? (p.type || '') : '';

  const mk = document.getElementById('pt-maketask');
  mk.checked = p ? !!p.taskId : true;
  mk.disabled = !!(p && p.taskId);
  document.getElementById('pt-task-note').textContent = p && p.taskId
    ? 'A task already exists for this point.'
    : 'Creates a task due on the point date, named "Project: title".';

  document.getElementById('pt-delete').style.display = p ? 'inline-flex' : 'none';
  document.getElementById('point-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('pt-title').focus(), 60);
}

function savePointFromModal() {
  const title = document.getElementById('pt-title').value.trim();
  const date = document.getElementById('pt-date').value;
  const endDate = document.getElementById('pt-end').value;
  const projectId = document.getElementById('pt-project').value;
  const type = document.getElementById('pt-type').value;
  const makeTask = document.getElementById('pt-maketask').checked;

  if (!title) { showToast('Give the point a title 📍'); return; }
  if (!date) { showToast('Pick a date 📅'); return; }
  if (endDate && endDate < date) { showToast('The era has to end after it starts ⏳'); return; }

  const list = tlPoints();
  let pt = editingPointId ? list.find(x => String(x.id) === String(editingPointId)) : null;
  if (!pt) {
    pt = { id: 'tp' + Date.now() + Math.floor(Math.random() * 999), createdAt: Date.now() };
    list.push(pt);
  }
  Object.assign(pt, { title, date, endDate: endDate || '', projectId, type });

  // "Project name: what needs doing" — one task, due on the point's date
  if (makeTask && !pt.taskId) {
    const proj = projectById(projectId);
    const text = (proj ? proj.name + ': ' : '') + title;
    const task = {
      id: Date.now() + Math.floor(Math.random() * 999),
      text,
      assigneeId: myPersonId() || (state.people[0] && state.people[0].id) || '',
      priority: 'medium',
      type: type || getActivityTypes()[0].id,
      mins: 30,
      due: pointDue({ date, endDate }),
      done: false,
      source: 'timeline',
      subtasks: [],
      collapsed: false
    };
    state.tasks.push(task);
    pt.taskId = task.id;
    showToast(`📍 Point added — task "${text}" is due ${tlLabel(pointDue({ date, endDate }))}`);
  } else {
    showToast('📍 Point saved');
  }
  // keep an existing task's due date in step with the point
  if (pt.taskId) {
    const t = state.tasks.find(x => x.id === pt.taskId);
    if (t) t.due = pointDue(pt);
  }

  save();
  closeModal('point-modal');
  renderTimelineSection();
  if (typeof refreshTaskSurfaces === 'function') refreshTaskSurfaces();
  if (bookOpenId) renderOpenBook();
}

function deletePointFromModal() {
  if (!editingPointId) return;
  const list = tlPoints();
  const i = list.findIndex(x => String(x.id) === String(editingPointId));
  if (i < 0) return;
  const pt = list[i];
  askConfirm(`Delete "${pt.title}"? The task it made (if any) stays on the board.`, () => {
    list.splice(i, 1);
    save();
    closeModal('point-modal');
    renderTimelineSection();
    if (bookOpenId) renderOpenBook();
  }, 'Delete it');
}

// ══════════════════════════════════════════════
//  THE BOOKSHELF
// ══════════════════════════════════════════════
function renderBookshelf() {
  const shelf = document.getElementById('tl-shelf');
  if (!shelf) return;
  const list = projects();
  shelf.innerHTML = list.map(p => {
    const prog = projectProgress(p);
    const col = p.color || '#3B9BD4';
    return `<button class="book" style="--book:${col}" onclick="openBook('${p.id}')"
        title="${escAttr(p.name + ' · ' + prog.pct + '% done')}">
      <span class="book-emoji">${escHtml(p.emoji || '📘')}</span>
      <span class="book-title">${escHtml(p.name || 'Untitled')}</span>
      <span class="book-status" style="background:${statusOf(p.status).color};color:#fff">${escHtml(statusOf(p.status).label)}</span>
      <span class="book-progress"><span style="width:${prog.pct}%"></span></span>
    </button>`;
  }).join('') + `<button class="book book-add" onclick="openBookEditor(null)" title="Start a new project">
      <span class="book-emoji">➕</span><span class="book-title">Add a book</span>
    </button>`;
}

// ── create / rename a project ──
let editingProjectId = null;
function openBookEditor(id) {
  editingProjectId = id || null;
  const p = id ? projectById(id) : null;
  document.getElementById('bk-modal-title').textContent = p ? '✏️ Edit project' : '📚 Add a book';
  document.getElementById('bk-name').value = p ? (p.name || '') : '';
  document.getElementById('bk-due').value = p ? (p.dueDate || '') : '';

  const esel = document.getElementById('bk-emoji');
  esel.innerHTML = BOOK_EMOJI.map(e => `<option value="${e}">${e}</option>`).join('');
  esel.value = p ? (p.emoji || '📘') : BOOK_EMOJI[projects().length % BOOK_EMOJI.length];

  const csel = document.getElementById('bk-color');
  csel.value = p ? (p.color || BOOK_COLORS[0]) : BOOK_COLORS[projects().length % BOOK_COLORS.length];

  document.getElementById('bk-delete').style.display = p ? 'inline-flex' : 'none';
  document.getElementById('book-editor').style.display = 'flex';
  setTimeout(() => document.getElementById('bk-name').focus(), 60);
}

function saveBookFromModal() {
  const name = document.getElementById('bk-name').value.trim();
  if (!name) { showToast('Give the project a name 📚'); return; }
  const list = projects();
  let p = editingProjectId ? projectById(editingProjectId) : null;
  if (!p) {
    p = { id: 'pj' + Date.now() + Math.floor(Math.random() * 999),
          notes: '', links: [], status: 'Not started', step: '', createdAt: Date.now() };
    list.push(p);
  }
  p.name = name;
  p.emoji = document.getElementById('bk-emoji').value;
  p.color = document.getElementById('bk-color').value;
  p.dueDate = document.getElementById('bk-due').value || '';
  save();
  closeModal('book-editor');
  renderTimelineSection();
  showToast(`📚 ${editingProjectId ? 'Updated' : 'Added'} "${name}"`);
}

function deleteBookFromModal() {
  if (!editingProjectId) return;
  const p = projectById(editingProjectId);
  if (!p) return;
  askConfirm(`Delete "${p.name}"? Its timeline points go too. Tasks stay on the board.`, () => {
    state.projects = projects().filter(x => String(x.id) !== String(p.id));
    state.tlPoints = tlPoints().filter(x => String(x.projectId) !== String(p.id));
    save();
    closeModal('book-editor');
    renderTimelineSection();
  }, 'Delete it');
}

// ── the open book ──
function openBook(id) {
  bookOpenId = id;
  bookPage = 0;
  document.getElementById('book-modal').style.display = 'flex';
  renderOpenBook();
}
function closeBook() {
  bookOpenId = null;
  const m = document.getElementById('book-modal');
  if (m) m.style.display = 'none';
}
function flipBook(dir) {
  bookPage = Math.max(0, Math.min(1, bookPage + dir));
  renderOpenBook();
}

function renderOpenBook() {
  const p = projectById(bookOpenId);
  const host = document.getElementById('book-body');
  if (!p || !host) return;
  const col = p.color || '#3B9BD4';
  document.getElementById('book-modal-title').innerHTML =
    `${escHtml(p.emoji || '📘')} ${escHtml(p.name)}`;
  document.getElementById('book-page-label').textContent = bookPage === 0 ? 'Notes & status' : 'Project timeline';

  if (bookPage === 1) {
    host.innerHTML = `<div class="bk-spread bk-single">${renderProjectTimeline(p)}</div>`;
    return;
  }

  const prog = projectProgress(p);
  // every task now, soonest first, finished ones at the bottom
  const all = projectTasks(p).slice().sort((a, b) => {
    if (!!a.done !== !!b.done) return a.done ? 1 : -1;
    return (a.due || '9999').localeCompare(b.due || '9999');
  });
  const links = Array.isArray(p.links) ? p.links : [];
  const strip = txt => (txt || '').replace(
    new RegExp('^' + p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*', 'i'), '');

  host.innerHTML = `<div class="bk-spread">
    <div class="bk-page bk-left">
      <div class="bk-h">📝 Notes</div>
      <textarea class="bk-notes" id="bk-notes" placeholder="What is this project, really?"
        oninput="onBookNotes()">${escHtml(p.notes || '')}</textarea>

      <div class="bk-h" style="margin-top:12px">📋 Everything on this project
        <span style="font-size:10px;font-weight:700;color:#8A6A46">(${all.length})</span></div>
      ${all.length ? `<div class="bk-tasks">${all.map(t => {
        const st = statusOf(t.projStatus);
        return `<div class="bk-task ${t.done ? 'is-done' : ''}">
          <input type="checkbox" ${t.done ? 'checked' : ''} onchange="toggleTask(${t.id}); renderOpenBook();">
          <span class="bk-task-text">${escHtml(strip(t.text))}</span>
          <select class="bk-task-status" style="background:${st.color}"
            onchange="setTaskProjStatus(${t.id}, this.value)"
            onclick="event.stopPropagation()">${statusOptions(t.projStatus)}</select>
          <span class="bk-task-due">${t.due ? escHtml(tlLabel(t.due)) : '—'}</span>
        </div>`;
      }).join('')}</div>`
        : `<div class="bk-empty">Nothing here yet. Add a task below, or drop a point on the timeline.</div>`}
    </div>

    <div class="bk-page bk-right">
      <div class="bk-h">🔗 Helpful links &amp; resources</div>
      <div class="bk-links" id="bk-links">
        ${links.length ? links.map((l, i) => `
          <div class="bk-link">
            <a href="${escAttr(l.url)}" target="_blank" rel="noopener">${escHtml(l.label || l.url)}</a>
            <button onclick="removeBookLink(${i})" title="Remove">×</button>
          </div>`).join('') : `<div class="bk-empty">Nothing saved yet.</div>`}
      </div>
      <div class="bk-link-add">
        <input class="form-input" id="bk-link-label" placeholder="Label" maxlength="40">
        <input class="form-input" id="bk-link-url" placeholder="https://…">
        <button class="btn-secondary" onclick="addBookLink()">＋</button>
      </div>

      <div class="bk-h" style="margin-top:14px">📊 Where it stands</div>
      <div class="bk-ring-row">
        <div class="bk-ring" style="--pct:${prog.pct};--book:${col}"><span>${prog.pct}%</span></div>
        <div class="bk-stat">
          <b>${prog.done}/${prog.total}</b><span>tasks done</span>
          <b style="margin-top:6px">${p.dueDate ? escHtml(tlLabel(p.dueDate, true)) : '—'}</b><span>complete by</span>
        </div>
      </div>

      <div class="bk-row">
        <label class="bk-field">Status
          <span class="bk-status-edit" onclick="openStatusEditor()" title="Rename or recolour these">✎ edit</span>
          <select class="form-input bk-status-sel" id="bk-status" onchange="setBookStatus(this.value)"
            style="background:${statusOf(p.status).color}">${statusOptions(p.status)}</select>
        </label>
        <label class="bk-field">Step you're on
          <select class="form-input" id="bk-step" onchange="setBookStep(this.value)">
            <option value="">—</option>
            ${all.map(t => `<option value="${t.id}" ${String(p.step) === String(t.id) ? 'selected' : ''}>${t.done ? '✓ ' : ''}${escHtml(strip(t.text))}</option>`).join('')}
          </select>
        </label>
      </div>

      <div class="bk-add-task">
        <input class="form-input" id="bk-new-task" placeholder="Another thing to do…" maxlength="70"
          onkeydown="if(event.key==='Enter') addProjectTask()">
        <button class="btn-primary" onclick="addProjectTask()" style="font-size:12px;">＋ Add task</button>
      </div>
    </div>
  </div>`;
}

// A project's own timeline — same renderer idea, scoped and compact.
function renderProjectTimeline(p) {
  const pts = pointsForProject(p.id);
  if (!pts.length) {
    return `<div class="bk-empty" style="padding:30px 10px;text-align:center">
      No points on this project's timeline yet.
      <div style="margin-top:10px"><button class="btn-primary" onclick="closeBook(); tlFilterProject='${p.id}'; showTlMode('timeline'); openPointModal(null);">📍 Add the first one</button></div>
    </div>`;
  }
  const start = tlAddDays(pts[0].date, -7);
  const lastEnd = pts.reduce((m, q) => (pointDue(q) > m ? pointDue(q) : m), pts[0].date);
  const end = tlAddDays(lastEnd, 7);
  const days = Math.max(1, tlDaysBetween(start, end));
  const scale = Math.max(3, Math.min(24, 760 / days));
  const width = Math.max(600, days * scale);
  const x = k => tlDaysBetween(start, k) * scale;
  const col = p.color || '#3B9BD4';

  const eras = pts.filter(q => q.endDate && q.endDate > q.date).map(q =>
    `<div class="tl-era" style="left:${x(q.date).toFixed(1)}px;width:${Math.max(6, x(q.endDate) - x(q.date)).toFixed(1)}px;background:${col}"></div>`).join('');

  const marks = pts.map((q, i) => {
    const due = pointDue(q);
    const dueX = x(due);
    const boat = (due !== q.date)
      ? `<div class="tl-boat" style="left:${(x(q.date) - dueX).toFixed(1)}px;color:${col}">⛵</div>` : '';
    return `
    <div class="tl-point ${i % 2 === 0 ? 'above' : 'below'}" style="left:${dueX.toFixed(1)}px"
      onclick="closeBook(); openPointModal('${q.id}')">
      ${boat}
      <div class="tl-card" style="border-color:${col}">
        <div class="tl-card-date">${due !== q.date ? '⛵ ' + escHtml(tlLabel(q.date)) + ' → ' : ''}${escHtml(tlLabel(due, true))}</div>
        <div class="tl-card-title">${escHtml(q.title)}</div>
      </div>
      <div class="tl-stem" style="background:${col}"></div>
      <div class="tl-dot" style="background:${col}"></div>
    </div>`;
  }).join('');

  return `<div class="bk-h" style="margin-bottom:8px">🕰️ ${escHtml(p.name)} timeline
      <span style="font-size:10px;font-weight:700;color:#8A6A46"> — click the line to add a point</span></div>
    <div class="tl-canvas bk-canvas"><div class="tl-strip" data-scale="${scale}" data-start="${start}" style="width:${width.toFixed(0)}px">
      <div class="tl-axis" onclick="bookAxisClick(event, '${p.id}')"></div>${eras}${marks}
    </div></div>`;
}

/**
 * Add a task straight to the project without going via the timeline.
 * It gets the project's own complete-by date so it still lands on the board
 * and the calendar somewhere sensible.
 */
function addProjectTask() {
  const p = projectById(bookOpenId);
  const input = document.getElementById('bk-new-task');
  if (!p || !input) return;
  const raw = input.value.trim();
  if (!raw) { showToast('Type what needs doing first ✍️'); return; }
  const task = {
    id: Date.now() + Math.floor(Math.random() * 999),
    text: `${p.name}: ${raw}`,
    assigneeId: myPersonId() || (state.people[0] && state.people[0].id) || '',
    priority: 'medium',
    type: getActivityTypes()[0].id,
    mins: 30,
    due: p.dueDate || '',
    done: false,
    source: 'project',
    subtasks: [],
    collapsed: false
  };
  state.tasks.push(task);
  save();
  input.value = '';
  renderOpenBook();
  renderBookshelf();
  if (typeof refreshTaskSurfaces === 'function') refreshTaskSurfaces();
  showToast(`✅ Added "${task.text}"`);
}

// Clicking the bare line inside a book's timeline adds a point to THAT project.
function bookAxisClick(e, projectId) {
  const canvas = e.currentTarget.closest('.bk-canvas');
  if (!canvas) return;
  const strip = canvas.querySelector('.tl-strip');
  const scale = parseFloat(strip.dataset.scale) || 6;
  const start = strip.dataset.start;
  const rect = canvas.getBoundingClientRect();
  const contentX = canvas.scrollLeft + (e.clientX - rect.left);
  const key = tlAddDays(start, Math.round(contentX / Math.max(0.0001, scale)));
  closeBook();
  tlFilterProject = projectId;
  showTlMode('timeline');
  openPointModal(null, key);
}

function setTaskProjStatus(taskId, statusId) {
  const t = state.tasks.find(x => x.id === taskId);
  if (!t) return;
  t.projStatus = statusId;
  save();
  renderOpenBook();
}

// ══════════════════════════════════════════════
//  STATUS EDITOR — rename, recolour, add, remove
// ══════════════════════════════════════════════
function openStatusEditor() {
  renderStatusEditor();
  document.getElementById('status-editor').style.display = 'flex';
}
function renderStatusEditor() {
  const box = document.getElementById('se-list');
  if (!box) return;
  box.innerHTML = projectStatuses().map((s, i) => `
    <div class="se-row">
      <input type="color" value="${escAttr(s.color)}" onchange="editStatus(${i},'color',this.value)" title="Colour">
      <input class="form-input" value="${escAttr(s.label)}" maxlength="26"
        oninput="editStatus(${i},'label',this.value)">
      <button onclick="removeStatus(${i})" title="Remove" ${projectStatuses().length <= 1 ? 'disabled' : ''}>×</button>
    </div>`).join('');
}
function editStatus(i, field, value) {
  const list = projectStatuses();
  if (!list[i]) return;
  list[i][field] = value;
  save();
  if (field === 'color') renderStatusEditor();
  if (bookOpenId) renderOpenBook();
  renderBookshelf();
}
function addStatus() {
  projectStatuses().push({
    id: 'st' + Date.now() + Math.floor(Math.random() * 99),
    label: 'New status', color: '#7FC4E8'
  });
  save();
  renderStatusEditor();
}
function removeStatus(i) {
  const list = projectStatuses();
  if (list.length <= 1) return;
  const gone = list[i];
  askConfirm(`Remove "${gone.label}"? Anything using it falls back to "${list[0].id === gone.id ? list[1].label : list[0].label}".`, () => {
    list.splice(i, 1);
    save();
    renderStatusEditor();
    if (bookOpenId) renderOpenBook();
    renderBookshelf();
  }, 'Remove it');
}
function resetStatuses() {
  askConfirm('Put the five original statuses back? Your custom ones are replaced.', () => {
    state.projectStatuses = DEFAULT_STATUSES.map(s => ({ ...s }));
    save();
    renderStatusEditor();
    if (bookOpenId) renderOpenBook();
    renderBookshelf();
  }, 'Reset them');
}

// ── book field handlers ──
let bookNotesTimer = null;
function onBookNotes() {
  clearTimeout(bookNotesTimer);
  bookNotesTimer = setTimeout(() => {
    const p = projectById(bookOpenId);
    const el = document.getElementById('bk-notes');
    if (!p || !el) return;
    p.notes = el.value;
    save();
  }, 500);
}
function setBookStatus(v) {
  const p = projectById(bookOpenId); if (!p) return;
  p.status = v; save(); renderBookshelf(); renderOpenBook();
  showToast(`Status: ${statusOf(v).label}`);
}
function setBookStep(v) {
  const p = projectById(bookOpenId); if (!p) return;
  p.step = v; save();
}
function addBookLink() {
  const p = projectById(bookOpenId); if (!p) return;
  const label = document.getElementById('bk-link-label').value.trim();
  let url = document.getElementById('bk-link-url').value.trim();
  if (!url) { showToast('Paste a link first 🔗'); return; }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  if (!Array.isArray(p.links)) p.links = [];
  p.links.push({ label: label || url, url });
  save();
  renderOpenBook();
}
function removeBookLink(i) {
  const p = projectById(bookOpenId); if (!p) return;
  p.links.splice(i, 1); save(); renderOpenBook();
}
