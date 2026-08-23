// ═══════════════════════════════════════════════════════════════
//  boats.js — the only file that knows how the website stores data.
//
//  The site syncs through Supabase: table `boats_items`, one row per person,
//  keyed `people:<id>`, with the WHOLE person object in the `data` column.
//  Everyone's fish and stars live there.
//
//  The safe way to change someone from the outside is to behave exactly like
//  the in-app admin console does (js/06-admin.js):
//    • fish  — add/remove `{ fromAdmin: true }` fish objects
//    • stars — clamp the scalar into range
//    • BUMP scoreEpoch — this is what makes the change authoritative. When a
//      people row arrives carrying a newer scoreEpoch than a browser's copy,
//      the browser takes the row WHOLE instead of union-merging its own stale
//      numbers back in (js/02-persist.js, applyItemRowInner). Without this, a
//      fish REMOVAL would be undone by any tab that still remembered the fish.
// ═══════════════════════════════════════════════════════════════
'use strict';

const { createClient } = require('@supabase/supabase-js');

// Same clamps the admin console uses (js/06-admin.js).
const STAR_MAX = 9999;
const FISH_MAX = 999;

function clampInt(v, lo, hi) {
  v = Math.round(Number(v) || 0);
  return Math.max(lo, Math.min(hi, v));
}

function makeClient(url, key) {
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Every person row in the room, so we can match by the website `name`.
 * People live in the shared room (not the private per-person rooms), so a plain
 * room filter is enough.
 */
async function findPeopleByName(sb, room, name) {
  const { data, error } = await sb
    .from('boats_items')
    .select('item_key, data')
    .eq('room', room)
    .like('item_key', 'people:%');
  if (error) throw error;
  const want = String(name).trim().toLowerCase();
  return (data || []).filter(
    (r) => r.data && String(r.data.name || '').trim().toLowerCase() === want
  );
}

function addFish(p, count) {
  if (!Array.isArray(p.fish)) p.fish = [];
  const base = Date.now();
  for (let i = 0; i < count; i++) {
    // `at` must be unique so the union-merge never dedupes two granted fish.
    p.fish.push({ emoji: '🐟', name: 'Granted by admin', minutes: 0, at: base + i, fromAdmin: true });
  }
}

function removeFish(p, count) {
  if (!Array.isArray(p.fish)) p.fish = [];
  let toRemove = Math.min(count, p.fish.length);
  while (toRemove-- > 0) {
    // Prefer removing admin-granted fish first, exactly like adminSetFish.
    const i = p.fish.findIndex((f) => f.fromAdmin);
    p.fish.splice(i > -1 ? i : p.fish.length - 1, 1);
  }
}

/**
 * Apply a signed change to one player's fish or stars.
 * Returns { ok, reason?, name?, item, newValue? }.
 */
async function applyChange(sb, room, name, item, delta) {
  const rows = await findPeopleByName(sb, room, name);
  if (rows.length === 0) return { ok: false, reason: 'no-match', item };
  if (rows.length > 1) return { ok: false, reason: 'ambiguous', item };

  const row = rows[0];
  const p = row.data;
  const now = Date.now();

  if (item === 'star') {
    p.stars = clampInt((p.stars || 0) + delta, 0, STAR_MAX);
    p._ts = p._ts || {};
    p._ts.stars = now;
  } else {
    // fish
    if (!Array.isArray(p.fish)) p.fish = [];
    const target = clampInt(p.fish.length + delta, 0, FISH_MAX);
    const diff = target - p.fish.length;
    if (diff > 0) addFish(p, diff);
    else if (diff < 0) removeFish(p, -diff);
    p._ts = p._ts || {};
    p._ts.fish = now;
  }

  // The bit that makes it stick everywhere: a newer epoch => browsers take the
  // whole row rather than merging their stale copy back in.
  p.scoreEpoch = now;

  const { error } = await sb
    .from('boats_items')
    .upsert({ room, item_key: row.item_key, data: p, updated_at: now });
  if (error) throw error;

  return {
    ok: true,
    name: p.name,
    item,
    newValue: item === 'star' ? p.stars : p.fish.length,
  };
}

module.exports = { makeClient, applyChange, findPeopleByName };
