// ═══════════════════════════════════════════════════════════════
//  WAY OF BOATS — 19-boot.js
//  Start-up sequence — runs last
//
//  Loaded in numbered order by index.html. These are classic scripts,
//  not ES modules, so every function stays global and the inline
//  onclick= handlers in the markup keep working unchanged.
// ═══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════
load();
renderAll();
applyConfigColors();
initCursors();
startFish();
wireBoats();
wireWaterSplash();
renderPomo();
renderPomoTodos();
renderBoard();
// initialize content calendar view toggle + task-board reminders
if (state.calView === 'week') setCalView('week'); else setCalView('month');
renderPostReminders();

renderAppVersion();

// Check for a newer build: on load, when the tab is reopened (how phones
// usually come back), and hourly for tabs left open all day.
setTimeout(() => checkForUpdate(false), 2500);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    checkForUpdate(false);
    // a phone waking up may also have missed sync traffic — re-read the room
    if (sb && sbConfig) pullAllItems();
  }
});
setInterval(() => checkForUpdate(false), 60 * 60 * 1000);

// Prompt for name on first visit
if (!state.myName) {
  setTimeout(() => openMyNameModal(), 800);
}

// Auto-reconnect to live sync if previously configured
if (sbConfig && typeof window.supabase !== 'undefined') {
  setSyncStatus('🟡 Connecting…', 'var(--peach)');
  startSync();
}
