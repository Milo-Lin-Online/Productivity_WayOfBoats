// ═══════════════════════════════════════════════════════════════
//  WAY OF BOATS — 10-charts.js
//  Time-by-activity pie and its recommendations
//
//  Loaded in numbered order by index.html. These are classic scripts,
//  not ES modules, so every function stays global and the inline
//  onclick= handlers in the markup keep working unchanged.
// ═══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════
// PIE CHART — time by activity, with recommendations
// ══════════════════════════════════════════════
function renderPie() {
  const psel = document.getElementById('pie-person');
  if (!psel) return;
  // populate person selector
  const cur = psel.value;
  psel.innerHTML = `<option value="">Everyone</option>` +
    visiblePeople().map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('');
  if (cur) psel.value = cur;
  const who = psel.value;

  // gather minutes per activity type (open tasks — planned time)
  let tasks = state.tasks.filter(t => !t.done);
  if (who) tasks = tasks.filter(t => t.assigneeId === who);

  const byType = {};
  getActivityTypes().forEach(at => byType[at.id] = 0);
  tasks.forEach(t => {
    const id = t.type || getActivityTypes()[0].id;
    byType[id] = (byType[id] || 0) + taskEffectiveMins(t);
  });

  const holder = document.getElementById('pie-svg-holder');
  const legend = document.getElementById('pie-legend');
  const recs = document.getElementById('pie-recs');

  const entries = Object.entries(byType).filter(([id, m]) => m > 0);
  const total = entries.reduce((s, [,m]) => s + m, 0);

  if (total === 0) {
    holder.innerHTML = `<div style="width:200px;height:200px;border-radius:50%;background:var(--ocean-pale);display:flex;align-items:center;justify-content:center;font-size:40px;">🥧</div>`;
    legend.innerHTML = `<div style="font-size:13px;font-weight:600;color:var(--ink-light);">No open tasks with time estimates yet. Add some tasks to see the breakdown!</div>`;
    recs.innerHTML = '';
    return;
  }

  // build pie slices — each slice uses the activity type's own color
  const cx = 100, cy = 100, r = 92;
  let angle = -Math.PI / 2;
  let paths = '';
  const legendRows = [];
  entries.forEach(([id, mins], i) => {
    const frac = mins / total;
    const a2 = angle + frac * Math.PI * 2;
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
    const large = frac > 0.5 ? 1 : 0;
    const meta = typeMeta(id);
    const col = meta.color || '#3B9BD4';
    if (frac >= 0.999) {
      paths += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${col}"/>`;
    } else {
      paths += `<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${col}" stroke="white" stroke-width="2"/>`;
    }
    const pct = Math.round(frac * 100);
    legendRows.push(`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
      ${fishIcon(col, 20)}
      <span style="font-size:13px;font-weight:700;flex:1;">${escHtml(meta.label)}</span>
      <span style="font-size:12px;font-weight:800;color:var(--ink-light);">${formatMinutes(mins)} · ${pct}%</span>
    </div>`);
    angle = a2;
  });

  holder.innerHTML = `<svg width="200" height="200" viewBox="0 0 200 200">${paths}</svg>`;
  legend.innerHTML = legendRows.join('');

  // ── RECOMMENDATIONS ──
  // 1) "ignored" = the activity type with the LEAST estimated time logged (but not zero-excluded: pick smallest among all types)
  const allTypes = getActivityTypes();
  let leastType = null, leastMin = Infinity;
  allTypes.forEach(at => {
    const m = byType[at.id] || 0;
    if (m < leastMin) { leastMin = m; leastType = at; }
  });
  // 2) "quick win" = an open task marked ≤30 min, soonest to knock out
  let quickPool = state.tasks.filter(t => !t.done && taskEffectiveMins(t) <= 30);
  if (who) quickPool = quickPool.filter(t => t.assigneeId === who);
  quickPool.sort((a,b) => (a.mins||30) - (b.mins||30));
  const quick = quickPool[0];

  let html = '';
  if (leastType) {
    html += `<div style="background:var(--ocean-pale);border-radius:12px;padding:12px 14px;margin-bottom:10px;">
      <div style="font-size:12px;font-weight:800;color:var(--ocean-deep);margin-bottom:2px;">🧭 You might be ignoring…</div>
      <div style="font-size:14px;font-weight:700;display:flex;align-items:center;gap:6px;">${fishIcon(leastType.color||'#3B9BD4',18)} ${escHtml(leastType.label)} — only ${formatMinutes(leastMin)} of planned time. Maybe give it some attention?</div>
    </div>`;
  }
  if (quick) {
    const qp = personById(quick.assigneeId);
    html += `<div style="background:#FFF2E8;border-radius:12px;padding:12px 14px;border:2px solid var(--sunset-light);">
      <div style="font-size:12px;font-weight:800;color:var(--sunset-deep);margin-bottom:2px;">⚡ Quick win — do it right now!</div>
      <div style="font-size:14px;font-weight:700;">"${escHtml(quick.text)}" · ~${formatMinutes(quick.mins||30)}${qp ? ' · ' + escHtml(qp.name) : ''}</div>
    </div>`;
  } else {
    html += `<div style="font-size:12px;font-weight:600;color:var(--ink-light);">No tasks marked ≤30 min. Mark a small task's time estimate to get a "quick win" suggestion!</div>`;
  }
  recs.innerHTML = html;
}



function openPeopleConfig() {
  const list = document.getElementById('people-config-list');
  if (state.people.length === 0) {
    list.innerHTML = `<div style="text-align:center; padding:16px; color:var(--ink-light); font-weight:600; font-size:13px;">No crew yet — add your first sailor below! ⛵</div>`;
  } else {
    list.innerHTML = (isAdmin() ? state.people : visiblePeople()).map((p, i) => `
      <div class="people-config-row" data-pid="${p.id}" style="flex-direction:column; align-items:stretch; gap:8px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="flex:1; display:flex; flex-direction:column; gap:2px;">
            <input class="form-input pc-name" value="${escAttr(p.name)}" placeholder="Name" maxlength="${CONFIG.nameCharLimit}"
              oninput="livePersonName('${p.id}', this.value); updateNameCounter(this)">
            <span class="name-counter" style="font-size:10px; font-weight:700; color:var(--ink-light); align-self:flex-end;">${(p.name||'').length}/${CONFIG.nameCharLimit}</span>
          </div>
          <label class="boat-color-picker" title="Click the sail to change color">
            <span class="boat-swatch">${sailBoat(p.color)}</span>
            <input type="color" class="boat-color-input" value="${p.color}"
              oninput="setPersonColor('${p.id}', this.value)">
          </label>
          <input class="form-input hex-input" value="${escAttr(p.color)}" maxlength="7" title="Type a hex code"
            oninput="setPersonColorHex('${p.id}', this.value)" style="width:78px; font-size:12px;">
          <button class="task-delete" onclick="removePerson('${p.id}')">×</button>
        </div>
        <div>
          <span style="font-size:10px; font-weight:800; color:var(--ocean-deep); text-transform:uppercase; letter-spacing:0.04em;">Their note template</span>
          <textarea class="form-input pc-template" placeholder="Text that auto-fills ${escAttr(p.name)}'s box in every new meeting (e.g. headers to guide what goes where)…"
            style="width:100%; min-height:52px; font-size:12px; resize:vertical; margin-top:3px;"
            oninput="setPersonTemplate('${p.id}', this.value)">${escHtml((state.personTemplates && state.personTemplates[p.id]) || '')}</textarea>
        </div>
      </div>`).join('');
  }
  document.getElementById('people-modal').style.display = 'flex';
}

function updateNameCounter(input) {
  const counter = input.parentElement.querySelector('.name-counter');
  if (counter) counter.textContent = `${input.value.length}/${CONFIG.nameCharLimit}`;
}

function livePersonName(pid, value) {
  const p = state.people.find(x => x.id === pid);
  if (p) p.name = value;
}
function setPersonTemplate(pid, value) {
  if (!state.personTemplates) state.personTemplates = {};
  state.personTemplates[pid] = value;
  save();
}

function setPersonColor(pid, hex) {
  const p = state.people.find(x => x.id === pid);
  if (!p) return;
  p.color = hex;
  const row = document.querySelector(`.people-config-row[data-pid="${pid}"]`);
  if (row) {
    const hx = row.querySelector('.hex-input'); if (hx) hx.value = hex;
    const sw = row.querySelector('.boat-swatch'); if (sw) sw.innerHTML = sailBoat(hex);
  }
}
function setPersonColorHex(pid, val) {
  let hex = val.trim();
  if (!hex.startsWith('#')) hex = '#' + hex;
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return; // wait until it's a valid 6-digit hex
  const p = state.people.find(x => x.id === pid);
  if (!p) return;
  p.color = hex;
  const row = document.querySelector(`.people-config-row[data-pid="${pid}"]`);
  if (row) {
    const ci = row.querySelector('.boat-color-input'); if (ci) ci.value = hex;
    const sw = row.querySelector('.boat-swatch'); if (sw) sw.innerHTML = sailBoat(hex);
  }
}

// kept for backward compat (unused now)
function cyclePeopleColor(pid, dot) {
  const p = state.people.find(x => x.id === pid);
  if (!p) return;
  const current = PALETTE.indexOf(p.color);
  p.color = PALETTE[(current + 1) % PALETTE.length];
  dot.style.background = p.color;
}

function addPersonConfig() {
  // commit any in-progress typing first
  commitPeopleInputs();
  state.people.push({ id: 'p' + Date.now() + Math.floor(Math.random()*999), name: '', color: PALETTE[state.people.length % PALETTE.length] });
  openPeopleConfig();
  // focus the newly added name input
  setTimeout(() => {
    const inputs = document.querySelectorAll('.pc-name');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }, 30);
}

function removePerson(pid) {
  state.people = state.people.filter(p => p.id !== pid);
  // also clean up their tasks
  state.tasks = state.tasks.filter(t => t.assigneeId !== pid);
  openPeopleConfig();
}

function commitPeopleInputs() {
  document.querySelectorAll('.people-config-row').forEach(row => {
    const pid = row.getAttribute('data-pid');
    const inp = row.querySelector('.pc-name');
    const p = state.people.find(x => x.id === pid);
    if (p && inp) p.name = inp.value.trim();
  });
}

function savePeople() {
  commitPeopleInputs();
  // drop any blank-named people
  state.people = state.people.filter(p => p.name.trim().length > 0);
  save();
  closeModal('people-modal');
  renderAll();
  showToast('Crew saved! ⚓');
}
