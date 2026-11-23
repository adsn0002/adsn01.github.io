# v18.2 — Parent overview and area-specific participation

## Changes

1. Removed the repeated Student Activity banner and the redundant registration-number tiles from Parent Overview. The participation allowance now appears directly below the school hero. The child name, class and section remain available in My Child.
2. Scoped the compact participation allowance on the parent Arts page to Arts only.
3. Scoped the compact participation allowance on the parent Sports page to Sports only.
4. Kept the full combined allowance on Parent Overview. The Group Items catalogue retains its previous combined allowance view.
5. Made a single-area allowance card use the full width of the panel.
6. Advanced the local server build ID to `arts-and-sports-portal-v18.2-parent-overview-and-area-quota-fixes`.

## Preserved behaviour

- No registration records, programme eligibility rules, configured choice limits, validation logic, data schema, localStorage keys, or storage architecture were changed.
- My Child continues to show the student's profile details.
- Parent Overview continues to show Arts, Sports and Group Items summaries together.

## Verification

- Static regression checks: 158/158 passed.
- UI layout, nested CSS parsing and contrast checks: 84/84 passed.
- HTTP/server security checks: 39/39 passed.
- JavaScript syntax checks for all three scripts: passed.
- Python compilation: passed.
- ZIP integrity: passed.
- A live Chromium interaction/screenshot check was attempted, but this environment blocked both localhost and file URL navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`; visual browser verification could not be completed here.
