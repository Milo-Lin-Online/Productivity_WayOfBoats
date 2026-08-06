// ═══════════════════════════════════════════════════════════════
//  WAY OF BOATS — 15-logs.js
//  Day logs: the 2am-to-2am timeline and archive
//
//  Loaded in numbered order by index.html. These are classic scripts,
//  not ES modules, so every function stays global and the inline
//  onclick= handlers in the markup keep working unchanged.
// ═══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════
// DAY LOG + TWO-DAY PLANNER
// ══════════════════════════════════════════════
// A logged day runs 2am → 2am, so late nights stay on the day they belong to.
// Times are stored as minutes from midnight OF THE LOG'S DATE, which means the
// after-midnight tail is simply > 1440 (e.g. 1500 = 1:00am the next morning).
const LOG_DAY_START = 120;    // 2:00 AM
const LOG_DAY_END   = 1560;   // 2:00 AM the following day
const LOG_HOUR_H    = 46;     // px per hour in the timeline

function minToLabel(m) {
  const mm = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(mm / 60), mi = mm % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  return `${h12}:${String(mi).padStart(2, '0')} ${ampm}`;
}
function minToTimeInput(m) {
  const mm = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
}
function parseTimeInput(str) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((str || '').trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}
// A clock time before 2am belongs to the tail of the logged day, not its start.
function resolveStartMin(str) {
  const cm = parseTimeInput(str);
  if (cm == null) return null;
  const cand = cm < LOG_DAY_START ? cm + 1440 : cm;
  return Math.min(cand, LOG_DAY_END - 5);
}
function resolveEndMin(startMin, str) {
  const cm = parseTimeInput(str);
  if (cm == null) return null;
  let cand = cm < LOG_DAY_START ? cm + 1440 : cm;
  if (cand <= startMin) cand += 1440;      // rolled past midnight
  return Math.min(cand, LOG_DAY_END);
}
function keyPlusDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return ymd(dt);
}
function keyLabel(key, withYear) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const mons = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${days[dt.getDay()]} ${mons[dt.getMonth()]} ${dt.getDate()}` + (withYear ? ` ${y}` : '');
}

// ── storage ──
function personLogs(pid) {
  const p = personById(pid);
  if (!p) return {};
  if (!p.logs || typeof p.logs !== 'object' || Array.isArray(p.logs)) p.logs = {};
  return p.logs;
}
function getLog(pid, dateKey, create) {
  const logs = personLogs(pid);
  if (!logs[dateKey] && create) {
    logs[dateKey] = { date: dateKey, entries: [], createdAt: Date.now(), edited: false, editedAt: null };
  }
  const L = logs[dateKey];
  if (L && !Array.isArray(L.entries)) L.entries = [];
  return L || null;
}
// Changing a day that has already passed counts as an edit; adding to today
// while today is still happening is just logging.
function markLogEdited(L) {
  // Only a day that has already happened can be "edited". Logging today as it
  // goes, or planning tomorrow ahead of time, is just normal use.
  if (L && L.date < estDateKey()) { L.edited = true; L.editedAt = Date.now(); }
}

// Tomorrow is editable so the same timeline can be used to plan ahead.
function tomorrowKey() { return keyPlusDays(estDateKey(), 1); }
function isFutureDay(key) { return key > estDateKey(); }
function planDays() {
  const d = getPlanning();
  if (!d.days || typeof d.days !== 'object' || Array.isArray(d.days)) d.days = {};
  return d.days;
}
function entriesFor(mode, dateKey, pid) {
  if (mode === 'plan') {
    const days = planDays();
    if (!Array.isArray(days[dateKey])) days[dateKey] = [];
    return days[dateKey];
  }
  const L = getLog(pid || myPersonId(), dateKey, true);
  return L ? L.entries : [];
}
function persistEntries(mode, dateKey) {
  if (mode === 'plan') { const d = getPlanning(); savePlanning(d); }
  else save();
}
function totalLogged(entries) {
  return (entries || []).reduce((s, e) => s + Math.max(0, e.endMin - e.startMin), 0);
}

// ── notebook tabs ──
// The notebook opens on Logs. Today's log is just the first entry in the
// archive, so there's one interface for logging and for reviewing.
let nbTab = 'logs';
function showNbTab(name) {
  nbTab = name;
  ['logs','notes'].forEach(t => {
    const pane = document.getElementById('nbpane-' + t);
    const tab  = document.getElementById('nbtab-' + t);
    if (pane) pane.classList.toggle('active', t === name);
    if (tab)  tab.classList.toggle('active', t === name);
  });
  if (name === 'logs') renderSavedLogs();
}

// ── the timeline itself ──
function renderTimeline(entries, opts) {
  opts = opts || {};
  const span = LOG_DAY_END - LOG_DAY_START;
  const totalH = (span / 60) * LOG_HOUR_H;
  const pos = m => ((m - LOG_DAY_START) / span) * totalH;

  let hours = '';
  for (let m = LOG_DAY_START; m < LOG_DAY_END; m += 60) {
    hours += `<div class="tl-hour"><span class="tl-hour-label">${minToLabel(m)}</span></div>`;
  }

  const sorted = (entries || []).slice().sort((a, b) => a.startMin - b.startMin);
  const blocks = sorted.map(e => {
    const meta = typeMeta(e.type || getActivityTypes()[0].id);
    const top = pos(e.startMin);
    const h = Math.max(18, pos(e.endMin) - pos(e.startMin));
    const dur = e.endMin - e.startMin;
    const names = (e.taskIds || [])
      .map(id => (state.tasks.find(t => t.id === id) || {}).text)
      .filter(Boolean);
    // Editable blocks carry their identity in data-* so one delegated pointer
    // handler can drag/resize any timeline without per-element wiring.
    const dragAttrs = opts.editable
      ? `class="tl-entry editable" data-mode="${opts.mode}" data-date="${opts.dateKey}" data-id="${e.id}"`
      : `class="tl-entry"`;
    const handles = opts.editable
      ? `<div class="tl-rs top"></div><div class="tl-rs bot"></div>` : '';
    return `<div ${dragAttrs} style="top:${top.toFixed(1)}px;height:${h.toFixed(1)}px;background:${meta.color}"
      title="${escAttr((e.label || meta.label) + ' · ' + minToLabel(e.startMin) + '–' + minToLabel(e.endMin) + (opts.editable ? ' · drag to move, drag an edge to resize, click to edit' : ''))}">
      ${handles}
      <div>${escHtml(e.label || meta.label)}</div>
      <div class="tle-time">${minToLabel(e.startMin)}–${minToLabel(e.endMin)} · ${formatMinutes(dur)}</div>
      ${names.length ? `<div class="tle-tasks">🔗 ${escHtml(names.join(', '))}</div>` : ''}
    </div>`;
  }).join('');

  // the midnight boundary — where the new day begins
  const ndTop = pos(1440);
  const newDayLabel = opts.dateKey ? keyLabel(keyPlusDays(opts.dateKey, 1)) : 'next day';
  const newDay = `<div class="tl-newday" style="top:${ndTop.toFixed(1)}px"><span>▲ ${escHtml(newDayLabel)} — new day</span></div>`;

  // a live "you are here" line, only on today
  let nowLine = '';
  if (opts.showNow) {
    const now = new Date();
    let cm = now.getHours() * 60 + now.getMinutes();
    if (cm < LOG_DAY_START) cm += 1440;
    if (cm >= LOG_DAY_START && cm <= LOG_DAY_END) {
      nowLine = `<div class="tl-now" style="top:${pos(cm).toFixed(1)}px"></div>`;
    }
  }

  return `<div class="tl">
    <div class="tl-scroll"><div class="tl-body" style="height:${totalH}px">
      ${hours}
      <div class="tl-endcap" style="top:${totalH}px"><span class="tl-hour-label">${minToLabel(LOG_DAY_END)}</span></div>
      ${newDay}${nowLine}
      <div class="tl-lane" style="height:${totalH}px"
        ${opts.editable ? `data-editable="1" data-mode="${opts.mode}" data-date="${opts.dateKey}"` : ''}>${blocks}</div>
    </div></div>
  </div>`;
}

// Start the scroll near the action instead of at 2am.
function scrollTimelineIntoView(wrap, entries) {
  const sc = wrap.querySelector('.tl-scroll');
  if (!sc) return;
  const span = LOG_DAY_END - LOG_DAY_START;
  const totalH = (span / 60) * LOG_HOUR_H;
  let anchor;
  if (entries && entries.length) anchor = Math.min(...entries.map(e => e.startMin));
  else if (typeof logViewDate === 'string' && isFutureDay(logViewDate)) anchor = 480;  // 8am — "now" is meaningless for a day that hasn't happened
  else { const n = new Date(); anchor = n.getHours() * 60 + n.getMinutes(); if (anchor < LOG_DAY_START) anchor += 1440; }
  const top = ((anchor - LOG_DAY_START) / span) * totalH;
  sc.scrollTop = Math.max(0, top - 60);
}

// ── saved logs tab ──
let logViewPerson = null;   // whose archive we're looking at
let logViewDate = null;     // which log is expanded

function onLogPersonChange() {
  const sel = document.getElementById('log-person');
  logViewPerson = sel ? sel.value : null;
  logViewDate = estDateKey();    // land on today for whoever we switched to
  renderSavedLogs();
}

function renderSavedLogs() {
  const sel = document.getElementById('log-person');
  if (!sel) return;
  if (!logViewPerson) logViewPerson = myPersonId() || (visiblePeople()[0] && visiblePeople()[0].id) || '';
  // open on today unless the user has picked another day
  if (!logViewDate) logViewDate = estDateKey();
  sel.innerHTML = visiblePeople().map(p =>
    `<option value="${p.id}">${escHtml(p.name)}${p.id === myPersonId() ? ' (you)' : ''}</option>`).join('');
  if (!state.people.length) sel.innerHTML = `<option value="">No crew yet</option>`;
  sel.value = logViewPerson;

  renderLogWeek();
  renderLogToc();
  renderLogDetail();
}

// Week view: the last 7 days as seven miniature one-day logs.
function renderLogWeek() {
  const wrap = document.getElementById('log-week');
  if (!wrap) return;
  const today = estDateKey();
  const isMine = logViewPerson === myPersonId();
  const span = LOG_DAY_END - LOG_DAY_START;
  // auto-fit so the extra (8th) column doesn't overflow the 7-wide grid, and
  // still wraps sensibly on a phone
  wrap.style.gridTemplateColumns = 'repeat(auto-fit, minmax(56px, 1fr))';
  wrap.innerHTML = [-6,-5,-4,-3,-2,-1,0,1].map(off => {
    const key = keyPlusDays(today, off);
    const L = getLog(logViewPerson, key, false);
    const entries = (L && L.entries) || [];
    const blocks = entries.map(e => {
      const meta = typeMeta(e.type || getActivityTypes()[0].id);
      const top = ((e.startMin - LOG_DAY_START) / span) * 100;
      const h = Math.max(1.2, ((e.endMin - e.startMin) / span) * 100);
      return `<div class="wk-block" style="top:${top.toFixed(2)}%;height:${h.toFixed(2)}%;background:${meta.color}"></div>`;
    }).join('');
    const has = entries.length > 0;
    const future = isFutureDay(key);
    // today and tomorrow stay clickable even when empty, so there's always a
    // way in to log or to plan
    const openable = has || (isMine && (key === today || key === tomorrowKey()));
    const futureStyle = future ? 'border-style:dashed;' : '';
    return `<div class="wk-day ${openable ? '' : 'empty'} ${key === today ? 'is-today' : ''}"
        style="${futureStyle}"
        ${openable ? `onclick="openSavedLog('${key}')"` : ''}
        title="${escAttr(keyLabel(key, true) + (future ? ' — plan ahead' : ''))}">
      <div class="wk-head">${future ? '🗓️ plan' : keyLabel(key).replace(' ', '<br>')}</div>
      <div class="wk-strip">${blocks}</div>
      <div class="wk-foot">${has ? formatMinutes(totalLogged(entries)) : (future ? 'tomorrow' : '—')}</div>
    </div>`;
  }).join('');
}

function renderLogToc() {
  const wrap = document.getElementById('log-toc');
  const count = document.getElementById('log-count');
  if (!wrap) return;
  const logs = personLogs(logViewPerson);
  const today = estDateKey();
  const tomorrow = tomorrowKey();
  const keys = Object.keys(logs).filter(k => (logs[k].entries || []).length).sort().reverse();
  // today and tomorrow always get a row, even when empty: one to log into, one
  // to plan into. Sorting descending puts tomorrow first, then today, then past.
  const isMine = logViewPerson === myPersonId();
  if (isMine) {
    [today, tomorrow].forEach(k => { if (!keys.includes(k)) keys.push(k); });
    keys.sort().reverse();
  }
  if (count) count.textContent = keys.length ? `${keys.length} day${keys.length === 1 ? '' : 's'}` : '';

  if (!keys.length) {
    wrap.innerHTML = `<div class="nb-empty">No logs yet for this person.</div>`;
    return;
  }
  wrap.innerHTML = keys.map(k => {
    const L = logs[k] || { entries: [] };
    const total = totalLogged(L.entries);
    const chips = L.entries.slice().sort((a,b)=>a.startMin-b.startMin).map(e => {
      const meta = typeMeta(e.type || getActivityTypes()[0].id);
      return `<span class="log-chip" style="background:${meta.color}" title="${escAttr(e.label || meta.label)}"></span>`;
    }).join('');
    const isTomorrow = k === tomorrow;
    const tag = isTomorrow ? '🗓️ Tomorrow · ' : (k === today ? '📍 Today · ' : '');
    return `<div class="log-row ${k === logViewDate ? 'active' : ''}"
        style="${isTomorrow ? 'border-style:dashed;' : ''}" onclick="openSavedLog('${k}')">
      <span class="log-row-date">${tag}${keyLabel(k, true)}</span>
      <span class="log-row-total">${L.entries.length ? `${L.entries.length} · ${formatMinutes(total)}` : (isTomorrow ? 'nothing planned' : 'nothing yet')}</span>
      <span class="log-chips">${chips}</span>
      ${L.edited ? `<span class="edited-mark" title="Changed after the day it covers">✏️ edited</span>` : ''}
    </div>`;
  }).join('');
}

function openSavedLog(key) {
  logViewDate = key;            // stay open — this pane IS the editor
  renderLogToc();
  renderLogDetail();
  if (logViewDate) {
    const d = document.getElementById('log-detail');
    if (d) setTimeout(() => d.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 40);
  }
}

// Which day/person the detail pane is currently showing. A re-render for the
// SAME day should leave the reader exactly where they were; only a genuine
// change of day earns an auto-scroll.
let logDetailShowing = null;

function renderLogDetail() {
  const wrap = document.getElementById('log-detail');
  if (!wrap) return;
  if (!logViewDate) { wrap.innerHTML = ''; logDetailShowing = null; return; }
  const mine = logViewPerson === myPersonId();
  // create today's (or any of my days') log on demand so it's always editable
  const L = getLog(logViewPerson, logViewDate, mine) || { date: logViewDate, entries: [] };
  if (!L) { wrap.innerHTML = ''; return; }
  const total = totalLogged(L.entries);

  // innerHTML throws the old .tl-scroll away, taking its scroll position with
  // it. Remember where the reader was so we can put them back.
  const showingKey = logViewPerson + '|' + logViewDate;
  const sameDay = (logDetailShowing === showingKey);
  const prev = wrap.querySelector('.tl-scroll');
  const keptScroll = (sameDay && prev) ? prev.scrollTop : null;

  // A future day is the same timeline used forwards: you're planning, not
  // recording, so the wording changes but the mechanics don't.
  const future = isFutureDay(logViewDate);
  const noun = future ? 'block' : 'activity';
  const nounPl = future ? 'blocks' : 'activities';

  wrap.innerHTML = `
    <hr class="nb-divider">
    <div class="tl-head">
      <div>
        <div class="tl-date">${future ? '🗓️ ' : ''}${keyLabel(logViewDate, true)}${future ? ' — planning ahead' : ''}</div>
        <div class="tl-total">
          ${L.entries.length} ${future ? 'planned ' : ''}${L.entries.length === 1 ? noun : nounPl} · ${formatMinutes(total)}
          ${L.edited ? ` · <span style="color:var(--sunset-deep);font-weight:800;">edited ${new Date(L.editedAt).toLocaleDateString()}</span>` : ''}
        </div>
      </div>
      ${mine ? `<button class="btn-primary" onclick="openEntryModal('log','${logViewDate}',null)" style="font-size:13px;">＋ ${future ? 'Plan a block' : 'Log an activity'}</button>` : ''}
    </div>
    ${mine ? '' : `<div class="tl-total" style="margin-bottom:8px;">Viewing someone else's log — read only.</div>`}
    ${mine && !L.entries.length ? `<div class="tl-empty">${future
        ? 'Nothing planned for tomorrow yet. Block out the first thing and the next one picks up where it ended.'
        : 'Nothing logged for this day yet. Add the first block and the next one picks up where it ended.'}</div>` : ''}
    ${renderTimeline(L.entries, { mode: 'log', dateKey: logViewDate, editable: mine, showNow: !future })}
  `;
  logDetailShowing = showingKey;
  if (keptScroll != null) {
    // same day, just re-rendered (a sync echo, a new block, a task added
    // elsewhere) — restore the exact position instead of jumping to 2am
    const sc = wrap.querySelector('.tl-scroll');
    if (sc) sc.scrollTop = keptScroll;
  } else {
    // genuinely opening a different day — anchor on its first activity
    scrollTimelineIntoView(wrap, L.entries);
  }
}

// ── the add / edit activity modal ──
let entryCtx = { mode: 'log', dateKey: null, entryId: null, taskIds: [] };

function openEntryModal(mode, dateKey, entryId, preset) {
  if (mode === 'log' && !myPersonId()) {
    showToast('Set "My Name" in the sidebar first so the log knows whose it is 🪪');
    return;
  }
  const entries = entriesFor(mode, dateKey);
  const existing = entryId ? entries.find(e => e.id === entryId) : null;
  entryCtx = { mode, dateKey, entryId: entryId || null, taskIds: existing ? (existing.taskIds || []).slice() : [] };

  document.getElementById('entry-title').textContent = existing
    ? (mode === 'plan' ? '✏️ Edit planned block' : '✏️ Edit activity')
    : (mode === 'plan' ? '🗓️ Plan an activity' : '🕑 Log an activity');
  document.getElementById('entry-daylabel').textContent =
    keyLabel(dateKey, true) + ' · day runs 2:00 AM → 2:00 AM';

  // activity type options
  const tsel = document.getElementById('entry-type');
  tsel.innerHTML = getActivityTypes().map(at =>
    `<option value="${at.id}">${escHtml(at.label)}</option>`).join('');

  let startMin, endMin;
  if (existing) {
    startMin = existing.startMin; endMin = existing.endMin;
    document.getElementById('entry-label').value = existing.label || '';
    tsel.value = existing.type || getActivityTypes()[0].id;
  } else if (preset) {
    // times came from dragging out a range on the timeline
    startMin = preset.startMin;
    endMin = preset.endMin;
    document.getElementById('entry-label').value = '';
    tsel.value = getActivityTypes()[0].id;
  } else {
    // pick up where the previous block ended
    startMin = entries.length ? Math.max(...entries.map(e => e.endMin)) : defaultStartFor(dateKey);
    if (startMin >= LOG_DAY_END - 5) startMin = LOG_DAY_END - 65;
    endMin = Math.min(startMin + 60, LOG_DAY_END);
    document.getElementById('entry-label').value = '';
    tsel.value = getActivityTypes()[0].id;
  }
  document.getElementById('entry-start').value = minToTimeInput(startMin);
  document.getElementById('entry-end').value = minToTimeInput(endMin);
  document.getElementById('entry-delete').style.display = existing ? 'inline-flex' : 'none';

  renderEntryTasks();
  updateEntryPreview();
  document.getElementById('entry-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('entry-label').focus(), 60);
}

function defaultStartFor(dateKey) {
  if (isFutureDay(dateKey)) return 480;   // planning: start the day at 8am
  if (dateKey === estDateKey()) {
    const n = new Date();
    let cm = n.getHours() * 60 + n.getMinutes();
    cm = Math.floor(cm / 5) * 5;
    if (cm < LOG_DAY_START) cm += 1440;
    return Math.min(cm, LOG_DAY_END - 65);
  }
  return 540;   // 9:00 AM
}

function renderEntryTasks() {
  const wrap = document.getElementById('entry-tasks');
  if (!wrap) return;
  const myId = myPersonId();
  const pool = state.tasks.filter(t => (!myId || t.assigneeId === myId) &&
    (!t.done || entryCtx.taskIds.includes(t.id)));
  if (!pool.length) {
    wrap.innerHTML = `<div style="font-size:12px;font-weight:700;color:var(--ink-light);">No tasks on the board to attach.</div>`;
    return;
  }
  wrap.innerHTML = pool.map(t => {
    const on = entryCtx.taskIds.includes(t.id);
    const meta = typeMeta(t.type || getActivityTypes()[0].id);
    return `<label class="ent-task ${on ? 'on' : ''}">
      <input type="checkbox" ${on ? 'checked' : ''} onchange="toggleEntryTask(${t.id}, this.checked)">
      <span style="width:9px;height:9px;border-radius:2px;background:${meta.color};display:inline-block;"></span>
      <span style="flex:1;">${escHtml(t.text)}</span>
    </label>`;
  }).join('');
}
function toggleEntryTask(id, on) {
  if (on) { if (!entryCtx.taskIds.includes(id)) entryCtx.taskIds.push(id); }
  else entryCtx.taskIds = entryCtx.taskIds.filter(x => x !== id);
  renderEntryTasks();
}

function updateEntryPreview() {
  const out = document.getElementById('entry-dur');
  if (!out) return;
  const s = resolveStartMin(document.getElementById('entry-start').value);
  if (s == null) { out.textContent = '—'; return; }
  const e = resolveEndMin(s, document.getElementById('entry-end').value);
  if (e == null) { out.textContent = '—'; return; }
  const crosses = e > 1440 && s <= 1440;
  out.innerHTML = `${minToLabel(s)} → ${minToLabel(e)} · <b>${formatMinutes(e - s)}</b>` +
    (crosses ? ` <span style="color:var(--sunset-deep);">(runs past midnight into ${escHtml(keyLabel(keyPlusDays(entryCtx.dateKey, 1)))})</span>` : '');
}

function saveEntryFromModal() {
  const label = document.getElementById('entry-label').value.trim();
  const startMin = resolveStartMin(document.getElementById('entry-start').value);
  if (startMin == null) { showToast('Give the block a start time ⏰'); return; }
  const endMin = resolveEndMin(startMin, document.getElementById('entry-end').value);
  if (endMin == null) { showToast('Give the block an end time ⏰'); return; }
  if (endMin <= startMin) { showToast('The end needs to come after the start ⏰'); return; }
  const type = document.getElementById('entry-type').value;

  const { mode, dateKey, entryId } = entryCtx;
  const entries = entriesFor(mode, dateKey);
  if (entryId) {
    const e = entries.find(x => x.id === entryId);
    if (e) Object.assign(e, { startMin, endMin, type, label, taskIds: entryCtx.taskIds.slice() });
  } else {
    entries.push({ id: Date.now() + Math.floor(Math.random() * 1000),
      startMin, endMin, type, label, taskIds: entryCtx.taskIds.slice() });
  }
  if (mode === 'log') markLogEdited(getLog(myPersonId(), dateKey, true));
  persistEntries(mode, dateKey);
  closeModal('entry-modal');
  afterEntryChange(mode);
  showToast(mode === 'plan' ? '🗓️ Planned!' : '🕑 Logged!');
}

function deleteEntryFromModal() {
  const { mode, dateKey, entryId } = entryCtx;
  if (!entryId) return;
  const entries = entriesFor(mode, dateKey);
  const idx = entries.findIndex(e => e.id === entryId);
  if (idx > -1) entries.splice(idx, 1);
  if (mode === 'log') markLogEdited(getLog(myPersonId(), dateKey, true));
  persistEntries(mode, dateKey);
  closeModal('entry-modal');
  afterEntryChange(mode);
}

function afterEntryChange(mode) {
  renderSavedLogs();
  const ls = document.getElementById('nb-log-saved');
  if (ls) { ls.classList.add('show'); clearTimeout(ls._t); ls._t = setTimeout(() => ls.classList.remove('show'), 1200); }
  renderLogPie();
}
