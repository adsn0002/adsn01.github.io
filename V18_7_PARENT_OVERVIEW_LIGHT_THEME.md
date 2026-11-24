# v18.7 — Parent overview cleanup and light-theme default

## Requested changes

1. Remove **Recent Registrations** from the parent Overview.
2. Reduce the size and change the font of the Arts, Sports and Group Items labels in the parent Overview.
3. Make light/white mode the default instead of dark mode.

## Implemented

- Removed the Recent Registrations panel from `renderParentOverview()` and removed its unused registration sorting and published-result lookup. The separate **My child** activity record is unchanged. Registration data itself is not deleted or modified.
- Set the three parent overview area-card labels to `14px`, weight `600`, Segoe UI/Arial/system sans-serif. Existing card descriptions, item counts, icons, other parent pages and staff typography are unchanged.
- Advanced the saved theme-default marker from version `2` to `3`. Profiles without the v18.7 marker now initialise in light mode, including existing v18.6 installs that used the old dark default. After v18.7 starts, the user's chosen light/dark mode is saved and reused on later launches.
- Advanced the launcher build ID to `arts-and-sports-portal-v18.7-parent-overview-light-default`.

## Scope protection

No changes were made to registration workflows or data, student records, programmes, eligibility, participation limits, role permissions, navigation, database structures, imports/exports or login plans. The dark theme remains available through the existing theme toggle.

## Verification

- Static regression checks: **162/162 passed**.
- UI/layout/contrast and nested CSS checks: **119/119 passed**.
- HTTP/server security checks: **39/39 passed**.
- `node --check`: `app.js`, `poll.js`, and `poll-live.js` passed.
- Python compilation: launcher and test modules passed.
- CSS nested parser: **0 errors**.
- Offline Chromium rendered the actual project HTML/CSS/JS and verified: v18.6 dark-default marker migrates to light; a fresh profile starts light; parent Overview retains its hero, participation panel and three area cards; Recent Registrations is absent; area labels compute to `14px` with the requested font stack; toggling dark writes the v18.7 preference and a subsequent load restores a deliberately saved dark choice. No browser JavaScript runtime errors occurred.

Direct Chromium navigation to localhost and file URLs is blocked in this execution environment, so the browser checks used an offline page containing the exact project HTML/CSS/JS and an in-memory storage mock. No claim is made that a real browser profile was opened by the test harness.
