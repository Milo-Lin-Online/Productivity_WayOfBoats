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
  // the Fish Bank tab follows the same rule — visible to "bank tank" or admin
  try { if (typeof refreshBankVisibility === 'function') refreshBankVisibility(); } catch (e) {}
  const btn = document.getElementById('nav-admin');
  if (btn) btn.style.display = isAdmin() ? 'flex' : 'none';
  // if we're sitting on the admin page and the name changed, bail out
  if (!isAdmin()) {
    const sec = document.getElementById('section-admin');
    if (sec && sec.classList.contains('active')) showSection('tasks');
  }
}

// ── admin panel ──
// The drop tables, rendered from the SAME constants the roller uses — so this
// card can never drift out of date with the actual odds. Admin section only.
// ══════════════════════════════════════════════
//  ADMIN: EDIT SOMEONE'S STREAKS
//  Set a streak, this month's check-in tally, or the date of the last
//  check-in — per category, per person.
// ══════════════════════════════════════════════
let streakEditPid = null;

function openStreakEditor(pid) {
  if (!isAdmin()) return;
  streakEditPid = pid;
  renderStreakEditor();
  const m = document.getElementById('streak-editor');
  if (m) m.style.display = 'flex';
}

function renderStreakEditor() {
  const box = document.getElementById('sk-list');
  const who = document.getElementById('sk-who');
  if (!box || !isAdmin()) return;
  const p = personById(streakEditPid);
  if (!p) { box.innerHTML = '<div class="nb-empty">No one selected.</div>'; return; }
  if (who) who.textContent = p.name;

  const mk = estMonthKey();
  const today = estDateKey();
  const yesterday = prevDateKey(today);
  if (!p.wc) p.wc = {};

  box.innerHTML = getWcCategories(p.id).map(cat => {
    const rec = p.wc[cat.id] || { streak: 0, last: null, monthCounts: {}, monthFish: {} };
    const last = rec.last || '';
    // reconcileStreaks() will zero anything whose last check-in is older than
    // yesterday, so warn rather than let the admin set a value that evaporates
    const willReset = (rec.streak > 0) && last && last !== today && last !== yesterday;
    return `<div class="sk-row">
      <div class="sk-cat">${escHtml(cat.emoji || '🔥')} <b>${escHtml(cat.label || cat.id)}</b></div>
      <div class="sk-fields">
        <label class="sk-f">streak
          <input type="number" min="0" max="9999" value="${rec.streak || 0}"
            onchange="adminSetStreak('${p.id}','${cat.id}','streak',this.value)"></label>
        <label class="sk-f">check-ins this month
          <input type="number" min="0" max="31" value="${(rec.monthCounts && rec.monthCounts[mk]) || 0}"
            onchange="adminSetStreak('${p.id}','${cat.id}','count',this.value)"></label>
        <label class="sk-f">last check-in
          <input type="date" value="${escAttr(last)}"
            onchange="adminSetStreak('${p.id}','${cat.id}','last',this.value)"></label>
      </div>
      ${willReset ? `<div class="sk-warn">⚠️ Last check-in is older than yesterday, so this streak resets to 0 on next load.
        <button onclick="adminSetStreak('${p.id}','${cat.id}','last','${today}')">set it to today</button></div>` : ''}
    </div>`;
  }).join('');
}

/**
 * Write a streak value. Stamps a new score epoch so the change outranks
 * whatever the person's own devices are holding — otherwise the merge would
 * take the higher streak back and an admin correction downward wouldn't stick.
 */
function adminSetStreak(pid, catId, field, value) {
  if (!isAdmin()) return;
  const p = personById(pid);
  if (!p) return;
  if (!p.wc) p.wc = {};
  const rec = p.wc[catId] || { streak: 0, last: null, monthCounts: {}, monthFish: {} };
  if (!rec.monthCounts) rec.monthCounts = {};
  if (!rec.monthFish) rec.monthFish = {};

  if (field === 'streak') {
    rec.streak = clampInt(value, 0, 9999);
    // A streak is only shown if its last check-in was today or yesterday, so
    // setting a number against a stale date would silently display as zero.
    // Anchor it to today whenever the existing date can't carry it.
    const today = estDateKey(), yesterday = prevDateKey(today);
    if (rec.streak > 0 && rec.last !== today && rec.last !== yesterday) {
      rec.last = today;
      showToast(`Anchored to today so ${rec.streak}🔥 actually shows`);
    }
  } else if (field === 'count') {
    rec.monthCounts[estMonthKey()] = clampInt(value, 0, 31);
  } else if (field === 'last') {
    rec.last = value || null;
    if (!rec.last) rec.streak = 0;
  }
  p.wc[catId] = rec;

  bumpScoreEpoch([p]);
  save();
  renderStreakEditor();
  renderLeaderboard();
  try { renderWorldCup(); } catch (e) {}
  renderAdmin();
}

/** Admin: the vault float, the bid range, the exchange rate, and shop prices. */
function renderAdminBank() {
  const box = document.getElementById('admin-bank');
  if (!box || !isAdmin() || typeof bankConfig !== 'function') return;
  const cfg = bankConfig();
  const shelf = (typeof getStoreItems === 'function') ? getStoreItems() : [];
  box.innerHTML = `
    <div class="bank-admin-row">
      <label title="What the vault started with. Change it and the balance shifts by the difference.">
        opening float <input type="number" min="0" value="${cfg.openingFish}"
          onchange="setBankConfig('openingFish', parseInt(this.value,10)||0)"></label>
      <label title="The banker never offers less than this">lowest bid
        <input type="number" min="1" value="${cfg.minBid}"
          onchange="setBankConfig('minBid', parseInt(this.value,10)||1)"></label>
      <label title="…nor more than this">highest bid
        <input type="number" min="1" value="${cfg.maxBid}"
          onchange="setBankConfig('maxBid', parseInt(this.value,10)||1)"></label>
      <label title="How many starfish buy one whole fish">⭐ per 🐟
        <input type="number" min="1" value="${cfg.starfishPerFish}"
          onchange="setBankConfig('starfishPerFish', parseInt(this.value,10)||1)"></label>
    </div>
    <div class="bank-vault-now">Vault right now: <b>${bankBalance()} 🐟</b></div>
    <div class="bank-admin-row">
      <button class="btn-secondary" onclick="adminBankAdjust(10)" title="Put fish into the vault">+10 🐟</button>
      <button class="btn-secondary" onclick="adminBankAdjust(-10)" title="Take fish out of the vault">−10 🐟</button>
    </div>
    <div class="bank-vault-now">Shop prices</div>
    <div class="bank-admin-prices">
      ${shelf.map(it => `<label title="What ${escAttr(it.name)} costs in fish">
        <span>${it.emoji || '🎁'} ${escHtml(it.name)}</span>
        <input type="number" min="0" value="${it.cost}"
          onchange="adminSetPrice('${escAttr(it.id)}', this.value)"></label>`).join('')
        || '<div class="nb-empty">Nothing on the shelf.</div>'}
    </div>`;
}

/** Move money in or out of the vault — recorded in the ledger, never rewritten. */
function adminBankAdjust(n) {
  if (!isAdmin()) return;
  bankPost('admin', n, 0, '', `admin ${n >= 0 ? 'added' : 'removed'} ${Math.abs(n)} fish`);
  renderAdminBank();
  try { renderBank(); } catch (e) {}
  showToast(`🏦 Vault ${n >= 0 ? '+' : ''}${n} 🐟 — now ${bankBalance()}`);
}

/** Set what something costs. Overrides live on the synced store item. */
function adminSetPrice(itemId, value) {
  if (!isAdmin()) return;
  const cost = Math.max(0, parseInt(value, 10) || 0);
  if (!Array.isArray(state.storeItems)) state.storeItems = [];
  const it = state.storeItems.find(x => String(x.id) === String(itemId));
  if (it) it.cost = cost;
  else {
    // a built-in item being repriced for the first time — keep an override row
    const base = (typeof catalogItem === 'function') ? catalogItem(itemId) : null;
    state.storeItems.push(Object.assign({}, base || { id: itemId }, { id: itemId, cost }));
  }
  save();
  renderAdminBank();
  try { renderMarket(); } catch (e) {}
  showToast(`💰 Price set to ${cost} 🐟`);
}

/** Admin: when live cursors are allowed to cost anything. */
function renderAdminCursors() {
  const box = document.getElementById('admin-cursors');
  if (!box || !isAdmin() || typeof cursorPolicy !== 'function') return;
  const pol = cursorPolicy();
  box.innerHTML = `
    <div class="bank-admin-row">
      <label title="Above this many connected clients, nobody sends a cursor — so nobody receives one either">
        silent above <input type="number" min="0" max="50" value="${pol.maxOnline}"
          onchange="setCursorMax(this.value)"> online</label>
    </div>
    <div style="font-size:11px;font-weight:800;color:var(--ocean-deep);margin:10px 0 5px">
      Days cursors are switched off entirely</div>
    <div class="cursor-days">
      ${DAY_NAMES.map((d, i) => `
        <label class="cd-day ${pol.offDays.includes(i) ? 'off' : ''}"
          title="${pol.offDays.includes(i) ? d + ': cursors off — no messages at all' : d + ': cursors allowed'}">
          <input type="checkbox" ${pol.offDays.includes(i) ? 'checked' : ''}
            onchange="toggleCursorDay(${i})"><span>${d}</span></label>`).join('')}
    </div>
    <div style="font-size:11.5px;font-weight:700;color:var(--ink-light);margin-top:8px;line-height:1.5">
      Ticked = off. On an off day nobody broadcasts and nobody renders, so the
      whole group costs nothing.<br>
      Right now: <b>${cursorStatusText()}</b>
    </div>`;
}
function setCursorMax(v) {
  if (!isAdmin()) return;
  if (!state.cursorPolicy) state.cursorPolicy = {};
  state.cursorPolicy.maxOnline = Math.max(0, parseInt(v, 10) || 0);
  saveNow();
  renderAdminCursors();
}
function toggleCursorDay(i) {
  if (!isAdmin()) return;
  if (!state.cursorPolicy) state.cursorPolicy = {};
  const cur = cursorPolicy().offDays.slice();
  const at = cur.indexOf(i);
  if (at > -1) cur.splice(at, 1); else cur.push(i);
  state.cursorPolicy.offDays = cur.sort();
  saveNow();
  renderAdminCursors();
  showToast(`👀 Cursors ${cur.includes(i) ? 'off' : 'on'} for ${DAY_NAMES[i]}s`);
}

function renderAdminGachaRules() {
  const box = document.getElementById('admin-gacha-rules');
  if (!box || !isAdmin()) return;
  const rows = [
    ['0 - 20 min',   '—',              `<b>${(PUFFER_ODDS*100).toFixed(2)}%</b> ${POLITE_PUFFER.emoji} ${POLITE_PUFFER.name}`, 'Sock'],
    ['21 - 44 min',  '—',              '<b>10%</b> one small', 'Sock'],
    ['45 - 50 min',  '—',              '<b>85%</b> one small', 'Sock'],
    ['51 - 95 min',  'one small fish', '<b>30%</b> → coin-flip: big or another small', '—'],
    ['96+ min',      'one small fish', '<b>65%</b> one big fish', '—'],
  ];
  box.innerHTML = `
    <table class="gacha-tbl">
      <tr><th>Timer</th><th>Guaranteed</th><th>Chance roll</th><th>Dry</th></tr>
      ${rows.map(r => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('')}
    </table>
    <div class="gacha-note">
      <b>Small (2 pts):</b> ${GACHA_SMALL.map(f => f.emoji + ' ' + escHtml(f.name)).join(' · ')}<br>
      <b>Big (3 pts):</b> ${GACHA_BIG.map(f => f.emoji + ' ' + escHtml(f.name)).join(' · ')}
      · <b>${LUCKY_LOBSTER.emoji} ${LUCKY_LOBSTER.name}</b> takes ${(LUCKY_LOBSTER_SHARE*100)|0}% of big pulls<br>
      <b>Specials (2 pts):</b> ${POLITE_PUFFER.emoji} ${POLITE_PUFFER.name} (rolled) ·
      ${PITY_PUFFER.emoji} ${PITY_PUFFER.name} (pity only)<br>
      <b>Sock:</b> 0 pts, cosmetic, not spendable in the shop.
    </div>
    <div class="gacha-note">
      <b>Pity:</b> threshold = ${PITY_BASE} + ${PITY_PER_LOBSTER} × (Lucky Lobsters owned).
      On reaching it the player gets a ${PITY_PUFFER.name} and their socks reset to zero.<br>
      <b>Early finish:</b> the roll uses the minutes actually spent, bumped one tier up.<br>
      <b>Sticker Queen:</b> ${STICKER_QUEEN_MIN}+ stickers owned → badge and +${STICKER_QUEEN_BONUS} points.
    </div>`;
}

// Frozen standings are a record, but records can be wrong — let the admin
// correct who was actually ahead for any given meeting.
function renderAdminWinners() {
  const box = document.getElementById('admin-winners');
  const sel = document.getElementById('admin-winner-meeting');
  if (!box || !sel || !isAdmin()) return;
  const ms = state.meetings || [];
  sel.innerHTML = ms.length
    ? ms.map(m => `<option value="${m.id}">${escHtml(m.title || 'Untitled')} · ${escHtml(m.date || '')}</option>`).join('')
    : `<option value="">No meetings yet</option>`;
  const m = ms.find(x => String(x.id) === String(sel.value)) || ms[0];
  if (!m) { box.innerHTML = '<div class="nb-empty">No meetings to edit.</div>'; return; }
  sel.value = m.id;
  if (!m.standings) m.standings = {};
  const rows = visiblePeople().map(p => {
    const st = m.standings[p.id] || {};
    return `<div class="win-row">
      <span class="admin-dot" style="background:${p.color || 'var(--ocean)'}"></span>
      <b>${escHtml(p.name)}</b>
      <label>rank <input type="number" min="1" max="99" value="${st.rank || ''}"
        onchange="adminSetStanding(${m.id}, '${p.id}', 'rank', this.value)"></label>
      <label>pts <input type="number" value="${st.pts != null ? st.pts : ''}"
        onchange="adminSetStanding(${m.id}, '${p.id}', 'pts', this.value)"></label>
    </div>`;
  }).join('');
  box.innerHTML = rows + `<div style="margin-top:8px"><button class="btn-secondary" onclick="adminResnapshot(${m.id})" style="font-size:12px">↻ Recalculate from today's scores</button></div>`;
}
function adminSetStanding(mid, pid, field, value) {
  if (!isAdmin()) return;
  const m = state.meetings.find(x => String(x.id) === String(mid));
  if (!m) return;
  if (!m.standings) m.standings = {};
  if (!m.standings[pid]) m.standings[pid] = {};
  const n = parseInt(value, 10);
  if (isNaN(n)) delete m.standings[pid][field];
  else m.standings[pid][field] = n;
  save();
  renderMeetings();
}
function adminResnapshot(mid) {
  if (!isAdmin()) return;
  const m = state.meetings.find(x => String(x.id) === String(mid));
  if (!m) return;
  askConfirm(`Overwrite "${m.title}" standings with today's scores?`, () => {
    m.standings = snapshotStandings();
    save(); renderAdminWinners(); renderMeetings();
  }, 'Recalculate');
}

function renderAdmin() {
  if (!isAdmin()) return;
  renderAdminMeetings();
  renderAdminPlayers();
  renderAdminStore();
  renderAdminGachaRules();
  renderAdminWinners();
  try { renderAdminBank(); } catch (e) {}
  try { renderAdminCursors(); } catch (e) {}
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
        <button class="btn-secondary" onclick="openStreakEditor('${p.id}')">🔥 edit streaks</button>
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
  return wcTotalStreak(pid);
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
  const mn = document.getElementById('batch-mins').value;      // time estimate
  const du = document.getElementById('batch-due').value;       // due date

  // A task with subtasks takes its time from the sum of them, so setting the
  // parent's estimate would be ignored — say so instead of failing quietly.
  let skippedForSubtasks = 0;
  const changes = [];
  if (pr) changes.push('priority');
  if (ty) changes.push('activity');
  if (pe) changes.push('assignee');
  if (mn) changes.push('time');
  if (du) changes.push('due date');
  if (!changes.length) { showToast('Pick something to set first'); return; }

  state.tasks.forEach(t => {
    if (!batchSelected.has(t.id)) return;
    if (pr) t.priority = pr;
    if (ty) t.type = ty;
    if (pe) t.assigneeId = pe;
    if (du) t.due = du === 'clear' ? '' : du;
    if (mn) {
      if ((t.subtasks || []).length) skippedForSubtasks++;
      else t.mins = parseInt(mn, 10) || 0;
    }
  });
  save();
  renderTasks();
  renderLeaderboard();
  try { renderCalendar(); } catch (e) {}
  showToast(`Set ${changes.join(', ')} on ${batchSelected.size} task(s) ✏️` +
    (skippedForSubtasks ? ` · ${skippedForSubtasks} kept their subtask total` : ''));
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
