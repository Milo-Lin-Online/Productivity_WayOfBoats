# Way of Boats Bot

A tiny Discord bot that lets you correct a player's **fish** or **stars** on the
website from a Discord channel. It writes straight into the same Supabase room
the site syncs through, so changes appear in every open browser within seconds.

## Command

In the `#glitch-things` channel:

```
!fix <name> <fish|star> <±N>
```

| Example                | Effect                                        |
|------------------------|-----------------------------------------------|
| `!fix Alice fish +3`   | give Alice 3 more fish                         |
| `!fix Bob star -2`     | take 2 stars off Bob                           |
| `!fix "Mary Jane" fish -1` | quote names that contain spaces           |

- `<name>` matches the player's **website name** (case-insensitive). Names with
  spaces must be `"quoted"`.
- `<item>` is `fish` or `star` (plurals accepted).
- `<±N>` is a signed whole number. A bare `5` counts as `+5`. `0` is ignored.

Feedback is **reactions only**:

- ✅ applied
- ❌ something was wrong — unknown/ambiguous name, bad syntax, or a write error.
  The reason is printed to the bot's console.

Values are clamped the same way the in-app admin console clamps them:
stars `0–9999`, fish `0–999`.

## How it works (and why it's safe)

Each player is one row in Supabase's `boats_items` table, keyed `people:<id>`,
holding the whole person object. The bot:

1. Finds the row whose `data.name` matches.
2. Adjusts `fish` (adds/removes `fromAdmin` fish) or `stars`.
3. Sets `scoreEpoch = Date.now()`.

That last step is the important one: when a player row arrives with a newer
`scoreEpoch`, every browser **takes it whole** instead of merging its own copy
back in. This is the exact "admin correction outranks everything" path the app
already uses, so removals stick and nothing gets double-counted.

## Setup

### 1. Create the Discord bot

1. Go to <https://discord.com/developers/applications> → **New Application**.
   Name it **Way of Boats Bot**.
2. **Bot** tab → **Add Bot**. Set the bot's **username** to `Way of Boats Bot`
   (this is the name that shows in Discord). Copy the **token** (for
   `DISCORD_TOKEN`).
3. Under **Privileged Gateway Intents**, enable **Message Content Intent**.
   (The bot needs to read message text to parse commands.)
4. **OAuth2 → URL Generator**: scope `bot`; permissions **View Channels**,
   **Read Message History**, **Add Reactions**. Open the generated URL to invite
   the bot to your server, and make sure it can see `#glitch-things`.

### 2. Get the Supabase values

Open the website, open its **Sync settings** dialog, and copy the **URL**,
**key**, and **room** into `.env`. These are the same values the browsers use.

### 3. Run it

```bash
cd bot
cp .env.example .env      # then fill in .env
npm install
npm start
```

You should see `Logged in as ... Listening in #glitch-things`. Post a command in
the channel and watch for the ✅.

## Keeping it running

`npm start` runs in the foreground. For always-on, run it under a process
manager (`pm2 start index.js --name glitch-things`) or deploy to a small host like
Railway, Render, or Fly.io — set the same env vars there.
