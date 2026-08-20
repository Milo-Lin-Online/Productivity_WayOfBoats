// ═══════════════════════════════════════════════════════════════
//  WAY OF BOATS — 20-bank.js
//  THE FISH BANK  ·  sign in as "bank tank"
//
//  WHY A LEDGER AND NOT A BALANCE
//  ------------------------------
//  A single `bank.fish` number is the worst possible shape for this app.
//  Two people buying something at the same moment both read 100, both write
//  their own answer, and one purchase silently evaporates — the same class of
//  bug that cost everyone their fish counts earlier.
//
//  So the bank has no balance field. It has an append-only ledger of
//  transactions, each with its own id, and the balance is derived by adding
//  them up. Appends union cleanly across devices, in any order, however many
//  times they arrive. Two simultaneous purchases produce two entries and both
//  survive.
//
//  The same trick gives every player a spendable starfish balance: what they
//  have earned, minus what the ledger says they have spent.
// ═══════════════════════════════════════════════════════════════

if (typeof SINGLETONS !== 'undefined') {
  ['bankLedger', 'bankConfig', 'bankOffers'].forEach(k => {
    if (!SINGLETONS.includes(k)) SINGLETONS.push(k);
  });
}
// ledgers and offers are id-keyed lists, so they merge item by item
if (typeof ID_LIST_SINGLETONS !== 'undefined') {
  ID_LIST_SINGLETONS.bankLedger = true;
  ID_LIST_SINGLETONS.bankOffers = true;
}

const BANK_LOGIN = 'bank tank';

const BANK_DEFAULTS = {
  openingFish: 100,   // what the bank started the world with
  minBid: 8,          // the banker never offers less than this
  maxBid: 17,         // …nor more than this
  starfishPerFish: 10,// coins to the dollar
  contact: 'lin.milo@northeastern.edu',
};

function bankConfig() {
  if (!state.bankConfig || typeof state.bankConfig !== 'object') state.bankConfig = {};
  return Object.assign({}, BANK_DEFAULTS, state.bankConfig);
}
function setBankConfig(key, value) {
  if (!isAdmin()) return;
  if (!state.bankConfig || typeof state.bankConfig !== 'object') state.bankConfig = {};
  state.bankConfig[key] = value;
  save();
  renderBank();
  renderAdmin();
}

function bankLedger() {
  if (!Array.isArray(state.bankLedger)) state.bankLedger = [];
  return state.bankLedger;
}

/**
 * Record one movement of money. Positive `fish` means the bank GAINED it.
 * Never edit an entry after the fact — write a correcting one instead, the way
 * a real ledger works, so history stays merge-safe.
 */
function bankPost(kind, fish, starfish, personId, note) {
  bankLedger().push({
    id: 'bk' + Date.now() + Math.floor(Math.random() * 9999),
    at: Date.now(), kind,
    fish: Number(fish) || 0,
    starfish: Number(starfish) || 0,
    personId: personId || '',
    note: note || '',
  });
  save();
}

/** What the bank holds right now: its opening float plus everything since. */
function bankBalance() {
  const cfg = bankConfig();
  return bankLedger().reduce((s, e) => s + (e.fish || 0), cfg.openingFish);
}
function bankStarfish() {
  return bankLedger().reduce((s, e) => s + (e.starfish || 0), 0);
}

// ── a player's spendable money ────────────────────────────────
/** Catches not yet spent. Spending tombstones a uid; it never deletes. */
function spendableFish(p) {
  if (!p || !Array.isArray(p.fish)) return [];
  const spent = new Set((p.spentFish || []).map(String));
  return p.fish.filter(f => f && !spent.has(String(f.uid || fishIdentity(f))));
}

/** Tombstone these catches as spent, and tell the bank it took the money. */
function spendFish(p, catches, note) {
  if (!p) return;
  if (!Array.isArray(p.spentFish)) p.spentFish = [];
  catches.forEach(f => {
    const uid = String((f && f.uid) || fishIdentity(f));
    if (!p.spentFish.includes(uid)) p.spentFish.push(uid);
  });
  bankPost('sale', catches.length, 0, p.id, note || 'shop purchase');
}

/**
 * Starfish are earned by finishing tasks early and spent as small change.
 * Earnings live on the person; spending lives in the ledger, so the balance is
 * the difference. That keeps it depletable without a scalar that two devices
 * can fight over.
 */
function starfishEarned(p) { return Math.max(0, Number(p && p.stars) || 0); }
function starfishSpent(pid) {
  return bankLedger().reduce((s, e) =>
    (String(e.personId) === String(pid) ? s + (e.starfish || 0) : s), 0);
}
function starfishBalance(p) {
  return p ? Math.max(0, starfishEarned(p) - starfishSpent(p.id)) : 0;
}

/** Trade small change up into a whole fish. */
function cashInStarfish() {
  const me = personById(myPersonId());
  if (!me) { showToast('Set your name to a crew member first! 🪪'); return; }
  const cfg = bankConfig();
  const bal = starfishBalance(me);
  if (bal < cfg.starfishPerFish) {
    showToast(`Need ${cfg.starfishPerFish} ⭐ for one 🐟 — you have ${bal}`); return;
  }
  if (bankBalance() < 1) { showToast("The bank is out of fish right now."); return; }
  if (!Array.isArray(me.fish)) me.fish = [];
  const caught = { emoji: '🐟', name: 'Fish (cashed in)', kind: 'small',
                   minutes: 0, at: Date.now() };
  caught.uid = fishIdentity(caught);
  me.fish.push(caught);
  bankPost('exchange', -1, cfg.starfishPerFish, me.id,
           `cashed ${cfg.starfishPerFish} starfish for 1 fish`);
  save(); renderBank(); renderLeaderboard();
  showToast(`💱 ${cfg.starfishPerFish} ⭐ → 1 🐟`);
}

// ══════════════════════════════════════════════
//  SELLING AN IDEA TO THE STORE
//  A player offers artwork; the banker names a price between minBid and
//  maxBid. Accept and the fish are paid out, the offer is logged, and an
//  email is drafted so the PNG can be added to the shop by hand.
// ══════════════════════════════════════════════
function bankOffers() {
  if (!Array.isArray(state.bankOffers)) state.bankOffers = [];
  return state.bankOffers;
}

let pendingOffer = null;

function openSellModal() {
  const me = personById(myPersonId());
  if (!me) { showToast('Set your name to a crew member first! 🪪'); return; }
  pendingOffer = null;
  document.getElementById('sell-name').value = '';
  document.getElementById('sell-note').value = '';
  document.getElementById('sell-bid').innerHTML =
    '<div class="bid-idle">Describe it, then let the banker look it over.</div>';
  document.getElementById('sell-accept').style.display = 'none';
  document.getElementById('sell-modal').style.display = 'flex';
}

/** The banker sizes it up. Random, within the admin-set range. */
function requestBid() {
  const name = document.getElementById('sell-name').value.trim();
  if (!name) { showToast('Give the item a name first ✍️'); return; }
  // Clear any previous offer FIRST. Without this a refusal left the last
  // accepted-looking offer sitting in the variable, so a stale deal could still
  // be taken even though the banker had just said no.
  pendingOffer = null;
  const cfg = bankConfig();
  const lo = Math.max(1, Math.min(cfg.minBid, cfg.maxBid));
  const hi = Math.max(cfg.minBid, cfg.maxBid);
  const bid = lo + Math.floor(Math.random() * (hi - lo + 1));

  if (bankBalance() < bid) {
    document.getElementById('sell-bid').innerHTML =
      `<div class="bid-no">The bank only holds ${bankBalance()} 🐟 — it can't cover a ${bid} 🐟 offer today.</div>`;
    document.getElementById('sell-accept').style.display = 'none';
    return;
  }
  pendingOffer = { name, bid, note: document.getElementById('sell-note').value.trim() };
  document.getElementById('sell-bid').innerHTML = `
    <div class="bid-yes">
      <div class="bid-amount">${bid} 🐟</div>
      <div class="bid-line">“I'll take <b>${escHtml(name)}</b> off your hands for ${bid} fish. Fair?”</div>
    </div>`;
  document.getElementById('sell-accept').style.display = 'inline-flex';
  playSound('ding');
}

function acceptBid() {
  if (!pendingOffer) return;
  const me = personById(myPersonId());
  if (!me) return;
  const cfg = bankConfig();
  const { name, bid, note } = pendingOffer;
  if (bankBalance() < bid) { showToast("The bank can't cover that any more."); return; }

  if (!Array.isArray(me.fish)) me.fish = [];
  for (let i = 0; i < bid; i++) {
    const f = { emoji: '🐟', name: `Fish (sold ${name})`, kind: 'small', minutes: 0, at: Date.now() + i };
    f.uid = fishIdentity(f);
    me.fish.push(f);
  }
  bankPost('buy-in', -bid, 0, me.id, `bought "${name}" from ${me.name}`);

  bankOffers().push({
    id: 'of' + Date.now() + Math.floor(Math.random() * 9999),
    at: Date.now(), name, note, bid, personId: me.id, seller: me.name, listed: false,
  });

  save();
  closeModal('sell-modal');
  renderBank();
  renderLeaderboard();
  showToast(`🤝 Sold “${name}” for ${bid} 🐟`);
  // draft the note straight away rather than on a timer — the seller should
  // never be able to navigate away before it exists
  openStoreEmail(name, bid, me.name, note, cfg.contact);
}

/**
 * Draft the "please add this to the store" email.
 *
 * A mailto: link, so it opens in whatever mail app the person already uses and
 * nothing has to be sent from the page itself.
 */
function openStoreEmail(name, bid, seller, note, to) {
  const subject = `Way of Boats — new store item: ${name}`;
  const body =
`A new item has been bought by the Fish Bank and needs adding to the store.

  Item:    ${name}
  Seller:  ${seller}
  Paid:    ${bid} fish
  Notes:   ${note || '(none)'}

Attach the PNG and add it in the admin panel under Shop.

Bank balance after this purchase: ${bankBalance()} fish.`;
  lastStoreEmail = body;
  const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const box = document.getElementById('bank-email-box');
  if (box) {
    box.innerHTML = `
      <div class="bank-email">
        <b>📧 One last step</b>
        <div>Send the artwork over so it can go in the shop.</div>
        <a class="btn-primary" href="${href}">Open the email</a>
        <button class="btn-secondary" onclick="copyStoreEmail()" title="Copy the whole note to the clipboard">Copy the text</button>
      </div>`;
    box.style.display = 'block';
  }
}
/**
 * Hold the drafted note here rather than inlining it into an onclick — a
 * multi-line JSON blob inside an HTML attribute breaks the moment the text
 * contains a quote, and it made the handler checker choke too.
 */
let lastStoreEmail = '';
function copyStoreEmail() {
  if (!lastStoreEmail) return;
  try { navigator.clipboard.writeText(lastStoreEmail); showToast('📋 Copied'); }
  catch (e) { showToast('Clipboard blocked — select the text and copy it by hand.'); }
}

/** Admin marks an offer as listed once the PNG is in the shop. */
function markOfferListed(id) {
  if (!isAdmin()) return;
  const o = bankOffers().find(x => String(x.id) === String(id));
  if (!o) return;
  o.listed = !o.listed;
  save();
  renderBank();
}

// ══════════════════════════════════════════════
//  THE BANK SCREEN
// ══════════════════════════════════════════════
function isBanker() {
  return (state.myName || '').trim().toLowerCase() === BANK_LOGIN;
}
/** The bank tab shows for the banker and for admin; everyone else sells from the shop. */
function refreshBankVisibility() {
  const nav = document.getElementById('nav-bank');
  if (nav) nav.style.display = (isBanker() || isAdmin()) ? '' : 'none';
}

function renderBank() {
  const host = document.getElementById('bank-body');
  if (!host) return;
  const cfg = bankConfig();
  const me = personById(myPersonId());
  const ledger = bankLedger().slice().sort((a, b) => b.at - a.at);

  host.innerHTML = `
    <div class="bank-top">
      ${bankerArt()}
      <div class="bank-vault">
        <div class="vault-label">The vault holds</div>
        <div class="vault-fish">${bankBalance()} <span>🐟</span></div>
        <div class="vault-sub">opening float ${cfg.openingFish} · bids ${cfg.minBid}–${cfg.maxBid} 🐟
          · ${cfg.starfishPerFish} ⭐ to the 🐟</div>
      </div>
    </div>

    ${me ? `<div class="bank-wallet">
      <div><b>${escHtml(me.name)}'s wallet</b></div>
      <div class="wallet-row">
        <span title="Catches you haven't spent">${spendableFish(me).length} 🐟</span>
        <span title="Starfish earned for finishing tasks early, minus what you've spent">${starfishBalance(me)} ⭐</span>
        <button class="btn-secondary" onclick="cashInStarfish()"
          title="Trade ${cfg.starfishPerFish} starfish for one fish">💱 Cash in ${cfg.starfishPerFish} ⭐</button>
        <button class="btn-primary" onclick="openSellModal()"
          title="Offer artwork to the bank and it'll name a price">🤝 Sell something to the store</button>
      </div>
    </div>` : ''}

    <div id="bank-email-box" style="display:none"></div>

    <div class="nb-sub"><div class="nb-sub-label">🧾 Items bought from the crew</div></div>
    ${bankOffers().length ? `<div class="offer-list">${bankOffers().slice().reverse().map(o => `
      <div class="offer ${o.listed ? 'listed' : ''}">
        <div><b>${escHtml(o.name)}</b><span class="offer-by">from ${escHtml(o.seller || '')} · ${o.bid} 🐟</span></div>
        ${isAdmin()
          ? `<button class="btn-secondary" onclick="markOfferListed('${o.id}')">${o.listed ? '✓ in the shop' : 'mark as listed'}</button>`
          : `<span class="offer-tag">${o.listed ? '✓ in the shop' : 'waiting to be added'}</span>`}
      </div>`).join('')}</div>`
      : `<div class="nb-empty">Nothing bought yet.</div>`}

    <div class="nb-sub"><div class="nb-sub-label">📖 Ledger</div>
      <span style="font-size:11px;font-weight:700;color:var(--ink-light)">every movement, oldest at the bottom</span></div>
    ${ledger.length ? `<div class="ledger">${ledger.slice(0, 60).map(e => `
      <div class="led-row">
        <span class="led-when">${new Date(e.at).toLocaleDateString()}</span>
        <span class="led-what">${escHtml(e.note || e.kind)}</span>
        <span class="led-amt ${e.fish >= 0 ? 'in' : 'out'}">${e.fish >= 0 ? '+' : ''}${e.fish} 🐟</span>
      </div>`).join('')}</div>`
      : `<div class="nb-empty">No transactions yet.</div>`}`;
}

/** The banker: a fish in a suit, drawn rather than downloaded. */
function bankerArt() {
  return `<div class="banker" title="The bank's buyer. He names a price; you can always walk away.">
    <svg viewBox="0 0 150 170" aria-hidden="true">
      <ellipse cx="75" cy="160" rx="46" ry="7" class="bk-shadow"/>
      <path d="M112 96 L140 78 L140 126 Z" class="bk-tail"/>
      <path d="M30 96 q45 -34 84 0 q-39 34 -84 0 z" class="bk-suit"/>
      <path d="M72 74 q22 6 34 22 l-34 8 z" class="bk-lapel"/>
      <path d="M78 74 q-22 6 -30 22 l30 8 z" class="bk-lapel"/>
      <path d="M75 78 l9 9 -9 26 -9 -26 z" class="bk-tie"/>
      <ellipse cx="75" cy="52" rx="38" ry="31" class="bk-head"/>
      <path d="M37 30 h76 l-6 -9 h-64 z" class="bk-brim"/>
      <path d="M45 21 q30 -20 60 0 z" class="bk-hat"/>
      <circle cx="60" cy="50" r="10" class="bk-eyew"/>
      <circle cx="92" cy="50" r="10" class="bk-eyew"/>
      <circle cx="62" cy="51" r="4.5" class="bk-pupil"/>
      <circle cx="90" cy="51" r="4.5" class="bk-pupil"/>
      <path d="M50 50 h-9 M100 50 h9 M70 50 h10" class="bk-specs"/>
      <path d="M66 66 q9 7 18 0" class="bk-mouth"/>
      <path d="M40 62 q-12 6 -2 16 q9 -4 10 -12 z" class="bk-fin"/>
    </svg>
  </div>`;
}
