// ═══════════════════════════════════════════════════════════════
//  WAY OF BOATS — 09-leaderboard.js
//  Scoring, ranking and player profiles
//
//  Loaded in numbered order by index.html. These are classic scripts,
//  not ES modules, so every function stays global and the inline
//  onclick= handlers in the markup keep working unchanged.
// ═══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════
// LEADERBOARD
// ══════════════════════════════════════════════
// 5 or more stickers earns the Sticker Queen badge, worth a flat bonus.
const STICKER_QUEEN_MIN = 5;
const STICKER_QUEEN_BONUS = 10;

function renderLeaderboard() {
  const panel = document.getElementById('leaderboard-panel');
  const counts = getTaskCountsByPerson();

  if (visiblePeople().length === 0) {
    panel.innerHTML = `<div class="leaderboard-title">🏆 Hall of Fame</div>
      <div class="empty-state"><div class="empty-emoji">⚓</div><p>No crew yet!</p><small>Add people in "Edit People" to start the race.</small></div>`;
    return;
  }

  const sorted = visiblePeople()
    .map(p => {
      const fishArr = p.fish || [];
      const fish = fishArr.length;
      const focusMinutes = fishArr.reduce((sum, f) => sum + (f.minutes || 0), 0);
      const done = counts[p.id]?.done || 0;
      const total = counts[p.id]?.total || 0;
      const ratio = total > 0 ? (done / total) : 0;
      // 🔥 streak stays the consecutive-day count for display, but POINTS now come
      // from how many times you checked in this month, consecutive or not.
      const wc = p.wc || {};
      const streak = getWcCategories(p.id).reduce((s, c) => s + ((wc[c.id] && wc[c.id].streak) || 0), 0);
      const monthChecks = wcMonthChecks(p.id);
      const streakPts = monthChecks / 10;
      const stars = p.stars || 0;
      // NEW FORMULA
      // plus any manual admin adjustment (pointsAdjust, can be negative)
      const adjust = p.pointsAdjust || 0;
      // Fish are no longer interchangeable: big fish are worth 3, everything
      // else 2, socks 0 (they aren't kept in this array at all). Anything caught
      // before the gacha has no `kind` and still counts as 2.
      const fishPts = fishArr.reduce((s, f) => s + fishValue(f), 0);
      // 5+ stickers earns the Sticker Queen badge and a flat bonus
      const stickerCount = (p.stickers || []).length;
      const isQueen = stickerCount >= STICKER_QUEEN_MIN;
      const queenBonus = isQueen ? STICKER_QUEEN_BONUS : 0;
      const points = Math.round(fishPts + ((done/5) + (10 * ratio)) + streakPts + (total / 15) + (stars / 2)) + adjust + queenBonus;
      return { ...p, done, total, fish, fishPts, focusMinutes, streak, monthChecks, streakPts,
               stars, adjust, points, stickerCount, isQueen, queenBonus, socks: p.socks || 0 };
    })
    .sort((a, b) => b.points - a.points || b.done - a.done);

  const max = sorted[0]?.points || 1;
  const medals = ['🥇', '🥈', '🥉'];

  panel.innerHTML = `
    <div class="leaderboard-title">🏆 Hall of Fame</div>
    <div class="leaderboard-sub">
      <div class="rules-box">
        <b>🧮 How points work</b>
        <div class="rules-formula">Points = (🎣&nbsp;×&nbsp;3) + (10&nbsp;×&nbsp;done&nbsp;÷&nbsp;total) + (✅&nbsp;check-ins&nbsp;this&nbsp;month&nbsp;÷&nbsp;10) + (tasks&nbsp;÷&nbsp;5) + (⭐&nbsp;÷&nbsp;2)</div>
        <div class="rules-note">✅ every check-in this month counts, streak or not — 19 gym days is 19&nbsp;÷&nbsp;10 = 1.9 points. 🎣 fish come from the World Cup (${STREAK_FISH_REWARD} fish for hitting 26 days in a month) and focus sessions. ⭐ stars are earned by finishing a task on or before its due date.</div>
      </div>
    </div>
    <div class="leaderboard-list">
      ${sorted.map((p, i) => {
        const rankClass = i < 3 ? `rank-${i+1}` : '';
        const medal = medals[i] || `#${i+1}`;
        const starDisplay = p.stars > 0 ? `<span class="lb-stars" title="${p.stars} on-time star${p.stars>1?'s':''}">⭐${p.stars}</span>` : '';
        const barW = max > 0 ? Math.round((p.points / max) * 100) : 0;
        return `<div class="lb-row ${rankClass}" onclick="openPlayerProfile('${p.id}')" style="cursor:pointer" title="View ${escAttr(p.name)}'s profile">
          <span class="lb-rank">${medal}</span>
          <div style="width:28px;height:28px;border-radius:50%;background:${p.color};flex-shrink:0;border:2px solid rgba(255,255,255,0.7)"></div>
          <span class="lb-name">${escHtml(p.name)}${stickerStrip(p)} ${starDisplay}
            <span style="display:block;font-size:10px;font-weight:700;color:var(--ink-light)">✅ ${p.done}/${p.total} · 🎣 ${p.fish} · 🔥 ${p.streak} · 📅 ${p.monthChecks} this month (+${p.streakPts.toFixed(1)})${p.adjust ? ` · <b style="color:var(--sunset-deep)">${p.adjust > 0 ? '+' : ''}${p.adjust} adj</b>` : ''}</span>
          </span>
          <div class="lb-bar-wrap"><div class="lb-bar" style="width:${barW}%;background:${p.color}"></div></div>
          ${p.isQueen ? `<span class="queen-badge" title="Sticker Queen — ${p.stickerCount} stickers, +${STICKER_QUEEN_BONUS} pts">👑</span>` : ''}
          <span class="lb-score">${p.points}<span> pts</span></span>
        </div>`;
      }).join('')}
    </div>
    ${sorted[0]?.points > 0 ? `<div style="text-align:center;margin-top:18px;font-size:22px">🎉 ${escHtml(sorted[0].name)} is sailing ahead! ⛵</div>` : ''}
  `;
}

// ══════════════════════════════════════════════
// PLAYER PROFILE — click a leaderboard row to see their fish & stats
// ══════════════════════════════════════════════
function openPlayerProfile(pid) {
  const p = personById(pid);
  if (!p) return;
  const counts = getTaskCountsByPerson();
  const done = counts[pid]?.done || 0;
  const total = counts[pid]?.total || 0;
  const wc = p.wc || {};
  const streak = getWcCategories(pid).reduce((s, c) => s + ((wc[c.id] && wc[c.id].streak) || 0), 0);
  const stars = p.stars || 0;
  const fishArr = p.fish || [];
  const focusMins = focusMinutesFor(pid);
  const sessions = p.pomoSessions || 0;

  // group fish by name to show counts of each kind
  const byKind = {};
  fishArr.forEach(f => {
    const key = (f.emoji || '🐟') + '|' + (f.name || 'Fish').replace(/ \(bonus!?\)$/,'').replace(/ \(.*\)$/,'');
    if (!byKind[key]) byKind[key] = { emoji: f.emoji || '🐟', name: (f.name||'Fish').replace(/ \(bonus!?\)$/,''), count: 0 };
    byKind[key].count++;
  });
  const kinds = Object.values(byKind).sort((a,b) => b.count - a.count);

  const fishHtml = fishArr.length === 0
    ? `<div style="text-align:center;color:var(--ink-light);font-weight:600;padding:14px;">No fish caught yet 🌊</div>`
    : kinds.map(k => `<div class="profile-fish-row">
        <span style="font-size:22px">${k.emoji}</span>
        <span style="flex:1;font-weight:700;font-size:13px;">${escHtml(k.name)}</span>
        <span class="profile-fish-count">×${k.count}</span>
      </div>`).join('');

  // stickers owned from the Fish Market
  const owned = (p.stickers || []).map(id => catalogItem(id)).filter(Boolean);
  const active = p.activeStickers || [];
  const isMe = pid === myPersonId();
  const stickersHtml = owned.length === 0
    ? `<div style="font-size:11px;font-weight:600;color:var(--ink-light);padding:6px;">No stickers yet — visit the 🐠 Fish Market under World Cup!</div>`
    : owned.map(it => {
        const on = active.includes(it.id);
        return `<button class="profile-sticker ${it.special?'shiny':''} ${on?'equipped':''}" ${isMe?'':'disabled'}
          onclick="toggleSticker('${pid}', '${it.id}')" title="${isMe ? (on?'Click to unequip':'Click to equip') : escAttr(it.name)}">
          <span class="ps-emoji">${it.emoji}</span>${on?'<span class="ps-check">✓</span>':''}
        </button>`;
      }).join('');

  document.getElementById('player-modal-body').innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
      <div style="width:46px;height:46px;border-radius:50%;background:${p.color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.2);flex-shrink:0;"></div>
      <div>
        <div style="font-family:'Kalam',cursive;font-size:24px;font-weight:700;color:var(--ocean-deep);">${escHtml(p.name)}${stickerStrip(p)}</div>
        <div style="font-size:12px;font-weight:700;color:var(--ink-light);">🎣 ${fishArr.length} fish · ⭐ ${stars} stars · 🔥 ${streak} streak</div>
      </div>
    </div>
    <div class="profile-stats">
      <div class="profile-stat"><b>${done}/${total}</b><span>tasks done</span></div>
      <div class="profile-stat"><b>${fishArr.length}</b><span>total fish</span></div>
      <div class="profile-stat"><b>${stars}</b><span>on-time ⭐</span></div>
      <div class="profile-stat"><b>${formatMinutes(focusMins)}</b><span>focus time</span></div>
    </div>
    ${(p.stickers || []).length >= STICKER_QUEEN_MIN ? `
    <div class="queen-banner"><span class="queen-badge big">👑</span>
      <div><b>Sticker Queen</b><span class="qb-sub">${(p.stickers || []).length} stickers · +${STICKER_QUEEN_BONUS} points</span></div>
    </div>` : ''}
    ${(p.socks || 0) || (p.pendingCatches || []).length ? `
    <div style="margin:10px 0 4px;">
      <div style="font-size:11px;font-weight:800;color:var(--ocean-deep);margin-bottom:4px;">🎣 On the line &amp; in the drawer</div>
      <div class="prof-buys">
        ${(p.pendingCatches || []).length ? `<div class="prof-buy"><div class="em">🪝</div><div class="nm">${p.pendingCatches.length} unopened</div></div>` : ''}
        ${(p.socks || 0) ? `<div class="prof-buy" title="${Math.max(0, pityThreshold(p) - p.socks)} more dry pulls until pity"><div class="em">🧦</div><div class="nm">${p.socks} sock${p.socks === 1 ? '' : 's'}</div></div>` : ''}
      </div>
    </div>` : ''}
    ${(p.purchases && p.purchases.length) || p.streakFixers ? `
    <div style="margin:10px 0 4px;">
      <div style="font-size:11px;font-weight:800;color:var(--ocean-deep);margin-bottom:4px;">🛍️ Purchased</div>
      <div class="prof-buys">
        ${p.streakFixers ? `<div class="prof-buy"><div class="em">🩹</div><div class="nm">${p.streakFixers} fixer${p.streakFixers === 1 ? '' : 's'}</div></div>` : ''}
        ${(p.purchases || []).map(x => `<div class="prof-buy" title="${escAttr(x.name)}">
          ${x.image ? `<img src="${escAttr(x.image)}" alt="">` : `<div class="em">${x.emoji || '🎁'}</div>`}
          <div class="nm">${escHtml(x.name)}</div>
        </div>`).join('')}
      </div>
    </div>` : ''}
    <div class="profile-focus">
      <span class="pf-emoji">⏳</span>
      <div>
        <b>${formatDurationLong(focusMins)}</b> of focus logged
        <span class="pf-sub">${sessions} pomodoro session${sessions === 1 ? '' : 's'} · 🔥 ${streak} streak · 📅 ${wcMonthChecks(pid)} check-ins this month (+${wcStreakPoints(pid).toFixed(1)} pts)</span>
      </div>
    </div>
    <div style="font-size:12px;font-weight:800;color:var(--ocean-deep);text-transform:uppercase;letter-spacing:0.04em;margin:14px 0 6px;">🏷️ Stickers ${isMe?'<span style="font-weight:600;text-transform:none;color:var(--ink-light)">(tap to equip, up to 3)</span>':''}</div>
    <div class="profile-sticker-row">${stickersHtml}</div>
    <div style="font-size:12px;font-weight:800;color:var(--ocean-deep);text-transform:uppercase;letter-spacing:0.04em;margin:14px 0 6px;">🐟 Fish collection</div>
    <div class="profile-fish-list">${fishHtml}</div>
  `;
  document.getElementById('player-modal').style.display = 'flex';
}
