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
    pomoRunning = false;
    pomoRemaining = Math.max(0, Math.round((pomoEndTime - Date.now()) / 1000));
    pomoEndTime = null;
    stopPomoTick();
    btn.textContent = '🎣 Resume';
    document.getElementById('pomodoro').classList.remove('pomo-running');
    toggle.classList.remove('casting');
  } else {
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
function stopPomoTick() { if (pomoInterval) { clearInterval(pomoInterval); pomoInterval = null; } }
function pomoTick() {
  if (!pomoRunning || pomoEndTime == null) return;
  pomoRemaining = Math.max(0, Math.round((pomoEndTime - Date.now()) / 1000));
  if (pomoRemaining <= 0) {
    // time's up.
    const tasks = pomoSessionTasks();
    const hadTasks = tasks.length > 0;
    const allDone = hadTasks && tasks.every(t => t.done);
    if (hadTasks && !allDone) {
      // unfinished tasks → the "all tasks" bonus is off. But a ≥45-min session
      // still earns its completion fish. Under 45 with unfinished tasks → nothing.
      if (pomoMinutes >= POMO_FISH_MIN_MINUTES) {
        finishPomoSession(false);           // completion fish only
      } else {
        stopPomoTick();
        pomoRunning = false;
        pomoEndTime = null;
        pomoRemaining = 0;
        bankPomoTime();   // no fish here, but the minutes focused still count
        document.getElementById('pomo-toggle').classList.remove('casting');
        document.getElementById('pomodoro').classList.remove('pomo-running');
        document.getElementById('pomo-startbtn').textContent = '🎣 Cast';
        showToast("⏳ Time's up — tasks unfinished, no catch this time.");
        renderPomo();
      }
    } else {
      // no tasks, or every task finished exactly at time-up → bonus applies if all done
      finishPomoSession(allDone);
    }
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
  bankPomoTime();   // log the minutes focused BEFORE the timer is reset below
  stopPomoTick();
  pomoRunning = false;
  pomoEndTime = null;
  document.getElementById('pomo-toggle').classList.remove('casting');
  document.getElementById('pomodoro').classList.remove('pomo-running');
  document.getElementById('pomo-startbtn').textContent = '🎣 Cast';

  const earnedCompletion = pomoMinutes >= POMO_FISH_MIN_MINUTES;
  const earnedBonus = !!earlyBonus;

  if (earnedCompletion) catchFish(false);   // full-length focus fish
  if (earnedBonus) catchFish(true);         // all-tasks-done bonus fish

  // messaging
  if (earnedCompletion && earnedBonus) {
    showToast('🏆 Focus done + all tasks finished — 2 fish! 🎣🎣');
  } else if (earnedBonus) {
    showToast('🏆 All tasks done — bonus fish! 🎣');
  } else if (earnedCompletion) {
    // completion toast already shown inside catchFish(false)
  } else {
    showToast('🎣 Focus complete! (Sessions under ' + POMO_FISH_MIN_MINUTES + ' min don\'t catch a fish)');
  }

  // ⚠️ EXPLOIT FIX — clear finished tasks out of the session when a timer ends,
  // so a user can't keep the same "already done" tasks and re-earn the bonus fish
  // every session. To change/remove this behavior, edit the line below.
  pomoTaskIds = pomoTaskIds.filter(id => {
    const t = state.tasks.find(x => x.id === id);
    return t && !t.done;   // keep only tasks that are still NOT done
  });
  renderPomoTodos();

  pomoRemaining = pomoMinutes * 60;
  pomoBankedSecs = 0;        // fresh session from here on
  renderPomo();
}

function catchFish(isBonus) {
  playSound('ding');
  const fish = FISH_SPECIES[Math.floor(Math.random() * FISH_SPECIES.length)];
  const list = myFishList();
  list.push({ emoji: fish.emoji, name: fish.name + (isBonus ? ' (bonus!)' : ''), goal: pomoGoal, minutes: pomoMinutes, at: Date.now(), bonus: !!isBonus });
  saveMyFish(list);

  const pop = document.getElementById('fish-caught');
  document.getElementById('fc-fish-emoji').textContent = fish.emoji;
  document.getElementById('fc-fish-name').textContent = (isBonus ? 'Bonus! ' : 'Caught a ') + fish.name + '!';
  pop.style.display = 'block';
  setTimeout(() => { pop.style.display = 'none'; }, 3000);

  if (!isBonus) showToast(pomoGoal ? `🎣 Reeled in your goal: ${pomoGoal}` : '🎣 Nice catch! Focus complete');

  renderPomo();
  renderLeaderboard();
}
function resetPomo() {
  bankPomoTime();            // credit whatever was focused before the reset
  stopPomoTick();
  pomoRunning = false;
  pomoEndTime = null;
  pomoRemaining = pomoMinutes * 60;
  pomoBankedSecs = 0;
  document.getElementById('pomo-startbtn').textContent = '🎣 Cast';
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
    tank.innerHTML = list.length ? list.map(f => `<span title="${escAttr(f.name + (f.goal ? ' · ' + f.goal : ''))}">${f.emoji}</span>`).join('') : '🌊';
  }
}
// When returning to the tab, immediately re-sync the display.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && pomoRunning) { pomoTick(); }
});
