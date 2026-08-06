# Deploying on GitHub Pages

## Why your versions look scrambled

Three different builds have been in play:

| you saw | what it is |
|---|---|
| `2026.08.02-3` (live site) | the log-scroll-fix build, several turns old |
| `2026.08.03-1` (local file) | the first gacha build |
| `2026.08.06-1` | **current — the only one you should keep** |

Nothing is broken. You had older downloads sitting around. Delete every other
copy so there's nothing left to confuse.

## What GitHub Pages does that other hosts don't

**It ignores `_headers`, `vercel.json` and `.htaccess`.** Those files are in the
folder for portability; on Pages they do nothing. There is no way to set
`Cache-Control` on GitHub Pages.

**It serves `index.html` through a CDN with a ~10 minute cache.** After you
push, the old page can keep appearing for up to ten minutes no matter how hard
you refresh.

**It runs Jekyll**, which silently refuses to publish files and folders starting
with an underscore. The `.nojekyll` file in this folder switches that off. Keep
it — without it, `_headers` wouldn't even upload.

## So how do updates land?

The app updates itself. On load it fetches its own `index.html` with a unique
`?_cb=` timestamp, which defeats both the browser cache **and** the GitHub CDN,
compares the served version against the running one, and reloads into the new
build if they differ.

That means: push, wait a few minutes, and open the site. It should correct
itself without you doing anything.

If it can't — because the CDN is still inside its 10-minute window — it stops
after one attempt and shows a banner saying exactly that, rather than reloading
in a loop.

## Deploying

1. Delete everything currently in the repo (or at least the old `index.html`)
2. Copy in **all** of this folder, keeping the structure:
   ```
   index.html   .nojekyll   css/styles.css   js/*.js  (19 files)
   ```
3. Commit and push
4. Wait ~1 minute for the Pages build, then open the site

## Checking it worked

Look at the bottom of the sidebar. It should read **v2026.08.06-1**.

If it doesn't after a few minutes, tap **⟳ Force update**. If it still doesn't,
the CDN is inside its cache window — wait it out, it will clear.

## Supabase

Nothing here affects your sync. The stale-data protections still apply: no
device pushes until it has read the room, admin resets carry an epoch that
outranks older data, and personal logs merge instead of overwriting.
