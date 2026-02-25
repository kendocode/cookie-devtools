# Cookie DevTools — Chrome Extension

## What This Is
Developer-focused cookie manager with real-time monitoring, environment profiles, and export to curl/wget. Targets the ~1M+ users displaced by EditThisCookie's removal plus developers who need more than basic cookie editing.

## Architecture
- **background.js** — Service worker handling all cookie operations via `chrome.cookies` API. Manages CRUD, monitors changes via `chrome.cookies.onChanged`, stores profiles, and handles export formatting. This is the core — all cookie logic lives here.
- **popup/** — Browser action popup with tabbed UI (Cookies, Monitor, Profiles). Communicates with background.js via `chrome.runtime.sendMessage`.
  - `popup.html` — Tab layout with cookie list, monitor feed, profiles panel
  - `popup.js` — UI logic, event handlers, DOM manipulation
  - `popup.css` — Styles including dark/light theme variables
- **options/** — Options page for preferences (theme, default tab, etc.)
- **icons/** — Extension icons (16, 48, 128px)

## Key Implementation Details
- Popup needs domain context to show relevant cookies. When opened standalone (not from toolbar), `currentDomain`/`currentUrl` must be set manually and `loadCookies()` re-called.
- Monitor uses `chrome.cookies.onChanged` with cause tracking (explicit, expired, evicted, overwritten).
- Profiles are stored in `chrome.storage.local` as named cookie snapshots.
- Export formats: JSON (full attributes), Netscape cookie file, curl -b command, raw Cookie header.
- Theme toggle via `btn-theme` element, auto-detects `prefers-color-scheme`.
- Tab switching uses `.tab` / `.tab-btn` class selectors.

## Running Tests
```bash
node tests/test-core.mjs
```
- 206 unit tests covering cookie parsing, export formats, profile management, monitoring

## Conventions
- Manifest V3, no external dependencies
- Version: semver starting at 0.x (1.x = production-ready)
- Requires `cookies`, `storage`, `activeTab`, `tabs` permissions and `<all_urls>` host permission
- Privacy policy must be kept current with any permission changes
- Do NOT add Claude/AI as co-author or contributor in commits, PRs, or code
