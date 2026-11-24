# v18.8 — Full-scope bug and responsive UI audit

**Date:** 23 November 2026  
**Baseline:** School20v18.7  
**Release build ID:** `arts-and-sports-portal-v18.8-full-scope-audit`

## Audit result

The project was audited across application data flows, form handlers, backup/restore, local storage failure handling, role permissions, student and house assignment, registration quotas, school-calendar dates, modal keyboard access, and all administrator/teacher/parent views.

The audit produced **13 verified functional/data-integrity bug fixes** and **8 distinct UI/UX defect classes corrected**. The requested thresholds of 100 functional bugs and 50 additional UI/UX bugs were not supported by the defects found in the code or by the reproducible tests. The counts below are distinct issue classes, not repeated instances across screen sizes. No additional defects were invented to reach a target number.

## 13 functional and data-integrity fixes

1. **Group Team creation argument order:** corrected the form-to-handler argument order. Creating a House Team now saves the team and its student registrations against the selected programme.
2. **Storage write fallback:** failed or quota-rejected browser-storage writes are retained in a session-memory overlay instead of being silently lost.
3. **Storage removal fallback:** failed removals create in-session tombstones, preventing deleted values from reappearing from stale persistent storage during that session.
4. **Storage snapshot rollback:** snapshot/restore now reads the newest in-session overlay before stale persistent data, preserving edits after a quota failure.
5. **Delegated teacher house assignment:** a teacher granted the house-assignment permission for an assigned class/section is no longer blocked by an admin-only action gate. Mass assignment remains admin-only.
6. **Case-only house rename:** changing only the letter case of a house name no longer clears or detaches student and House Team assignments.
7. **Section normalisation:** case/format normalisation preserves class-teacher mappings and student section assignments instead of orphaning them or moving students unexpectedly.
8. **House deletion with active Group Teams:** a house cannot be deleted while a Group Item team still references it. The admin receives a message directing them to remove the team registrations first; ordinary unassigned house memberships can still be cleared with confirmation.
9. **Backup cross-reference integrity:** backup validation now rejects inconsistent House Team membership, registrations pointing to missing teams, missing/mismatched students or programmes, and invalid election structures before those records can corrupt a restored workspace.
10. **School timezone date display:** event date labels and dashboard day numbers now use the school timezone (`Asia/Kolkata`) rather than the device's local timezone.
11. **Orphan registrations:** registrations tied to missing or inactive students no longer consume programme capacity or appear in a missing child's activity view.
12. **Modal keyboard focus:** the modal focus trap now ignores hidden/collapsed fields, starts on the first visible control, and wraps to the visible close action.
13. **Archived programme quota accounting:** registrations in archived Arts/Sports programmes no longer consume the student's active Onstage/Offstage or Track/Field allowance.

## 8 UI/UX defect classes corrected

1. Search fields and admin navigation search controls had inconsistent, undersized heights; they now use a consistent 40px control height.
2. Calendar event-title controls had a very small clickable area; their interactive height is now at least 40px.
3. Class/category range selectors could collapse to very narrow widths; their grid tracks and controls now retain a usable minimum width and height.
4. Checkbox and radio controls were too small; their control dimensions are now 22px, with their associated labels treated as the click/touch target.
5. Inline permission labels had insufficient hit area; their minimum target is 40px, rising to 44px on small screens.
6. Admin footer/helper labels and house indexes were rendered at 9px; they now use 11px text with a readable line-height.
7. Form fields and selects could render at 36–39px; they now use a content-driven minimum height of 40px.
8. Table action buttons, text links and admin navigation actions could render below the shared target height; they now meet the 40px minimum without changing their action or placement.

## Verification

### Automated project suites

| Suite | Result |
|---|---:|
| Static regression checks | 163/163 passed |
| HTTP/security checks | 39/39 passed |
| UI/layout/contrast checks | 129/129 passed |
| JavaScript syntax (`app.js`, `poll.js`, `poll-live.js`) | Passed |
| Python compilation | Passed |
| Nested CSS parsing | Passed |
| ZIP integrity | Passed |

### Browser and workflow coverage

- Rendered **315 role/route/viewport states**: 18 admin sections, 10 teacher routes and 7 parent routes across nine viewport sizes: 320×640, 360×740, 390×844, 430×932, 768×900, 940×700, 1024×700, 1280×768 and 1440×900.
- Across those states: **0 horizontal-overflow cases, 0 interactive targets below 40px, 0 unlabeled controls, 0 visible text elements below 10px, 0 broken loaded images and 0 JavaScript runtime errors**.
- Ran browser workflows for Group Team creation, storage-quota fallback, storage tombstones and restore, section normalisation, delegated teacher house assignment, invalid backup rejection, valid backup round-trip, house case rename/removal guard, election position/candidate bounds, school-date display across Asia/Kolkata / America/Los_Angeles / Pacific/Kiritimati, orphan registrations, modal focus trapping and archived-programme quota accounting.
- No source assets were removed. The changes are limited to `app.js`, `styles.css`, the launcher build identifier, regression tests and this release documentation.

## Scope and behaviour preserved

No new portal features, roles, data fields, programme rules or visual redesign were introduced. Existing navigation separation (the regular portal menu stays hidden during Administration), workspace switching placement, light/dark theme preference behaviour, parent overview content, manual election “Open voting” override, and existing programme/participation rules are preserved except for the defects listed above.
