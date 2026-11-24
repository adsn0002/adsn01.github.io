# v18.4 — Shared workspace menu, Administration navigation and UI refinement

**Date:** 23 November 2026  
**Build ID:** `arts-and-sports-portal-v18.4-shared-menu-visual-refinement`

## Changes

### 1. One shared navigation menu
- The regular portal sidebar now stays present for Admin, Teacher and Parent.
- The Admin-only **Back to Portal** action is part of the normal main navigation and appears only while Administration is open.
- The workspace selector appears once, inside the shared collapsible sidebar. It is a simple menu group with no highlighted card, special badge or duplicate admin copy.
- The old workspace selector was removed from the Administration section index.

### 2. Administration navigation
- Desktop keeps the Administration section index beside its content.
- On mobile and tablet, the standard hamburger opens the shared sidebar; the section index is replaced by a compact native selector inside the Administration page.
- Back to Portal, workspace switching and section switching remain separate controls with clear purposes.

### 3. Mobile drawer correction
- On shorter screens, the sidebar footer previously compressed and clipped the workspace/account controls.
- The footer now keeps its natural height, and the drawer itself scrolls. Workspace and preview-account selectors can be reached by scrolling to the lower portion of the menu.
- Drawer width, layering, background scroll lock, Escape close and focus handling remain in place.

### 4. More deliberate visual language
- Standardised card edges, borders, control radii and surfaces across the portal.
- Removed the continuously animated fog/crystal background layers and expensive backdrop blur. The school palette and brick-accent hierarchy remain.
- Reduced excess shadow/glass effects and removed decorative movement that did not communicate state.

### 5. Purposeful motion and efficiency
- Kept short route-entry motion using opacity and a small transform (180ms).
- Added/retained restrained modal (160ms), toast (150ms), disclosure (145ms) and progress-meter (320ms) motion, plus navigation/control feedback.
- The hamburger icon gives a small state cue; button/card press feedback is limited to a subtle 1px movement.
- Motion is interaction-driven rather than continuous. The reduced-motion preference disables transitions and animations.
- Removed a forced layout read from the route-entry helper. The mobile drawer receives a compositing hint only while it is open, not permanently.

## Preservation

No role permissions, programme registration rules, participation limits, student records, result records, database schema, storage keys, imports/exports or deferred authentication design were changed.

## Verification

| Check | Result |
|---|---:|
| Static regression checks | 158/158 passed |
| HTTP/server security checks | 39/39 passed |
| UI layout, CSS parsing and contrast checks | 110/110 passed |
| JavaScript syntax (`app.js`, `poll.js`, `poll-live.js`) | Passed |
| Python compilation | Passed |
| Chromium responsive route states | 152 checked |
| Widths covered | 320, 360, 390, 430, 768, 940, 1024 and 1440px |
| Horizontal overflow in tested states | 0 cases |
| JavaScript runtime errors in tested states | 0 |
| Shared menu / Admin navigation interactions | Passed |
| ZIP integrity | Passed (`unzip -t`) |

**Browser harness limitation:** direct Chromium navigation to local HTTP and file URLs is blocked in this execution environment. The test harness loaded the exact project HTML, CSS and JavaScript into an offline page and exercised the menu, role switching and route navigation. Persistent storage in a normal browser profile was not tested in that harness.
