# WAY OF BOATS — file map

The app used to be one 7,700-line `index.html`. It's now split so you can open
the file that matches what you're changing.

**Deploy the whole folder.** Opening `index.html` on its own will show a red
error bar — it needs `css/` and `js/` beside it.

```
index.html        markup only + the module loader at the bottom
css/styles.css    all styling (design tokens live in :root at the top)
js/               nineteen modules, loaded in numbered order
```

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

Bump **one** string — `<meta name="app-version">` in `index.html`.

The loader appends `?v=<that version>` to every script and stylesheet, so a
single bump cache-busts the entire app. The in-app update checker reads the same
meta tag off the server, which is how phones learn there's a newer build.

## Why classic scripts, not ES modules

Every `onclick=` in the markup calls a global function. ES modules have their own
scope, so switching would silently break hundreds of handlers unless each one
were re-exported onto `window`. Classic scripts with `async = false` keep
execution order, keep the globals, and need no build step.
