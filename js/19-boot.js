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
// Collapse anything the duplication bug already wrote before it reaches a
// render or a push.
try { if (typeof repairAllPeople === 'function') {
  const n = repairAllPeople();
  if (n) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); console.log('[boats] repaired', n, 'duplicate records'); }
} } catch (e) {}
try { if (typeof stripBookCovers === 'function') {
  const n = stripBookCovers();
  if (n) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); console.log('[boats] dropped', n, 'book covers'); }
} } catch (e) {}
// ⚠️ ORDER MATTERS.
//
// These three used to sit BELOW renderAll(), so any throw while drawing left
// the app with no version number, no build check and — worst — no sync, because
// startSync() at the bottom of this file never ran. Boot the essentials first;
// drawing can fail without taking the connection down with it.
renderAppVersion();
try { checkBuildIntegrity(); } catch (e) {}
if (sbConfig && typeof window.supabase !== 'undefined') {
  setSyncStatus('🟡 Connecting…', 'var(--peach)');
  startSync();
}

renderAll();
// reflect the saved live-cursor choice (off unless it was turned on)
try { const cb = document.getElementById('cursor-toggle'); if (cb) cb.checked = cursorsOn(); } catch (e) {}
try { renderSaveButton(); } catch (e) {}
try { applyConfigColors(); } catch (e) { console.error("[boats] boot step failed:", 'applyConfigColors()', e); }
try { initCursors(); } catch (e) { console.error("[boats] boot step failed:", 'initCursors()', e); }
try { startFish(); } catch (e) { console.error("[boats] boot step failed:", 'startFish()', e); }
try { wireBoats(); } catch (e) { console.error("[boats] boot step failed:", 'wireBoats()', e); }
try { wireWaterSplash(); } catch (e) { console.error("[boats] boot step failed:", 'wireWaterSplash()', e); }
try { renderPomo(); } catch (e) { console.error("[boats] boot step failed:", 'renderPomo()', e); }
try { renderPomoTodos(); } catch (e) { console.error("[boats] boot step failed:", 'renderPomoTodos()', e); }
try { renderBoard(); } catch (e) { console.error("[boats] boot step failed:", 'renderBoard()', e); }
// initialize content calendar view toggle + task-board reminders
try { if (state.calView === 'week') setCalView('week'); else setCalView('month'); } catch (e) {}
try { renderPostReminders(); } catch (e) { console.error("[boats] boot step failed:", 'renderPostReminders()', e); }

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

// (sync now starts near the top of boot, before any drawing)
