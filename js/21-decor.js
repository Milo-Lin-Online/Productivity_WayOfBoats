// ═══════════════════════════════════════════════════════════════
//  WAY OF BOATS — 21-decor.js
//  DECORATING THE MEETING PAGE
//
//  Stickers and shop purchases can be stuck anywhere on a meeting — your own
//  block, someone else's, or the open board between them — then dragged and
//  scaled like objects on a Miro canvas.
//
//  Two things shape the data model:
//
//  1. Several people own the same item. A crown bought by Milo and a crown
//     bought by Tiana are different objects, so every placement records who
//     owns THAT copy, and the name shown above it is the owner's, not the
//     person whose column it happens to be sitting in.
//
//  2. Meetings sync as whole rows, so two people decorating at once would
//     normally clobber each other. Placements are therefore an id-keyed list
//     merged item by item, with removals recorded as graves — the same rule
//     the projects and timeline points use.
//
//  Positions are stored as PERCENTAGES of the block they live in, so a sticker
//  stays where it was put when the window is resized or a column reflows.
// ═══════════════════════════════════════════════════════════════

const DECOR_MIN_SCALE = 0.4;
const DECOR_MAX_SCALE = 4;

let decorMode = false;        // is the tray open?
let armedItem = null;         // an item picked up, waiting for somewhere to go
let decorDrag = null;         // in-flight move or resize

function decorList(m) {
  if (!m) return [];
  if (!Array.isArray(m.decor)) m.decor = [];
  return m.decor;
}

/** Everything the signed-in person owns and could stick on the page. */
function myDecorables() {
  const me = personById(myPersonId());
  if (!me) return [];
  const out = [];
  (me.stickers || []).forEach(id => {
    const it = (typeof catalogItem === 'function') ? catalogItem(id) : null;
    out.push({ itemId: id, emoji: (it && it.emoji) || '⭐', image: (it && it.image) || '',
               name: (it && it.name) || id });
  });
  (me.purchases || []).forEach(x => {
    out.push({ itemId: x.id, emoji: x.emoji || '🎁', image: x.image || '', name: x.name || x.id });
  });
  return out;
}

function toggleDecorMode(mid) {
  decorMode = !decorMode;
  armedItem = null;
  renderMeetings();
  showToast(decorMode
    ? '🎨 Pick something from the tray, then click where it should go'
    : '🎨 Decorating off');
}

function armDecorItem(itemId) {
  const found = myDecorables().find(d => String(d.itemId) === String(itemId));
  armedItem = (armedItem && armedItem.itemId === itemId) ? null : found || null;
  renderMeetings();
  if (armedItem) showToast(`Now click where “${armedItem.name}” should go`);
}

/**
 * Drop the armed item. `target` is a person's id, or 'board' for the open area,
 * and the click position becomes a percentage of that block.
 */
function placeDecor(ev, mid, target) {
  if (!decorMode || !armedItem) return;
  ev.stopPropagation();
  const m = state.meetings.find(x => String(x.id) === String(mid));
  const me = personById(myPersonId());
  if (!m || !me) return;
  const box = ev.currentTarget.getBoundingClientRect();
  const x = ((ev.clientX - box.left) / Math.max(1, box.width)) * 100;
  const y = ((ev.clientY - box.top) / Math.max(1, box.height)) * 100;

  decorList(m).push({
    id: 'dc' + Date.now() + Math.floor(Math.random() * 9999),
    itemId: armedItem.itemId,
    emoji: armedItem.emoji,
    image: armedItem.image,
    name: armedItem.name,
    ownerId: me.id,                 // whose copy this is — drives the label
    target: String(target),
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(0, Math.min(100, y)),
    scale: 1,
    z: decorList(m).length + 1,
    at: Date.now(),
    _ts: Date.now(),
  });
  armedItem = null;
  save();
  renderMeetings();
  playSound('ding');
}

/** Only the person who placed it, or admin, may move or remove it. */
function mayEditDecor(d) {
  if (!d) return false;
  if (typeof isAdmin === 'function' && isAdmin()) return true;
  return String(d.ownerId) === String(myPersonId());
}

function removeDecor(mid, decorId) {
  const m = state.meetings.find(x => String(x.id) === String(mid));
  if (!m) return;
  const d = decorList(m).find(x => String(x.id) === String(decorId));
  if (!d || !mayEditDecor(d)) { showToast("That's not yours to move."); return; }
  // record the grave, or a union merge will put it straight back
  if (typeof markDeleted === 'function') markDeleted('decor', d.id);
  m.decor = decorList(m).filter(x => String(x.id) !== String(decorId));
  save();
  renderMeetings();
}

function bumpDecorZ(mid, decorId) {
  const m = state.meetings.find(x => String(x.id) === String(mid));
  if (!m) return;
  const list = decorList(m);
  const d = list.find(x => String(x.id) === String(decorId));
  if (!d || !mayEditDecor(d)) return;
  d.z = Math.max(...list.map(x => x.z || 0)) + 1;
  d._ts = Date.now();
  save();
  renderMeetings();
}

// ── moving and scaling ────────────────────────────────────────
function startDecorDrag(ev, mid, decorId, mode) {
  const m = state.meetings.find(x => String(x.id) === String(mid));
  if (!m) return;
  const d = decorList(m).find(x => String(x.id) === String(decorId));
  if (!d || !mayEditDecor(d)) return;
  ev.preventDefault();
  ev.stopPropagation();
  const layer = ev.currentTarget.closest('.decor-layer');
  if (!layer) return;
  const box = layer.getBoundingClientRect();
  decorDrag = {
    mid, decorId, mode, box,
    startX: ev.clientX, startY: ev.clientY,
    x0: d.x, y0: d.y, s0: d.scale || 1,
    el: ev.currentTarget.closest('.decor'),
  };
  document.body.classList.add('decor-dragging');
}

function moveDecorDrag(ev) {
  if (!decorDrag) return;
  const m = state.meetings.find(x => String(x.id) === String(decorDrag.mid));
  if (!m) return;
  const d = decorList(m).find(x => String(x.id) === String(decorDrag.decorId));
  if (!d) return;

  if (decorDrag.mode === 'move') {
    const dx = ((ev.clientX - decorDrag.startX) / Math.max(1, decorDrag.box.width)) * 100;
    const dy = ((ev.clientY - decorDrag.startY) / Math.max(1, decorDrag.box.height)) * 100;
    d.x = Math.max(0, Math.min(100, decorDrag.x0 + dx));
    d.y = Math.max(0, Math.min(100, decorDrag.y0 + dy));
  } else {
    // scale from how far the corner is dragged, in pixels, so it feels the same
    // whatever size the block is
    const dist = (ev.clientX - decorDrag.startX) + (ev.clientY - decorDrag.startY);
    d.scale = Math.max(DECOR_MIN_SCALE, Math.min(DECOR_MAX_SCALE, decorDrag.s0 + dist / 90));
  }
  // paint straight onto the element mid-drag; committing to state on every
  // pointermove would re-render the whole meeting sixty times a second
  if (decorDrag.el) {
    decorDrag.el.style.left = d.x + '%';
    decorDrag.el.style.top = d.y + '%';
    decorDrag.el.style.setProperty('--s', d.scale);
  }
}

function endDecorDrag() {
  if (!decorDrag) return;
  const m = state.meetings.find(x => String(x.id) === String(decorDrag.mid));
  const d = m && decorList(m).find(x => String(x.id) === String(decorDrag.decorId));
  decorDrag = null;
  document.body.classList.remove('decor-dragging');
  if (d) { d._ts = Date.now(); save(); }
}
document.addEventListener('pointermove', moveDecorDrag);
document.addEventListener('pointerup', endDecorDrag);
document.addEventListener('pointercancel', endDecorDrag);

// ── drawing ───────────────────────────────────────────────────
/** The tray of things you own, shown while decorating is switched on. */
function decorTray(mid) {
  if (!decorMode) return '';
  const mine = myDecorables();
  return `<div class="decor-tray">
    <div class="dt-label">🎨 Your stickers &amp; purchases
      <span>click one, then click where it goes</span></div>
    ${mine.length ? `<div class="dt-items">${mine.map(d => `
      <button class="dt-item ${armedItem && armedItem.itemId === d.itemId ? 'armed' : ''}"
        onclick="armDecorItem('${escAttr(d.itemId)}')" title="${escAttr(d.name)}">
        ${d.image ? `<img src="${escAttr(d.image)}" alt="">` : `<span>${d.emoji}</span>`}
      </button>`).join('')}</div>`
      : `<div class="dt-empty">Nothing to place yet — buy something from the shop.</div>`}
  </div>`;
}

/**
 * One positioned layer's worth of decorations. Called for each person column
 * and once for the board, with `target` naming which.
 */
function decorLayer(m, target) {
  const items = decorList(m).filter(d => String(d.target) === String(target));
  const armed = decorMode && armedItem;
  return `<div class="decor-layer ${armed ? 'armed' : ''} ${decorMode ? 'on' : ''}"
      onclick="placeDecor(event, ${m.id}, '${escAttr(String(target))}')">
    ${items.map(d => {
      const owner = personById(d.ownerId);
      const mine = mayEditDecor(d);
      return `<div class="decor ${mine && decorMode ? 'editable' : ''}"
          style="left:${d.x}%;top:${d.y}%;--s:${d.scale || 1};z-index:${d.z || 1}"
          onpointerdown="${mine && decorMode ? `startDecorDrag(event, ${m.id}, '${d.id}', 'move')` : ''}"
          title="${escAttr(d.name + (owner ? ' — ' + owner.name + "'s" : ''))}">
        <div class="decor-name" style="${owner && owner.color ? 'background:' + owner.color : ''}">
          ${escHtml(owner ? owner.name : 'someone')}</div>
        <div class="decor-art">${d.image
          ? `<img src="${escAttr(d.image)}" alt="${escAttr(d.name)}">`
          : `<span>${d.emoji || '🎁'}</span>`}</div>
        ${mine && decorMode ? `
          <button class="decor-x" onclick="event.stopPropagation(); removeDecor(${m.id}, '${d.id}')"
            title="Remove this">×</button>
          <button class="decor-up" onclick="event.stopPropagation(); bumpDecorZ(${m.id}, '${d.id}')"
            title="Bring to the front">↑</button>
          <div class="decor-grip" onpointerdown="startDecorDrag(event, ${m.id}, '${d.id}', 'scale')"
            title="Drag to resize"></div>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}
