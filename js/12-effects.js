// ═══════════════════════════════════════════════════════════════
//  WAY OF BOATS — 12-effects.js
//  Sound engine, floating fish, boats, message board
//
//  Loaded in numbered order by index.html. These are classic scripts,
//  not ES modules, so every function stays global and the inline
//  onclick= handlers in the markup keep working unchanged.
// ═══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════
// SOUND ENGINE (Web Audio — no files needed)
// ══════════════════════════════════════════════
let audioCtx = null;
function getCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function tone(freq, dur, type = 'sine', vol = 0.15, delay = 0, sweepTo = null) {
  const ctx = getCtx(); if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}
function noiseWoosh(dur = 0.4, vol = 0.18, delay = 0) {
  const ctx = getCtx(); if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random()*2-1) * (1 - i/data.length);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const filter = ctx.createBiquadFilter(); filter.type = 'bandpass';
  filter.frequency.setValueAtTime(400, t0);
  filter.frequency.exponentialRampToValueAtTime(2500, t0 + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
  src.start(t0);
}
function playSound(kind) {
  switch(kind) {
    case 'click': tone(660, 0.06, 'triangle', 0.12); break;
    case 'woosh': noiseWoosh(0.45, 0.16); break;
    case 'seagull':
      // two quick chirps that sweep up
      tone(900, 0.12, 'sawtooth', 0.08, 0, 1500);
      tone(1100, 0.12, 'sawtooth', 0.07, 0.16, 1700);
      tone(950, 0.10, 'sawtooth', 0.06, 0.34, 1400);
      break;
    case 'ding':
      // short, rustic, joyful — two quick wood-block plucks up a third
      tone(784, 0.09, 'triangle', 0.20, 0);     // G
      tone(1047, 0.13, 'triangle', 0.18, 0.07);  // C — bright little hop
      break;
    case 'horn':
      // triumphant rising fanfare (with a warm horn underneath)
      tone(130, 0.7, 'sine', 0.16, 0);       // low foundation
      tone(392, 0.18, 'triangle', 0.18, 0);    // G
      tone(523, 0.18, 'triangle', 0.18, 0.16); // C
      tone(659, 0.22, 'triangle', 0.18, 0.32); // E
      tone(784, 0.45, 'triangle', 0.20, 0.48); // G (held)
      tone(1047, 0.45, 'sine', 0.12, 0.52);    // sparkle octave
      break;
    case 'splash':
      // dramatic splash — deep plunge, big spray, then trickling droplets
      tone(520, 0.18, 'sine', 0.20, 0, 120);      // the big plunk dropping in pitch
      tone(300, 0.22, 'sine', 0.16, 0.02, 90);
      noiseWoosh(0.35, 0.22);                       // the spray
      noiseWoosh(0.18, 0.12, 0.14);                 // secondary splash
      // scattered droplets pattering after
      tone(1400, 0.05, 'sine', 0.08, 0.20);
      tone(1750, 0.05, 'sine', 0.07, 0.28);
      tone(1200, 0.05, 'sine', 0.07, 0.36);
      tone(2000, 0.05, 'sine', 0.06, 0.44);
      break;
  }
}

// (water splash sound removed by request)
function wireWaterSplash() { /* no-op */ }

// Wire a soft click sound to all buttons/controls (no random seagull).
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button, .nav-btn, .tab-btn, .filter-chip, .task-check, .pcheck-box, .template-card, .color-dot');
  if (btn) playSound('click');
}, true);

// Woosh on page switch; boat horn specifically when opening the Leaderboard.
const _showSection = showSection;
showSection = function(name) {
  if (name === 'leaderboard') playSound('horn');
  else playSound('woosh');
  _showSection(name);
};

// ══════════════════════════════════════════════
// FLOATING PAPER FISH (orange, simple)
// ══════════════════════════════════════════════
function fishSvg(color = '#F4823C', scale = 1) {
  const w = Math.round(34 * scale), h = Math.round(20 * scale);
  // tail fin on the LEFT edge, rounded head + eye on the RIGHT → fish points RIGHT
  return `<svg width="${w}" height="${h}" viewBox="0 0 34 20">
    <polygon points="12,10 1,3 1,17" fill="${color}" stroke="white" stroke-width="1.2"/>
    <ellipse cx="20" cy="10" rx="13" ry="7" fill="${color}" stroke="white" stroke-width="1.2"/>
    <circle cx="28" cy="8" r="1.6" fill="white"/>
    <circle cx="28" cy="8" r="0.8" fill="#3D2B1F"/>
  </svg>`;
}
let recentFishY = [];
function spawnFish() {
  const layer = document.getElementById('fish-layer');
  if (!layer) return;
  // cap concurrent fish to avoid clutter/overlap
  if (layer.querySelectorAll('.floaty-fish').length >= 4) return;
  const fish = document.createElement('div');
  const rtl = Math.random() < 0.5;
  fish.className = 'floaty-fish ' + (rtl ? 'rtl' : 'ltr');
  const shades = ['#F4823C','#FF9E4D','#F4A460','#FF8C42'];
  const scale = 0.7 + Math.random() * 0.9;
  fish.innerHTML = fishSvg(shades[Math.floor(Math.random()*shades.length)], scale);
  // spread fish across a tall band, and avoid spawning near a recently-used height
  const minY = 120, maxY = window.innerHeight - 160;
  let y, tries = 0;
  do {
    y = minY + Math.random() * (maxY - minY);
    tries++;
  } while (tries < 8 && recentFishY.some(py => Math.abs(py - y) < 70));
  recentFishY.push(y);
  if (recentFishY.length > 5) recentFishY.shift();
  fish.style.top = y + 'px';
  fish.style.animationDuration = (17 + Math.random() * 10) + 's';
  layer.appendChild(fish);
  setTimeout(() => fish.remove(), 30000);
}

function jellySvg(color, scale = 1) {
  const w = Math.round(30 * scale), h = Math.round(40 * scale);
  return `<svg width="${w}" height="${h}" viewBox="0 0 30 40">
    <path d="M3,16 a12,13 0 0 1 24,0 q-3,-2 -6,0 q-3,2 -6,0 q-3,-2 -6,0 q-3,2 -6,0 Z" fill="${color}" stroke="white" stroke-width="1.2"/>
    <circle cx="11" cy="13" r="1.4" fill="white"/>
    <circle cx="19" cy="13" r="1.4" fill="white"/>
    <path d="M7,17 q1,10 -1,18" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.8"/>
    <path d="M12,18 q0,11 1,19" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.8"/>
    <path d="M18,18 q0,11 -1,19" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.8"/>
    <path d="M23,17 q-1,10 1,18" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.8"/>
  </svg>`;
}
function var_sidebar() {
  const sb = document.getElementById('sidebar');
  return sb ? sb.getBoundingClientRect().width : 220;
}
function spawnJelly() {  const layer = document.getElementById('fish-layer');
  if (!layer) return;
  const jelly = document.createElement('div');
  jelly.className = 'floaty-jelly';
  const shades = ['#E8A8D8','#C9B8E8','#A8C8F0','#F4A6C8'];
  const scale = 0.8 + Math.random() * 0.7;
  jelly.innerHTML = jellySvg(shades[Math.floor(Math.random()*shades.length)], scale);
  // keep jellyfish hugging the left or right edge, clear of the work area
  const side = Math.random() < 0.5;
  jelly.style.left = side
    ? (var_sidebar() + 6 + Math.random() * 30) + 'px'
    : (window.innerWidth - 70 - Math.random() * 30) + 'px';
  jelly.style.bottom = '-50px';
  jelly.style.animationDuration = (22 + Math.random() * 14) + 's, 2.4s';
  layer.appendChild(jelly);
  setTimeout(() => jelly.remove(), 38000);
}
function startFish() {
  for (let i = 0; i < 3; i++) setTimeout(spawnFish, i * 4000);
  setInterval(spawnFish, 9000);
  setTimeout(spawnJelly, 5000);
  setInterval(spawnJelly, 16000); // a jellyfish every now and then
}

// ══════════════════════════════════════════════
// CLICKABLE BOATS — motivational messages
// (Original lines inspired by themes of habit & decade-defining books)
// ══════════════════════════════════════════════
const BOAT_MESSAGES = [
  { text: "Tiny oars, big distance. A 1% better row today compounds into a whole new shore.", book: "in the spirit of Atomic Habits" },
  { text: "You don't rise to your goals — you drift to the level of your systems. Build a good boat.", book: "in the spirit of Atomic Habits" },
  { text: "Don't wait for the perfect tide. Cast off now; you can steer once you're moving.", book: "in the spirit of The Defining Decade" },
  { text: "Identity first: become the kind of person who finishes the crossing.", book: "in the spirit of Atomic Habits" },
  { text: "The next ten strokes matter more than you think. Small choices set the heading for years.", book: "in the spirit of The Defining Decade" },
  { text: "Make the habit obvious, easy, and a little bit fun — then it rows itself.", book: "in the spirit of Atomic Habits" },
  { text: "Weak ties carry you to new harbors. Reach out to one new person this week.", book: "in the spirit of The Defining Decade" },
  { text: "Every checkbox is a vote for the sailor you're becoming.", book: "in the spirit of Atomic Habits" },
  { text: "You can't change the wind, but you can keep adjusting the sail. Try again tomorrow.", book: "a little encouragement" },
  { text: "Progress over perfection — a leaky boat still moving beats a perfect one in dry dock.", book: "a little encouragement" },
  // ── Malcolm Gladwell themes (Outliers, Blink, The Tipping Point) ──
  { text: "Mastery isn't magic — it's roughly 10,000 hours of steady rowing. Log a few more today.", book: "in the spirit of Outliers, Malcolm Gladwell" },
  { text: "Big change often tips all at once after small pushes. Keep nudging your little epidemic of effort.", book: "in the spirit of The Tipping Point, Malcolm Gladwell" },
  { text: "Success is hidden advantages and lucky timing meeting hard work. Show up so luck can find you.", book: "in the spirit of Outliers, Malcolm Gladwell" },
  { text: "Sometimes your snap first instinct is wise. Trust the quick read, then verify.", book: "in the spirit of Blink, Malcolm Gladwell" },
  { text: "Where you come from shaped your oars — but you still choose where to row.", book: "in the spirit of Outliers, Malcolm Gladwell" },
  { text: "The underdog wins by playing a different game. What rule could you break today?", book: "in the spirit of David and Goliath, Malcolm Gladwell" },
  // ── Work-focus questions (randomized prompts) ──
  { text: "What's the cost? What's the gain? Weigh both before you commit the hours.", book: "a question for you 🎯" },
  { text: "What's the ONE thing that, if finished today, would make everything else easier?", book: "a question for you 🎯" },
  { text: "What have you been avoiding? Name it and give it ten honest minutes.", book: "a question for you 🎯" },
  { text: "If you only had 30 minutes today, what would you spend them on?", book: "a question for you 🎯" },
  { text: "What are you working on right now — and is it actually the most important thing?", book: "a question for you 🎯" },
  { text: "What tiny task could you finish in the next 5 minutes to build momentum?", book: "a question for you 🎯" },
  { text: "Which task feels heaviest? Break it into one small next step.", book: "a question for you 🎯" },
  // ── Struthless (Campbell Walker) themes — creativity, showing up, boredom ──
  { text: "You don't need more motivation — you need a smaller first step and a bit less shame.", book: "in the spirit of Struthless" },
  { text: "Do it badly first. A finished ugly draft beats a perfect idea that never leaves your head.", book: "in the spirit of Struthless" },
  { text: "Boredom is where the good stuff grows. Sit with the blank page a little longer.", book: "in the spirit of Struthless" },
  { text: "Your habits are voting for who you become. What's today's vote?", book: "in the spirit of Struthless" },
  { text: "Fall in love with the process, not the highlight reel. Show up for the boring middle.", book: "in the spirit of Struthless" },
  { text: "You're allowed to be a beginner. Suck, learn, repeat — that's the whole trick.", book: "in the spirit of Struthless" }
];
let boatMsgEl = null;
function showBoatMessage(x, boatEl) {
  if (boatMsgEl) boatMsgEl.remove();
  // pick one random quote per hover and keep it while hovering this boat
  const msg = BOAT_MESSAGES[Math.floor(Math.random() * BOAT_MESSAGES.length)];
  boatMsgEl = document.createElement('div');
  boatMsgEl.className = 'boat-msg';
  boatMsgEl.innerHTML = `⛵ ${escHtml(msg.text)}<span class="bm-book">— ${escHtml(msg.book)}</span>`;
  document.body.appendChild(boatMsgEl);
  const left = Math.max(16, Math.min(window.innerWidth - 300, x - 140));
  boatMsgEl.style.left = left + 'px';
}
function hideBoatMessage() {
  if (boatMsgEl) { boatMsgEl.remove(); boatMsgEl = null; }
}
function wireBoats() {
  document.querySelectorAll('.floaty-boat').forEach(b => {
    b.addEventListener('mouseenter', (e) => showBoatMessage(e.clientX, b));
    b.addEventListener('mouseleave', hideBoatMessage);
  });
}

// ══════════════════════════════════════════════
// MESSAGE BOARD (shared via Supabase, persisted)
// ══════════════════════════════════════════════
function toggleBoard() {
  document.getElementById('msgboard').classList.toggle('board-collapsed');
  renderBoard();
}
function postMessage() {
  const input = document.getElementById('board-input');
  const text = input.value.trim();
  if (!text) return;
  if (!state.messages) state.messages = [];
  state.messages.push({ id: Date.now(), who: state.myName || 'Anonymous', color: myColor, text, at: Date.now() });
  // keep only the latest 50
  if (state.messages.length > 50) state.messages = state.messages.slice(-50);
  input.value = '';
  save();
  renderBoard();
  playSound('click');
}
function deleteMessage(id) {
  state.messages = (state.messages || []).filter(m => m.id !== id);
  save();
  renderBoard();
}
function renderBoard() {
  const box = document.getElementById('board-notes');
  if (!box) return;
  const msgs = state.messages || [];
  if (msgs.length === 0) {
    box.innerHTML = `<div class="board-empty">No messages yet — be the first to toss a bottle! 🍾</div>`;
    return;
  }
  box.innerHTML = msgs.slice().reverse().map(m => `
    <div class="board-note">
      <span class="bn-who" style="color:${m.color || 'var(--ocean-deep)'}">${escHtml(m.who)}</span>
      ${escHtml(m.text)}
      <button class="bn-del" onclick="deleteMessage(${m.id})" title="Delete">×</button>
    </div>`).join('');
}
