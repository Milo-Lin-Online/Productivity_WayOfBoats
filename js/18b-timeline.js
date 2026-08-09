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
// Darken a hex colour — used so a book's border is its own colour, deeper,
// rather than a hard black outline.
function shade(hex, amt) {
  let h = String(hex || '#3B9BD4').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  if (isNaN(n)) return '#2A6F99';
  const f = amt < 0 ? 1 + amt : 1 - amt;
  const c = v => Math.max(0, Math.min(255, Math.round(v * f)));
  const r = c((n >> 16) & 255), g = c((n >> 8) & 255), b = c(n & 255);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/** Days from today to a date. Negative means it's already passed. */
function daysUntil(key) {
  if (!key) return null;
  return tlDaysBetween(tlToday(), key);
}
/** Human countdown for a project's complete-by date. */
function dueCountdown(key) {
  const d = daysUntil(key);
  if (d === null) return { text: 'no deadline set', cls: 'none', d: null };
  if (d < 0)  return { text: `${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} overdue`, cls: 'over', d };
  if (d === 0) return { text: 'due today', cls: 'today', d };
  if (d === 1) return { text: '1 day left', cls: 'soon', d };
  return { text: `${d} days left`, cls: d <= 7 ? 'soon' : 'ok', d };
}

/**
 * A quick paper rustle when a book opens. Built from filtered noise with two
 * envelope bumps so it reads as pages shuffling rather than a single hiss.
 */
function playPageShuffle() {
  try {
    const ctx = (typeof getCtx === 'function') ? getCtx() : null;
    if (!ctx) return;
    const dur = 0.28;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const x = i / data.length;
      const env = Math.exp(-7 * x) + 0.8 * Math.exp(-55 * Math.abs(x - 0.38));
      data[i] = (Math.random() * 2 - 1) * env * 0.3;
    }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = 2400; bp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.value = 0.45;
    src.connect(bp); bp.connect(g); g.connect(ctx.destination);
    src.start();
  } catch (e) {}
}

function projects() {
  if (!Array.isArray(state.projects)) state.projects = [];
  return state.projects;
}
function projectById(id) { return projects().find(p => String(p.id) === String(id)) || null; }

// ══════════════════════════════════════════════
//  WHOSE BOOK IS IT
//  A project belongs to one person. You only ever see your own shelf, so two
//  people using the same room don't end up staring at each other's work.
// ══════════════════════════════════════════════
let showArchived = false;

function ownsProject(p) {
  const me = myPersonId();
  if (!me) return true;                 // no name set yet — don't hide everything
  if (!p.ownerId) return true;          // legacy, un-claimed (see claimOwnerlessProjects)
  return String(p.ownerId) === String(me);
}

/** My shelf: mine, and archived ones only when I've asked to see them. */
function visibleProjects() {
  return projects().filter(p => ownsProject(p) && (showArchived || !p.archived));
}
/** Everything of mine including archived — for counts and the filter dropdown. */
function myProjects() { return projects().filter(ownsProject); }
function archivedCount() { return myProjects().filter(p => p.archived).length; }

/**
 * Projects made before books had owners have no ownerId. Rather than hide them
 * or leave them shared forever, the first person to open the Timeline claims
 * them — and the owner picker in the book editor makes that reversible if it
 * grabs something it shouldn't.
 */
function claimOwnerlessProjects() {
  const me = myPersonId();
  if (!me) return;
  const orphans = projects().filter(p => !p.ownerId);
  if (!orphans.length) return;
  orphans.forEach(p => { p.ownerId = me; });
  save();
  showToast(`📚 ${orphans.length} project${orphans.length === 1 ? '' : 's'} added to your shelf`);
}

function toggleArchivedView() {
  showArchived = !showArchived;
  renderBookshelf();
}
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
  claimOwnerlessProjects();
  if (tlMode === 'shelf') renderBookshelf();
  else renderTlBoard();
  renderTlProjectFilter();
}

function renderTlProjectFilter() {
  const sel = document.getElementById('tl-project-filter');
  if (!sel) return;
  sel.innerHTML = `<option value="">All my projects</option>` +
    myProjects().filter(p => !p.archived).map(p =>
      `<option value="${p.id}">${escHtml(p.name || 'Untitled')}</option>`).join('');
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
/** Strip the "Project: " prefix for display. */
function stripProjectName(proj, text) {
  if (!proj) return text || '';
  return (text || '').replace(
    new RegExp('^' + proj.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*', 'i'), '');
}

/**
 * Points the timeline shows that nobody placed by hand.
 *
 * A task belonging to a project appears whether it was made from the timeline,
 * from the book, from the task board or from a meeting — if it has a due date
 * it gets a marker. Subtasks with their own dates get smaller markers on the
 * same lane, so you can see the shape of the work inside a task.
 */
function derivedPointsFor(proj) {
  const out = [];
  const placed = new Set(tlPoints().map(x => x.taskId).filter(Boolean));
  projectTasks(proj).forEach(tk => {
    if (!placed.has(tk.id) && (tk.due || tk.start)) {
      out.push({
        id: 'd' + tk.id, derived: true, taskId: tk.id, projectId: proj.id,
        title: stripProjectName(proj, tk.text),
        date: tk.start || tk.due, endDate: tk.due || tk.start,
        type: tk.type, done: tk.done
      });
    }
    (tk.subtasks || []).forEach((s, si) => {
      if (!s.due && !s.start) return;
      out.push({
        id: 'sub' + tk.id + '_' + si, derived: true, sub: true, parentId: tk.id, subIndex: si,
        projectId: proj.id, title: s.text || 'step',
        date: s.start || s.due, endDate: s.due || s.start,
        type: tk.type, done: s.done
      });
    });
  });
  return out;
}

function tlVisiblePoints() {
  // a point is only visible if its book is — that keeps other people's work,
  // and your own archived work, off the main timeline
  const live = projects().filter(p => ownsProject(p) && !p.archived);
  const mine = new Set(live.map(p => String(p.id)));
  const all = tlPoints().filter(p => mine.has(String(p.projectId)))
    .concat(...live.map(derivedPointsFor));
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

// Brackets live in a thin band just above the line; cards live in a band above
// THAT. Keeping the two separate is what stops a busy month from growing a
// skyscraper — the bracket band is only as tall as it needs to be, and the card
// band never exceeds CARD_ROWS no matter how many events pile up.
const BR_LEVEL_H  = 10;    // one bracket level — deliberately shallow
// Two lines may never run along each other, and the only way to guarantee that
// is to give every overlapping bracket its own level. So this isn't really a
// cap; it's a ceiling for absurd data. The level height is what keeps it low:
// six things running at once is 72px, not a skyscraper.
const BR_MAX      = 60;
const CARD_W      = 186;
const CARD_H      = 78;
const CARD_ROWS   = 3;     // cards cycle through this many heights, then repeat
const CARD_STAGGER= 21;    // vertical offset per card row
const EV_PAD      = 10;

/** Interval-pack into at most `maxRows` rows. Returns rows used. */
function packRows(items, maxRows, getL, getR) {
  const rows = [];
  let used = 0;
  items.forEach(it => {
    let r = 0;
    for (; r < maxRows; r++) {
      if (!rows[r]) rows[r] = [];
      if (!rows[r].some(([s, e]) => !(getR(it) < s - EV_PAD || getL(it) > e + EV_PAD))) break;
    }
    if (r >= maxRows) {
      // out of room: take the row that frees up soonest and nudge sideways so
      // the card can never be completely hidden behind another
      r = 0;
      let best = Infinity;
      for (let k = 0; k < maxRows; k++) {
        const last = rows[k][rows[k].length - 1];
        if (last && last[1] < best) { best = last[1]; r = k; }
      }
      it.nudge = 14;
    }
    rows[r].push([getL(it), getR(it)]);
    it.row = r;
    used = Math.max(used, r + 1);
  });
  return used;
}

/** Pack one side of the line: brackets first, then cards. */
function layoutSide(list) {
  if (!list.length) return { brLevels: 0 };
  const brLevels = packRows(list.slice().sort((a, b) => a.x1 - b.x1), BR_MAX, e => e.x1, e => e.x2);
  list.forEach(e => { e.brLevel = e.row; e.row = 0; e.nudge = 0; });
  packRows(list, CARD_ROWS, e => e.cardL, e => e.cardL + CARD_W);
  return { brLevels };
}

function renderTlBoard() {
  const wrap = document.getElementById('tl-canvas');
  if (!wrap) return;
  const pts = tlVisiblePoints();
  const { start, end } = tlRange(pts);
  const days = Math.max(1, tlDaysBetween(start, end));

  const winW = wrap.clientWidth || 900;
  const minScale = Math.max(0.02, (winW - 120) / days);
  if (tlScale < minScale) tlScale = minScale;
  const width = Math.max(winW, days * tlScale);
  const x = key => tlDaysBetween(start, key) * tlScale;

  const evs = pts.map(q => {
    const due = pointDue(q);
    const x1 = x(q.date), x2 = x(due);
    // the card is CENTRED on the due leg, clamped so it can't leave the canvas
    const cardL = Math.max(0, Math.min(width - CARD_W, x2 - CARD_W / 2));
    return { q, due, x1, x2, cardL, ranged: due !== q.date, nudge: 0 };
  }).sort((a, b) => a.x2 - b.x2);

  // Alternate sides. Hanging half the work below the line halves how tall
  // either side has to grow, and gives the whole thing room to breathe.
  evs.forEach((e, i) => { e.down = (i % 2 === 1); });
  const up = evs.filter(e => !e.down), down = evs.filter(e => e.down);
  const upL = layoutSide(up), downL = layoutSide(down);

  const cardZone = CARD_H + (CARD_ROWS - 1) * CARD_STAGGER;
  const GUTTER = 15;   // kept clear of brackets so the countdowns stay readable
  const RULER = 33;    // band under the line holding the date ticks
  const upBr   = up.length   ? upL.brLevels   * BR_LEVEL_H + 6 : 0;
  const downBr = down.length ? downL.brLevels * BR_LEVEL_H + 6 : 0;
  const lineY  = (up.length ? upBr + GUTTER + 12 + cardZone + 14 : 40);
  const belowH = RULER + (down.length ? downBr + GUTTER + 12 + cardZone + 14 : 30);
  const height = lineY + belowH + 8;
  const upCardBottom = lineY - GUTTER - upBr - 12;   // undersides of the top cards
  const downCardTop  = lineY + RULER + GUTTER + downBr + 12; // tops of the bottom cards

  // ── ruler: faint full-height guides, labels parked at the very bottom ──
  const NICE_STEPS = [1, 2, 3, 7, 14, 30, 61, 91, 182, 365, 730, 1825];
  const wanted = Math.max(1, (days * tlScale) / 120);
  const raw = Math.max(1, days / wanted);
  let stepDays = NICE_STEPS.reduce((b2, n) => Math.abs(n - raw) < Math.abs(b2 - raw) ? n : b2, NICE_STEPS[0]);
  while (days / stepDays > 400) stepDays *= 2;
  const fmt = stepDays >= 365 ? (k => { const d = tlParse(k); return d ? d.getFullYear() : k; })
            : stepDays >= 61  ? (k => tlLabel(k, true))
            : (k => tlLabel(k));
  let ticks = '';
  for (let d = 0; d <= days; d += stepDays) {
    ticks += `<div class="tl-tick" style="left:${(d * tlScale).toFixed(1)}px;height:${height}px">
      <div class="tl-tick-line"></div>
      <div class="tl-tick-mark" style="top:${lineY}px"></div>
      <div class="tl-tick-label" style="top:${(lineY + 13).toFixed(0)}px">${escHtml(String(fmt(tlAddDays(start, d))))}</div>
    </div>`;
  }

  const today = tlToday();
  const todayMark = (today >= start && today <= end)
    ? `<div class="tl-today" style="left:${x(today).toFixed(1)}px;height:${height - 26}px"><span>today</span></div>` : '';

  const evHtml = evs.map(ev => {
    const q = ev.q;
    const proj = projectById(q.projectId);
    const col = (proj && proj.color) || 'var(--ocean)';
    const meta = q.type ? typeMeta(q.type) : null;
    const w = Math.max(2, ev.x2 - ev.x1);
    const legH = GUTTER + (ev.brLevel + 1) * BR_LEVEL_H;
    // a down-side leg has to reach back up through the ruler band to the line
    const reach = ev.down ? RULER : 0;
    const brTop = ev.down ? lineY + RULER : lineY - legH;   // container top
    const barOff = ev.down ? legH : 0;                 // where the bar sits inside it
    const footOff = ev.down ? 0 : legH;                // feet always meet the line
    const cardTop = ev.down
      ? downCardTop + ev.row * CARD_STAGGER
      : upCardBottom - CARD_H - ev.row * CARD_STAGGER;
    // Carry the due-end leg the rest of the way so the bracket actually meets
    // the underside of its card, instead of stopping short with a gap.
    const barAbsY = ev.down ? brTop + barOff : brTop;
    // Going up, the link is drawn from the card's TOP down to the bar and the
    // card paints over it — cards size to their content, so measuring down from
    // cardTop by the CARD_H constant would leave a gap under short ones.
    const linkTop = ev.down ? barAbsY : cardTop;
    const linkH   = Math.max(0, ev.down ? cardTop - barAbsY : barAbsY - cardTop);
    const click = q.derived ? `onclick="openBook('${q.projectId}')"` : `onclick="openPointModal('${q.id}')"`;

    return `<div class="tl-ev ${q.sub ? 'is-sub' : ''} ${q.done ? 'is-done' : ''} ${ev.ranged ? '' : 'is-moment'} ${ev.down ? 'below' : ''}"
        data-pid="${q.id}" style="left:${ev.x1.toFixed(1)}px;top:0" ${click}
        title="${escAttr(q.title + ' · ' + (ev.ranged ? tlLabel(q.date) + ' → ' : '') + tlLabel(ev.due, true))}">

      <div class="tl-ev-bracket" style="--c:${col};top:${brTop.toFixed(1)}px">
        <div class="tl-ev-bar" style="width:${w.toFixed(1)}px;top:${barOff}px"></div>
        <div class="tl-ev-leg l" style="height:${legH + reach}px;top:${-reach}px"></div>
        ${ev.ranged ? `<div class="tl-ev-leg r" style="height:${legH + reach}px;top:${-reach}px;left:${w.toFixed(1)}px"></div>` : ''}
        <div class="tl-ev-foot l" style="top:${footOff - reach}px"></div>
        ${ev.ranged ? `<div class="tl-ev-foot r" style="top:${footOff - reach}px;left:${w.toFixed(1)}px"></div>` : ''}
        ${ev.ranged ? `<div class="tl-ev-boat" style="top:${(ev.down ? 4 : legH - 19)}px">⛵</div>` : ''}
      </div>

      <div class="tl-ev-link" style="--c:${col};left:${(ev.ranged ? w : 0).toFixed(1)}px;top:${linkTop.toFixed(1)}px;height:${linkH.toFixed(1)}px"></div>

      <div class="tl-ev-card" style="border-color:${col};top:${cardTop.toFixed(1)}px;left:${(ev.cardL - ev.x1 + ev.nudge).toFixed(1)}px">
        <div class="tl-card-range">⛵ ${ev.ranged
            ? escHtml(tlLabel(q.date)) + ' → ' + escHtml(tlLabel(ev.due, true))
            : escHtml(tlLabel(ev.due, true))}</div>
        <div class="tl-card-title">${q.sub ? '↳ ' : ''}${escHtml(q.title || 'Untitled')}</div>
        ${proj ? `<div class="tl-card-proj" style="color:${col}">${escHtml(proj.emoji || '📘')} ${escHtml(proj.name)}</div>` : ''}
        <div class="tl-ev-chips">
          ${meta ? `<span class="tl-card-chip" style="background:${meta.color}">${escHtml(meta.label)}</span>` : ''}
          ${q.done ? `<span class="tl-card-chip" style="background:var(--matcha)">✓ done</span>` : ''}
        </div>
      </div>

    </div>`;
  }).join('');

  // Countdowns are drawn last, in one layer above every bracket, so a later
  // event's lines can never paint over an earlier event's pill.
  const pillHtml = evs.map(ev => {
    const left = ev.q.done ? null : daysUntil(ev.due);
    const cd = left === null ? { t: '—', c: '' }
      : left < 0   ? { t: Math.abs(left) + 'd over', c: 'over' }
      : left === 0 ? { t: 'today', c: 'today' }
      : { t: left + 'd left', c: left <= 7 ? 'soon' : '' };
    const y = ev.down ? lineY + RULER + GUTTER / 2 : lineY - GUTTER / 2;
    return `<div class="tl-ev-due ${cd.c}" style="left:${ev.x2.toFixed(1)}px;top:${y.toFixed(1)}px">
      <b>${escHtml(cd.t)}</b></div>`;
  }).join('');

  wrap.innerHTML = `<div class="tl-strip" style="width:${width.toFixed(0)}px;height:${height}px">
      <div class="tl-ticks">${ticks}</div>
      <div class="tl-mainline" style="top:${lineY}px"></div>
      ${todayMark}
      ${evHtml}
      <div class="tl-pills">${pillHtml}</div>
    </div>`;

  const empty = document.getElementById('tl-empty');
  if (empty) empty.style.display = pts.length ? 'none' : 'block';
  const rangeLabel = document.getElementById('tl-range');
  if (rangeLabel) {
    rangeLabel.textContent = pts.length
      ? `${tlLabel(start, true)} → ${tlLabel(end, true)} · ${pts.length} event${pts.length === 1 ? '' : 's'}`
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
  if (e.target.closest && e.target.closest('.tl-ev')) return;
  tlPan = { x: e.clientX, scroll: wrap.scrollLeft, moved: 0, wrap,
            onAxis: !!(e.target.classList && (e.target.classList.contains('tl-mainline') ||
                       e.target.classList.contains('tl-strip'))) };
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
  const el = wrap && wrap.querySelector(`.tl-ev[data-pid="${target.id}"]`);
  if (!wrap || !el) return;
  wrap.querySelectorAll('.tl-ev.focused').forEach(n => n.classList.remove('focused'));
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
  const list = visibleProjects();
  shelf.innerHTML = list.map(p => {
    const prog = projectProgress(p);
    const col = p.color || '#3B9BD4';
    const cd = dueCountdown(p.dueDate);
    return `<button class="book ${p.archived ? 'is-archived' : ''}" style="--book:${col};--book-dark:${shade(col, -0.42)}" onclick="openBook('${p.id}')"
        title="${escAttr(p.name + ' · ' + prog.pct + '% done · ' + cd.text + (p.archived ? ' · archived' : ''))}">
      ${p.dueDate ? `<span class="book-days ${cd.cls}">${escHtml(cd.d !== null && cd.d >= 0 ? cd.d + 'd' : Math.abs(cd.d) + 'd!')}</span>` : ''}
      ${p.cover ? `<span class="book-cover" style="background-image:url('${escAttr(p.cover)}')"></span>` : ''}
      ${p.archived ? '<span class="book-arch">archived</span>' : ''}
      <span class="book-cog" onclick="event.stopPropagation(); openBookEditor('${p.id}')" title="Edit, archive or delete">⋯</span>
      <span class="book-emoji">${p.cover ? '' : escHtml(p.emoji || '📘')}</span>
      <span class="book-title">${escHtml(p.name || 'Untitled')}</span>
      <span class="book-status" style="background:${statusOf(p.status).color};color:#fff">${escHtml(statusOf(p.status).label)}</span>
      <span class="book-progress"><span style="width:${prog.pct}%"></span></span>
    </button>`;
  }).join('') + `<button class="book book-add" onclick="openBookEditor(null)" title="Start a new project">
      <span class="book-emoji">➕</span><span class="book-title">Add a book</span>
    </button>`;

  const bar = document.getElementById('shelf-archive-bar');
  if (bar) {
    const n = archivedCount();
    bar.innerHTML = n
      ? `<button class="arch-toggle ${showArchived ? 'on' : ''}" onclick="toggleArchivedView()">
           📦 ${showArchived ? 'Hide' : 'Show'} archived (${n})
         </button>`
      : '';
  }
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

  // who the book belongs to — lets you hand one over, or undo a bad auto-claim
  const osel = document.getElementById('bk-owner');
  if (osel) {
    const crew = (typeof visiblePeople === 'function' ? visiblePeople() : state.people) || [];
    osel.innerHTML = crew.map(c =>
      `<option value="${c.id}">${escHtml(c.name)}${c.id === myPersonId() ? ' (you)' : ''}</option>`).join('')
      || `<option value="">Nobody yet</option>`;
    osel.value = (p && p.ownerId) || myPersonId() || (crew[0] && crew[0].id) || '';
  }

  pendingCover = null;
  const prev = document.getElementById('bk-cover-preview');
  if (prev) prev.innerHTML = (p && p.cover)
    ? `<img src="${escAttr(p.cover)}" alt=""><button onclick="clearBookCover()">remove</button>`
    : '<span class="bk-cover-none">no cover</span>';
  const arch = document.getElementById('bk-archive');
  if (arch) {
    arch.style.display = p ? 'inline-flex' : 'none';
    arch.textContent = (p && p.archived) ? '📤 Unarchive' : '📦 Archive';
  }
  document.getElementById('bk-delete').style.display = p ? 'inline-flex' : 'none';
  document.getElementById('book-editor').style.display = 'flex';
  setTimeout(() => document.getElementById('bk-name').focus(), 60);
}

let pendingCover = null;
function onBookCoverPick(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      // crop to the spine's shape and shrink hard — a raw photo would bloat sync
      const W = 200, H = 280;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      const scale = Math.max(W / img.width, H / img.height);
      const dw = img.width * scale, dh = img.height * scale;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      pendingCover = c.toDataURL('image/jpeg', 0.78);
      const prev = document.getElementById('bk-cover-preview');
      if (prev) prev.innerHTML = `<img src="${pendingCover}" alt=""><button onclick="clearBookCover()">remove</button>`;
    };
    img.onerror = () => showToast("Couldn't read that image.");
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
function clearBookCover() {
  pendingCover = '';
  const prev = document.getElementById('bk-cover-preview');
  if (prev) prev.innerHTML = '<span class="bk-cover-none">no cover</span>';
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
  if (pendingCover !== null) p.cover = pendingCover;
  const osel = document.getElementById('bk-owner');
  if (osel && osel.value) p.ownerId = osel.value;
  else if (!p.ownerId) p.ownerId = myPersonId() || '';
  save();
  closeModal('book-editor');
  renderTimelineSection();
  showToast(`📚 ${editingProjectId ? 'Updated' : 'Added'} "${name}"`);
}

/**
 * Archive or unarchive. Callable from the shelf, the editor, or the open book —
 * whichever the person happens to be looking at.
 */
function archiveProject(id) {
  const p = projectById(id);
  if (!p) return;
  p.archived = !p.archived;
  save();
  closeModal('book-editor');
  if (bookOpenId === id) closeBook();
  renderTimelineSection();
  showToast(p.archived
    ? `📦 "${p.name}" archived — off the shelf and off the timeline, nothing deleted`
    : `📤 "${p.name}" is back on the shelf`);
}

/**
 * Delete a project outright: the book, its timeline points, AND its tasks.
 * Anything referencing those tasks (notebook pins, the current pomodoro
 * session) is cleaned up so nothing dangles.
 */
function deleteProject(id) {
  const p = projectById(id);
  if (!p) return;
  const pts = pointsForProject(id).length;
  const tasks = projectTasks(p);
  const bits = [];
  if (pts) bits.push(`${pts} timeline point${pts === 1 ? '' : 's'}`);
  if (tasks.length) bits.push(`${tasks.length} task${tasks.length === 1 ? '' : 's'}`);
  const cost = bits.length ? bits.join(' and ') + ' go with it. ' : '';

  askConfirm(`Delete "${p.name}" and everything in it? ${cost}Archiving keeps it all instead.`, () => {
    const taskIds = new Set(tasks.map(t => t.id));
    state.tasks = state.tasks.filter(t => !taskIds.has(t.id));

    // unpin the doomed tasks from anywhere that points at them
    (state.people || []).forEach(person => {
      if (person.planning && Array.isArray(person.planning.links)) {
        person.planning.links = person.planning.links.filter(x => !taskIds.has(x));
      }
    });
    if (typeof pomoTaskIds !== 'undefined') pomoTaskIds = pomoTaskIds.filter(x => !taskIds.has(x));

    state.projects = projects().filter(x => String(x.id) !== String(id));
    state.tlPoints = tlPoints().filter(x => String(x.projectId) !== String(id));

    save();
    closeModal('book-editor');
    if (bookOpenId === id) closeBook();
    renderTimelineSection();
    if (typeof refreshTaskSurfaces === 'function') refreshTaskSurfaces();
    showToast(`🗑 "${p.name}" deleted${tasks.length ? ` along with ${tasks.length} task${tasks.length === 1 ? '' : 's'}` : ''}`);
  }, 'Delete everything');
}

// the editor's buttons just point at the id it's editing
function toggleArchiveBook() { if (editingProjectId) archiveProject(editingProjectId); }

function deleteBookFromModal() { if (editingProjectId) deleteProject(editingProjectId); }

// straight from the open book, so you never have to hunt for the editor
function editOpenBook()    { const id = bookOpenId; closeBook(); openBookEditor(id); }
function archiveOpenBook() { if (bookOpenId) archiveProject(bookOpenId); }
function deleteOpenBook()  { if (bookOpenId) deleteProject(bookOpenId); }

// ── the open book ──
function openBook(id) {
  bookOpenId = id;
  bookPage = 0;
  playPageShuffle();
  document.getElementById('book-modal').style.display = 'flex';
  renderOpenBook();
}
function closeBook() {
  bookOpenId = null;
  const m = document.getElementById('book-modal');
  if (m) m.style.display = 'none';
}
function flipBook(dir) {
  const next = Math.max(0, Math.min(1, bookPage + dir));
  if (next !== bookPage) playPageShuffle();
  bookPage = next;
  renderOpenBook();
}

function renderOpenBook() {
  const p = projectById(bookOpenId);
  const host = document.getElementById('book-body');
  if (!p || !host) return;
  const col = p.color || '#3B9BD4';
  document.getElementById('book-modal-title').innerHTML =
    `${escHtml(p.emoji || '📘')} ${escHtml(p.name)}` +
    (p.archived ? ` <span class="ob-arch-tag">archived</span>` : '');
  const cd = dueCountdown(p.dueDate);
  const cdEl = document.getElementById('ob-countdown');
  if (cdEl) {
    cdEl.className = 'ob-countdown ' + cd.cls;
    cdEl.innerHTML = p.dueDate
      ? `<b>${escHtml(cd.text)}</b><span>until ${escHtml(tlLabel(p.dueDate, true))}</span>`
      : `<b>No deadline</b><span>set one in ✎ edit</span>`;
  }
  const arch = document.getElementById('ob-archive');
  if (arch) arch.textContent = p.archived ? '📤' : '📦';
  if (arch) arch.title = p.archived ? 'Unarchive this project' : 'Archive this project';
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
        const subs = t.subtasks || [];
        const subTotal = subs.reduce((s, x) => s + (x.mins || 0), 0);
        const mins = subs.length ? subTotal : (t.mins || 0);
        const naming = (editingTaskId === t.id);
        return `<div class="bk-task ${t.done ? 'is-done' : ''}">
          <div class="bk-task-main">
            <input type="checkbox" ${t.done ? 'checked' : ''} onchange="toggleTask(${t.id}); renderOpenBook();">
            ${naming
              ? `<input class="bk-task-edit" id="bk-rename" value="${escAttr(strip(t.text))}"
                   onkeydown="if(event.key==='Enter'){this.blur()} if(event.key==='Escape'){editingTaskId=null;setTimeout(renderOpenBook,0)}"
                   onblur="commitTaskRename(${t.id}, this.value)">`
              : `<span class="bk-task-text" onclick="startTaskRename(${t.id})"
                   title="Click to rename">${escHtml(strip(t.text))}</span>`}
            <select class="bk-task-status" style="background:${st.color}"
              onchange="setTaskProjStatus(${t.id}, this.value)">${statusOptions(t.projStatus)}</select>
          </div>
          <div class="bk-task-meta">
            <label class="bk-f">starts<input type="date" value="${escAttr(t.start || '')}"
              onchange="setBookTaskDate(${t.id}, 'start', this.value)"></label>
            <label class="bk-f">due<input type="date" value="${escAttr(t.due || '')}"
              onchange="setBookTaskDate(${t.id}, 'due', this.value)"></label>
            ${subs.length
              ? `<span class="bk-mins" title="sum of its subtasks">⏱ ${formatMinutes(mins)} (subtasks)</span>`
              : `<label class="bk-f">mins<input type="number" min="0" max="1440" step="5" value="${mins}"
                   onchange="setBookTaskMins(${t.id}, this.value)"></label>`}
            <button class="bk-sub-add" onclick="addBookSubtask(${t.id})" title="Add a subtask">＋ sub</button>
          </div>
          ${subs.length ? `<div class="bk-subs">${subs.map((s, si) => `
            <div class="bk-sub ${s.done ? 'done' : ''}">
              <input type="checkbox" ${s.done ? 'checked' : ''} onchange="toggleSubtask(${t.id}, ${si}); renderOpenBook();">
              <input class="bk-sub-text" value="${escAttr(s.text || '')}" placeholder="step…"
                onchange="setBookSubField(${t.id}, ${si}, 'text', this.value)">
              <label class="bk-f">starts<input type="date" value="${escAttr(s.start || '')}"
                onchange="setBookSubField(${t.id}, ${si}, 'start', this.value)"></label>
              <label class="bk-f">due<input type="date" value="${escAttr(s.due || '')}"
                onchange="setBookSubField(${t.id}, ${si}, 'due', this.value)"></label>
              <label class="bk-f">mins<input type="number" min="0" max="600" step="5" value="${s.mins || 0}"
                onchange="setBookSubField(${t.id}, ${si}, 'mins', this.value)"></label>
              <button onclick="removeBookSubtask(${t.id}, ${si})" title="Remove">×</button>
            </div>`).join('')}</div>` : ''}
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
        <label class="bk-field">Activity for the whole book
          <select class="form-input" id="bk-activity" onchange="setBookActivity(this.value)">
            ${getActivityTypes().map(at => `<option value="${at.id}" ${((p.activityType || '') === at.id) ? 'selected' : ''}>${escHtml(at.label)}</option>`).join('')}
          </select>
        </label>
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
        <div class="bk-add-dates">
          <label>Starts<input class="form-input" id="bk-new-start" type="date" value="${tlToday()}"></label>
          <label>Due by<input class="form-input" id="bk-new-due" type="date"></label>
          <label>Mins<input class="form-input" id="bk-new-mins" type="number" min="0" max="1440" step="5" value="30"></label>
          <button class="btn-primary" onclick="addProjectTask()">＋ Add task</button>
        </div>
        <div class="bk-add-hint">Lands on the task board and drops a marker on the timeline.</div>
      </div>
    </div>
  </div>`;
}

// A project's own timeline — same renderer idea, scoped and compact.
function renderProjectTimeline(p) {
  const pts = pointsForProject(p.id).concat(derivedPointsFor(p))
    .sort((a, b) => pointDue(a).localeCompare(pointDue(b)));
  if (!pts.length) {
    return `<div class="bk-empty" style="padding:30px 10px;text-align:center">
      No dated work on this project yet.
      <div style="margin-top:10px"><button class="btn-primary" onclick="closeBook(); tlFilterProject='${p.id}'; showTlMode('timeline'); openPointModal(null);">📍 Add the first point</button></div>
    </div>`;
  }
  const start = tlAddDays(pts[0].date, -7);
  const lastEnd = pts.reduce((m, q) => (pointDue(q) > m ? pointDue(q) : m), pts[0].date);
  const end = tlAddDays(lastEnd, 7);
  const days = Math.max(1, tlDaysBetween(start, end));
  const scale = Math.max(3, Math.min(24, 700 / days));
  const width = Math.max(560, days * scale);
  const x = k => tlDaysBetween(start, k) * scale;
  const col = p.color || '#3B9BD4';

  const MINI_W = 130;
  const evs = pts.map(q => {
    const due = pointDue(q);
    const x1 = x(q.date), x2 = x(due);
    return { q, due, x1, x2, cardL: Math.max(0, x2 - MINI_W / 2), ranged: due !== q.date, nudge: 0 };
  }).sort((a, b) => a.x2 - b.x2);
  const levels = packRows(evs, 40, e => Math.min(e.x1, e.cardL), e => Math.max(e.x2, e.cardL + MINI_W));
  evs.forEach(e => { e.level = e.row; });
  const lineY = Math.max(64, levels * 62) + 56;

  const html = evs.map(ev => {
    const barY = lineY - (ev.level + 1) * 62;
    const legH = lineY - barY;
    const w = Math.max(2, ev.x2 - ev.x1);
    return `<div class="tl-ev mini ${ev.q.sub ? 'is-sub' : ''} ${ev.q.done ? 'is-done' : ''}"
        style="left:${ev.x1.toFixed(1)}px;top:${barY.toFixed(1)}px"
        onclick="closeBook(); ${ev.q.derived ? `openBook('${p.id}')` : `openPointModal('${ev.q.id}')`}">
      <div class="tl-ev-bracket" style="--c:${col}">
        <div class="tl-ev-bar" style="width:${w.toFixed(1)}px"></div>
        <div class="tl-ev-leg l" style="height:${legH.toFixed(1)}px"></div>
        ${ev.ranged ? `<div class="tl-ev-leg r" style="height:${legH.toFixed(1)}px;left:${w.toFixed(1)}px"></div>` : ''}
        <div class="tl-ev-foot l" style="top:${legH.toFixed(1)}px"></div>
        ${ev.ranged ? `<div class="tl-ev-foot r" style="top:${legH.toFixed(1)}px;left:${w.toFixed(1)}px"></div>` : ''}
      </div>
      <div class="tl-ev-card" style="border-color:${col};left:${(ev.cardL - ev.x1).toFixed(1)}px;bottom:8px">
        <div class="tl-card-title">${ev.q.sub ? '↳ ' : ''}${escHtml(ev.q.title)}</div>
      </div>
      <div class="tl-ev-due" style="left:${ev.ranged ? w.toFixed(1) : 0}px;top:${(legH - 30).toFixed(1)}px">
        <b>${escHtml(tlLabel(ev.due))}</b>
      </div>
    </div>`;
  }).join('');

  return `<div class="bk-h" style="margin-bottom:8px">🕰️ ${escHtml(p.name)} timeline
      <span style="font-size:10px;font-weight:700;color:#8A6A46"> — click the line to add a point</span></div>
    <div class="tl-canvas bk-canvas"><div class="tl-strip" data-scale="${scale}" data-start="${start}"
        style="width:${width.toFixed(0)}px;height:${lineY + 34}px">
      <div class="tl-mainline" style="top:${lineY}px" onclick="bookAxisClick(event, '${p.id}')"></div>
      ${html}
    </div></div>`;
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

// ═══════════════════════════════════════════════════════════════
//  BOOK TASK HANDLERS
//  These were lost when renderProjectTimeline was rewritten — a block
//  replacement between two anchors swallowed everything in between, and
//  because they're only ever called from inline onclick/onchange, nothing
//  complained until a book was opened. Restored here.
// ═══════════════════════════════════════════════════════════════

/** One activity for the whole book: re-tags every task and point under it. */
function setBookActivity(typeId) {
  const p = projectById(bookOpenId);
  if (!p) return;
  p.activityType = typeId;
  const tasks = projectTasks(p);
  tasks.forEach(t => { t.type = typeId; });
  pointsForProject(p.id).forEach(pt => { pt.type = typeId; });
  save();
  renderOpenBook();
  renderTlBoard();
  if (typeof refreshTaskSurfaces === 'function') refreshTaskSurfaces();
  showToast(`🎨 ${tasks.length} task${tasks.length === 1 ? '' : 's'} set to ${typeMeta(typeId).label}`);
}

// ── renaming a task straight from the book ──
let editingTaskId = null;

function startTaskRename(id) {
  editingTaskId = id;
  renderOpenBook();
  setTimeout(() => {
    const el = document.getElementById('bk-rename');
    if (el) { el.focus(); el.select(); }
  }, 30);
}

function commitTaskRename(id, value) {
  if (editingTaskId !== id) return;          // Escape already cancelled it
  const p = projectById(bookOpenId);
  const t = state.tasks.find(x => x.id === id);
  editingTaskId = null;
  // re-rendering inside a blur handler tears out the blurring element
  const redraw = () => setTimeout(renderOpenBook, 0);
  if (!p || !t) { redraw(); return; }
  const clean = (value || '').trim();
  if (clean) {
    t.text = `${p.name}: ${clean}`;          // keep the prefix so it stays attached
    const pt = tlPoints().find(x => x.taskId === id);
    if (pt) pt.title = clean;
    save();
    if (typeof refreshTaskSurfaces === 'function') refreshTaskSurfaces();
  }
  redraw();
}

function setBookTaskMins(id, v) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  t.mins = Math.max(0, parseInt(v, 10) || 0);
  save();
  renderOpenBook();
  if (typeof refreshTaskSurfaces === 'function') refreshTaskSurfaces();
}

/** Dates stay editable after the fact, and the timeline follows. */
function setBookTaskDate(id, field, value) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  if (field === 'due' && value && t.start && value < t.start) {
    showToast('Due has to come after the start ⏳'); renderOpenBook(); return;
  }
  if (field === 'start' && value && t.due && value > t.due) {
    showToast('The start has to come before the due date ⏳'); renderOpenBook(); return;
  }
  t[field] = value || '';
  const pt = tlPoints().find(x => x.taskId === id);
  if (pt) {
    if (field === 'due') pt.endDate = value || '';
    else pt.date = value || pt.date;
    if (pt.endDate && pt.endDate <= pt.date) pt.endDate = '';
  }
  save();
  renderOpenBook();
  renderTlBoard();
  if (typeof refreshTaskSurfaces === 'function') refreshTaskSurfaces();
}

/** Subtasks carry their own text, range and estimate. */
function setBookSubField(taskId, si, field, value) {
  const t = state.tasks.find(x => x.id === taskId);
  if (!t || !t.subtasks || !t.subtasks[si]) return;
  const s = t.subtasks[si];
  if (field === 'mins') s.mins = Math.max(0, parseInt(value, 10) || 0);
  else if (field === 'due' && value && s.start && value < s.start) {
    showToast('Due has to come after the start ⏳'); renderOpenBook(); return;
  }
  else s[field] = value;
  save();
  renderOpenBook();
  renderTlBoard();
  if (typeof refreshTaskSurfaces === 'function') refreshTaskSurfaces();
}

function addBookSubtask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  if (!Array.isArray(t.subtasks)) t.subtasks = [];
  t.subtasks.push({ text: 'New step', done: false, mins: 15 });
  save();
  renderOpenBook();
  if (typeof refreshTaskSurfaces === 'function') refreshTaskSurfaces();
}

function removeBookSubtask(id, si) {
  const t = state.tasks.find(x => x.id === id);
  if (!t || !t.subtasks) return;
  t.subtasks.splice(si, 1);
  save();
  renderOpenBook();
  if (typeof refreshTaskSurfaces === 'function') refreshTaskSurfaces();
}

function setTaskProjStatus(taskId, statusId) {
  const t = state.tasks.find(x => x.id === taskId);
  if (!t) return;
  t.projStatus = statusId;
  save();
  renderOpenBook();
}

/** Add a task from the book, with its own range, and drop it on the timeline. */
function addProjectTask() {
  const p = projectById(bookOpenId);
  const input = document.getElementById('bk-new-task');
  if (!p || !input) return;
  const raw = input.value.trim();
  if (!raw) { showToast('Type what needs doing first ✍️'); return; }

  const startEl = document.getElementById('bk-new-start');
  const dueEl = document.getElementById('bk-new-due');
  const start = (startEl && startEl.value) || tlToday();
  const due = (dueEl && dueEl.value) || '';
  if (due && due < start) { showToast('The due date has to come after the start ⏳'); return; }
  const dueKey = due || start;

  const task = {
    id: Date.now() + Math.floor(Math.random() * 999),
    text: `${p.name}: ${raw}`,
    assigneeId: myPersonId() || (state.people[0] && state.people[0].id) || '',
    priority: 'medium',
    type: p.activityType || getActivityTypes()[0].id,
    mins: Math.max(0, parseInt((document.getElementById('bk-new-mins') || {}).value, 10) || 0),
    start,
    due: dueKey,
    done: false,
    source: 'project',
    subtasks: [],
    collapsed: false
  };
  state.tasks.push(task);

  tlPoints().push({
    id: 'tp' + Date.now() + Math.floor(Math.random() * 999),
    createdAt: Date.now(),
    title: raw, date: start, endDate: due || '',
    projectId: p.id, type: task.type, taskId: task.id
  });

  save();
  input.value = '';
  renderOpenBook();
  renderBookshelf();
  if (typeof refreshTaskSurfaces === 'function') refreshTaskSurfaces();
  showToast(`✅ "${task.text}" — due ${tlLabel(dueKey)}, and it's on the timeline`);
}

/** Clicking the bare line inside a book's timeline adds a point to THAT project. */
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

// ══════════════════════════════════════════════
//  STATUS EDITOR — rename, recolour, add, remove
//  (also lost in the renderProjectTimeline rewrite)
// ══════════════════════════════════════════════
function openStatusEditor() {
  renderStatusEditor();
  const m = document.getElementById('status-editor');
  if (m) m.style.display = 'flex';
}

function renderStatusEditor() {
  const box = document.getElementById('se-list');
  if (!box) return;
  const list = projectStatuses();
  box.innerHTML = list.map((s, i) => `
    <div class="se-row">
      <input type="color" value="${escAttr(s.color)}" onchange="editStatus(${i},'color',this.value)" title="Colour">
      <input class="form-input" value="${escAttr(s.label)}" maxlength="26"
        oninput="editStatus(${i},'label',this.value)">
      <button onclick="removeStatus(${i})" title="Remove" ${list.length <= 1 ? 'disabled' : ''}>×</button>
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
  const fallback = (list[0].id === gone.id ? list[1] : list[0]).label;
  askConfirm(`Remove "${gone.label}"? Anything using it falls back to "${fallback}".`, () => {
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
