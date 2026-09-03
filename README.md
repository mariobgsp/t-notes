# t-notes

<img src="web/logo.svg" alt="t-notes logo" width="64" height="64">

Local-first, single-user notes + kanban board. Trello's core, none of its cloud — zero dependencies, tiny RAM.

## Features

- **Notes** — `+ New note` popup: title first, rich text (bold, italic,
  color, size), optional **board List** (a listed note also appears as a
  board card; same item, both views, edits sync). ✎ reopens the popup to
  **edit**; clicking the note opens a **detail dialog** (body + checklist +
  progress, list picker, image attachments). Archive, color labels, `#tags`
- **Board** — Jira-style color-coded lists (create with the *New list…* box,
  rename ✎ / delete ×). Cards with detail view: rich description, checklist +
  progress bar, due dates + overdue highlight, comments, label strips,
  `#tags`, drag & drop + ←/→ move. Notes pinned to a list render as cards
  too (draggable between columns). Both support **image attachments**
  (compressed locally, click to view full-size)
- **Search + filter** — text search, label and `#tag` filters
- **Archive + activity log**, checklist-item → card conversion
- **Toasts** confirm every action; **?** button opens the in-app guide
- **Light/dark mode** (follows system, toggle persisted)
- **AI assistant** (BYOK) — Command Code default (`meta/muse-spark-1.3-contributor`),
  plus OpenCode Zen free, OpenRouter, or any OpenAI-compatible URL.
  Summarize, Checklist, Improve, Ideas in notes and cards.
  Key stays local, never exported
- All data stays in your browser (`localStorage t-notes-v1`)

## Run it (any OS with a browser)

```sh
cd t-notes/web
python3 -m http.server 8000
# open http://localhost:8000
```

No build step, no `npm install`. Just static files.

## Windows installer (built from Linux)

```sh
sh build-windows.sh   # needs only Go → dist/t-notes.exe + dist/t-notes-setup.exe
```

- Copy `dist/t-notes-setup.exe` to Windows and run it: installs to
  `%LocalAppData%\t-notes`, creates **Desktop + Start Menu shortcuts**, launches.
- `t-notes.exe` also runs portable (no install).
- Uninstall: `t-notes.exe --uninstall`, then delete `%LocalAppData%\t-notes`.
- **Auto-startup:** ⏻ button in the header toggles launch-on-login (Windows
  Startup shortcut; highlighted blue when on).
- **Backup:** ⤓ exports all data as JSON, ⤒ restores it.

## Layout

| File | What |
| --- | --- |
| `web/` | Frontend: `index.html`, `styles.css`, `app.js`, `logo.svg` (no framework) |
| `main.go` | Windows host: local server + self-installer with shortcuts |
| `build-windows.sh` | `GOOS=windows go build` cross-compile from Linux |
| `src-tauri/` | Tauri desktop app (NSIS installer, autostart plugin) |
| `e2e/` | Playwright suite (system Chromium, mocked AI endpoint) |
| `.github/workflows/` | `windows build` CI → published GitHub Release |

## Real desktop app (Tauri)

The Go exe above is a browser launcher. For a usual Windows program — own
window, `t-notes-setup.exe` installer with Start Menu + Desktop shortcuts,
proper uninstall entry — Tauri builds it on GitHub Actions:

- Push a tag: `git tag vX.Y.Z && git push origin vX.Y.Z`, or run the
  `windows build` workflow manually. The installer publishes itself under
  GitHub Releases (no draft step).
- Local dev (Linux): `npm install` then `npx tauri dev` (needs Rust).
- The ⏻ startup toggle works in both builds (Tauri autostart plugin
  vs Go `/api/startup` fallback).

## Release notes

- The installer is **unsigned**: Windows SmartScreen will show an
  "Unknown publisher" warning — click *More info → Run anyway*.
  Signing (paid cert) is the fix, skipped for now.
- **No auto-updater yet**: new versions are manual downloads from
  GitHub Releases.
- First install needs internet once (WebView2 bootstrapper); nearly all
  Windows 10/11 PCs already have WebView2 via Edge/Windows Update.

## Tests

```sh
cd e2e && npm install && npx playwright test   # system Chromium, no browser downloads
```

10 tests cover: popup composer, rich text, labels, notes add/tag/persist,
card lifecycle (move, modal, checklist, due, labels, comments),
import/export roundtrip, AI actions (mocked endpoint), guide, search,
custom lists, theme persistence.

## Lean by design

~38KB of frontend, ~10MB self-contained Go exe, ~30MB Tauri app. Renders 500+ items
in well under a second with a single-digit-MB JS heap; search is debounced and
animations are `transform`/`opacity` only, respecting `prefers-reduced-motion`.
