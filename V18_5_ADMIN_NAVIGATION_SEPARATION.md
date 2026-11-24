# v18.5 — Administration and Portal Navigation Separation

**Date:** 23 November 2026

## Navigation correction

- Administration remains a separate workspace with its own section navigation.
- The regular portal menu is hidden for the entire time the Administration workspace is open.
- **Back to Portal** is placed at the top of the Administration navigation. It exits Administration and returns to the portal dashboard.
- The regular collapsible portal menu returns after exiting Administration.
- The plain **Switch workspace** selector remains inside that regular menu and is not shown in Administration.
- On mobile, the menu button opens the Administration drawer while in Administration and the regular portal drawer after exiting.

## Scope

This release corrects the navigation separation only. The v18.4 visual refinements and unrelated portal features, data, permissions, registrations, and settings are preserved.

## Verification

- Python compilation: passed.
- Static regression checks: **159/159 passed**.
- UI layout and contrast checks: **110/110 passed**.
- Security/server checks: **39/39 passed**.
- Chromium interaction checks at **320, 390, 768, and 1440 px**: Admin hides the regular menu; Back to Portal is available in the Admin navigation; after exit the regular menu and workspace selector return; switching to Teacher works.
- Horizontal overflow: none detected in the tested views.
- Browser runtime errors: none detected.

The browser checks loaded the project HTML, CSS, and JavaScript into an offline browser harness because direct localhost navigation was blocked in the harness environment.
