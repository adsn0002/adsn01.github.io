# Administration UX redesign — v13

## Review findings
- The old layout showed the global portal sidebar and a second full-width administrator menu simultaneously.
- The admin page repeated the same location in the global breadcrumb, workspace title and active-section context.
- Metrics, quick actions, navigation groups and configuration rows were all rendered as similar rounded cards, flattening the visual hierarchy.
- Many secondary labels and table headings remained around 10–12px, creating an overly dense administrative interface.
- The CSS had several historical admin override layers and a few stale selectors targeting accordion markup that was no longer in use.

## v13 changes
- On the admin page, the global navigation becomes a narrow icon rail with accessible labels/tooltips; the labelled admin navigation becomes the single full navigation for school operations.
- Removed the redundant admin page-context title row. Individual admin pages now own their page heading; the overview has its own clear heading.
- Replaced numbered/card-based navigation groups with plain labels and simple active states.
- Rebuilt the overview as a compact statistics strip, task rows, a needs-attention list and a simple rules list. No decorative icon tiles or per-item card surfaces.
- Tables, forms, dialogs and management panels now use consistent neutral surfaces, hairline dividers, readable text sizes and low-radius controls. Shadows and gradient fills are removed from the admin workspace.
- Typography uses an offline-safe Arial/Helvetica interface face and a Georgia editorial heading face.
- Admin mode is scoped using `body[data-page="admin"]`; teacher and parent layouts remain on the existing design system.
- Existing operations, data flows, role rules, parent result visibility, Sahodaya restrictions, security headers and local assets are retained.

## Reference interpretation
The Mailchimp contact screen informed the compact icon rail, contextual page identity and restrained metrics. The Coinbase press page informed the editorial page hierarchy, columns and hairline separators. The Dope Security reference informed the disciplined use of a single accent and flat surfaces; the supplied MP4 itself could not be fetched in this environment, so its published public design description was used only as supporting context. This is an adaptation for an administrative workflow, not a reproduction of any reference site.

## Verification
The static regression suite, JavaScript syntax checks, Python compilation, CSS parsing and local HTTP security checks should be run after packaging. Chromium screenshots are included as a visual regression step where browser access is available.
