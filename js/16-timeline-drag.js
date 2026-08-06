// ═══════════════════════════════════════════════════════════════
//  WAY OF BOATS — 16-timeline-drag.js
//  Drag, resize and drag-to-create on timelines
//
//  Loaded in numbered order by index.html. These are classic scripts,
//  not ES modules, so every function stays global and the inline
//  onclick= handlers in the markup keep working unchanged.
// ═══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════
// DRAG + RESIZE on the timelines (Google-Calendar style)
// ══════════════════════════════════════════════
// Drag a block's middle to move it, drag its top/bottom edge to resize. Snaps to
// 5-minute steps. A press that barely moves is treated as a click and opens the
// editor instead, so both gestures live on the same element.
const DRAG_SNAP = 5;         // minutes
const DRAG_THRESHOLD = 4;    // px of movement before it counts as a drag
let dragCtx = null;
let createCtx = null;   // dragging out a brand-new block on empty space

// Convert a viewport Y inside a lane to a snapped minute value in the day window.
function laneMinuteAt(rect, clientY) {
  const span = LOG_DAY_END - LOG_DAY_START;
  const raw = LOG_DAY_START + ((clientY - rect.top) / rect.height) * span;
  const snapped = Math.round(raw / DRAG_SNAP) * DRAG_SNAP;
  return Math.max(LOG_DAY_START, Math.min(snapped, LOG_DAY_END));
}

function applyEntryGeometry(el, s, en, laneH) {
  const span = LOG_DAY_END - LOG_DAY_START;
  el.style.top = (((s - LOG_DAY_START) / span) * laneH).toFixed(1) + 'px';
  el.style.height = Math.max(18, ((en - s) / span) * laneH).toFixed(1) + 'px';
  const t = el.querySelector('.tle-time');
  if (t) t.textContent = `${minToLabel(s)}–${minToLabel(en)} · ${formatMinutes(en - s)}`;
}

function tlPointerDown(e) {
  if (e.button != null && e.button !== 0) return;   // left button / touch only
  const el = e.target.closest && e.target.closest('.tl-entry.editable');
  if (el) {
    const lane = el.closest('.tl-lane');
    if (!lane) return;
    const mode = el.dataset.mode, dateKey = el.dataset.date, id = +el.dataset.id;
    const ent = entriesFor(mode, dateKey).find(x => x.id === id);
    if (!ent) return;
    const onTop = e.target.classList && e.target.classList.contains('top');
    const onBot = e.target.classList && e.target.classList.contains('bot');
    dragCtx = {
      el, mode, dateKey, id, ent,
      kind: onTop ? 'top' : (onBot ? 'bot' : 'move'),
      startY: e.clientY,
      origStart: ent.startMin, origEnd: ent.endMin,
      liveStart: ent.startMin, liveEnd: ent.endMin,
      laneH: lane.getBoundingClientRect().height,
      moved: 0
    };
    e.preventDefault();
    return;
  }

  // ── empty space: drag out a new block ──
  // Touch is excluded on purpose so a finger drag still scrolls the timeline;
  // on touch, the "＋ Plan" / "＋ Log an activity" button is the way in.
  if (e.pointerType === 'touch') return;
  const lane = e.target.closest && e.target.closest('.tl-lane[data-editable="1"]');
  if (!lane) return;
  const rect = lane.getBoundingClientRect();
  createCtx = {
    lane, rect,
    mode: lane.dataset.mode, dateKey: lane.dataset.date,
    anchor: laneMinuteAt(rect, e.clientY),
    startY: e.clientY, moved: 0,
    ghost: null, liveStart: null, liveEnd: null
  };
  e.preventDefault();
}

function tlPointerMove(e) {
  if (createCtx) { createDragMove(e); return; }
  const d = dragCtx;
  if (!d) return;
  const dy = e.clientY - d.startY;
  d.moved = Math.max(d.moved, Math.abs(dy));
  if (d.moved <= DRAG_THRESHOLD) return;
  d.el.classList.add('dragging');

  const span = LOG_DAY_END - LOG_DAY_START;
  const dm = Math.round(((dy / d.laneH) * span) / DRAG_SNAP) * DRAG_SNAP;
  let s = d.origStart, en = d.origEnd;
  if (d.kind === 'move') {
    const dur = d.origEnd - d.origStart;
    s = Math.max(LOG_DAY_START, Math.min(d.origStart + dm, LOG_DAY_END - dur));
    en = s + dur;
  } else if (d.kind === 'top') {
    s = Math.max(LOG_DAY_START, Math.min(d.origStart + dm, d.origEnd - DRAG_SNAP));
    en = d.origEnd;
  } else {
    en = Math.min(LOG_DAY_END, Math.max(d.origEnd + dm, d.origStart + DRAG_SNAP));
    s = d.origStart;
  }
  d.liveStart = s; d.liveEnd = en;
  applyEntryGeometry(d.el, s, en, d.laneH);
}

// Grow a dashed preview block between the anchor and the cursor.
function createDragMove(e) {
  const c = createCtx;
  c.moved = Math.max(c.moved, Math.abs(e.clientY - c.startY));
  if (c.moved <= DRAG_THRESHOLD) return;

  const cur = laneMinuteAt(c.rect, e.clientY);
  let s = Math.min(c.anchor, cur), en = Math.max(c.anchor, cur);
  if (en - s < DRAG_SNAP) en = s + DRAG_SNAP;         // never zero-length
  if (en > LOG_DAY_END) { en = LOG_DAY_END; s = Math.min(s, en - DRAG_SNAP); }
  c.liveStart = s; c.liveEnd = en;

  if (!c.ghost) {
    c.ghost = document.createElement('div');
    c.ghost.className = 'tl-ghost';
    c.ghost.innerHTML = `<span class="tl-ghost-time"></span>`;
    c.lane.appendChild(c.ghost);
  }
  const span = LOG_DAY_END - LOG_DAY_START;
  c.ghost.style.top = (((s - LOG_DAY_START) / span) * c.rect.height).toFixed(1) + 'px';
  c.ghost.style.height = Math.max(14, ((en - s) / span) * c.rect.height).toFixed(1) + 'px';
  c.ghost.querySelector('.tl-ghost-time').textContent =
    `${minToLabel(s)}–${minToLabel(en)} · ${formatMinutes(en - s)}`;
}

function tlPointerUp() {
  if (createCtx) {
    const c = createCtx;
    createCtx = null;
    if (c.ghost) c.ghost.remove();
    // Only a real drag creates something — a stray click does nothing.
    if (c.moved <= DRAG_THRESHOLD || c.liveStart == null) return;
    openEntryModal(c.mode, c.dateKey, null, { startMin: c.liveStart, endMin: c.liveEnd });
    return;
  }

  const d = dragCtx;
  if (!d) return;
  dragCtx = null;
  d.el.classList.remove('dragging');

  if (d.moved <= DRAG_THRESHOLD) {       // a tap, not a drag → edit it
    openEntryModal(d.mode, d.dateKey, d.id);
    return;
  }
  if (d.liveStart === d.origStart && d.liveEnd === d.origEnd) return;
  d.ent.startMin = d.liveStart;
  d.ent.endMin = d.liveEnd;
  if (d.mode === 'log') markLogEdited(getLog(myPersonId(), d.dateKey, true));
  persistEntries(d.mode, d.dateKey);
  afterEntryChange(d.mode);
}

document.addEventListener('pointerdown', tlPointerDown);
document.addEventListener('pointermove', tlPointerMove);
document.addEventListener('pointerup', tlPointerUp);
document.addEventListener('pointercancel', tlPointerUp);

// ── pie of logged time by activity ──
function renderLogPie() {
  const svgEl = document.getElementById('logpie-svg');
  const legEl = document.getElementById('logpie-legend');
  if (!svgEl || !legEl) return;
  const rangeSel = document.getElementById('logpie-range');
  const range = rangeSel ? rangeSel.value : 'week';

  // who are we charting? defaults to you, but any crew member (or everyone
  // combined) can be picked — same idea as the saved-log browser.
  const psel = document.getElementById('logpie-person');
  if (psel) {
    const want = psel.value || myPersonId() || 'all';
    psel.innerHTML = `<option value="all">🌍 Everyone</option>` +
      visiblePeople().map(p =>
        `<option value="${p.id}">${escHtml(p.name)}${p.id === myPersonId() ? ' (you)' : ''}</option>`).join('');
    psel.value = [...psel.options].some(o => o.value === want) ? want : 'all';
  }
  const who = psel ? psel.value : (myPersonId() || 'all');
  const targets = who === 'all' ? visiblePeople().map(p => p.id) : [who];
  const today = estDateKey();

  const byType = {};
  targets.forEach(tid => {
    const logs = personLogs(tid);
    Object.keys(logs).forEach(k => {
      if (range === 'today' && k !== today) return;
      if (range === 'week' && (k < keyPlusDays(today, -6) || k > today)) return;
      (logs[k].entries || []).forEach(e => {
        const id = e.type || getActivityTypes()[0].id;
        byType[id] = (byType[id] || 0) + Math.max(0, e.endMin - e.startMin);
      });
    });
  });

  const entries = Object.entries(byType).filter(([, m]) => m > 0).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, m]) => s + m, 0);

  if (!total) {
    svgEl.innerHTML = `<div style="width:200px;height:200px;border-radius:50%;background:var(--ocean-pale);display:flex;align-items:center;justify-content:center;font-size:40px;">🥧</div>`;
    legEl.innerHTML = `<div style="font-size:13px;font-weight:600;color:var(--ink-light);">Nothing logged in this range yet. Log a few activities and the split shows up here.</div>`;
    return;
  }

  const cx = 100, cy = 100, r = 92;
  let angle = -Math.PI / 2, paths = '';
  const rows = [];
  entries.forEach(([id, mins]) => {
    const frac = mins / total;
    const a2 = angle + frac * Math.PI * 2;
    const meta = typeMeta(id);
    const col = meta.color || '#3B9BD4';
    if (frac >= 0.999) {
      paths += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${col}"/>`;
    } else {
      const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(a2),   y2 = cy + r * Math.sin(a2);
      paths += `<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${frac > 0.5 ? 1 : 0} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${col}" stroke="white" stroke-width="2"/>`;
    }
    rows.push(`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
      ${fishIcon(col, 20)}
      <span style="font-size:13px;font-weight:700;flex:1;">${escHtml(meta.label)}</span>
      <span style="font-size:12px;font-weight:800;color:var(--ink-light);">${formatMinutes(mins)} · ${Math.round(frac * 100)}%</span>
    </div>`);
    angle = a2;
  });

  svgEl.innerHTML = `<svg width="200" height="200" viewBox="0 0 200 200">${paths}</svg>`;
  const whoLabel = who === 'all' ? 'everyone' : ((personById(who) || {}).name || 'this person');
  legEl.innerHTML = rows.join('') +
    `<div style="margin-top:8px;font-size:12px;font-weight:800;color:var(--ocean-deep);">Total logged by ${escHtml(whoLabel)}: ${formatMinutes(total)}</div>`;
}
