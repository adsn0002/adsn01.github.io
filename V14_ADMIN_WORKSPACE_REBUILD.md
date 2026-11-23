# v14 — Administration workspace rebuild

## Design direction

This is a structural redesign of the full Administration workspace, based on the supplied screenshots and video references rather than another colour/font pass.

The combined design direction is:
- Refero-style application rail + searchable category pane + detailed workspace.
- Grok/Mercury-style restrained editorial scale, generous negative space, dark hero treatment where useful, and clean section transitions.
- Business-dashboard information hierarchy: a small set of meaningful figures, one real data visual, follow-up items, shortcuts and recent activity.
- The earlier Mailchimp/Coinbase/Dope Security references: thin dividers, clean surfaces, low visual noise and consistent content hierarchy.

## What changed

### Whole Administration shell
- The existing portal navigation becomes a narrow icon rail only while the user is inside Administration. Its original destinations and click behaviour remain available; labels remain present for assistive technology.
- The Administration area now has its own searchable section index, with all five management categories visible and live item counts.
- The content area has a single breadcrumb/context line and a separate working canvas.
- Smaller screens use a single administration-area selector instead of squeezing the desktop navigation into tiny columns.

### Overview
- Replaced the decorative task-card grid with a dark, restrained introduction; a flat metrics strip; current registrations by area; live follow-up counts; common task rows; recent audit activity; and a compact rules summary.
- The registration metric and bars count only registrations attached to active students and non-archived programmes. No chart series or trend values are invented.

### Shared design system for every admin section
- One consistent system UI font stack is applied throughout Administration, including tables, forms, dialogs and controls.
- Replaced the former brick/orange direction with charcoal, warm-neutral surfaces and a restrained indigo accent. Dark mode receives a corresponding dark palette.
- Replaced high-radius, shadow-heavy cards with simple bordered sections, thin separators, clearer table headers, consistent field heights and compact rectangular controls.
- Applied shared styles to student/class management, account directories, house allocation, programmes, registrations, dates, school rules, events, elections, school settings, import/backup and activity log.

## Functionality preserved

The existing `adminTab` routes and the underlying feature functions/forms/actions are retained. The new navigation calls the same `admin-tab` action. The overview shortcuts use that same route. The only new interaction is section search and the responsive mobile section selector.

No database schema, student eligibility rules, programme limits, registration operations, ranking logic, Sahodaya logic, election processing, backup/import workflow, reset behaviour or server permission rules were intentionally changed.

Parent results access and parent Sahodaya exclusion remain as in v13. Teacher and parent interfaces are not re-themed by these admin-scoped styles.

## Verification

- JavaScript syntax: passed (`node --check app.js`).
- Python compilation: passed for launcher and test scripts.
- Static regression suite: 85/85 passed, including all 17 existing admin tab routes, parent results scope, Sahodaya exclusion, searchable navigation, mobile selector, security controls, and retained image assets.
- HTTP/security suite: 39/39 passed, including headers, traversal rejection, method restrictions, asset serving and build health endpoint.
- Stylesheet parsing: 0 CSS parse errors (including nested media/print rules).
- ZIP integrity: verified after packaging.

## Browser-test limitation

A Chromium attempt was made against the local server, but browser navigation was rejected by the execution environment with `ERR_BLOCKED_BY_ADMINISTRATOR`; a direct file-preview attempt also stalled. Therefore this build has source/static/HTTP verification, not a successful rendered-browser visual sign-off. The responsive rules and click/change handlers were inspected and covered by static checks, but a real visual pass on the user's machine is still needed.
