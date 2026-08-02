// ═══════════════════════════════════════════════════════════════
//  WAY OF BOATS — 07-worldcup.js
//  Daily streak tracker and check-ins
//
//  Loaded in numbered order by index.html. These are classic scripts,
//  not ES modules, so every function stays global and the inline
//  onclick= handlers in the markup keep working unchanged.
// ═══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════
// WORLD CUP — daily streak tracker (Eastern Time)
// ══════════════════════════════════════════════
// Categories are per-person now. state.wcCategories can be either an object
// keyed by personId, or (legacy) a flat array shared by all. This normalizes both.
function getWcCategories(personId) {
  const wcc = state.wcCategories;
  // legacy: a flat array → treat as everyone's shared default
  if (Array.isArray(wcc)) return wcc;
  if (wcc && personId && Array.isArray(wcc[personId]) && wcc[personId].length) return wcc[personId];
  return DEFAULT_WC_CATEGORIES;
}
function setWcCategories(personId, cats) {
  if (Array.isArray(state.wcCategories) || !state.wcCategories) state.wcCategories = {};
  state.wcCategories[personId] = cats;
}

// Returns today's "streak day" key in US Eastern Time as "YYYY-MM-DD".
// The day rolls over at 1:00 AM Boston time (not midnight) — so anything done
// between 12:00–12:59 AM still counts toward the previous day, giving night owls
// a little extra time. We do this by shifting the clock back 1 hour before taking the date.
const STREAK_ROLLOVER_HOUR = 1; // change this number to move the rollover time
function estDateKey(d = new Date()) {
  const shifted = new Date(d.getTime() - STREAK_ROLLOVER_HOUR * 3600000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(shifted);
}
function estMonthKey(d = new Date()) {
  const shifted = new Date(d.getTime() - STREAK_ROLLOVER_HOUR * 3600000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit' }).format(shifted);
}
// yesterday's key relative to a given key
function prevDateKey(key) {
  const d = new Date(key + 'T12:00:00Z'); // noon UTC avoids TZ edge
  d.setUTCDate(d.getUTCDate() - 1);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// Ensure a person's streak object exists: { catId: { streak, last, monthAwarded } }
function ensureWc(p) {
  if (!p.wc) p.wc = {};
  return p.wc;
}

// Called on load and when the WC section opens: apply "missed a day → reset" logic.
function reconcileStreaks() {
  const today = estDateKey();
  const yesterday = prevDateKey(today);
  // One-time cleanup: remove fish that were awarded under the OLD rule
  // (first-check-in-of-month fish had no valid month/25-day basis). These are
  // tagged fromStreak but lack a 'month' field, or were granted below threshold.
  if (!state._streakFishCleaned) {
    state.people.forEach(p => {
      if (Array.isArray(p.fish)) {
        p.fish = p.fish.filter(f => !(f.fromStreak && !f.month));
      }
    });
    state._streakFishCleaned = true;
    try { save(); } catch(e) {}
  }
  let fixerUsed = null;
  state.people.forEach(p => {
    const wc = ensureWc(p);
    getWcCategories(p.id).forEach(cat => {
      const rec = wc[cat.id];
      if (!rec) return;
      if (rec.last !== today && rec.last !== yesterday) {
        // A streak fixer buys back exactly one missed day: the streak survives
        // and the chain is treated as unbroken through yesterday.
        if (rec.streak > 0 && (p.streakFixers || 0) > 0) {
          p.streakFixers -= 1;
          rec.last = yesterday;
          rec.fixedOn = rec.fixedOn || [];
          rec.fixedOn.push(today);
          if (p.id === myPersonId()) fixerUsed = cat.label || 'a habit';
        } else {
          rec.streak = 0;
        }
      }
    });
  });
  if (fixerUsed) {
    setTimeout(() => showToast(`🩹 A streak fixer saved your ${fixerUsed} streak!`), 1200);
  }
}

// Toggle today's check-in for me + a category
function wcCheckIn(catId) {
  const pid = myPersonId();
  if (!pid) { showToast('Set your name to a crew member first! 🪪'); return; }
  const p = personById(pid);
  const wc = ensureWc(p);
  const today = estDateKey();
  const yesterday = prevDateKey(today);
  const mk = estMonthKey();
  let rec = wc[catId] || { streak: 0, last: null, monthCounts: {}, monthFish: {} };
  if (!rec.monthCounts) rec.monthCounts = {};
  if (!rec.monthFish) rec.monthFish = {};

  if (rec.last === today) {
    // uncheck today → step streak back and decrement this month's count
    rec.streak = Math.max(0, rec.streak - 1);
    rec.monthCounts[mk] = Math.max(0, (rec.monthCounts[mk] || 1) - 1);
    rec.last = rec.streak > 0 ? yesterday : null;
  } else {
    // check in for today
    if (rec.last === yesterday) rec.streak += 1;   // continuing streak
    else rec.streak = 1;                            // fresh start
    rec.last = today;
    rec.monthCounts[mk] = (rec.monthCounts[mk] || 0) + 1;
    playSound('ding');
    // Fish awarded ONLY when this category passes 25 check-in days in this month,
    // and only once per category per month.
    if (rec.monthCounts[mk] > 25 && !rec.monthFish[mk]) {
      rec.monthFish[mk] = true;
      awardStreakFish(p, catId, mk);
    }
  }
  wc[catId] = rec;
  save();
  renderWorldCup();
  renderLeaderboard();
}

// Completing a category's month (26+ check-in days) pays out this many fish.
const STREAK_FISH_REWARD = 3;

function awardStreakFish(p, catId, mk) {
  if (!p.fish) p.fish = [];
  const cat = getWcCategories(p.id).find(c => c.id === catId);
  const label = cat ? cat.label : 'habit';
  for (let i = 0; i < STREAK_FISH_REWARD; i++) {
    p.fish.push({ emoji: '🐟', name: 'Consistency Fish (' + label + ', ' + mk + ')', minutes: 0, at: Date.now() + i, fromStreak: true, catId, month: mk });
  }
  showToast(`🎣 ${escHtml(p.name)} earned ${STREAK_FISH_REWARD} fish — 26 days of ${label} this month! 🔥`);
}

// Total World Cup check-ins this month, across every category. Days do NOT have
// to be consecutive — 19 scattered gym days counts as 19.
function wcMonthChecks(pid, monthKey) {
  const p = personById(pid);
  if (!p) return 0;
  const wc = p.wc || {};
  const mk = monthKey || estMonthKey();
  return getWcCategories(pid).reduce((s, c) => {
    const rec = wc[c.id];
    return s + ((rec && rec.monthCounts && rec.monthCounts[mk]) || 0);
  }, 0);
}
// Those check-ins are worth a tenth of a point each: 19 → 1.9
function wcStreakPoints(pid, monthKey) {
  return wcMonthChecks(pid, monthKey) / 10;
}
