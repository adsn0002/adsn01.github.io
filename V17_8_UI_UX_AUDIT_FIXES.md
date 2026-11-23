# School Portal v17.8 — UI/UX and layout audit fixes

**Date:** 21 November 2026  
**Base:** v17.6-era project, retaining the v17.7 semantic-theme repairs and v17.8 navigation/legibility work.  
**Scope:** Administrator, teacher and parent browser interfaces. This release focuses on responsive layout, text legibility, navigation geometry and consistency; it does not intentionally change school-data workflows or role permissions.

## Issues found and fixed

### 1. Undersized metadata and status labels

The previous stylesheet targeted `.event-date small`, but the teacher activity markup uses `.activity-date small`. Those month labels therefore remained at 9px and measured 4.28:1 in the light theme. Corrected the actual selector and brought recurring calendar, class-register, parent programme-chip and admin breadcrumb/kicker metadata to a 10px minimum with semantic theme colours. Calendar date/counter surfaces now use the shared neutral surface tokens.

### 2. Mobile drawer width being overridden

An older, more-specific `.sidebar.open` rule continued to force teacher/parent drawers to 320px even after the general 300px rule was added. The open, hover and focus states now have explicit role-qualified sizing. Teacher, parent and admin drawers resolve to `min(300px, 88vw)` at the mobile breakpoint, with `min-width:0`, `max-width` and `flex-basis` aligned so flex layout cannot expand them unexpectedly.

### 3. Duplicate administration context strip

The admin top bar already supplies the portal/workspace context and academic year, and each selected admin page has its own heading. A second workspace context strip repeated this information. It is now hidden to remove duplicate breadcrumb/year text and recover vertical space.

### 4. Drawer focus and inert behaviour rechecked

Retested all three role drawers at 390px. Each drawer opens, exposes a visible close control, contains keyboard focus, closes with Escape and releases the background inert state after closing. The admin workspace correctly makes its own topbar and content region inert/`aria-hidden` while its drawer is open; the teacher/parent drawer makes the main content region inert.

### 5. Responsive layout and overflow rechecked

Revalidated teacher and parent pages at 320, 390, 768 and 1440px, and admin pages at 320, 360, 390, 768, 940, 941, 1024, 1280 and 1440px, in both themes. Admin sections checked include overview, students, programmes, registrations, rules and elections/audit. No document-level horizontal overflow, clipped primary controls or sibling layout overlaps were found in the audited pages. Tables retain intentional internal horizontal scrolling.

## What remains unchanged

- Existing admin/teacher/parent workflows and route handlers.
- Parent access to published results and restriction from Sahodaya.
- Parent programme registration and eligibility/quota checks.
- The v17.6 “Back to Portal” administrator exit action.
- Existing security headers and local-server protections.
- Existing light/dark theme choice and the school-colour palette.

## Verification results

### Automated suites

- `test_portal_static.py`: **146/146 passed**.
- `test_ui_layout.py`: **78/78 passed**; complete nested CSS parse reports zero errors.
- `test_security_server.py`: **39/39 passed**.
- `python -m py_compile start_portal.py`: passed.

### Rendered Chromium checks

The app HTML, application script and styles were loaded into headless Chromium with an isolated localStorage shim. These tests exercise actual browser layout and event handlers; they are not substitutes for testing on a physical school device.

- Teacher/parent layout matrix: **144 states**, zero issue groups, zero JavaScript errors. Covers both themes and widths 320, 390, 768 and 1440px.
- Admin layout matrix: **126 states plus 4 drawer states**, zero failures and zero JavaScript errors. Covers both themes, key admin tabs and widths 320 through 1440px, including the 940/941px responsive breakpoint.
- Contrast audit: **36 page/theme states**, zero low-contrast visible text elements in the audited pages.
- Drawer interaction: teacher, parent and admin open/close, responsive width, visible close control, keyboard focus containment, Escape closing and inert-state release all passed. At 390px the drawers measured 300px.
- Admin exit: entering Administration and using “Back to Portal” returned to the main dashboard, reset the admin sub-tab, closed navigation and released inert state; no JavaScript errors.

## Scope limitation

The browser matrix covers representative high-use pages and breakpoints, not every possible data combination, browser engine, physical device or zoom setting. Production acceptance should still include a pass on the actual target Windows/mobile devices with real school data backups. The checks found no further layout issue in the states exercised; this is not a claim that all possible defects have been eliminated.
