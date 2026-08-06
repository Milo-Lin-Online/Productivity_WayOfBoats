// ═══════════════════════════════════════════════════════════════
//  WAY OF BOATS — 18-calendar.js
//  Content calendar, posts and reminders
//
//  Loaded in numbered order by index.html. These are classic scripts,
//  not ES modules, so every function stays global and the inline
//  onclick= handlers in the markup keep working unchanged.
// ═══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════
// CONTENT CALENDAR (social media posts, month/week view)
// ══════════════════════════════════════════════
const POST_COLORS = ['#FF7A3C','#3B9BD4','#7AAF72','#C9B8E8','#E8536A','#F4A460','#1E5E63','#E8A8D8'];
const PLATFORM_EMOJI = { 'Instagram':'📸','LinkedIn':'💼','TikTok':'🎵','X / Twitter':'🐦','YouTube':'▶️','Facebook':'👍','Threads':'🧵','Blog':'✍️','Other':'🌐' };
let calCursor = new Date();          // the month/week currently shown
let editingPostId = null;
let pickedPostColor = POST_COLORS[0];

// local YYYY-MM-DD (avoids UTC off-by-one from toISOString)
function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function parseYmd(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function startOfWeek(d) { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); x.setHours(0,0,0,0); return x; } // Sunday start
function sameYmd(a, b) { return ymd(a) === ymd(b); }
function daysBetween(a, b) { // whole days from a→b (date-only)
  const A = new Date(a.getFullYear(),a.getMonth(),a.getDate());
  const B = new Date(b.getFullYear(),b.getMonth(),b.getDate());
  return Math.round((B - A) / 86400000);
}

function setCalView(v) {
  state.calView = v;
  document.getElementById('cal-view-month').classList.toggle('active', v==='month');
  document.getElementById('cal-view-week').classList.toggle('active', v==='week');
  renderCalendar();
}
function calShift(dir) {
  if (state.calView === 'week') calCursor = addDays(calCursor, dir*7);
  else calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth()+dir, 1);
  renderCalendar();
}
function calToday() { calCursor = new Date(); renderCalendar(); }

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  if (!grid) return;
  const label = document.getElementById('cal-period-label');
  const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let days = [];

  if (state.calView === 'week') {
    const start = startOfWeek(calCursor);
    for (let i=0;i<7;i++) days.push(addDays(start,i));
    if (label) {
      const end = addDays(start,6);
      label.textContent = start.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' – ' + end.toLocaleDateString('en-US',{month:'short',day:'numeric'});
    }
  } else {
    const first = new Date(calCursor.getFullYear(), calCursor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    for (let i=0;i<42;i++) days.push(addDays(gridStart,i)); // 6 weeks
    if (label) label.textContent = calCursor.toLocaleDateString('en-US',{month:'long',year:'numeric'});
  }

  const today = new Date();
  const curMonth = calCursor.getMonth();
  const headRow = `<div class="cal-weekdays">${weekdays.map(w=>`<div class="cal-weekday">${w}</div>`).join('')}</div>`;
  const gridClass = state.calView === 'week' ? 'cal-week-grid' : 'cal-month-grid';

  const cells = days.map(d => {
    const isToday = sameYmd(d, today);
    const other = state.calView === 'month' && d.getMonth() !== curMonth;
    const posts = postsForDay(d);
    const postHtml = posts.map(seg => {
      const spanClass = seg.spanStart && seg.spanEnd ? '' : (seg.spanStart ? 'span-start' : (seg.spanEnd ? 'span-end' : 'span-mid'));
      const emoji = PLATFORM_EMOJI[seg.post.platform] || '🌐';
      const showText = seg.spanStart || d.getDay() === 0; // show label at start or week wrap
      return `<div class="cal-post ${spanClass}" style="background:${seg.post.color||POST_COLORS[0]}" onclick="openPostModal('${seg.post.id}')" title="${escAttr(seg.post.title)} · ${escAttr(seg.post.platform)}">
        ${showText ? `${emoji} ${escHtml(seg.post.title || 'Untitled')}${seg.isPublishDay?' <span class=\"cp-pub\">🚀</span>':''}` : (seg.isPublishDay?'🚀':'&nbsp;')}
      </div>`;
    }).join('');
    // tasks of mine due on this day, tinted by their activity category
    const todayKey = estDateKey();
    const dueHtml = tasksDueOnDay(d).map(t => {
      const meta = typeMeta(t.type || getActivityTypes()[0].id);
      const overdue = !t.done && ymd(d) < todayKey;
      const mark = t.done ? '✓' : (overdue ? '❗' : '⏰');
      return `<div class="cal-due ${t.done?'is-done':''} ${overdue?'is-over':''}"
        style="background:${meta.color}"
        onclick="goToTaskFromCalendar(${t.id})"
        title="Due ${escAttr(t.due)} · ${escAttr(meta.label)}${t.done?' · done':(overdue?' · overdue':'')} — click to open on the board">
        <span class="cd-mark">${mark}</span>${escHtml(t.text)}
      </div>`;
    }).join('');
    return `<div class="cal-cell ${other?'other-month':''} ${isToday?'today':''}" ondblclick="quickAddPost('${ymd(d)}')">
      <span class="cal-cell-date">${d.getDate()}</span>
      ${postHtml}
      ${dueHtml}
    </div>`;
  }).join('');

  grid.innerHTML = headRow + `<div class="${gridClass}">${cells}</div>`;

  // legend so the due-date colors are readable without hovering
  const legend = document.getElementById('cal-due-legend');
  if (legend) {
    legend.innerHTML = getActivityTypes().map(at => `
      <span style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:800;color:var(--ink-light);">
        <span style="width:11px;height:11px;border-radius:3px;background:${at.color};display:inline-block;"></span>${escHtml(at.label)}
      </span>`).join('');
  }
}

// For a given day, return the posts that overlap it (start..publish inclusive) as segments.
function postsForDay(d) {
  const key = ymd(d);
  const segs = [];
  (state.posts || []).forEach(post => {
    const startK = post.start || post.publish;
    const pubK = post.publish || post.start;
    if (!startK || !pubK) return;
    if (key >= startK && key <= pubK) {
      segs.push({
        post,
        spanStart: key === startK,
        spanEnd: key === pubK,
        isPublishDay: key === pubK
      });
    }
  });
  return segs;
}

// ── DUE DATES ON THE CALENDAR ──
// Your own tasks that are due on a given day. Coloured by activity category so
// the month reads at a glance: all the blue days are one kind of work, etc.
// Falls back to showing everyone's tasks only when you haven't set your name yet.
function tasksDueOnDay(d) {
  const key = ymd(d);
  const myId = myPersonId();
  return (state.tasks || []).filter(t => {
    if (!t.due || t.due !== key) return false;
    return myId ? t.assigneeId === myId : true;
  });
}

// Jump from a calendar chip to that task on the board.
function goToTaskFromCalendar(id) {
  showSection('tasks');
  document.getElementById('nav-tasks').classList.add('active');
  setTimeout(() => {
    const el = document.getElementById('task-item-' + id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.transition = 'box-shadow 0.3s';
    el.style.boxShadow = '0 0 0 3px var(--sunset)';
    setTimeout(() => { el.style.boxShadow = ''; }, 1600);
  }, 60);
}

function quickAddPost(dayKey) { openPostModal(null, dayKey); }

function openPostModal(id, presetDay) {
  editingPostId = id;
  let post;
  if (id) {
    post = state.posts.find(p => p.id === id);
    if (!post) return;
    document.getElementById('post-modal-title').textContent = '📱 Edit Post';
  } else {
    const day = presetDay || ymd(new Date());
    post = { id: null, title: '', platform: 'Instagram', start: day, publish: day, color: POST_COLORS[Math.floor(Math.random()*POST_COLORS.length)], taskId: null };
    document.getElementById('post-modal-title').textContent = '📱 New Post';
  }
  document.getElementById('post-title').value = post.title || '';
  document.getElementById('post-platform').value = post.platform || 'Instagram';
  document.getElementById('post-start').value = post.start || '';
  document.getElementById('post-publish').value = post.publish || '';
  pickedPostColor = post.color || POST_COLORS[0];
  const cdiv = document.getElementById('post-colors');
  cdiv.innerHTML = POST_COLORS.map(c => `<div class="post-color-dot ${c===pickedPostColor?'sel':''}" style="background:${c}" onclick="pickPostColor('${c}', this)"></div>`).join('');
  const note = document.getElementById('post-task-note');
  note.textContent = (post.taskId && state.tasks.find(t=>t.id===post.taskId)) ? '✓ A task already exists for this post.' : '';
  document.getElementById('post-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('post-title').focus(), 50);
}
function pickPostColor(c, el) {
  pickedPostColor = c;
  document.querySelectorAll('.post-color-dot').forEach(d => d.classList.remove('sel'));
  el.classList.add('sel');
}
function readPostForm() {
  let start = document.getElementById('post-start').value;
  let publish = document.getElementById('post-publish').value;
  if (start && publish && start > publish) { const t = start; start = publish; publish = t; } // keep order sane
  return {
    title: document.getElementById('post-title').value.trim() || 'Untitled',
    platform: document.getElementById('post-platform').value,
    start: start || publish,
    publish: publish || start,
    color: pickedPostColor
  };
}
function savePost() {
  const form = readPostForm();
  if (!form.start && !form.publish) { showToast('Pick at least a publish date 📅'); return; }
  if (editingPostId) {
    const post = state.posts.find(p => p.id === editingPostId);
    Object.assign(post, form);
  } else {
    state.posts.push({ id: 'post'+Date.now()+Math.floor(Math.random()*999), taskId: null, ...form });
  }
  save();
  closeModal('post-modal');
  renderCalendar();
  renderPostReminders();
  playSound('click');
}
function deletePost() {
  if (!editingPostId) { closeModal('post-modal'); return; }
  state.posts = state.posts.filter(p => p.id !== editingPostId);
  save();
  closeModal('post-modal');
  renderCalendar();
  renderPostReminders();
}
// Turn the currently-open post into a task for the current user.
function makePostTask() {
  const form = readPostForm();
  // persist the post first (so the task can link to it)
  let post;
  if (editingPostId) {
    post = state.posts.find(p => p.id === editingPostId);
    Object.assign(post, form);
  } else {
    post = { id: 'post'+Date.now()+Math.floor(Math.random()*999), taskId: null, ...form };
    state.posts.push(post);
    editingPostId = post.id;
  }
  const myId = myPersonId();
  if (!myId) { showToast('Set your name to a crew member first! 🪪'); return; }
  const task = {
    id: Date.now(),
    text: `Make ${post.platform} post: ${post.title}`,
    assigneeId: myId,
    priority: 'medium',
    type: 'social',
    mins: 25,
    done: false,
    source: 'post',
    postId: post.id,
    subtasks: [],
    collapsed: false
  };
  state.tasks.push(task);
  post.taskId = task.id;
  save();
  renderCalendar();
  renderTasks();
  renderLeaderboard();
  renderPostReminders();
  document.getElementById('post-task-note').textContent = '✓ Task added to your board!';
  showToast('🛠️ Task created — check your board!');
}

// ══════════════════════════════════════════════
// POST REMINDER BAR (on the task board)
// ══════════════════════════════════════════════
function renderPostReminders() {
  const bar = document.getElementById('post-reminder-bar');
  if (!bar) return;
  const today = new Date(); today.setHours(0,0,0,0);
  const items = [];
  (state.posts || []).forEach(post => {
    // remind about start day and publish day within the next 7 days (and overdue-ish today)
    [['start','✏️','Start making'],['publish','🚀','Publish']].forEach(([field, icon, verb]) => {
      const k = post[field];
      if (!k) return;
      const diff = daysBetween(today, parseYmd(k));
      if (diff >= 0 && diff <= 7) {
        items.push({ post, field, icon, verb, diff, dateK: k });
      }
    });
  });
  items.sort((a,b) => a.diff - b.diff);
  if (items.length === 0) { bar.innerHTML = ''; return; }
  bar.innerHTML = items.map(it => {
    const emoji = PLATFORM_EMOJI[it.post.platform] || '🌐';
    const dateLabel = parseYmd(it.dateK).toLocaleDateString('en-US',{weekday:'short', month:'short', day:'numeric'});
    const daysTxt = it.diff === 0 ? 'TODAY' : (it.diff === 1 ? 'tomorrow' : `${it.diff} days`);
    const cls = it.diff === 0 ? 'today' : (it.diff <= 2 ? 'soon' : '');
    return `<div class="post-reminder" style="border-left-color:${it.post.color||'#FF7A3C'}" onclick="showSection('calendar')">
      <span style="font-size:16px">${it.icon}</span>
      <span>${it.verb} ${emoji} <b>${escHtml(it.post.title)}</b> (${escHtml(it.post.platform)}) — ${dateLabel}</span>
      <span class="pr-days ${cls}">${daysTxt}</span>
    </div>`;
  }).join('');
}
