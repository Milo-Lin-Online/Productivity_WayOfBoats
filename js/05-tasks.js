// ═══════════════════════════════════════════════════════════════
//  WAY OF BOATS — 05-tasks.js
//  Task board: filters, search, sorting, subtasks
//
//  Loaded in numbered order by index.html. These are classic scripts,
//  not ES modules, so every function stays global and the inline
//  onclick= handlers in the markup keep working unchanged.
// ═══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════
// TASKS
// ══════════════════════════════════════════════
function renderAssigneeSelect() {
  const sel = document.getElementById('task-assignee');
  if (sel) {
    if (state.people.length === 0) {
      sel.innerHTML = `<option value="">— add crew first —</option>`;
    } else {
      const cur = sel.value;
      sel.innerHTML = visiblePeople().map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('');
      if (cur) sel.value = cur;
    }
  }
  // activity type dropdown (add row)
  const tsel = document.getElementById('task-type');
  if (tsel) {
    const cur = tsel.value;
    tsel.innerHTML = getActivityTypes().map(t => `<option value="${t.id}">${escHtml(t.label)}</option>`).join('');
    if (cur && getActivityTypes().some(t => t.id === cur)) tsel.value = cur;
  }
  // sort/filter by activity dropdown
  const ssel = document.getElementById('sort-type');
  if (ssel) {
    const cur = state.sortType || '';
    ssel.innerHTML = `<option value="">All activities</option>` +
      getActivityTypes().map(t => `<option value="${t.id}">${escHtml(t.label)}</option>`).join('');
    ssel.value = cur;
  }
  // person filter dropdown
  const psel = document.getElementById('filter-person');
  if (psel) {
    const cur = state.filterPerson || '';
    psel.innerHTML = `<option value="">👥 Everyone</option>` +
      visiblePeople().map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('');
    psel.value = cur;
  }
  // batch dropdowns
  const bt = document.getElementById('batch-type');
  if (bt) bt.innerHTML = `<option value="">Activity…</option>` + getActivityTypes().map(t => `<option value="${t.id}">${escHtml(t.label)}</option>`).join('');
  const bp = document.getElementById('batch-person');
  if (bp) bp.innerHTML = `<option value="">Assignee…</option>` + visiblePeople().map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('');
}

function personById(id) { return state.people.find(p => p.id === id); }

// Activity types are user-editable; ids are stable, labels/emojis editable.
const DEFAULT_ACTIVITY_TYPES = [
  { id: 'health',    color: '#E8536A', label: 'Health' },
  { id: 'work',      color: '#3B9BD4', label: 'Work' },
  { id: 'personal',  color: '#C9B8E8', label: 'Personal' },
  { id: 'money',     color: '#7AAF72', label: 'Money' },
  { id: 'gym',       color: '#FF7A3C', label: 'Gym' },
  { id: 'freelance', color: '#F4A460', label: 'Freelance' },
  { id: 'career',    color: '#2876B0', label: 'Career' },
  { id: 'social',    color: '#E8A8D8', label: 'Social Media' }
];
function getActivityTypes() { return state.activityTypes || DEFAULT_ACTIVITY_TYPES; }
function typeMeta(id) {
  return getActivityTypes().find(t => t.id === id) || { color: '#999', label: 'Other' };
}
// Little inline fish icon in a given color (used for activity types).
// World Cup category shapes — pick a shape + it's tinted with the category color.
const WC_SHAPES = ['circle','square','diamond','star','heart','triangle','anchor','fish'];
function wcShapeSvg(shape, color, px = 18) {
  const s = px;
  const wrap = (inner) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" style="vertical-align:middle;flex-shrink:0">${inner}</svg>`;
  switch (shape) {
    case 'square':   return wrap(`<rect x="3" y="3" width="18" height="18" rx="3" fill="${color}"/>`);
    case 'diamond':  return wrap(`<path d="M12 2 L22 12 L12 22 L2 12 Z" fill="${color}"/>`);
    case 'star':     return wrap(`<path d="M12 2 L15 9 L22 9 L16 14 L18 21 L12 17 L6 21 L8 14 L2 9 L9 9 Z" fill="${color}"/>`);
    case 'heart':    return wrap(`<path d="M12 21 C4 14 4 7 8.5 7 C11 7 12 9 12 9 C12 9 13 7 15.5 7 C20 7 20 14 12 21 Z" fill="${color}"/>`);
    case 'triangle': return wrap(`<path d="M12 3 L22 21 L2 21 Z" fill="${color}"/>`);
    case 'anchor':   return wrap(`<circle cx="12" cy="4" r="2.4" fill="none" stroke="${color}" stroke-width="2"/><line x1="12" y1="6" x2="12" y2="20" stroke="${color}" stroke-width="2"/><line x1="7" y1="11" x2="17" y2="11" stroke="${color}" stroke-width="2"/><path d="M4 15 C5 20 10 21 12 21 C14 21 19 20 20 15" fill="none" stroke="${color}" stroke-width="2"/>`);
    case 'fish':     return `<span style="display:inline-flex">${fishIcon(color, px)}</span>`;
    default:         return wrap(`<circle cx="12" cy="12" r="9" fill="${color}"/>`);
  }
}

function fishIcon(color, px = 16) {  const w = px, h = Math.round(px * 0.62);
  return `<svg width="${w}" height="${h}" viewBox="0 0 34 20" style="vertical-align:middle;flex-shrink:0">
    <polygon points="12,10 1,3 1,17" fill="${color}"/>
    <ellipse cx="20" cy="10" rx="13" ry="7" fill="${color}"/>
    <circle cx="28" cy="8" r="1.6" fill="white"/>
  </svg>`;
}
// Small paper boat whose SAIL is the given color (used as the person color picker).
function sailBoat(color, px = 34) {
  return `<svg width="${px}" height="${px}" viewBox="0 0 40 40" style="vertical-align:middle">
    <polygon points="20,3 20,22 8,22" fill="${color}" stroke="white" stroke-width="1.5"/>
    <rect x="19.2" y="3" width="1.6" height="20" fill="#8B5E3C"/>
    <path d="M4,24 L36,24 L30,36 L10,36 Z" fill="#FFFFFF" stroke="${color}" stroke-width="1.6"/>
    <path d="M4,24 L36,24 L33,28 L7,28 Z" fill="#DCF1FB"/>
  </svg>`;
}
// Small colorful completeness donut (done vs total) in the site's palette.
function completenessDonut(done, total, accent) {
  const size = 46, r = 18, cxy = size / 2, circ = 2 * Math.PI * r;
  const frac = total > 0 ? done / total : 0;
  const dash = (frac * circ).toFixed(2);
  const col = accent || 'var(--ocean)';
  const track = 'rgba(0,0,0,0.10)';
  const pctTxt = total > 0 ? Math.round(frac * 100) + '%' : '–';
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${cxy}" cy="${cxy}" r="${r}" fill="none" stroke="${track}" stroke-width="6"/>
    <circle cx="${cxy}" cy="${cxy}" r="${r}" fill="none" stroke="${col}" stroke-width="6"
      stroke-linecap="round" stroke-dasharray="${dash} ${circ}"
      transform="rotate(-90 ${cxy} ${cxy})" style="transition:stroke-dasharray 0.4s;"/>
    <text x="${cxy}" y="${cxy}" text-anchor="middle" dominant-baseline="central"
      font-size="11" font-weight="800" fill="${col}" font-family="Nunito,sans-serif">${pctTxt}</text>
  </svg>`;
}
const PRIORITY_META = {
  high:   { emoji: '🔴', label: 'High', rank: 0 },
  medium: { emoji: '🟡', label: 'Medium', rank: 1 },
  low:    { emoji: '🟢', label: 'Low', rank: 2 }
};
const PRIORITY_ORDER = ['high', 'medium', 'low'];

// ── TIME PARSING ──
// Accepts "30", "30m", "30 min", "30 minutes", "2h", "1.5h", "2 hours",
// or combos like "1h30m". Returns total minutes (integer).
function parseTimeToMinutes(input) {
  if (input == null) return 30;
  let s = String(input).trim().toLowerCase();
  if (!s) return 30;
  let mins = 0, matched = false;
  // hours: number followed by h / hr / hrs / hour / hours
  const hMatch = s.match(/(\d+(?:\.\d+)?)\s*(hours|hour|hrs|hr|h)/);
  if (hMatch) { mins += parseFloat(hMatch[1]) * 60; matched = true; }
  // minutes: number followed by m / min / mins / minute / minutes
  const mMatch = s.match(/(\d+(?:\.\d+)?)\s*(minutes|minute|mins|min|m)(?!\w*h)/);
  if (mMatch) { mins += parseFloat(mMatch[1]); matched = true; }
  // bare number with no unit → treat as minutes
  if (!matched) {
    const n = parseFloat(s.replace(/[^\d.]/g, ''));
    if (!isNaN(n)) mins = n;
  }
  mins = Math.round(mins);
  return mins > 0 ? mins : 30;
}
// Format minutes back as a compact "1h 30m" / "45m" / "2h" string.
function formatMinutes(mins) {
  mins = parseInt(mins, 10) || 0;
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function addTask() {
  const input = document.getElementById('task-input');
  const text = input.value.trim();
  if (!text) return;
  const assigneeId = document.getElementById('task-assignee').value;
  if (!assigneeId) { showToast('Add a crew member first! ⚓'); return; }
  const priority = document.getElementById('task-priority').value;
  const type = document.getElementById('task-type').value;
  const minsField = document.getElementById('task-mins');
  const mins = parseTimeToMinutes(minsField.value);
  minsField.value = formatMinutes(mins);  // autocorrect display (e.g. "90 minutes" → "1h 30m")
  const due = document.getElementById('task-due').value || '';
  state.tasks.push({ id: Date.now(), text, assigneeId, priority, type, mins, due, done: false, source: 'board', subtasks: [], collapsed: false });
  input.value = '';
  document.getElementById('task-due').value = '';
  save();
  renderTasks();
  renderLeaderboard();
  showToast('Task added! ✅');
}

function changeSort() {
  state.sortPriority = document.getElementById('sort-priority').value;
  state.sortType = document.getElementById('sort-type').value;
  state.sortTime = document.getElementById('sort-time').value;
  const dueSel = document.getElementById('sort-due');
  state.sortDue = dueSel ? dueSel.value : '';
  state.filterPerson = document.getElementById('filter-person').value;
  renderTasks();
}

// Every surface that shows task state, refreshed in one place. Checking a task
// off anywhere — board, meeting checklist, pomodoro list, notebook, leaderboard
// drawer — has to show up everywhere else immediately, so all togglers call this
// instead of each maintaining its own partial list of re-renders.
function refreshTaskSurfaces() {
  try { renderTasks(); } catch(e) {}          // also refreshes the pomodoro to-do list
  try { renderLeaderboard(); } catch(e) {}
  try { renderPersonExpand(); } catch(e) {}   // the meeting person drawer, if open
  try { renderMeetings(); } catch(e) {}
  try { renderCalendar(); } catch(e) {}
  try { renderPlanningLinks(); } catch(e) {}
  try { renderPie(); } catch(e) {}
}
