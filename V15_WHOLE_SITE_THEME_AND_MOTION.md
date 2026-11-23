# v15 — Whole-site colour, layout and motion update

## Scope

- Applies one visual system to administrators, teachers, parents, and the standalone voting/results pages.
- Uses mineral-mist backgrounds, evergreen navigation, porcelain surfaces, and sea-glass teal accents.
- Keeps all existing data workflows and role permission logic unchanged.

## Visual changes

- Replaces the older brick/copper/indigo colour layers with a common light/dark token system.
- Adds immutable `--v15-*` aliases and explicitly remaps legacy admin-scoped variables, preventing older body-level declarations from overriding the new palette.
- Carries the same colour and typography through page headings, hero surfaces, metric strips, tables, forms, programme cards, events, parent profiles, admin workspace navigation and dialogs.
- Removes the admin-only colour island; admin tokens now map to the same global design variables.

## Layout / overlap hardening

- Added minimum-width and max-width guards for nested grid/flex items across all page roles.
- Made forms, headings, event rows, toolbars and action groups wrap cleanly.
- Kept wide tables in their own horizontal scrolling frame.
- Added narrower breakpoints for metric grids, forms, event cards, class rows, admin workspace navigation and footer.
- Corrected compact admin topbar wrapping and removed its desktop rail offset on mobile.
- Added responsive rails and topbar rules without changing the navigation actions.

## Motion

- Route and key sub-view transitions fade, rise and stagger when the page, admin tab, programme detail, parent area, or role context changes; data/filter rerenders do not replay the full page animation.
- Adds controlled hover, press, focus, table-row, navigation, modal, toast, image, tab, and chart-progress transitions.
- Includes `prefers-reduced-motion` overrides.

## Security / logic preservation

- No role permission logic or data CRUD logic was intentionally changed.
- The existing role routing, parent-only linked-child scope, parent Results access, and Sahodaya exclusion remain.
- Existing local server security headers and allowlists remain; build identifier updated to v15.

## v15.1 theme-cascade correction

A follow-up cascade audit identified that older administrator-specific declarations set colour variables directly on `body[data-page="admin"]`. Those declarations have higher priority than inherited `:root` values, which could leave administrator surfaces using the old indigo/charcoal palette while teacher and parent pages used the v15 palette. The administrator page now explicitly maps its legacy variables to immutable `--v15-*` theme aliases for both light and dark themes. The launcher build identifier is updated so an already-running older copy is not mistaken for the corrected build.

## Verification

- Static regression suite: 95/95 passed.
- HTTP/security suite: 39/39 passed.
- JavaScript syntax: `app.js`, `poll.js`, and `poll-live.js` passed `node --check`.
- Python launcher: passed `py_compile`.
- `styles.css` and `poll.css`: recursively parsed with zero CSS syntax errors.
- Browser navigation remains blocked by the test environment, so no computed-style screenshot or pixel-level visual sign-off is claimed.

Run `python test_portal_static.py` and `python test_security_server.py` from the project folder.
