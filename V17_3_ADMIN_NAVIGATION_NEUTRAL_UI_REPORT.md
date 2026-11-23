# School Arts & Sports Portal — v17.3 Navigation and neutral UI corrections

## User issues addressed

- Light-mode menu text was difficult to read.
- The admin page had too many navigation sidebars and a blank strip between its section menu and content.
- The selected admin section incorrectly highlighted its numeric count/summary.
- Presentation-only prototype notices appeared in the site shell and admin overview.
- Class-register headers and other status/information surfaces used bright colour fills.
- The menu was slow and the admin mobile drawer could appear collapsed or fail to accept taps.

## Implementation

### Navigation model
- Teacher and parent workspaces retain one global collapsible portal sidebar.
- Administrator workspace uses exactly one admin section index plus the content canvas. The global portal sidebar is hidden while the admin workspace is active.
- Admin section index is constrained to 224px on desktop and the workspace grid gap is zero, removing the unintended white gutter.
- On mobile, the admin section index opens as one off-canvas drawer. The global portal scrim is disabled for admin because it lived above the main-area stacking context and could intercept drawer taps.
- A dedicated `admin-sidebar-open` state raises the main-area layer, creates an in-layer backdrop, and keeps the menu button and admin drawer above it.
- Background page scrolling is locked while the mobile admin drawer is open. Click-away, Escape and hamburger controls close it.
- Drawer motion uses short transitions without backdrop blur to reduce perceived latency.

### Appearance and visibility
- Light-mode sidebar uses a mineral background with readable dark text.
- Active admin row retains a restrained selected-state surface; numeric counts remain transparent and are not highlighted.
- The aggregate attention count is no longer displayed in a highlighted pill.
- Class-register headers, information boxes, warning boxes, notices, status surfaces, and empty states use theme-driven neutral fills in both light and dark mode.
- All prototype presentation notices were removed from the rendered UI; operational election-access warnings remain.

## Verification

- Static regression: **146/146 passed**.
- HTTP/security suite: **39/39 passed**.
- JavaScript syntax: `app.js`, `poll.js`, `poll-live.js` passed.
- Python compilation: launcher and test files passed.
- CSS parser: two stylesheets parsed with zero parse errors.
- ZIP integrity: verified after packaging.

## Remaining limitation

A browser screenshot/interaction verification was not completed because the execution environment blocks local browser navigation. Static and server verification do not prove pixel-level layout behaviour on every real device. The updated mobile admin drawer should be checked on an actual phone before school deployment.
