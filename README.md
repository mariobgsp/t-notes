# t-notes

<img src="logo.svg" alt="t-notes pixel logo" width="64" height="64">

Local-first, single-user notes + kanban board. Trello's core, none of its cloud — zero dependencies, tiny RAM.

## Features

- **Notes** — save, list, archive, color labels, `#tags`
- **Board** — custom lists (add/rename/delete), cards with detail view:
  description, checklist + progress bar, due dates + overdue highlight,
  comments, labels, `#tags`, drag & drop + ←/→ move
- **Search + filter** — text search, label and `#tag` filters
- **Archive + activity log**, checklist-item → card conversion
- **Light/dark mode** (follows system, toggle persisted)
- All data stays in your browser (`localStorage t-notes-v1`)

## Run it (any OS with a browser)

```sh
cd t-notes
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
| `index.html` | Shell: Notes \| Board tabs, filter bar, card modal |
| `styles.css` | Theming (CSS vars), layout, GPU-only animations |
| `app.js` | State, `localStorage` persistence, rendering (no framework) |
| `main.go` | Windows host: local server + self-installer with shortcuts |
| `build-windows.sh` | `GOOS=windows go build` cross-compile from Linux |

## Real desktop app (Tauri)

The Go exe above is a browser launcher. For a usual Windows program — own
window, `t-notes-setup.exe` installer with Start Menu + Desktop shortcuts,
proper uninstall entry — Tauri builds it on GitHub Actions:

- Push a tag: `git tag v0.1.0 && git push origin v0.1.0`, or run the
  `windows build` workflow manually. A draft release with the installer
  appears under GitHub Releases.
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

Covers: notes add/tag/persist, card lifecycle (move, modal, checklist, due,
labels, comments), search, custom lists, theme persistence.

## Lean by design

~25KB frontend, ~9MB self-contained exe, uses the system's browser instead of
bundling Chromium (~150MB saved vs Electron). Animations are `transform`/`opacity`
only with `content-visibility` for long lists.
