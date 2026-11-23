# v16 — School palette, full-site UI and glass-motion update

## Colour system
The new three-colour allocation is designed around the school identity while avoiding a green direction:
- **45% warm paper** `#F5F1E9`: primary page canvas, negative space, warm surfaces.
- **45% mineral blue-grey** `#DCE4EB`: navigation surfaces, secondary panels, data surfaces and glass tint.
- **10% school brick** `#822811`: editorial headings, selected states, fine emphasis, small markers and chart highlights. It is not used as a large repeated fill.

Functional ink `#243448` and slate action `#344A61` are neutral readability/action values, not additional brand colours. Older green status markers were also remapped to brick or slate so legacy status components do not reintroduce a green accent. Dark mode uses deep navy and mineral tones with a softened brick accent.

## Whole-site changes
- Added a global icon rail for teacher and parent areas while retaining the existing role-specific routes and admin workspace structure.
- Applied the shared colour and surface system to shared page shells, sidebars, topbars, programme cards, class groups, results, tables, forms, dialogs, settings and standalone poll pages.
- Kept administration's current three-pane workspace and all prior functional admin routes intact.
- School branding updates the rail logo and existing sidebar logo together.

## Motion and glass
- Soft, slow ambient fog drift and floating translucent crystal-glass atmosphere.
- Translucent blurred navigation panes and glass surfaces.
- Hero background drift, page entrance, staggered card reveal, chart growth, modal entrance, toast entrance, nav icon motion and hover depth/zoom.
- Motion uses transform/opacity where practical and is disabled/reduced under `prefers-reduced-motion: reduce`.

## Behaviour and scope
No application workflows, data schema, role authorization logic, form submission or existing route identifiers were intentionally changed. The rail home action navigates to the existing dashboard route. Parent Results and Sahodaya restrictions remain unchanged.

## Verification status
Static and HTTP regression suites are run before packaging. Automated Chromium visual verification is unavailable in the current environment because local navigation is blocked by the execution environment; this is disclosed rather than presented as a successful visual sign-off.
