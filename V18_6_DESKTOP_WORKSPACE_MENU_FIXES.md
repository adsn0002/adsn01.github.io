# v18.6 — Desktop workspace menu and navigation regression fixes

## Requested correction

Workspace switching remains inside the regular collapsible portal menu on both Windows/desktop and mobile. The regular portal menu remains hidden throughout Administration; the dedicated **Back to Portal** action exits Administration, after which the normal menu and workspace selector are available again.

## Fixes

- Fixed a desktop flex-layout defect that allowed the sidebar footer to shrink below its content height. At shorter Windows window heights (for example 1280×768, 1024×700, and 941×600), the footer's `overflow:hidden` clipped the workspace and preview-account controls even though their HTML and responsive visibility rules existed.
- On desktop, the regular sidebar footer is now non-shrinking and remains at the bottom of the expanded menu. The navigation list above it becomes the scrollable region when vertical space is limited.
- Kept the plain workspace selector visible when the desktop menu is expanded by hover, keyboard focus, or the menu's pinned state. It has no special card/highlight treatment.
- Kept the mobile drawer scrollable with a non-shrinking footer so both workspace and preview-account selectors remain reachable.
- Did not change the Administration navigation model, Exit/Back to Portal action, role permissions, page layouts, programme rules, data storage, or unrelated features.

## Navigation audit findings

- **Desktop short-height clipping:** fixed. This was the reason selectors could appear to be missing on Windows.
- **Desktop menu collapsed state:** selectors remain intentionally tucked into the expanded menu; click the top menu control to pin it open, or expand by hover/focus.
- **Administration separation:** retained. The regular menu and its selector are intentionally not available until Back to Portal is used.
- **Workspace and preview-account change handlers:** retained; each closes the menu, updates the selected role/account, resets to Overview, and rerenders.
- **Mobile footer reachability:** retained and covered by explicit regression assertions.

## Verification

- Static, UI-layout/CSS, security, JavaScript syntax, Python compilation, and ZIP integrity checks are run for this release.
- An offline Chromium harness loads the project's actual HTML/CSS/JavaScript with in-memory local storage so navigation and computed layout can be checked without navigating to blocked localhost/file URLs. Persistent browser-profile storage is not exercised by that harness.

### Verified results

- 159/159 static regression checks passed.
- 119/119 UI layout, nested CSS syntax, accessibility, navigation and theme checks passed (9 additional v18.6 navigation assertions).
- 39/39 HTTP/security checks passed.
- `node --check` passed for `app.js`, `poll.js` and `poll-live.js`.
- Python compilation passed for the launcher and test modules.
- The actual project HTML, CSS and JavaScript were rendered in an offline Chromium harness at 1024×700, 1280×768 and 1440×900. At all three sizes, the workspace and preview-account selectors were visible, and the footer retained its full 197px height within the viewport. No JavaScript runtime errors occurred.
- A responsive navigation harness using the project's full stylesheet and matching sidebar markup passed at desktop sizes 941×600, 960×650, 1024×700, 1280×768 and 1440×900, plus mobile widths 320px, 390px and 768px. It also confirmed the admin/portal menu visibility contract and selector reachability.
- Persistent browser-profile storage was not exercised; the actual-app Chromium harness used in-memory local storage because direct localhost/file navigation is blocked in this execution environment.
