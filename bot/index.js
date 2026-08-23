// ═══════════════════════════════════════════════════════════════
//  Way of Boats Bot — Discord bot for the #glitch-things channel
//
//  Listens in one channel for a strict command and adjusts a player's fish or
//  stars on the website:
//
//      !fix <name> <fish|star> <±N>
//
//  Examples:
//      !fix Alice fish +3
//      !fix Bob star -2
//      !fix "Mary Jane" fish -1
//
//  Feedback is react-only: ✅ applied, ❌ something was wrong (the reason is
//  printed to the console for debugging).
// ═══════════════════════════════════════════════════════════════
'use strict';

require('dotenv').config();
const { Client, GatewayIntentBits, Events, Partials } = require('discord.js');
const { makeClient, applyChange } = require('./boats');

const {
  DISCORD_TOKEN,
  DISCORD_CHANNEL = 'glitch-things',
  SUPABASE_URL,
  SUPABASE_KEY,
  SUPABASE_ROOM,
} = process.env;

for (const [k, v] of Object.entries({ DISCORD_TOKEN, SUPABASE_URL, SUPABASE_KEY, SUPABASE_ROOM })) {
  if (!v) {
    console.error(`Missing required env var: ${k}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
}

const OK = '✅';
const FAIL = '❌';

const sb = makeClient(SUPABASE_URL, SUPABASE_KEY);

// !fix  <"quoted name" | bareword>  <fish|star(+plurals)>  <signed int>
const CMD = /^!fix\s+(?:"([^"]+)"|(\S+))\s+(fish|fishes|star|stars)\s+([+-]?\d+)\s*$/i;

function parse(content) {
  const m = content.trim().match(CMD);
  if (!m) return null;
  const name = (m[1] || m[2]).trim();
  const item = m[3].toLowerCase().startsWith('star') ? 'star' : 'fish';
  const delta = parseInt(m[4], 10);
  if (!Number.isFinite(delta) || delta === 0) return null;
  return { name, item, delta };
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // privileged — enable it in the Dev Portal
  ],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}. Listening in #${DISCORD_CHANNEL} for "!fix ..." commands.`);
});

client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot) return;
  if (!msg.channel || msg.channel.name !== DISCORD_CHANNEL) return;
  if (!msg.content.toLowerCase().startsWith('!fix')) return;

  const parsed = parse(msg.content);
  if (!parsed) {
    console.log(`[reject] bad syntax: ${msg.content}`);
    return react(msg, FAIL);
  }

  const { name, item, delta } = parsed;
  try {
    const res = await applyChange(sb, SUPABASE_ROOM, name, item, delta);
    if (!res.ok) {
      console.log(`[reject] ${res.reason}: name="${name}" item=${item} delta=${delta}`);
      return react(msg, FAIL);
    }
    console.log(
      `[ok] ${res.name}: ${item} ${delta >= 0 ? '+' : ''}${delta} → ${res.newValue}`
    );
    return react(msg, OK);
  } catch (err) {
    console.error('[error] write failed:', err.message || err);
    return react(msg, FAIL);
  }
});

async function react(msg, emoji) {
  try {
    await msg.react(emoji);
  } catch (e) {
    console.error('could not add reaction:', e.message || e);
  }
}

client.login(DISCORD_TOKEN);
