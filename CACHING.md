# Making updates actually show up

Three things now work together. The first two are already done; the third
depends on your host.

## 1. Everything except index.html is versioned

`index.html` loads `css/styles.css?v=<version>` and `js/*.js?v=<version>`,
where `<version>` comes from one place:

```html
<meta name="app-version" content="2026.08.03-2">
```

Bump that string, and every stylesheet and script is a brand-new URL that no
cache has ever seen. **This is the only thing you have to remember to do.**

> Previously the stylesheet was pinned to a literal `?v=2026.08.02-1` that never
> changed, so browsers kept serving an old stylesheet no matter what. Fixed —
> it now reads the meta tag.

## 2. The app repairs itself

On load, and whenever you switch back to the tab, the app fetches its own
`index.html` with `cache: 'no-store'` and compares the served version against
the running one. If they differ it reloads into the new build automatically.

If that reload *doesn't* help — because the host is still serving the old file —
it stops after one attempt and shows a banner saying so, rather than looping.

## 3. Tell your host not to cache index.html

This is the real fix, and it's the piece I can't do from here. Pick the file
that matches your host; the others are harmless.

| host | file | notes |
|---|---|---|
| Netlify | `_headers` | works as-is |
| Cloudflare Pages | `_headers` | works as-is |
| Vercel | `vercel.json` | works as-is |
| Apache / cPanel | `.htaccess` | needs `mod_headers` (usually on) |
| **GitHub Pages** | — | **cannot set headers.** See below. |

`no-cache` doesn't mean "never cache" — it means "ask me before reusing this".
The browser keeps the file and the server replies `304 Not Modified` when
nothing changed, so the cost is a few hundred bytes per load.

### If you're on GitHub Pages

GitHub Pages serves `index.html` with a 10-minute cache and gives you no way to
change it. Your options:

- **Wait 10 minutes** after pushing, then hard-refresh once.
- **Rely on step 2** — the auto-update will catch it on the next load.
- **Move to Netlify or Cloudflare Pages** (both free, both read `_headers`).

## Releasing, start to finish

1. Edit a file in `js/` or `css/`
2. Bump `<meta name="app-version">` in `index.html`
3. Upload the whole folder
