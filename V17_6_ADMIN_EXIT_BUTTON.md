# v17.6 — Administration Exit Control

## Change
Added a persistent **Back to Portal** button at the top of the Administration navigation. It returns an administrator to the main portal dashboard (`dashboard`), resets the administration sub-tab to `overview`, and uses the existing `navigate()` route flow so the admin navigation and any drawer/inert state are cleaned up consistently.

## Behaviour
- Visible on desktop and mobile whenever the Administration workspace is open.
- Clear text label plus house icon; not icon-only.
- Restricted to administrators through the existing action guard and a specific `isAdmin()` check.
- Keyboard accessible with a visible focus ring.
- Does not reset or modify student, registration, results, account or election data.

## Validation
Includes regression assertions for presence, permission guard, dashboard destination, tab reset, styling and focus visibility.
