# v18.1 — Parent dashboard and participation limits

## Changes

1. Added the same large school-photo hero banner used by the teacher workspace to the parent overview. It uses the existing school background image, dashboard title, description and quote settings.
2. Added a participation allowance panel to the parent overview showing current use against the configured maximum:
   - Arts total, with separate Onstage and Offstage meters.
   - Sports total, with separate Track and Field meters.
   - Group Items are shown as a separate staff-managed allowance and do not consume individual Arts/Sports choices.
3. Added a compact copy of the allowance panel to the parent Arts and Sports programme lists so parents can see remaining choices while browsing.
4. Updated the parent child activity summary to show used / maximum for Arts, Sports and Group Items.
5. Kept the existing `quotaStatus()` validation unchanged. The display reads the same registration records and configuration settings as the registration flow.
6. Advanced the server build ID to `arts-and-sports-portal-v18.1-parent-dashboard-participation-limits` to prevent reuse of an older running server instance.

## School-default limits

- Arts: 3 Onstage + 3 Offstage = 6 total.
- Sports: 3 total, with up to 2 Track and up to 2 Field. A full three-choice allocation is 2 Track + 1 Field or 1 Track + 2 Field.
- Group Items: separate limit, staff-managed.

The display reads the saved configuration values, so schools that adjust the choice limits in Administration will see their configured values rather than hard-coded defaults.

## Verification

- JavaScript syntax check: passed.
- Python compilation: passed.
- Static regression checks: 152/152 passed.
- UI layout, CSS parsing and contrast checks: 82/82 passed.
- HTTP/server security checks: 39/39 passed.
- Browser-rendered screenshot test: attempted, but the execution environment's Chromium policy blocked both localhost and file URL navigation (`ERR_BLOCKED_BY_ADMINISTRATOR`). Runtime visual verification could not be completed in this environment.

No data schema, localStorage format, registration cap logic, or multi-device architecture was changed.
