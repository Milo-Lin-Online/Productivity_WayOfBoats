// ═══════════════════════════════════════════════════════════════
//  WAY OF BOATS — 08-shop.js
//  StoreCatalog class, the fish market, purchases
//
//  Loaded in numbered order by index.html. These are classic scripts,
//  not ES modules, so every function stays global and the inline
//  onclick= handlers in the markup keep working unchanged.
// ═══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════
// FISH MARKET — spend caught fish on profile stickers
// ══════════════════════════════════════════════
// 9 items. "special" = shiny/animated, costs more. id must stay stable.
const MARKET_ITEMS = [
  { id: 'st_star',    emoji: '🌟', name: 'Gold Star',      cost: 3,  special: false },
  { id: 'st_heart',   emoji: '💖', name: 'Sparkle Heart',  cost: 3,  special: false },
  { id: 'st_crown',   emoji: '👑', name: 'Crown',          cost: 4,  special: false },
  { id: 'st_rocket',  emoji: '🚀', name: 'Rocket',         cost: 4,  special: false },
  { id: 'st_rainbow', emoji: '🌈', name: 'Rainbow',        cost: 5,  special: false },
  { id: 'st_fire',    emoji: '🔥', name: 'Blazing Flame',  cost: 6,  special: true },
  { id: 'st_diamond', emoji: '💎', name: 'Shiny Diamond',  cost: 8,  special: true },
  { id: 'st_trophy',  emoji: '🏆', name: 'Champion Cup',   cost: 10, special: true },
  { id: 'st_whale',   emoji: '🐋', name: 'Legendary Whale', cost: 12, special: true }
];
// The Streak Fixer is permanent — it always occupies the first of the nine
// slots and the admin can't remove it. Buying one banks a token that is spent
// automatically the first time you'd otherwise lose a streak.
const STREAK_FIXER = { id: 'st_fixer', emoji: '🩹', name: 'Streak Fixer', cost: 5,
                       special: true, consumable: true, permanent: true,
                       blurb: 'Saves one missed day' };

const STORE_SLOTS = 9;
// What sits on the shelf by default. Anything in MARKET_ITEMS that isn't listed
// here still EXISTS (people keep what they bought) — it's just not for sale.
const DEFAULT_SHELF_IDS = ['st_star', 'st_heart', 'st_crown', 'st_fire',
                           'st_diamond', 'st_trophy', 'st_whale'];

/**
 * Two different questions get asked about a shop item, and conflating them is
 * what made the Legendary Whale vanish from people's names:
 *
 *   "can I buy this?"  → the SHELF   (what's on sale right now)
 *   "what is this?"    → the CATALOG (everything that has ever existed)
 *
 * Owned stickers are looked up in the catalog, so taking something off the
 * shelf never erases it from the people who already paid for it.
 */
class StoreCatalog {
  constructor(defaults, permanent) {
    this.defaults = defaults;
    this.permanent = permanent;
  }

  /** Items currently for sale — permanent first, then the admin's list. */
  get shelf() {
    const custom = Array.isArray(state.storeItems)
      ? state.storeItems
      : this.defaults.filter(i => DEFAULT_SHELF_IDS.includes(i.id));
    return [this.permanent]
      .concat(custom.filter(i => i && i.id !== this.permanent.id))
      .slice(0, STORE_SLOTS);
  }

  /** How many slots are still free. */
  get freeSlots() { return Math.max(0, STORE_SLOTS - this.shelf.length); }

  /** Everything that has ever been purchasable, on sale or not. */
  get all() {
    const seen = new Map();
    [this.permanent].concat(this.defaults, Array.isArray(state.storeItems) ? state.storeItems : [])
      .forEach(i => { if (i && !seen.has(i.id)) seen.set(i.id, i); });
    return [...seen.values()];
  }

  /** Look an item up anywhere in the catalog. Use this for DISPLAY. */
  find(id) { return this.all.find(i => i.id === id) || null; }

  /** Look an item up on the shelf only. Use this for BUYING. */
  onShelf(id) { return this.shelf.find(i => i.id === id) || null; }

  isOpen() { return state.storeEnabled !== false; }
}

const Shop = new StoreCatalog(MARKET_ITEMS, STREAK_FIXER);

// thin wrappers so the rest of the app (and inline handlers) read naturally
function getStoreItems() { return Shop.shelf; }
function storeIsOpen()   { return Shop.isOpen(); }
function marketItem(id)  { return Shop.onShelf(id); }   // buying
function catalogItem(id) { return Shop.find(id); }      // display

function renderMarket() {
  const shelf = document.getElementById('market-shelf');
  const bal = document.getElementById('market-balance');
  const card = document.getElementById('market-card');
  if (!shelf) return;

  // Admin can close the shop. Admins still see it (greyed) so they can reopen it.
  if (card) card.style.display = (storeIsOpen() || isAdmin()) ? '' : 'none';
  const closedNote = document.getElementById('market-closed');
  if (closedNote) closedNote.style.display = storeIsOpen() ? 'none' : 'block';

  const myId = myPersonId();
  const me = myId ? personById(myId) : null;
  const fishCount = me ? (me.fish || []).length : 0;
  const owned = (me && me.stickers) || [];
  const purchases = (me && me.purchases) || [];
  if (bal) bal.innerHTML = `🎣 ${fishCount} fish` + (me && me.streakFixers ? ` · 🩹 ${me.streakFixers}` : '');

  shelf.innerHTML = getStoreItems().map(item => {
    const isConsumable = !!item.consumable;
    const boughtCount = isConsumable
      ? (item.id === STREAK_FIXER.id ? ((me && me.streakFixers) || 0) : 0)
      : 0;
    const isOwned = !isConsumable && (owned.includes(item.id) || purchases.some(x => x.id === item.id));
    const canAfford = fishCount >= item.cost;
    const shut = !storeIsOpen();
    const btn = shut
      ? `<div class="market-locked">shop closed</div>`
      : !me
        ? `<div class="market-locked">set your name to buy</div>`
        : isOwned
          ? `<div class="market-owned">✓ Owned</div>`
          : `<button class="market-buy ${canAfford?'':'disabled'}" ${canAfford?'':'disabled'} onclick="buyMarketItem('${item.id}')">🎣 ${item.cost}</button>`;
    const art = item.image
      ? `<img class="market-img" src="${escAttr(item.image)}" alt="${escAttr(item.name)}">`
      : `<div class="market-emoji ${item.special?'shiny':''}">${item.emoji || '🎁'}</div>`;
    return `<div class="market-item ${item.special?'special':''} ${isOwned?'is-owned':''}">
      ${item.permanent ? '<div class="market-badge">♾️ always here</div>' : (item.special ? '<div class="market-badge">✨ special</div>' : '')}
      ${art}
      <div class="market-name">${escHtml(item.name)}</div>
      ${item.blurb ? `<div class="market-blurb">${escHtml(item.blurb)}</div>` : ''}
      ${boughtCount ? `<div class="market-count">you have ${boughtCount}</div>` : ''}
      ${btn}
    </div>`;
  }).join('');
}

function buyMarketItem(id) {
  if (!storeIsOpen()) { showToast('The shop is closed right now.'); return; }
  const myId = myPersonId();
  if (!myId) { showToast('Set your name to a crew member first! 🪪'); return; }
  const me = personById(myId);
  const item = marketItem(id);
  if (!item) return;
  if (!me.stickers) me.stickers = [];
  if (!me.purchases) me.purchases = [];
  const alreadyOwned = !item.consumable &&
    (me.stickers.includes(id) || me.purchases.some(x => x.id === id));
  if (alreadyOwned) { showToast('You already own that one!'); return; }

  const fish = me.fish || [];
  if (fish.length < item.cost) { showToast(`Not enough fish — need ${item.cost} 🎣`); return; }
  // spend the fish: remove `cost` fish, preferring plain ones first so the
  // consistency fish that carry leaderboard weight are spent last
  const spendOrder = fish.map((f, idx) => ({ f, idx }))
    .sort((a, b) => (a.f.fromStreak?1:0) - (b.f.fromStreak?1:0));
  const removeIdx = new Set(spendOrder.slice(0, item.cost).map(o => o.idx));
  me.fish = fish.filter((f, idx) => !removeIdx.has(idx));

  if (item.id === STREAK_FIXER.id) {
    me.streakFixers = (me.streakFixers || 0) + 1;
    showToast(`🩹 Streak Fixer bought — you now have ${me.streakFixers}. It'll spend itself the next time you'd lose a streak.`);
  } else if (item.custom) {
    // admin-made collectible: kept as a trophy on the profile, not equippable
    me.purchases.push({ id: item.id, name: item.name, image: item.image || '', emoji: item.emoji || '🎁', at: Date.now() });
    showToast(`🛍️ Bought ${item.name}! It's on your profile.`);
  } else {
    me.stickers.push(id);
    showToast(`🛍️ Bought ${item.name}! Equip it from your profile.`);
  }
  playSound('ding');
  save();
  renderMarket();
  renderLeaderboard();
}

// equip/unequip stickers (called from the player profile). Max 3 shown on profile.
function toggleSticker(pid, id) {
  const p = personById(pid);
  if (!p) return;
  if (!p.activeStickers) p.activeStickers = [];
  const i = p.activeStickers.indexOf(id);
  if (i > -1) { p.activeStickers.splice(i, 1); }
  else {
    if (p.activeStickers.length >= 3) { showToast('You can show up to 3 stickers — remove one first.'); return; }
    p.activeStickers.push(id);
  }
  save();
  openPlayerProfile(pid);   // re-render the profile
  renderLeaderboard();
}
// small helper: the emoji string for a person's equipped stickers
function stickerStrip(p) {
  const act = (p.activeStickers || []).map(id => catalogItem(id)).filter(Boolean);
  if (!act.length) return '';
  return ' ' + act.map(it => `<span class="sticker-badge ${it.special?'shiny':''}" title="${escAttr(it.name)}">${it.emoji}</span>`).join('');
}

function renderWorldCup() {
  renderMarket();
  reconcileStreaks();
  const table = document.getElementById('worldcup-table');
  if (!table) return;
  const today = estDateKey();
  const mk = estMonthKey();
  const myId = myPersonId();

  if (state.people.length === 0) {
    table.innerHTML = `<tr><td style="padding:20px;text-align:center;color:var(--ink-light);font-weight:600;">No crew yet — add people in "Edit People" to start the World Cup!</td></tr>`;
    return;
  }

  // Each person has their own categories, so render a card per sailor.
  const ranked = visiblePeople().map(p => {
    const wc = p.wc || {};
    const cats = getWcCategories(p.id);
    const total = cats.reduce((s, c) => s + ((wc[c.id] && wc[c.id].streak) || 0), 0);
    return { p, total, cats };
  }).sort((a,b) => b.total - a.total);

  const cards = ranked.map(({ p, total, cats }) => {
    const wc = p.wc || {};
    const isMe = p.id === myId;
    const chips = cats.map(c => {
      const rec = wc[c.id] || { streak: 0, last: null, monthCounts: {} };
      const checkedToday = rec.last === today;
      const monthCount = (rec.monthCounts && rec.monthCounts[mk]) || 0;
      const nearFish = monthCount > 0 ? ` · ${monthCount}/26 this month (+${(monthCount / 10).toFixed(1)} pts)` : '';
      return `<div class="wc-chip">
        <button class="wc-check ${checkedToday ? 'checked' : ''}" ${isMe ? '' : 'disabled'}
          onclick="wcCheckIn('${c.id}')" title="${isMe ? 'Check in for today' : 'Only ' + escAttr(p.name) + ' can check this'}">${checkedToday ? '✓' : ''}</button>
        <span class="wc-chip-label" style="display:inline-flex;align-items:center;gap:5px;">${wcShapeSvg(c.shape||'circle', c.color||'#3B9BD4', 16)} ${escHtml(c.label)}</span>
        <span class="wc-streak">${rec.streak || 0}🔥<span style="font-size:9px;color:var(--ink-light);font-weight:700">${nearFish}</span></span>
      </div>`;
    }).join('');
    return `<div class="wc-card ${isMe ? 'wc-me' : ''}">
      <div class="wc-card-head">
        <span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${p.color};margin-right:6px;"></span>${escHtml(p.name)}${isMe ? ' <span style="font-size:10px;color:var(--ocean)">(you)</span>' : ''}</span>
        <span style="display:flex; align-items:center; gap:8px;">
          <b>${total}🔥 total</b>
          ${isMe ? `<button class="thing-add" onclick="openWcCategoriesModal()" title="Edit your categories">⚙️ my goals</button>` : ''}
        </span>
      </div>
      <div class="wc-chips">${chips || '<span style="font-size:12px;color:var(--ink-light)">No categories yet.</span>'}</div>
    </div>`;
  }).join('');

  // render inside the same container (as a block, not an actual table)
  table.outerHTML = `<div id="worldcup-table" class="wc-cards">${cards}</div>`;
}

// ── WC categories editor (edits the CURRENT USER's own goals) ──
function openWcCategoriesModal() {
  const myId = myPersonId();
  if (!myId) { showToast('Set your name to a crew member first! 🪪'); return; }
  const list = document.getElementById('wc-categories-list');
  list.innerHTML = getWcCategories(myId).map(c => {
    const color = c.color || '#3B9BD4';
    const shape = c.shape || 'circle';
    const shapeOpts = WC_SHAPES.map(s => `<option value="${s}" ${s===shape?'selected':''}>${s}</option>`).join('');
    return `
    <div style="display:flex; gap:8px; align-items:center; background:var(--ocean-pale); padding:8px; border-radius:12px;" data-cid="${c.id}">
      <span class="wc-shape-preview" style="width:24px;display:flex;justify-content:center;">${wcShapeSvg(shape, color, 22)}</span>
      <select class="form-input wc-shape" style="width:92px; font-size:12px; padding:6px" onchange="previewWcShape(this)">${shapeOpts}</select>
      <input type="color" class="color-input wc-color" value="${color}" title="Shape color" oninput="previewWcShape(this)">
      <input class="form-input wc-label" style="flex:1" value="${escAttr(c.label)}" placeholder="Habit name">
      <button class="task-delete" onclick="removeWcCategory('${c.id}')">×</button>
    </div>`;
  }).join('');
  document.getElementById('wc-categories-modal').style.display = 'flex';
}
function previewWcShape(el) {
  const row = el.closest('[data-cid]');
  const shape = row.querySelector('.wc-shape').value;
  const color = row.querySelector('.wc-color').value;
  const prev = row.querySelector('.wc-shape-preview');
  if (prev) prev.innerHTML = wcShapeSvg(shape, color, 22);
}
function commitWcInputs() {
  const rows = document.querySelectorAll('#wc-categories-list [data-cid]');
  const updated = [];
  rows.forEach(row => {
    const id = row.getAttribute('data-cid');
    const shape = row.querySelector('.wc-shape').value || 'circle';
    const color = row.querySelector('.wc-color').value || '#3B9BD4';
    const label = row.querySelector('.wc-label').value.trim();
    if (label) updated.push({ id, shape, color, label });
  });
  return updated;
}
function addWcCategory() {
  const myId = myPersonId(); if (!myId) return;
  const cur = commitWcInputs();
  const pal = ['#E8536A','#3B9BD4','#7AAF72','#FF7A3C','#C9B8E8'];
  cur.push({ id: 'wc' + Date.now() + Math.floor(Math.random()*999), shape: WC_SHAPES[cur.length % WC_SHAPES.length], color: pal[cur.length % pal.length], label: '' });
  setWcCategories(myId, cur);
  openWcCategoriesModal();
  setTimeout(() => { const l = document.querySelectorAll('.wc-label'); if (l.length) l[l.length-1].focus(); }, 30);
}
function removeWcCategory(id) {
  const myId = myPersonId(); if (!myId) return;
  let cats = commitWcInputs().filter(c => c.id !== id);
  if (cats.length === 0) cats = [{ id: 'wc_move', emoji: '🏃', label: 'Move' }];
  setWcCategories(myId, cats);
  openWcCategoriesModal();
}
function saveWcCategories() {
  const myId = myPersonId(); if (!myId) return;
  const updated = commitWcInputs();
  if (updated.length === 0) { showToast('Keep at least one category!'); return; }
  setWcCategories(myId, updated);
  save();
  closeModal('wc-categories-modal');
  renderWorldCup();
  showToast('Your goals saved! ⚙️');
}
function resetWcCategories() {
  const myId = myPersonId(); if (!myId) return;
  setWcCategories(myId, JSON.parse(JSON.stringify(DEFAULT_WC_CATEGORIES)));
  save();
  openWcCategoriesModal();
  showToast('Your goals reset ↺');
}
