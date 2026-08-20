// ═══════════════════════════════════════════════════════════════
//  WAY OF BOATS — 14-notes.js
//  Notes-to-self notebook and pinned tasks
//
//  Loaded in numbered order by index.html. These are classic scripts,
//  not ES modules, so every function stays global and the inline
//  onclick= handlers in the markup keep working unchanged.
// ═══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════
// PLANNING SCRATCHPAD  (private spiral notebook, per person)
// ══════════════════════════════════════════════
// Kept on the person as `planning: { text, links: [taskId] }` so it rides the
// same per-item sync as everything else. Before a name is set there's no person
// to attach it to, so it falls back to a local draft that gets folded in later.
const PLANNING_LOCAL_KEY = 'boats_planning_draft';

function getPlanning() {
  const id = myPersonId();
  if (!id) {
    try { return JSON.parse(localStorage.getItem(PLANNING_LOCAL_KEY) || '{}') || {}; }
    catch(e) { return {}; }
  }
  const p = personById(id);
  if (!p) return {};
  if (!p.planning) p.planning = { text: '', links: [] };
  if (!Array.isArray(p.planning.links)) p.planning.links = [];
  return p.planning;
}

/**
 * The notebook is the one thing that waits for a button.
 *
 * It's long-form typing nobody else is waiting on, and every autosave was
 * billed to all eighteen connected clients. It writes locally on every
 * keystroke — nothing can be lost — and reaches the room when you press Save.
 */
function savePlanning(obj) {
  const id = myPersonId();
  if (!id) { localStorage.setItem(PLANNING_LOCAL_KEY, JSON.stringify(obj)); return; }
  const p = personById(id);
  if (!p) return;
  p.planning = obj;
  if (typeof saveLocal === 'function') saveLocal(); else save();
}

// Move a pre-name draft onto the profile once they claim one.
function claimLocalPlanning() {
  const id = myPersonId();
  if (!id) return;
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(PLANNING_LOCAL_KEY) || 'null'); } catch(e) {}
  if (!draft) return;
  const hasText = (draft.text || '').trim();
  const hasLinks = (draft.links || []).length;
  if (!hasText && !hasLinks) { localStorage.removeItem(PLANNING_LOCAL_KEY); return; }
  const p = personById(id);
  if (!p) return;
  if (!p.planning) p.planning = { text: '', links: [] };
  // keep both: the draft goes above anything already on the page
  p.planning.text = hasText
    ? (draft.text + (p.planning.text ? '\n\n' + p.planning.text : ''))
    : p.planning.text;
  const merged = new Set([...(draft.links || []), ...(p.planning.links || [])]);
  p.planning.links = [...merged];
  localStorage.removeItem(PLANNING_LOCAL_KEY);
  save();
}

let planningSaveTimer = null;
function onPlanningInput() {
  clearTimeout(planningSaveTimer);
  planningSaveTimer = setTimeout(savePlanningNow, 500);   // debounce: don't sync every keystroke
}

function savePlanningNow() {
  clearTimeout(planningSaveTimer);
  const ta = document.getElementById('nb-textarea');
  if (!ta) return;
  const cur = getPlanning();
  if ((cur.text || '') === ta.value) return;      // nothing changed
  cur.text = ta.value;
  if (!Array.isArray(cur.links)) cur.links = [];
  savePlanning(cur);
  flashSaved();
}

function flashSaved() {
  const el = document.getElementById('nb-saved');
  if (!el) return;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 1200);
}

function renderPlanning() {
  claimLocalPlanning();
  const ta = document.getElementById('nb-textarea');
  if (!ta) return;
  const data = getPlanning();
  // don't stomp what someone is actively typing
  if (document.activeElement !== ta) ta.value = data.text || '';

  const owner = document.getElementById('planning-owner');
  if (owner) {
    const id = myPersonId();
    const p = id ? personById(id) : null;
    owner.textContent = p
      ? `${p.name}'s page, separate from everyone else's`
      : 'set "My Name" in the sidebar to keep this page with your profile';
  }

  // the spiral binding — count of rings scales with the notebook's height
  const rings = document.getElementById('nb-rings');
  if (rings && !rings.childElementCount) {
    rings.innerHTML = Array.from({ length: 18 }, () => '<div class="nb-ring"></div>').join('');
  }

  renderPlanningLinks();
  renderLogPie();
  // Only rebuild the log when it's actually on screen. renderAll() fires on
  // every sync echo, and rebuilding a hidden pane just churned the DOM (and
  // used to reset the reader's scroll position).
  const section = document.getElementById('section-planning');
  const visible = section && section.classList.contains('active');
  if (visible && nbTab === 'logs') renderSavedLogs();
}

// The picker of board tasks available to pin, + the pinned list itself.
function renderPlanningLinks() {
  const data = getPlanning();
  const links = Array.isArray(data.links) ? data.links : [];

  const picker = document.getElementById('nb-task-picker');
  if (picker) {
    const avail = myOpenBoardTasks().filter(t => !links.includes(t.id));
    picker.innerHTML = `<option value="">Pin a task from the board…</option>` +
      avail.map(t => `<option value="${t.id}">${escHtml(t.text)}</option>`).join('');
    if (!avail.length) {
      picker.innerHTML = `<option value="">No open tasks to pin</option>`;
    }
  }

  const wrap = document.getElementById('nb-links');
  if (!wrap) return;

  // resolve live from the board, and drop links whose task was deleted
  const resolved = links.map(id => state.tasks.find(t => t.id === id)).filter(Boolean);
  if (resolved.length !== links.length) {
    data.links = resolved.map(t => t.id);
    savePlanning(data);
  }

  if (!resolved.length) {
    wrap.innerHTML = `<div class="nb-empty">Nothing pinned yet — pull a task over from the board to think it through here.</div>`;
    return;
  }

  const todayKey = estDateKey();
  wrap.innerHTML = resolved.map(t => {
    const meta = typeMeta(t.type || getActivityTypes()[0].id);
    const overdue = t.due && !t.done && t.due < todayKey;
    const dueHtml = t.due
      ? `<span class="nb-link-due ${overdue ? 'over' : ''}">${overdue ? '❗' : '⏰'} ${escHtml(t.due)}</span>`
      : '';
    return `<div class="nb-link ${t.done ? 'done' : ''}" style="border-left-color:${meta.color}">
      <div class="task-check ${t.done ? 'checked' : ''}" onclick="togglePlanningTask(${t.id})" title="${t.done ? 'Mark as not done' : 'Mark as done'}">${t.done ? '✓' : ''}</div>
      <span class="nb-link-text">${escHtml(t.text)}</span>
      ${dueHtml}
      <span class="nb-link-meta">${escHtml(meta.label)} · ${formatMinutes(taskEffectiveMins(t))}</span>
      <button class="nb-link-x" onclick="removePlanningLink(${t.id})" title="Unpin from this page (keeps the task on the board)">×</button>
    </div>`;
  }).join('');
}

function addPlanningLink() {
  const sel = document.getElementById('nb-task-picker');
  if (!sel) return;
  const id = parseInt(sel.value, 10);
  if (!id) return;
  const data = getPlanning();
  if (!Array.isArray(data.links)) data.links = [];
  if (!data.links.includes(id)) data.links.push(id);
  savePlanning(data);
  sel.value = '';
  renderPlanningLinks();
  flashSaved();
}

// Unpins from the notebook only — the task stays on the board.
function removePlanningLink(id) {
  const data = getPlanning();
  data.links = (data.links || []).filter(x => x !== id);
  savePlanning(data);
  renderPlanningLinks();
}

// Ticking a pinned task ticks the real board task, so it stays in sync everywhere.
function togglePlanningTask(id) {
  toggleTask(id);
  renderPlanningLinks();
}
