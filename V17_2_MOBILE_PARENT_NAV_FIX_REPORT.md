# School Arts & Sports Portal — v17.2 corrective report

## Scope
This update addresses the latest user-reported regressions in the v17.1 build. It is a targeted repair pass; school programme rules, stored database structure, admin actions, teacher permissions and parent-child data relationships are retained.

## Changes

### Global search
- Removed the crystal/glass backdrop, blur, elevated shadow and decorative focus transform from the top-level student search control.
- The global search now uses an opaque theme surface, visible border, high-contrast input text and a restrained focus outline.
- Page-level search fields and the admin navigation search are plain controls as well.

### Mobile navigation
- Removed the stacking-context conflict caused by `.app-shell` having a positioned z-index. The mobile sidebar is now a root-level fixed drawer at z-index 1300, above the scrim at z-index 1200.
- Standardised the mobile drawer at up to 310px / 86vw, with a fixed viewport height, independent vertical scrolling, touch scrolling and safe-area padding.
- Opening the drawer stores the current page scroll position and locks the body. Closing it restores the previous scroll position.
- Added/retained explicit open, close, Escape, scrim click, focus and `aria-expanded` handling.
- The desktop sidebar remains a single collapsed icon rail that expands on hover/focus. Mobile does not rely on hover.

### School image sizing
- On small screens the hero image region is fixed to 158px, clips overflow and does not grow with the source image's natural dimensions. Text is clamped and secondary metadata is hidden in this compact hero mode. The source photograph itself is not blurred.

### Parent portal
- Parent overview is a short dashboard: linked-child context, registration summary, area navigation, school notice and recent registration summary. It does not render the whole catalogue.
- Arts, Sports and Group Items are accessible from the parent menu. Arts and Sports list compact, parent-specific cards. Cards do not expose whole-school entry totals, rosters or staff-only counts.
- Parent Arts/Sports cards reuse the existing eligibility, registration window and quota checks and invoke the established `portal-select` action. Duplicate entries are prevented by existing registration and UI-state checks.
- Group Items are visible as an area, but parents are told to ask the class teacher to add their child; they cannot self-register group teams.
- The Staff Workspace label, class register, house assignment, reports, not-registered and administration entries are role-hidden. CSS explicitly ensures `[hidden]` remains hidden despite older display rules.
- Parent results remain limited to their linked child; Sahodaya remains unavailable to parents.

### Icons and contrast
- Main navigation and common controls now use a bundled SVG symbol sprite; it works offline and adds no external package or network request.
- Light mode uses dark ink and slate text on paper/surface backgrounds. Dark mode uses near-white body text, readable muted text and low-luminance controls with no bright colour fills.

## Verification
- Static regression suite: **130/130 passed**.
- HTTP/security suite: **39/39 passed**.
- `node --check app.js`, `node --check poll.js`, `node --check poll-live.js`: passed.
- `python -m py_compile start_portal.py`: passed.
- `tinycss2` nested stylesheet parse: **3,059 top-level rules, 0 parse errors**.
- HTTP checks confirmed all four new WebP assets are served with correct content type, host validation, CSP/security headers, no-cache policy, and rejected write methods.
- ZIP archive integrity checked after packaging.

## Limitation
The browser automation environment blocks or times out on local navigation. Source-level regression, CSS parsing and live HTTP checks are available, but a rendered mobile screenshot, touch simulation and end-to-end parent browser interaction could not be completed here. This report does not claim visual browser sign-off.

## Data and installation notes
The original v17.1 ZIP is unchanged. The new build uses the same localStorage origin when started on the same localhost port, so existing browser data should remain available. Back up the portal data before replacing an active build. Close the old server before launching the new one.
