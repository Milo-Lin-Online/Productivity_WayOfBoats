# Data audit — every system that stores something

Generated from the code, not from memory. `check.py` re-runs the mechanical
parts of this on every build.

## The rule

> Nobody's score is ever deleted by someone else's device.

Three shapes of data, three merge rules:

| shape | examples | rule |
|---|---|---|
| **Ledger** — things accumulate | fish, purchases, stickers, logs | **union by stable id.** Recorded anywhere, survives everywhere. Order-independent, so every device lands on the same answer. |
| **Scalar** — one current value | stars, focus minutes, name, colour | **newest write wins, by per-field timestamp.** A decrease sticks, so admin can correct downward. |
| **Keyed list** — collections of records | projects, timeline points, shop items, activity types, statuses | **merge item by item**, newest edit wins per item, **deletions stick** via tombstones. |

Plus two overrides:

- **Ownership** — a device may only write its own person row. Admin may write any.
- **Admin epoch** — a row stamped after an admin correction is taken whole; a row
  stamped before it hands over only its harmless fields.

---

## Every system, and how it's handled

| system | lives in | shape | merge | verified |
|---|---|---|---|---|
| **Fish caught** | `p.fish[]` | ledger | union by content id | 1–4 |
| **Gacha catches waiting** | `p.pendingCatches[]` | ledger | union, minus opened tombstones | 15, 16 |
| **Opened catches** | `p.openedCatches[]` | ledger | union — stops a re-payout | 15 |
| **Pity socks** | `p.socks` | scalar | newest write | 17, 18 |
| **Streak fixers** | `p.streakFixers` | scalar | newest write | — |
| **Purchases** | `p.purchases[]` | ledger | union by item id | 5 |
| **Stickers owned** | `p.stickers[]` | ledger | union set | 6 |
| **Stickers equipped** | `p.activeStickers` | scalar | newest write | — |
| **World Cup streaks** | `p.wc{cat}` | keyed | latest check-in wins; tallies take the higher | 7, 8, 9 |
| **World Cup categories** | `state.wcCategories{pid}` | per-person map | you own yours, they own theirs | 10, 11 |
| **Day logs** | `p.logs{date}` | keyed ledger | union by day, then by entry id | 12 |
| **Focus minutes** | `p.pomoMinutes` | scalar | newest write | 13 |
| **Pomodoro sessions** | `p.pomoSessions` | scalar | newest write | — |
| **Gold stars** | `p.stars` | scalar | newest write | 14 |
| **Admin points adjust** | `p.pointsAdjust` | scalar | newest write | — |
| **Notebook / planning** | `p.planning` | scalar | newest write | — |
| **Name, colour** | `p.name`, `p.color` | scalar | newest write | — |
| **Timer lock** | `p.timerLock` | scalar | newest write | — |
| **Tasks** | `state.tasks[]` | own row each | per-row | 23 |
| **Meetings & notes** | `state.meetings[]` | own row each | per-row | — |
| **Content posts** | `state.posts[]` | own row each | per-row | — |
| **Calendar events** | `state.events[]` | own row each | per-row | — |
| **Message board** | `state.messages[]` | own row each | per-row | — |
| **Projects (books)** | `state.projects[]` | keyed list | newest edit wins, deletions stick | 19, 20, 21 |
| **Timeline points** | `state.tlPoints[]` | keyed list | same | 22 |
| **Project statuses** | `state.projectStatuses[]` | keyed list | same | — |
| **Shop items** | `state.storeItems[]` | keyed list | same | — |
| **Activity types** | `state.activityTypes[]` | keyed list | same | — |
| **Meeting templates** | `state.templates[]` | keyed list | same | — |
| **Per-person templates** | `state.personTemplates{pid}` | per-person map | you own yours | — |
| **Workspace name** | `state.wsName/wsSub` | plain value | newest write | — |
| **Shop open/closed** | `state.storeEnabled` | plain value | newest write | — |
| **Score epoch** | `state.scoreEpoch` | plain value | admin authority | 9 |
| **Deletion tombstones** | `state._graves` | map | union, keep newest | 20 |

**Deliberately not synced** — local to the device by design:
`myName`, `taskSearch`, `selectedTemplate`, sort and filter settings,
`calView`, `_streakFishCleaned`, pomodoro panel size.

---

## What "pull then push" looks like here

1. **On open or refresh** the device reads the room *before* it says anything
   (`syncReady` gates every push). It cannot overwrite the room with a stale cache.
2. **Rows are merged, not replaced.** An old version arriving never wipes a newer
   one — but if it carries a better streak or a catch nobody else has, that comes
   along, which is your "bring the good parts of the old version" requirement.
3. **Deletions are recorded**, so a union can't undo them.
4. **Your device writes only your row**, so nobody's account can be trampled.
5. **The app self-updates**: it fetches its own `index.html` with a cache-busting
   query, compares versions, and reloads into the newer build once.

---

## Running the checks

```
python3 check.py     # handler existence + name collisions
python3 build.py     # bundle
```

27 data-integrity cases are listed in the table above by number.
