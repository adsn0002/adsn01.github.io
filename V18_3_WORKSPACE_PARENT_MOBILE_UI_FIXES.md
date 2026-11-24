# v18.3 — Workspace navigation, parent layout and mobile fixes

**Date:** 23 November 2026  
**Build ID:** `arts-and-sports-portal-v18.3-navigation-parent-layout-mobile-fixes`

## Changes made

1. **Workspace selector location**
   - Removed the role and preview-account selectors from the topbar.
   - Placed the teacher/parent workspace selectors in the shared collapsible navigation sidebar.
   - Placed the administrator selectors in the Administration navigation drawer, including its mobile drawer layout. No duplicate workspace selector is left above the mobile admin content.
   - Updated synchronization so all visible selector instances reflect the current role/account. Role and preview-account changes close the current drawer before rerendering.

2. **Parent Overview opening layout**
   - Removed the separate `Overview` heading and explanatory text above the hero.
   - Made the school-photo hero the first content in Parent Overview.
   - Kept the linked-child selector or the current child's class/category label inside the hero.

3. **Participation allowance size**
   - Reduced padding and spacing in the common parent participation panel and its compact variant.
   - Reduced quota card padding, counter sizes, meter heights, labels and supporting notes across parent areas.
   - Retained the same Arts, Sports and Group Items counts and configured limits.

4. **Parent activity dates**
   - The My Child activity table remains date-free.
   - Removed the `Added` date column from Parent Overview's recent-registration table as well. The list still sorts by most recent registration internally; it simply no longer displays that date.

5. **Administrator headings**
   - Added a clear school-brick left accent and divider under the main admin page heading.
   - Increased weight and hierarchy for admin page headings and section headings, including h2 and h3 section-title variants and settings-card titles.
   - Added mobile-specific heading sizes and padding so accents do not consume too much space on narrow screens.

6. **Mobile layout and navigation**
   - Tightened the parent hero and child selector on small screens.
   - Stacked participation allowance cards at narrow widths and reduced their inner spacing.
   - Constrained admin content, mobile drawer controls, page grids and headings to the available viewport width.
   - Kept horizontal table scrolling inside each table wrapper rather than allowing tables to widen the page.
   - Fixed the preview-account drawer rerender path so it resets the open/inert navigation state before replacing page content.

## Preservation

- No role access rules, business logic, student/programme/result records, participation limits, SQLite schema, storage keys or import/export rules were changed.
- The workspace selector remains a preview/navigation control; it does not introduce authentication or change the deferred login plan.

## Verification

| Check | Result |
|---|---:|
| Static portal checks | 158/158 passed |
| HTTP/server security checks | 39/39 passed |
| UI layout, nested CSS parsing and contrast checks | 98/98 passed |
| JavaScript syntax checks (`app.js`, `poll.js`, `poll-live.js`) | Passed |
| Python compilation | Passed |
| Chromium responsive route checks | 42 states passed at 320px, 390px and 768px |
| Additional responsive checks | Parent Overview, My Child and Admin workspace at 320px, 360px, 390px, 430px, 768px, 940px, 1024px and 1440px |
| Runtime JavaScript errors in rendered checks | 0 |
| Horizontal page overflow in rendered checks | 0 |

**Browser-test limitation:** the execution environment blocked direct navigation to localhost and file URLs. The Chromium checks therefore loaded the exact project HTML/CSS/JavaScript in an offline rendering harness with the project's bundled images and an in-memory storage shim. This verifies the rendered layout and tested navigation interactions, but does not verify persistence in a real browser profile.
