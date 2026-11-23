# School Arts & Sports Portal — v17.5 UI audit and fixes

**Date:** 21 November 2026  
**Base:** v17.3 UI build (delivered as the v17.3 archive)  
**Build ID:** `arts-and-sports-portal-v17.5-ui-layout-colour-a11y`

## Scope

A focused follow-up review of additional overlap, theme-visibility, layout, navigation-state and accessibility issues. The prior v17.3 drawer/layout findings were retained as regression checks; this pass also looked for defects beyond those already documented.

## Additional defects found and fixed

### 1. Desktop teacher/parent sidebar expansion covered page content

**Cause:** the side rail expands from the collapsed width to the full navigation width on hover, keyboard focus or pin, but the main canvas retained its collapsed-rail offset. This caused the expanded rail to overlap the left side of the page.

**Fix:** on desktop teacher/parent workspaces, the main canvas now transitions its margin and width to match the expanded navigation width whenever the rail is hovered, focused or pinned. Administrator layout is excluded because it has its own in-flow section index.

### 2. Leftover saturated colours remained in the administrator overview

**Cause:** older rules still assigned blue to inline links and quick-action hover text, and alternating blue/green markers to recent activity. Older area-bar rules also defined separate saturated colours.

**Fix:** overview links, activity markers, area bars and status markers now use the theme's neutral text/muted tokens. The school brick remains available as a restrained heading/brand accent, not a large interactive fill.

### 3. Toast notifications retained saturated success/warning/error backgrounds

**Cause:** older `.toast.success`, `.toast.warning` and `.toast.error` declarations used green, amber and red background fills, conflicting with the requested muted palette.

**Fix:** notifications now use the theme's neutral surface, readable text and a restrained school-brick border cue. The message content still communicates success, warning or error; the whole component no longer becomes a bright coloured block.

### 4. Workspace role changes did not explicitly clear navigation state

**Cause:** the role selector changed `state.role` and rerendered without first closing a pinned/open navigation state. This could leave stale drawer classes or inert/aria-hidden state across a role change.

**Fix:** the role-change handler calls `closeSidebar(false)` before updating the selected role and rerendering. That removes open/pinned classes, scrim state and inert background state first.

### 5. New desktop reflow did not respect reduced-motion preference

**Cause:** the new main-canvas margin/width transition had not been included in the reduced-motion fallback.

**Fix:** the desktop canvas reflow transition is disabled under `prefers-reduced-motion: reduce`.

## Previous drawer/layout findings retained as regression checks

- Admin mobile drawer is viewport-fixed and responsive rather than offset by a transformed ancestor.
- Admin navigation groups occupy a single full-width column; old 48% width constraint is absent.
- The admin 224px fixed section index is limited to desktop; mobile uses a viewport-relative drawer.
- Teacher/parent and administrator drawers each have an internal close button.
- Background content is marked inert and hidden from assistive technology while a mobile drawer is open.
- Focus is trapped in the open drawer; Escape and outside-click paths close it and focus is restored.
- Admin drawer and its backdrop use a consistent stacking layer.
- Mobile topbar hides optional workspace/account controls so the 320px layout remains within viewport width.
- Tables use their own horizontal scroll wrapper; modals and forms stay within viewport/container bounds.
- Dark sidebar status surface and the active row/count styles remain theme-aware and neutral.

## Colour and contrast checks

The added regression suite calculates contrast ratios for the current semantic token pairs. All tested normal text/placeholder pairs are above the WCAG AA 4.5:1 threshold:

| Pair | Contrast |
|---|---:|
| Light primary text on page background | 12.46:1 |
| Light secondary text on page background | 8.39:1 |
| Light muted text on page background | 4.88:1 |
| Light placeholder on surface | 4.95:1 |
| Light sidebar text on navigation surface | 9.78:1 |
| Dark primary text on page background | 15.26:1 |
| Dark secondary text on surface | 10.58:1 |
| Dark muted text on surface | 7.92:1 |
| Dark placeholder on surface | 8.34:1 |
| Dark sidebar text on navigation surface | 13.32:1 |
| Dark selected navigation text on selected surface | 10.59:1 |
| Dark toast text on toast surface | 11.58:1 |

These are token-pair tests, not a claim that every dynamically rendered page element has been individually measured.

## Verification

- `python test_portal_static.py`: **146/146 passed**
- `python test_security_server.py`: **39/39 passed**
- `python test_ui_layout.py`: **46/46 passed**
- JavaScript syntax: `app.js`, `poll.js`, `poll-live.js` passed `node --check`
- Python compilation: `start_portal.py` passed
- Full nested stylesheet parse with `tinycss2`: zero errors
- Static HTML duplicate-ID audit: no duplicates in `index.html`, `poll.html`, `poll-live.html`
- ZIP archive integrity: checked after packaging

**Total:** 231 automated checks passed.

## Testing limitation

The available Chromium environment blocks the portal's local navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`, so this pass could not obtain a fresh end-to-end browser screenshot after the fixes. The CSS/layout/contrast checks are static and deterministic; an actual desktop and phone visual check is still recommended before deploying the portal with real school data.
