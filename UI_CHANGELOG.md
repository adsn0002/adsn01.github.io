# Portal UI update — v14

The entire Administration workspace has been rebuilt structurally around a compact portal rail, searchable administration index, and spacious working canvas. This is not a font-only or dashboard-only restyle: the overview, navigation, section hierarchy, tables, forms, dialogs, account directories, reports, settings and other admin modules now share one design system. The implementation preserves the existing administration routes and feature actions, and does not re-theme teacher/parent workspaces.

The v13 UX review is retained in `V13_ADMIN_UX_REDESIGN.md`; the v14 design and verification notes follow.

## v14 — full Administration workspace rebuild

- Replaced the conventional admin sidebar layout with a three-pane workspace: compact portal icon rail, searchable administration category index, and a spacious content canvas.
- Added live counts to section navigation and a mobile section selector.
- Rebuilt the overview around live registration-by-area data, actionable follow-up counts, common tasks, recent audit activity and current school rules.
- Applied one modern system UI font, new charcoal/neutral/indigo palette, restrained borders, consistent tables/forms and lower visual density across all admin modules.
- Preserved all existing admin tab routes, underlying data functions and role restrictions.
- Verified 85/85 static regression checks, 39/39 HTTP/security checks, JavaScript/Python compilation and CSS parsing. Browser navigation remained blocked by the execution environment, so no visual-browser pass is claimed.


## v15 — Whole-site theme and motion
- Applied a unified mineral-mist / evergreen / sea-glass palette across admin, teacher, parent and public voting pages.
- Replaced admin-only palette exceptions with global design tokens.
- Added responsive layout guards to prevent grid/flex content collisions and preserve horizontal table scrolling.
- Added route-level page motion plus component microinteractions, modal/toast transitions and reduced-motion support.
- Existing workflows and role permissions retained.


## v15.1 — theme cascade correction
- Corrected a CSS cascade defect where earlier `body[data-page="admin"]` tokens overrode `:root` site-wide colours.
- Added light/dark v15 token aliases and explicitly maps every shared/admin colour, status, row accent and shadow token in admin mode.
- Updated regression checks to test the effective final palette mapping rather than stale legacy CSS declarations.
- Launcher build ID advanced to `arts-and-sports-portal-v15-1-theme-cascade-fix` so the corrected CSS is not served by an older running server instance.


## v16 — School palette, whole-site rail and glass-motion system
- Replaces the former evergreen/green direction with a 45/45/10 design allocation: warm paper (`#F5F1E9`) and mineral blue-grey (`#DCE4EB`) as the two dominant surface colours, with school brick (`#822811`) reserved for headings and restrained emphasis.
- Introduces high-contrast ink and slate action colours; no green/evergreen brand or action colour is used. Dark theme uses coordinated navy/mineral surfaces and softened brick accents.
- Adds a compact global icon rail for teacher/parent portal navigation, keeping the existing administrator icon rail and three-pane administration workspace.
- Reworks shared teacher/parent navigation panes, page canvases, forms, cards, tables, programme views, class groups and public election pages to share the same visual tokens.
- Adds animated ambient fog, floating crystal-glass atmosphere, glass panes, hero background drift, page entry, staggered card reveal, modal entrance, chart growth, nav micro-interactions and hover depth.
- Adds responsive containment breakpoints and `prefers-reduced-motion` fallback. Existing role permissions, navigation handlers, data operations, and forms remain the functional source of truth.
- Launcher build ID advanced to `arts-and-sports-portal-v16-school-palette-glass-motion`.

- Final colour audit maps legacy green status indicators to the brick/slope-neutral palette so older components do not reintroduce green accents.


## v17.1 — navigation, glass and theme reliability
- Removed duplicate workspace rail. Main sidebar collapses/expands on desktop and works as one mobile drawer.
- Fixed theme-dependent text and control contrast, updated browser theme colour.
- Added adaptive crystal-glass search/navigation/modal surfaces, continuous fog/crystal motion and custom scrollbars.
- Tightened container sizing and overflow handling throughout forms, grids, tables and dialogs.

## v17.1 verification addendum
- Removed the workspace-only home rail from the actual document markup; the main sidebar is the only global navigation rail.
- Desktop sidebar defaults to a 66px icon rail and expands on hover/focus; touch/mobile uses one off-canvas drawer without backdrop blur.
- Dark-mode semantic colours now cover regular copy, headings, strong text, links, controls, placeholders, panels, table cells, scrollbars and browser theme colour.
- Search bars use a separate adaptive crystalline material; glass is reserved for functional/navigation surfaces instead of being repeated on every content card.
- Fog and crystal layers move and zoom continuously behind the UI; school photos and logos remain sharp.
- Verification: 116/116 static regression checks, 39/39 HTTP/security checks, JS syntax checks for all three scripts, Python compilation, duplicate-ID checks (none), and nested CSS parse (zero errors).
- Full browser screenshot/visual inspection was attempted with Chromium but timed out in this environment; rendered pixel-level verification remains outstanding.

## v17.2 — mobile navigation, parent catalogue and contrast fixes
- Removed the crystalline/glass material from the global student search field; it is now a plain high-contrast utility input. Search fields used for page-level filtering are also plain controls.
- Rebuilt the mobile sidebar as one fixed, scrollable drawer above a separate scrim. Removed the app-shell stacking context that could trap the drawer below the scrim; added body scroll preservation, touch scrolling, Escape close and focus restoration.
- Locked the mobile school hero/photo region to a fixed 158px height with clipped overflow and non-stretching image treatment.
- Parent overview is now a summary and area launcher, not a full programme catalogue. Arts, Sports and Group Items have dedicated navigation; Arts/Sports pages show compact child-specific programme rows with the existing eligibility, deadline, duplicate and quota checks. Group Items remain staff-added.
- Parent navigation hides staff workspace, class register, house assignment, reports, not-registered and administration entries. The parent role can view published child results but not Sahodaya.
- Added a self-contained offline SVG icon sprite for shared navigation, search, theme, profile and menu controls.
- Tightened high-contrast text and muted dark-mode control surfaces; removed bright fills from dark-mode functional controls.
- Build ID advanced to `arts-and-sports-portal-v17.2-mobile-parent-programme-icons`.
- Verification: 130/130 static regression checks, 39/39 HTTP/security checks, JavaScript syntax checks, Python compilation, nested CSS parsing (0 errors), and ZIP integrity. Browser screenshot/interaction testing remains unavailable because local browser navigation is blocked in this execution environment.

## v17.3 — administration navigation and neutral UI corrections
- Replaced the obsolete three-pane admin assumption (global icon rail + admin nav + content) with one administration section index and one content canvas. The global portal sidebar is hidden only while the administrator page is active; teacher and parent navigation continue to use the single global collapsible sidebar.
- Removed the admin grid gutter and fixed the section index at 224px on desktop to prevent shrinking/collapsing and the visible blank strip between the menu and content.
- Fixed the mobile admin drawer stacking-context defect. The drawer now sits above an in-layer backdrop within the main-area stacking context, while the global scrim is disabled for admin. Hamburger and outside-click close interactions are handled separately.
- Added background scroll locking for the admin mobile drawer. The global parent/teacher drawer continues to use the shared scrim and body scroll lock.
- Removed visible prototype/preview notices from the site shell and admin overview. Operational election-access/security warnings remain, with neutral wording.
- Removed number/count highlight fills from active admin navigation and transparentized the admin attention total so only the selected section is highlighted.
- Neutralized information, warning, notice, status and empty-state surfaces in light and dark themes; retained readable text and borders without bright fill colours.
- Updated static regression coverage for the new admin single-nav structure, active-count behaviour, prototype-notice removal, mobile drawer stacking/scroll lock, responsive controls and theme contrast.
- Build ID advanced to `arts-and-sports-portal-v17.3-navigation-admin-neutral-visual`.
- Verification: 146/146 static regression checks, 39/39 HTTP/security checks, JavaScript syntax checks, Python compilation, CSS parsing (zero errors). Full browser visual verification remains unavailable because local browser navigation is blocked in the execution environment.

## v17.5 — Additional UI overlap, visibility and layout fixes (21 November 2026)

- Added desktop content reflow when the teacher/parent navigation rail expands or is pinned; the rail no longer covers the page canvas.
- Normalised the remaining administrator overview link, recent-activity marker and registration bar colours to theme-aware neutral slate tokens.
- Replaced saturated success/warning/error toast fills with readable, restrained theme surfaces and a subtle school-brick border marker.
- Workspace role changes explicitly close navigation and release inert/aria-hidden state before rerendering the new role.
- Added a reduced-motion exception for the new desktop content reflow transition.
- Added `test_ui_layout.py` for full nested CSS parsing, duplicate HTML IDs, mobile drawer geometry, navigation focus/inert handling, desktop rail reflow, dark/light contrast ratios, table/modal containment and reduced-motion behaviour.


## v17.6 — Exit Administration
- Added a persistent, labelled “Back to Portal” control at the top of the Administration navigation.
- The action returns administrators to the main portal dashboard, resets the admin sub-tab to Overview for the next entry, and closes navigation/inert overlay state through the existing route handler.
- Restricted the action to the administrator role and added keyboard focus styling.

## v17.8 — UI/UX rendered audit follow-up (21 November 2026)
- Fixed the real teacher activity date selector (`.activity-date small`) that escaped the previous `.event-date small` typography rule; brought recurring event/calendar metadata, class-register helper text, parent programme chips and admin micro-labels to a readable 10px minimum with theme-aware foreground colours.
- Fixed a stale role-qualified `.sidebar.open` width rule that overrode the general mobile drawer cap. Teacher, parent and administrator open/hover/focus drawer states now consistently use `min(300px, 88vw)` with matching min/max/flex sizing.
- Removed the redundant administrator workspace breadcrumb and duplicate academic-year strip; the topbar context and selected page heading remain.
- Rechecked drawer focus containment, visible close controls, Escape close and role-specific inert/aria-hidden behaviour in Chromium.
- Rechecked admin Back to Portal route, theme contrast, mobile/tablet/desktop overflow, and major admin sections in rendered Chromium.
- Verification: 146/146 static checks, 78/78 UI layout/contrast checks, 39/39 HTTP/security checks; 144 teacher/parent rendered states, 126 admin rendered states plus 4 drawer states and 36 contrast page/theme states passed with zero detected layout/contrast issues in the audited states.
- Build ID: `arts-and-sports-portal-v17.8-uiux-layout-legibility-fixes`.

## v18.1 — Parent dashboard hero and participation limits (23 November 2026)
- Added the same school-image hero banner to the parent overview, using the school-customisable title, description, quote and background already available to the teacher workspace.
- Added parent-facing participation allowance cards showing used versus maximum Arts and Sports choices, including separate Onstage, Offstage, Track and Field counters and remaining places.
- The Sports allowance explains valid full allocations from the configured total and subcategory caps (with the school defaults of 2 Track + 1 Field or 1 Track + 2 Field).
- Added a compact quota view on the parent Arts and Sports programme pages so the allowance remains visible while browsing and registering.
- Updated the parent child activity summary to display used / maximum counts. Group Items remain separate and staff-managed under their independent limit.
- No registration caps or storage architecture were changed; existing `quotaStatus` validation remains authoritative.
- Build ID advanced to `arts-and-sports-portal-v18.1-parent-dashboard-participation-limits`.
- Verification: JavaScript syntax, Python compilation, existing static checks, responsive CSS parse, HTTP security checks and ZIP integrity.


## v18.2 — Parent overview and area-specific participation (23 November 2026)
- Removed the repeated Student Activity identity/status banner and the duplicate registration-number tiles from Parent Overview. The participation allowance now appears directly beneath the school hero; detailed child identity remains available in My Child.
- Scoped the compact participation allowance on the parent Arts page to Arts only and on the parent Sports page to Sports only. The overview retains the combined Arts, Sports and Group Items summary; the Group Items catalogue retains the existing combined view.
- Expanded the single-area quota card to use the available panel width.
- No registration records, programme eligibility, choice caps, or data storage structures were changed.
- Build ID advanced to `arts-and-sports-portal-v18.2-parent-overview-and-area-quota-fixes`.
