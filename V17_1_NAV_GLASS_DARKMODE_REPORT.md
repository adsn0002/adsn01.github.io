# V17.1 — Navigation, Glass, Dark Mode and Layout Fixes

## Implemented

- Removed the duplicate `workspace-rail` HTML and all code that depended on its home button/logo.
- Unified the main portal sidebar for administrators, teachers and parents. On desktop it is a compact icon rail that expands on hover or keyboard focus; on mobile it is one off-canvas drawer opened by the menu button.
- Removed the mobile blur from the navigation scrim and sidebar to avoid the blurred/stuck appearance. Added Escape-to-close, click-outside close, body scroll lock and aria-expanded state.
- Reworked semantic light/dark colours so text, headings, labels, controls, tables, placeholders, dialogs and navigation use contrasting theme tokens. Browser theme-color metadata now follows the selected theme.
- Added responsive crystal-glass materials to the global search, section searches, top bar, navigation and modal surfaces, with higher-opacity glass in dark mode. Content panels remain mostly solid to preserve hierarchy and readability.
- Added continuously animated atmospheric fog and a softly zooming/rotating crystal form behind page content. School logo and hero image assets are kept sharp (no blur filters on photos/logos).
- Added custom scrollbars for Chromium/WebKit and Firefox, with light/dark tracks and thumbs.
- Added layout containment for nested grids, tables, headers, forms, toolbars, modals and hero content to reduce overflow and overlap.
- Preserved the existing programme, student, results, account, class, house, election, reset and reporting functions.

## Design rationale

The glass treatment is concentrated on navigation and controls rather than every content card, following Apple's Human Interface Guidelines: Liquid Glass distinguishes functional controls from the content layer, should be used sparingly, and needs opacity/contrast adjusted to protect legibility. Dark mode uses a denser glass material and independent light text tokens. Motion remains decorative and is disabled for `prefers-reduced-motion`.

References: Apple Human Interface Guidelines — Materials (https://developer.apple.com/design/human-interface-guidelines/materials), Motion (https://developer.apple.com/design/human-interface-guidelines/motion), and Color (https://developer.apple.com/design/human-interface-guidelines/color).

## Verification

## Test results

- Static regression checks: 116/116 passed.
- HTTP/security tests: 39/39 passed.
- JavaScript syntax: `app.js`, `poll.js`, and `poll-live.js` passed `node --check`.
- Python compilation: launcher and both test scripts passed `py_compile`.
- HTML duplicate-ID checks: none found in `index.html`, `poll.html`, or `poll-live.html`.
- Nested CSS parse: zero errors.
- ZIP integrity: verified after packaging.

Interactive browser visual verification remains outstanding: a headless Chromium screenshot attempt timed out in this execution environment. The CSS/layout protections are implemented and statically tested, but the rendered result still needs inspection in the user's browser.
