// ═══════════════════════════════════════════════════════════════
//  WAY OF BOATS — 13-pomodoro.js
//  Fishing focus timer and the catchable fish
//
//  Loaded in numbered order by index.html. These are classic scripts,
//  not ES modules, so every function stays global and the inline
//  onclick= handlers in the markup keep working unchanged.
// ═══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════
// FISHING FOCUS TIMER
// ══════════════════════════════════════════════
// Fish you can catch (rarer ones for longer focus sessions)
const FISH_SPECIES = CONFIG.icons.fishSpecies;
let pomoMinutes = parseInt(localStorage.getItem('boats_pomo_min') || '25', 10);
let pomoRemaining = pomoMinutes * 60;
let pomoRunning = false;
let pomoInterval = null;
let pomoGoal = '';
let pomoEndTime = null;      // wall-clock ms timestamp when the session should end
let pomoTaskIds = [];        // ids of REAL board tasks pulled into this session
let userSetMinutes = false;  // did the user manually override the suggested time?

// caught fish stored per-person so it can feed the leaderboard
function myFishList() {
  const id = myPersonId();
  if (!id) {
    try { return JSON.parse(localStorage.getItem('boats_myfish') || '[]'); } catch(e){ return []; }
  }
  const p = personById(id);
  if (!p.fish) p.fish = [];
  return p.fish;
}
function saveMyFish(list) {
  const id = myPersonId();
  if (!id) { localStorage.setItem('boats_myfish', JSON.stringify(list)); return; }
  const p = personById(id);
  p.fish = list;
  save();
}
function myPersonId() {
  const n = (state.myName || '').trim().toLowerCase();
  if (!n) return null;
  const p = state.people.find(x => x.name.trim().toLowerCase() === n);
  return p ? p.id : null;
}
