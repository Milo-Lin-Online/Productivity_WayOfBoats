# WAY OF BOATS — file map

The app is **edited as modules** and **deployed as one file**.

```
way-of-boats/          <- edit in here
  index.html             markup + a module loader
  css/styles.css         all styling
  js/*.js                nineteen modules, numbered = load order
  build.py               bundles the above into a single file

index.html             <- upload THIS (built by build.py)
```

## The loop

1. Edit a module in `way-of-boats/`
2. `cd way-of-boats && python3 build.py`
3. Upload the `index.html` it writes one level up

That single file has the CSS and all nineteen modules inlined, so it works on
its own exactly like the original did — nothing else needs uploading.

You can also open `way-of-boats/index.html` directly while developing to skip
the build step, as long as you serve the folder (`python3 -m http.server`).
Opening it from `file://` works too.

| file | what's in it |
|---|---|
| `01-config.js` | Theme colours, workspace names, the `state` shape |
| `02-persist.js` | `save()`, app-update checks, Supabase sync + stale-data guards |
| `03-navigation.js` | `showSection()`, live cursors |
| `04-meetings.js` | Meetings, checklists, meeting-linked tasks |
| `05-tasks.js` | Task board: filters, search, sorting, subtasks |
| `06-admin.js` | Admin console: overrides, resets, shop management |
| `07-worldcup.js` | Daily streak tracker, check-ins, streak fixer |
| `08-shop.js` | `StoreCatalog` class, fish market, purchases |
| `09-leaderboard.js` | Points formula, ranking, player profiles |
| `10-charts.js` | Time-by-activity pie |
| `11-people.js` | My name, online roster, shared helpers |
| `12-effects.js` | Sound, floating fish, boats, message board |
| `13-pomodoro.js` | Focus timer + the fish you can catch |
| `14-notes.js` | Notes-to-self notebook, pinned tasks |
| `15-logs.js` | Day logs — the 2am→2am timeline and archive |
| `16-timeline-drag.js` | Drag / resize / drag-to-create on timelines |
| `17-focus-bank.js` | Lifetime focus minutes, pomodoro panel + tooltip |
| `18-calendar.js` | Content calendar, posts, reminders |
| `19-boot.js` | Start-up sequence — always runs last |

## Common edits

- **Points formula** → `09-leaderboard.js`, search `const points =`
- **Shop contents** → `08-shop.js`, `DEFAULT_SHELF_IDS`
- **Colours / theme** → `01-config.js` (`CONFIG.colors`) or `:root` in `styles.css`
- **Streak rules** → `07-worldcup.js`

## Releasing a new version

Bump **one** string — `<meta name="app-version">` in `way-of-boats/index.html` —
then run `build.py`. The in-app update checker reads that meta tag off the
server, which is how phones learn there's a newer build waiting.

## Why classic scripts, not ES modules

Every `onclick=` in the markup calls a global function. ES modules have their own
scope, so switching would silently break hundreds of handlers unless each one
were re-exported onto `window`. Classic scripts with `async = false` keep
execution order, keep the globals, and need no build step.
