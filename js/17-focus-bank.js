// ═══════════════════════════════════════════════════════════════
//  WAY OF BOATS — 17-focus-bank.js
//  Lifetime focus minutes + pomodoro panel/tooltip
//
//  Loaded in numbered order by index.html. These are classic scripts,
//  not ES modules, so every function stays global and the inline
//  onclick= handlers in the markup keep working unchanged.
// ═══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════
// FOCUS TIME BANK  (lifetime pomodoro minutes, per person)
// ══════════════════════════════════════════════
// Every session adds the minutes actually focused to the person's running
// total, so 30m + 1m + 120m adds up to 151 → "2 hours and 31 minutes".
// Stored on the person as `pomoMinutes` so it syncs and survives updates.
function addFocusMinutes(mins) {
  mins = Math.round(mins);
  if (!mins || mins <= 0) return;
  const id = myPersonId();
  if (!id) {
    // no name set yet — hold it locally and fold it in once they claim a profile
    const cur = parseInt(localStorage.getItem('boats_focus_mins') || '0', 10) || 0;
    localStorage.setItem('boats_focus_mins', String(cur + mins));
    return;
  }
  const p = personById(id);
  if (!p) return;
  p.pomoMinutes  = (p.pomoMinutes  || 0) + mins;
  p.pomoSessions = (p.pomoSessions || 0) + 1;
  save();
  renderPomo();
}

// If someone focused before setting their name, move that time onto their profile.
function claimLocalFocusMinutes() {
  const id = myPersonId();
  if (!id) return;
  const pending = parseInt(localStorage.getItem('boats_focus_mins') || '0', 10) || 0;
  if (pending <= 0) return;
  const p = personById(id);
  if (!p) return;
  p.pomoMinutes = (p.pomoMinutes || 0) + pending;
  localStorage.removeItem('boats_focus_mins');
  save();
}

function focusMinutesFor(pid) {
  const p = personById(pid);
  if (!p) return 0;
  let mins = p.pomoMinutes || 0;
  if (pid === myPersonId()) {
    mins += parseInt(localStorage.getItem('boats_focus_mins') || '0', 10) || 0;
  }
  return mins;
}

// "2 hours and 31 minutes" — spelled out, for the profile.
function formatDurationLong(mins) {
  mins = Math.max(0, parseInt(mins, 10) || 0);
  const h = Math.floor(mins / 60), m = mins % 60;
  const hPart = h ? `${h} hour${h === 1 ? '' : 's'}` : '';
  const mPart = m ? `${m} minute${m === 1 ? '' : 's'}` : '';
  if (hPart && mPart) return `${hPart} and ${mPart}`;
  return hPart || mPart || '0 minutes';
}

// Seconds of the CURRENT session already added to the total, so a session
// can never be counted twice (e.g. time-up followed by a Reset click).
let pomoBankedSecs = 0;
function bankPomoTime() {
  const elapsed = (pomoMinutes * 60) - pomoRemaining;   // focused so far, this session
  const fresh = elapsed - pomoBankedSecs;
  if (fresh <= 0) return;
  pomoBankedSecs = elapsed;
  addFocusMinutes(fresh / 60);
}

// ── THINGS TO DO RIGHT NOW (pulled from the Task Board) ──
// Helper: my open (not-done) board tasks that aren't already in the session.
function myOpenBoardTasks() {
  const myId = myPersonId();
  return state.tasks.filter(t => !t.done && (!myId || t.assigneeId === myId));
}
// The task objects currently in this session (still resolved live from the board).
function pomoSessionTasks() {
  return pomoTaskIds.map(id => state.tasks.find(t => t.id === id)).filter(Boolean);
}
function addPomoTaskFromBoard() {
  const sel = document.getElementById('pomo-task-picker');
  if (!sel) return;
  const id = parseInt(sel.value, 10);
  if (!id) return;
  if (!pomoTaskIds.includes(id)) pomoTaskIds.push(id);
  sel.value = '';
  renderPomoTodos();
  maybeSuggestTime();
}
function togglePomoTask(id) {
  // toggle the REAL board task so it stays in sync everywhere
  toggleTask(id);
  renderPomoTodos();
  checkPomoAllDone();
}
function removePomoTask(id) {
  // just removes it from this session (doesn't delete the board task)
  pomoTaskIds = pomoTaskIds.filter(x => x !== id);
  renderPomoTodos();
  maybeSuggestTime();
}
let pomoExpanded = {};   // { taskId: true } which session tasks are expanded to show subtasks
function togglePomoExpand(id) { pomoExpanded[id] = !pomoExpanded[id]; renderPomoTodos(); }
function addPomoSubtask(id) {
  addSubtask(id);          // reuse the board's subtask add (adds an empty subtask + focuses)
  pomoExpanded[id] = true;
  renderPomoTodos();
  maybeSuggestTime();
}
// ══════════════════════════════════════════════
// POMODORO: hover tooltip + resizable panel
// ══════════════════════════════════════════════
// The tooltip lives on <body> rather than inside the panel, because the to-do
// list scrolls (overflow:auto) and would clip anything positioned within it.
let pomoTipEl = null;
function showPomoTip(el) {
  const text = el.dataset.full || el.textContent || '';
  if (!text) return;
  if (!pomoTipEl) {
    pomoTipEl = document.createElement('div');
    pomoTipEl.className = 'pomo-tip';
    document.body.appendChild(pomoTipEl);
  }
  pomoTipEl.textContent = text;
  pomoTipEl.style.display = 'block';
  const r = el.getBoundingClientRect();
  const tw = pomoTipEl.offsetWidth, th = pomoTipEl.offsetHeight;
  // Anchor off the PANEL's edge, not the row's — anchoring to the row would let
  // the tip overlap the panel and cover the very text it's revealing.
  const panel = document.getElementById('pomo-panel');
  const pr = panel ? panel.getBoundingClientRect() : r;
  let left = pr.left - tw - 12;
  if (left < 8) left = Math.min(pr.right + 12, window.innerWidth - tw - 8);
  let top = r.top + r.height / 2 - th / 2;
  top = Math.max(8, Math.min(top, window.innerHeight - th - 8));
  pomoTipEl.style.left = Math.max(8, left) + 'px';
  pomoTipEl.style.top = top + 'px';
}
function hidePomoTip() { if (pomoTipEl) pomoTipEl.style.display = 'none'; }

// ══════════════════════════════════════════════
//  THE TAB COUNTDOWN
//  A running timer writes itself into document.title, so the countdown is
//  readable from the tab strip in any browser, desktop or phone — no API
//  support needed, nothing to install.
// ══════════════════════════════════════════════
const BASE_TITLE = document.title;   // captured before we ever touch it

function tabClock(secs) {
  const m = Math.floor(Math.max(0, secs) / 60), s = Math.max(0, secs) % 60;
  return m + ':' + String(s).padStart(2, '0');
}

function updateTabTitle() {
  let title = BASE_TITLE;
  if (pomoRunning && pomoRemaining > 0) {
    title = `${tabClock(pomoRemaining)} · ${pomoGoal ? pomoGoal : 'focusing'}`;
  } else if (pendingCatches().length) {
    // keep nagging from the tab strip until the catch is reeled in
    title = `🎣 something's on the line`;
  } else if (!pomoRunning && pomoRemaining > 0 && pomoRemaining < pomoMinutes * 60) {
    title = `⏸ ${tabClock(pomoRemaining)} · paused`;
  }
  if (document.title !== title) document.title = title;
}

// ── resizable panel ──
const POMO_SIZE_KEY = 'boats_pomo_size';
const POMO_MIN_W = 200, POMO_MIN_H = 260;

// Never let the panel reach the sidebar: measure the sidebar's actual right edge
// so this keeps working when the layout goes responsive.
function pomoMaxWidth() {
  const sb = document.getElementById('sidebar');
  const sbRight = sb ? sb.getBoundingClientRect().right : 0;
  const gap = 20;                 // visible breathing room from the menu
  const rightInset = 22;          // #pomodoro's own right offset
  return Math.max(POMO_MIN_W, window.innerWidth - sbRight - gap - rightInset);
}
function pomoMaxHeight() {
  return Math.max(POMO_MIN_H, window.innerHeight - 150);
}

function loadPomoSize() {
  let sz = null;
  try { sz = JSON.parse(localStorage.getItem(POMO_SIZE_KEY) || 'null'); } catch(e) {}
  if (!sz) return;
  applyPomoSize(sz.w, sz.h);
}
function applyPomoSize(w, h) {
  const panel = document.getElementById('pomo-panel');
  if (!panel) return;
  const cw = Math.round(Math.max(POMO_MIN_W, Math.min(w, pomoMaxWidth())));
  const ch = Math.round(Math.max(POMO_MIN_H, Math.min(h, pomoMaxHeight())));
  panel.style.width = cw + 'px';
  panel.style.height = ch + 'px';
  panel.classList.add('pomo-sized');
  try { localStorage.setItem(POMO_SIZE_KEY, JSON.stringify({ w: cw, h: ch })); } catch(e) {}
}
function resetPomoSize() {
  const panel = document.getElementById('pomo-panel');
  if (!panel) return;
  panel.style.width = ''; panel.style.height = '';
  panel.classList.remove('pomo-sized');
  try { localStorage.removeItem(POMO_SIZE_KEY); } catch(e) {}
  showToast('Timer size reset.');
}

let pomoRs = null;
function pomoResizeDown(e, kind) {
  const panel = document.getElementById('pomo-panel');
  if (!panel) return;
  const r = panel.getBoundingClientRect();
  pomoRs = { kind, x: e.clientX, y: e.clientY, w: r.width, h: r.height };
  document.body.classList.add('pomo-resizing');
  e.preventDefault();
  e.stopPropagation();
}
function pomoResizeMove(e) {
  if (!pomoRs) return;
  // dragging left/up grows the panel, since it's anchored to the bottom-right
  const dw = pomoRs.kind === 'top' ? 0 : (pomoRs.x - e.clientX);
  const dh = pomoRs.kind === 'left' ? 0 : (pomoRs.y - e.clientY);
  applyPomoSize(pomoRs.w + dw, pomoRs.h + dh);
}
function pomoResizeUp() {
  if (!pomoRs) return;
  pomoRs = null;
  document.body.classList.remove('pomo-resizing');
}
document.addEventListener('pointermove', pomoResizeMove);
document.addEventListener('pointerup', pomoResizeUp);
document.addEventListener('pointercancel', pomoResizeUp);
// keep it legal if the window (or sidebar) changes size
window.addEventListener('resize', () => {
  const panel = document.getElementById('pomo-panel');
  if (panel && panel.classList.contains('pomo-sized')) {
    applyPomoSize(panel.getBoundingClientRect().width, panel.getBoundingClientRect().height);
  }
  hidePomoTip();
});

function renderPomoTodos() {
  // refresh the picker of available board tasks
  const picker = document.getElementById('pomo-task-picker');
  if (picker) {
    const avail = myOpenBoardTasks().filter(t => !pomoTaskIds.includes(t.id));
    picker.innerHTML = `<option value="">＋ pull in a task from your board…</option>` +
      avail.map(t => `<option value="${t.id}">${escHtml(t.text || 'untitled')} · ${formatMinutes(taskEffectiveMins(t))}</option>`).join('');
  }
  const box = document.getElementById('pomo-todo-list');
  if (!box) return;
  const tasks = pomoSessionTasks();
  if (tasks.length === 0) {
    box.innerHTML = `<div class="pomo-todo-empty">Pull in tasks from your board below 👇</div>`;
    return;
  }
  box.innerHTML = tasks.map(t => {
    const meta = typeMeta(t.type || getActivityTypes()[0].id);
    const subs = t.subtasks || [];
    const hasSubs = subs.length > 0;
    const expanded = !!pomoExpanded[t.id];
    const subHtml = (hasSubs && expanded) ? `<div class="pomo-sub-list">${subs.map((st, si) => `
      <div class="pomo-sub-row">
        <div class="pomo-todo-check sm ${st.done?'checked':''}" onclick="toggleSubtask(${t.id}, ${si}); renderPomoTodos();">${st.done?'✓':''}</div>
        <span class="pomo-sub-text ${st.done?'done':''}" data-full="${escAttr(st.text || 'subtask')}"
          onmouseenter="showPomoTip(this)" onmouseleave="hidePomoTip()">${escHtml(st.text || 'subtask')}</span>
        <span class="pomo-sub-mins">${formatMinutes(st.mins||0)}</span>
      </div>`).join('')}</div>` : '';
    return `
    <div class="pomo-todo-item-wrap">
      <div class="pomo-todo-item">
        <div class="pomo-todo-check ${t.done?'checked':''}" onclick="togglePomoTask(${t.id})">${t.done?'✓':''}</div>
        <span class="pomo-fish-ico" title="${escAttr(meta.label)}">${fishIcon(meta.color, 14)}</span>
        <span class="pomo-todo-text ${t.done?'done':''}" data-full="${escAttr(t.text || 'untitled')}"
          onmouseenter="showPomoTip(this)" onmouseleave="hidePomoTip()">${escHtml(t.text || 'untitled')}</span>
        <span class="pomo-todo-mins" title="From the board">${formatMinutes(taskEffectiveMins(t))}</span>
        <button class="pomo-todo-caret" onclick="togglePomoExpand(${t.id})" title="Show subtasks">${hasSubs ? (expanded?'▾':'▸') : ''}</button>
        <button class="pomo-todo-del" onclick="removePomoTask(${t.id})" title="Remove from this session">×</button>
      </div>
      ${subHtml}
      ${expanded ? `<button class="pomo-add-sub" onclick="addPomoSubtask(${t.id})">＋ add subtask</button>` : ''}
    </div>`;
  }).join('');
}
// suggest total time from the session's board tasks; user can still override
function pomoTodosTotalMins() {
  return pomoSessionTasks().reduce((s, t) => s + taskEffectiveMins(t), 0);
}
function maybeSuggestTime() {
  const total = pomoTodosTotalMins();
  const sug = document.getElementById('pomo-suggest');
  if (!pomoRunning && total > 0 && !userSetMinutes) {
    pomoMinutes = Math.max(1, Math.min(180, total));
    pomoRemaining = pomoMinutes * 60;
    const minEl = document.getElementById('pomo-minutes');
    if (minEl) minEl.value = pomoMinutes;
    renderPomo();
  }
  if (sug) {
    if (total > 0) {
      sug.innerHTML = `⏱️ These tasks add up to <b>${formatMinutes(total)}</b>. ` +
        (userSetMinutes ? `<a onclick="usePomoSuggested()">use this</a>` : `Suggested & set. <a onclick="clearPomoSuggest()">edit manually</a>`);
    } else {
      sug.innerHTML = '';
    }
  }
}
function usePomoSuggested() {
  userSetMinutes = false;
  maybeSuggestTime();
}
function clearPomoSuggest() {
  userSetMinutes = true;
  maybeSuggestTime();
}
// if every session task is checked off, end early with the bonus fish
function checkPomoAllDone() {
  const tasks = pomoSessionTasks();
  if (pomoRunning && tasks.length > 0 && tasks.every(t => t.done)) {
    finishPomoSession(true);
  }
}

function togglePomo() {
  document.getElementById('pomodoro').classList.toggle('pomo-collapsed');
}
function bumpPomoMinutes(delta) {
  userSetMinutes = true;
  setPomoMinutes(pomoMinutes + delta);
  document.getElementById('pomo-minutes').value = pomoMinutes;
  maybeSuggestTime();
}
function setPomoMinutes(val) {
  let v = Math.max(1, Math.min(180, parseInt(val, 10) || 25));
  pomoMinutes = v;
  localStorage.setItem('boats_pomo_min', String(v));
  if (document.activeElement === document.getElementById('pomo-minutes')) userSetMinutes = true;
  // Changing the dial restarts the clock, so the "already banked" guard has to
  // reset too — otherwise the next session's elapsed time measures short.
  if (!pomoRunning) { pomoRemaining = v * 60; pomoBankedSecs = 0; renderPomo(); }
}
function startPausePomo() {
  const btn = document.getElementById('pomo-startbtn');
  const toggle = document.getElementById('pomo-toggle');
  if (pomoRunning) {
    // pause: freeze remaining from the wall clock
    releaseTimerLock();
    pomoRunning = false;
    setTimeout(updateTabTitle, 0);   // after this handler settles the state
    pomoRemaining = Math.max(0, Math.round((pomoEndTime - Date.now()) / 1000));
    pomoEndTime = null;
    stopPomoTick();
    btn.textContent = '🎣 Resume';
    document.getElementById('pomodoro').classList.remove('pomo-running');
    toggle.classList.remove('casting');
  } else {
    // Only one timer per person at a time. If another tab or device is already
    // running one, ask for it to be closed rather than silently double-counting.
    const other = foreignTimerLock();
    if (other) { showTimerConflict(other); return; }
    claimTimerLock(true);
    pomoGoal = document.getElementById('pomo-goal').value.trim();
    document.getElementById('pomo-goal-display').textContent = pomoGoal ? '🎯 ' + pomoGoal : '';
    pomoRunning = true;
    // anchor the end to a real timestamp so background tabs stay accurate
    pomoEndTime = Date.now() + pomoRemaining * 1000;
    btn.textContent = '⏸ Pause';
    document.getElementById('pomodoro').classList.add('pomo-running');
    toggle.classList.add('casting');
    stopPomoTick();
    pomoInterval = setInterval(pomoTick, 250); // finer tick; real time comes from the clock
  }
}
function showTimerConflict(lock) {
  const m = document.getElementById('timer-conflict');
  if (!m) { showToast('A timer is already running on another device.'); return; }
  const when = lock && lock.at ? new Date(lock.at).toLocaleTimeString() : '';
  const el = document.getElementById('tc-detail');
  if (el) el.textContent = `Last seen ${when}${lock && lock.minutes ? ` · a ${lock.minutes} minute timer` : ''}.`;
  const err = document.getElementById('tc-error');
  if (err) err.style.display = 'none';
  m.style.display = 'flex';
}

// "I closed it" — re-check, and start if the other side really is gone.
function retryAfterTimerConflict() {
  const other = foreignTimerLock();
  const err = document.getElementById('tc-error');
  if (other) {
    if (err) {
      err.style.display = 'block';
      err.textContent = 'Still running over there. Close that tab or stop its timer, then try again.';
    }
    return;
  }
  closeModal('timer-conflict');
  startPausePomo();
}

function stopPomoTick() { if (pomoInterval) { clearInterval(pomoInterval); pomoInterval = null; } }
function pomoTick() {
  if (!pomoRunning || pomoEndTime == null) return;
  beatTimerLock();   // tell other tabs/devices this timer is alive
  pomoRemaining = Math.max(0, Math.round((pomoEndTime - Date.now()) / 1000));
  updateTabTitle();
  if (pomoRemaining <= 0) {
    // time's up.
    const tasks = pomoSessionTasks();
    const hadTasks = tasks.length > 0;
    const allDone = hadTasks && tasks.every(t => t.done);
    // Every completed session earns a roll now — a short one just has long odds.
    // The all-tasks bonus still only applies when every session task is done.
    finishPomoSession(allDone);
    return;
  }
  renderPomo();
}

// Called when a session completes. earlyBonus = finished all tasks before time ran out.
// Fish rules (the two rewards are INDEPENDENT and can stack):
//   • Completion fish: awarded whenever the session was ≥ 45 min.
//   • Bonus fish: awarded whenever ALL session tasks got finished.
//   So finishing all tasks in a ≥45-min session = 2 fish; under 45 min = just the bonus.
const POMO_FISH_MIN_MINUTES = 45;
function finishPomoSession(earlyBonus) {
  // capture the minutes ACTUALLY focused before bankPomoTime resets the clock
  const elapsedMin = Math.max(0, Math.round(((pomoMinutes * 60) - pomoRemaining) / 60));
  bankPomoTime();
  stopPomoTick();
  pomoRunning = false;
  pomoEndTime = null;
  releaseTimerLock();
  document.getElementById('pomo-toggle').classList.remove('casting');
  document.getElementById('pomodoro').classList.remove('pomo-running');
  document.getElementById('pomo-startbtn').textContent = '🎣 Cast';

  // Which drop table applies. A session that ran its full length uses the timer
  // it was set to. One that finished early rolls on the time ACTUALLY spent —
  // no bump, no credit for the timer you set. Finish a 55-minute timer in 47 and
  // you get the 45-50 box, plus the guaranteed bonus fish added below.
  let rollMinutes = pomoMinutes;
  let earlyRoll = false;
  if (earlyBonus && elapsedMin < pomoMinutes) {
    rollMinutes = elapsedMin;
    earlyRoll = true;
  }

  const items = rollGacha(rollMinutes);
  if (earlyBonus) items.push({ ...gachaSmall(), bonus: true });   // all-tasks-done bonus, unchanged

  queueCatch({
    id: Date.now() + Math.floor(Math.random() * 999),
    at: Date.now(),
    minutes: elapsedMin || pomoMinutes,
    tier: gachaTier(rollMinutes),
    tierLabel: GACHA_TIER_LABEL[gachaTier(rollMinutes)],
    earlyRoll,
    goal: pomoGoal,
    items
  });

  // ⚠️ EXPLOIT FIX — clear finished tasks out of the session when a timer ends,
  // so a user can't keep the same "already done" tasks and re-earn the bonus
  // every session. To change/remove this behavior, edit the line below.
  pomoTaskIds = pomoTaskIds.filter(id => {
    const t = state.tasks.find(x => x.id === id);
    return t && !t.done;
  });
  renderPomoTodos();

  pomoRemaining = pomoMinutes * 60;
  pomoBankedSecs = 0;
  renderPomo();
  updateTabTitle();
}

// ═══════════════════════════════════════════════════════════════
//  THE CATCH — a line you pull, not a prize handed over
//  The roll happens when the session ends and is stored, so opening later can
//  never be re-rolled for a better result.
// ═══════════════════════════════════════════════════════════════
const AUTO_OPEN_KEY = 'boats_pomo_autoopen';
function autoOpenCatches() { return localStorage.getItem(AUTO_OPEN_KEY) === '1'; }
function setAutoOpenCatches(on) {
  try { localStorage.setItem(AUTO_OPEN_KEY, on ? '1' : '0'); } catch (e) {}
  showToast(on ? '🎣 Catches will open themselves from now on' : '🎣 Catches will wait on the line for you');
  renderPomo();
}

function pendingCatches() {
  const id = myPersonId();
  if (!id) return [];
  const p = personById(id);
  if (!p) return [];
  if (!Array.isArray(p.pendingCatches)) p.pendingCatches = [];
  return p.pendingCatches;
}

function queueCatch(entry) {
  const id = myPersonId();
  if (!id) {
    showToast('Set your name to a crew member to keep your catch! 🪪');
    return;
  }
  pendingCatches().push(entry);
  save();
  renderPomo();
  if (autoOpenCatches()) {
    setTimeout(() => openCatch(entry.id), 400);
  } else {
    playSound('ding');
    showToast('🎣 Something is on the line — tap it to reel it in');
  }
}

// Reel one in: play the reveal, then bank whatever it holds.
let revealTimer = null;
let revealFailsafe = null;
/**
 * Reel one in.
 *
 * `awardOnly` skips the reveal so a batch can play a single animation at the
 * end instead of cancelling its own timers — see openAllCatches.
 */
function openCatch(catchId, awardOnly) {
  const p = personById(myPersonId());
  if (!p) return null;
  if (!Array.isArray(p.openedCatches)) p.openedCatches = [];

  const list = pendingCatches();
  // ids survive a JSON round trip as numbers or strings depending on where
  // they came from, so compare loosely
  const idx = list.findIndex(c => String(c.id) === String(catchId));
  if (idx < 0) return null;
  if (p.openedCatches.some(x => String(x) === String(catchId))) {
    // already reeled in on another device — drop it rather than pay out twice
    list.splice(idx, 1); save(); renderPomo(); return null;
  }
  const entry = list[idx];
  list.splice(idx, 1);
  p.openedCatches.push(entry.id);
  if (p.openedCatches.length > 300) p.openedCatches = p.openedCatches.slice(-300);

  if (!Array.isArray(p.fish)) p.fish = [];

  const awarded = [];
  if (entry.items.length === 0) {
    // dry roll — a sock, and a step closer to pity
    p.socks = (p.socks || 0) + 1;
    awarded.push({ emoji: '🧦', name: 'Sock', kind: 'sock', sock: true });
    const need = pityThreshold(p);
    if (p.socks >= need) {
      p.socks = 0;
      const pity = { ...PITY_PUFFER, kind: 'special', minutes: 0, at: Date.now(), pity: true };
      p.fish.push(pity);
      awarded.push({ ...pity, pityMessage: true });
    }
  } else {
    entry.items.forEach((it, i) => {
      const caught = { ...it, minutes: i === 0 ? (entry.minutes || 0) : 0, at: Date.now() + i };
      p.fish.push(caught);
      awarded.push(caught);
    });
  }

  save();
  if (!awardOnly) showCatchReveal(entry, awarded);
  renderPomo();
  renderLeaderboard();
  return awarded;
}

/**
 * Reel in everything at once.
 *
 * This used to fire openCatch on a 260ms stagger, and every call begins with
 * clearTimeout(revealTimer) — so each reveal cancelled the one before it and
 * all but the last sat on "Reeling it in…" forever. The fish were awarded; the
 * animation simply never finished, which is what made it look frozen.
 *
 * Now everything is banked first and one reveal plays for the lot.
 */
function openAllCatches() {
  const entries = pendingCatches().slice();
  if (!entries.length) return;
  const all = [];
  entries.forEach(c => { const got = openCatch(c.id, true); if (got) all.push(...got); });
  if (!all.length) { renderPomo(); return; }
  showCatchReveal({ tierLabel: entries.length + ' catches reeled in',
                    minutes: 0, goal: '', earlyRoll: false }, all);
}

function showCatchReveal(entry, awarded) {
  const modal = document.getElementById('catch-modal');
  if (!modal) return;
  const stage = document.getElementById('catch-stage');
  const title = document.getElementById('catch-title');
  const sub = document.getElementById('catch-sub');
  const body = document.getElementById('catch-result');

  title.textContent = '🎣 Reeling it in…';
  sub.textContent = entry.tierLabel + (entry.earlyRoll ? ` (finished early — rolled on the ${entry.minutes} min you actually did)` : '');
  body.innerHTML = '';
  stage.className = 'catch-stage casting';
  modal.style.display = 'flex';

  clearTimeout(revealTimer);
  // Belt and braces: land the animation regardless, so nobody is ever left
  // watching a spinner because something downstream threw.
  clearTimeout(revealFailsafe);
  revealFailsafe = setTimeout(() => {
    const st = document.getElementById('catch-stage');
    if (st && st.classList.contains('casting')) st.className = 'catch-stage landed';
  }, 2600);
  revealTimer = setTimeout(() => {
   try {
    stage.className = 'catch-stage landed';
    const sock = awarded.find(a => a.sock);
    const pity = awarded.find(a => a.pityMessage);
    const real = awarded.filter(a => !a.sock && !a.pityMessage);

    if (pity) {
      title.textContent = 'Pity, granted';
      sub.textContent = 'Jesus, 6+ rolls and nothing? I pity you but keep it up.';
    } else if (sock) {
      const p = personById(myPersonId());
      const left = Math.max(0, pityThreshold(p) - (p.socks || 0));
      title.textContent = 'A sock.';
      sub.textContent = left + ' more dry pull' + (left === 1 ? '' : 's') + ' and the sea owes you one.';
    } else {
      title.textContent = real.length > 1 ? 'A double catch!' : 'Nice catch!';
      sub.textContent = entry.goal ? '🎯 ' + entry.goal : entry.tierLabel;
    }

    body.innerHTML = awarded.filter(a => !a.pityMessage).concat(pity ? [pity] : []).map((a, i) => `
      <div class="catch-item ${a.kind || ''}" style="animation-delay:${i * 130}ms">
        <div class="catch-emoji">${a.emoji}</div>
        <div class="catch-name">${escHtml(a.name)}${a.bonus ? ' (bonus!)' : ''}</div>
        <div class="catch-pts">${a.sock ? 'no points' : '+' + fishValue(a) + ' pts'}</div>
      </div>`).join('');
   } catch (e) {
    stage.className = 'catch-stage landed';
    title.textContent = 'Nice catch!';
    body.innerHTML = `<div class="catch-item"><div class="catch-emoji">🐟</div>
      <div class="catch-name">${awarded.length} item(s) banked</div></div>`;
    console.error('[boats] catch reveal failed', e);
   }
  }, 1100);
}

function closeCatchReveal() {
  clearTimeout(revealTimer);
  clearTimeout(revealFailsafe);
  const m = document.getElementById('catch-modal');
  if (m) m.style.display = 'none';
}

function resetPomo() {
  bankPomoTime();            // credit whatever was focused before the reset
  stopPomoTick();
  pomoRunning = false;
  pomoEndTime = null;
  releaseTimerLock();
  pomoRemaining = pomoMinutes * 60;
  pomoBankedSecs = 0;
  document.getElementById('pomo-startbtn').textContent = '🎣 Cast';
  updateTabTitle();
  document.getElementById('pomodoro').classList.remove('pomo-running');
  document.getElementById('pomo-toggle').classList.remove('casting');
  renderPomo();
}
function renderPomo() {
  // if running, always recompute from the wall clock (keeps background tabs accurate)
  if (pomoRunning && pomoEndTime != null) {
    pomoRemaining = Math.max(0, Math.round((pomoEndTime - Date.now()) / 1000));
  }
  const m = Math.floor(pomoRemaining / 60);
  const s = pomoRemaining % 60;
  const tEl = document.getElementById('pomo-time');
  if (tEl) tEl.textContent = `${m}:${String(s).padStart(2,'0')}`;
  const tank = document.getElementById('pomo-fish-tank');
  if (tank) {
    const list = myFishList();
    const p = myPersonId() ? personById(myPersonId()) : null;
    const socks = (p && p.socks) || 0;
    const sockHtml = socks ? `<span title="${socks} sock${socks===1?'':'s'} — ${Math.max(0, pityThreshold(p) - socks)} more dry pulls to pity">${'🧦'.repeat(Math.min(socks, 8))}</span>` : '';
    tank.innerHTML = (list.length || socks)
      ? list.map(f => `<span title="${escAttr(f.name + (f.goal ? ' · ' + f.goal : ''))}">${f.emoji}</span>`).join('') + sockHtml
      : '🌊';
  }

  // anything waiting on the line
  const lineWrap = document.getElementById('pomo-line');
  if (lineWrap) {
    const pend = pendingCatches();
    if (!pend.length) {
      lineWrap.innerHTML = '';
      lineWrap.style.display = 'none';
    } else {
      lineWrap.style.display = 'block';
      lineWrap.innerHTML = `
        <div class="pl-label">${pend.length} catch${pend.length === 1 ? '' : 'es'} on the line</div>
        <div class="pl-lines">
          ${pend.map(c => `
            <button class="pl-line" onclick="openCatch(${c.id})" title="${escAttr(c.tierLabel + (c.earlyRoll ? ' · rolled on time actually spent' : ''))}">
              <span class="pl-string"></span><span class="pl-hook">🪝</span>
            </button>`).join('')}
        </div>
        ${pend.length > 1 ? `<button class="pl-all" onclick="openAllCatches()">Reel in all</button>` : ''}`;
    }
  }

  const auto = document.getElementById('pomo-autoopen');
  if (auto) auto.checked = autoOpenCatches();

  updateTabTitle();
}
// When returning to the tab, immediately re-sync the display.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && pomoRunning) { pomoTick(); }
});
