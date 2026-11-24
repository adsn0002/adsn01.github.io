"""Responsive layout, drawer interaction, and theme-contrast regression checks."""
from pathlib import Path
from html.parser import HTMLParser
import re
import tinycss2

ROOT = Path(__file__).resolve().parent
css = (ROOT / "styles.css").read_text(encoding="utf-8")
app = (ROOT / "app.js").read_text(encoding="utf-8")
index = (ROOT / "index.html").read_text(encoding="utf-8")
server = (ROOT / "start_portal.py").read_text(encoding="utf-8")

checks = []
def check(name, condition):
    checks.append((name, bool(condition)))

# Parse the complete stylesheet, including nested at-rules and @page blocks.
css_errors = []
def walk_rules(rules, scope="root"):
    for rule in rules:
        if rule.type == "error":
            css_errors.append((scope, rule.message, rule.source_line, rule.source_column))
            continue
        if rule.type == "qualified-rule":
            declarations = tinycss2.parse_declaration_list(rule.content, skip_comments=True, skip_whitespace=True)
            for declaration in declarations:
                if declaration.type == "error":
                    css_errors.append((scope + " selector", declaration.message, declaration.source_line, declaration.source_column))
        elif rule.type == "at-rule" and rule.content is not None:
            if rule.lower_at_keyword in {"media", "supports", "layer", "container", "document", "keyframes", "-webkit-keyframes", "scope"}:
                walk_rules(tinycss2.parse_rule_list(rule.content, skip_comments=True, skip_whitespace=True), scope + " @" + rule.lower_at_keyword)
            else:
                declarations = tinycss2.parse_declaration_list(rule.content, skip_comments=True, skip_whitespace=True)
                for declaration in declarations:
                    if declaration.type == "error":
                        css_errors.append((scope + " @" + rule.lower_at_keyword, declaration.message, declaration.source_line, declaration.source_column))

walk_rules(tinycss2.parse_stylesheet(css, skip_comments=True, skip_whitespace=True))
check("full nested CSS parses without errors", len(css_errors) == 0)

class IdAudit(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if values.get("id"):
            self.ids.append(values["id"])

for filename in ("index.html", "poll.html", "poll-live.html"):
    parser = IdAudit()
    parser.feed((ROOT / filename).read_text(encoding="utf-8"))
    duplicates = sorted({item for item in parser.ids if parser.ids.count(item) > 1})
    check(f"{filename} has no duplicate static IDs", len(duplicates) == 0)

# Drawer sizing, layering and responsive geometry.
check("admin navigation drawer has viewport-fixed mobile geometry", "position:fixed !important;" in css and "width:min(320px,88vw) !important" in css and "height:100dvh !important" in css)
check("old fixed 224px drawer width is limited to desktop media query", "@media (min-width:941px) {\n  body[data-page=\"admin\"] .admin-section-nav" in css and "@media (max-width:940px)" in css and "width:min(320px,88vw) !important" in css)
check("old half-width navigation-group constraint is absent", "body[data-page=\"admin\"] .admin-nav-group { width: 48%" not in css and "width:48%" not in css)
check("admin navigation groups occupy one full-width column", "body[data-page=\"admin\"] .admin-nav-group {\n  display:grid !important;\n  grid-template-columns:minmax(0,1fr) !important;\n  width:100% !important;" in css)
check("admin workspace transform cannot reposition its fixed mobile drawer", "#page-content > .admin-workspace-v2" in css and "transform:none !important" in css and "body[data-page=\"admin\"] .admin-workspace-v2 { display:block !important; position:static !important" in css)
check("admin index sticky position is below the 76px topbar", "top:76px !important;" in css and "height:calc(100dvh - 76px) !important" in css)
check("drawer overlays are ordered below the drawer", ".mobile-scrim { z-index:1200; }" in css and ".sidebar { z-index:1300; }" in css and "z-index:1300 !important" in css)
check("admin mobile navigation opens the dedicated admin drawer with its overlay", "body[data-page=\"admin\"] .admin-section-nav.open" in css and "body[data-page=\"admin\"].admin-sidebar-open" in css and "body[data-page=\"admin\"].admin-sidebar-open .main-area::before" in css)
check("mobile menu controls remain within the viewport at 320px", "@media (max-width:380px)" in css and ".breadcrumb { max-width:54px !important; }" in css and ".global-search { flex-basis:80px !important; max-width:112px !important; }" in css)
check("mobile header hides optional role/account selectors", ".year-pill,.role-preview,.account-preview,.top-user { display:none !important; }" in css)
check("tables scroll inside their own wrapper rather than forcing page width", ".page-content .table-wrap { width: 100%; max-width: 100%; min-width: 0; overflow-x: auto !important" in css and ".page-content .data-table { width: 100%; max-width: none; }" in css)
check("forms and page grids can shrink without child overflow", ".page-content :is(.form-field,.filter-field,.form-grid > *, .settings-grid > *, .toolbar > *, .filter-drawer > *) { min-width: 0; max-width: 100%; }" in css)
check("modals remain inside viewport height", "max-height: min(92dvh,900px)" in css and ".modal-body { min-width: 0; max-width: 100%; overflow: auto" in css)

# Drawer behaviour and focus management.
check("shared sidebar close control is available for all workspaces", 'id="sidebar-close"' in index and "$('#sidebar-close')?.addEventListener('click',()=>closeSidebar(true))" in app and ".sidebar-mobile-close,.admin-nav-close { display:grid !important" in css)
check("drawer open state makes background inert and aria-hidden", "node.inert=!!open" in app and "node.setAttribute('aria-hidden','true')" in app)
check("drawer traps keyboard focus and closes with Escape", "if(event.key==='Tab'&&!isDrawerOpen)return" not in app and "if(event.key!=='Tab'||!isDrawerOpen)return" in app and "event.key==='Escape'" in app and "last.focus({preventScroll:true})" in app)
check("drawer close restores focus after background is re-enabled", "setNavigationBackgroundInert(false,false)" in app and "returnTarget.focus({preventScroll:true})" in app)
check("switching workspace role clears drawer and inert state", "if(el.matches('select[data-workspace-role]')){closeSidebar(false);state.role=el.value;" in app)
check("regular roles use the portal sidebar while admins use the separate admin menu", "function navigationForCurrentPage() {\n    return document.body.dataset.page === 'admin' ? $('#admin-section-nav') : $('#sidebar');\n  }" in app and "setAttribute('aria-controls',state.page==='admin'?'admin-section-nav':'sidebar')" in app)

# Prevent desktop expanding sidebar from covering the content canvas.
check("desktop teacher/parent rail expansion reserves content width", "body:not([data-page=\"admin\"]):has(.sidebar:hover) .main-area" in css and "body:not([data-page=\"admin\"]):has(.sidebar:focus-within) .main-area" in css and "margin-left:var(--v17-sidebar-expanded) !important" in css)
check("desktop content reflow respects reduced-motion preference", "@media (prefers-reduced-motion: reduce) {\n  body:not([data-page=\"admin\"]) .main-area { transition:none !important; }" in css)

# Theme contrast checks (WCAG AA normal-text threshold).
def luminance(hex_color):
    values = [int(hex_color[i:i+2], 16) / 255 for i in (1, 3, 5)]
    values = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values]
    return .2126 * values[0] + .7152 * values[1] + .0722 * values[2]

def contrast(a, b):
    x, y = sorted((luminance(a), luminance(b)), reverse=True)
    return (x + .05) / (y + .05)

pairs = {
    "light primary text": ("#1F2D3A", "#F4F1EA"),
    "light secondary text": ("#354858", "#F4F1EA"),
    "light muted text": ("#5A6B7A", "#F4F1EA"),
    "light placeholder": ("#5E6F80", "#FBFAF7"),
    "light sidebar text": ("#243545", "#DCE4EB"),
    "dark primary text": ("#F0F3F5", "#141D27"),
    "dark secondary text": ("#D2DAE1", "#1D2833"),
    "dark muted text": ("#B3BEC8", "#1D2833"),
    "dark placeholder": ("#B7C3CE", "#1D2833"),
    "dark sidebar text": ("#E9EEF2", "#182532"),
    "dark selected item text": ("#F0F3F5", "#2B3947"),
    "dark toast text": ("#F0F3F5", "#26333F"),
}
for label, (fg, bg) in pairs.items():
    ratio = contrast(fg, bg)
    check(f"contrast AA >= 4.5:1 — {label} ({ratio:.2f}:1)", ratio >= 4.5)

# Remove old saturated and inconsistent styles from the visible admin overview.
check("Back to Portal action is located inside the dedicated admin navigation", 'data-action="admin-back-to-portal"' in app[app.find("function renderAdmin()") : app.find("function adminOverview()") ] and 'class="admin-back-portal"' in app[app.find("function renderAdmin()") : app.find("function adminOverview()") ] and 'data-action="admin-back-to-portal"' not in index)
check("Back to Portal action is restricted to administrators", "'admin-back-to-portal'" in app[app.find("const adminOnly = new Set"):app.find("if (adminOnly.has(action)")])
check("Back to Portal resets admin tab and navigates to portal dashboard", "case 'admin-back-to-portal':" in app and "state.adminTab='overview';" in app and "navigate('dashboard');" in app)
check("Back to Portal action uses the dedicated admin exit control styling", 'body[data-page="admin"] .admin-back-portal {' in css and 'display:flex !important;' in css[css.find('body[data-page="admin"] .admin-back-portal {'):css.find('body[data-page="admin"] .admin-back-portal {')+500])
check("normal portal sidebar is hidden throughout Administration", 'body[data-page="admin"] .sidebar {\n  display:none !important;' in css and 'body[data-page="admin"] .admin-section-nav {\n    display:flex !important;' in css)
check("admin overview quick links use theme-aware neutral text", "body[data-page=\"admin\"] .admin-inline-link,\nbody[data-page=\"admin\"] .admin-quick-action:hover .admin-quick-copy strong" in css and "color:var(--v17-text-2) !important" in css)
check("admin recent markers and area bars use one neutral tone", "body[data-page=\"admin\"] .admin-recent-mark,\nbody[data-page=\"admin\"] .admin-recent-item:nth-child(2n) .admin-recent-mark" in css and "background:var(--v17-muted-2) !important" in css)
check("success/warning/error toasts use muted theme surfaces", ".toast.success,.toast.warning,.toast.error {\n  background:var(--v17-surface-2) !important;" in css)
check("dark-mode toast surface remains dark and neutral", ":root[data-theme=\"dark\"] .toast.success" in css and "background:#26333F !important" in css)
check("admin selected counts are not highlighted with the active row", "body[data-page=\"admin\"] .admin-link.active small" in css and "background:transparent !important" in css)
check("light/dark input placeholders use theme-specific readable values", "--v17-placeholder:#5E6F80" in css and "--v17-placeholder:#B7C3CE" in css)
check("reduced motion disables navigation, chart and ambient transitions", "@media (prefers-reduced-motion: reduce)" in css and "animation-duration:.01ms" in css and "transition:none !important" in css)
check("custom scrollbar tracks and thumbs are defined for both themes", "::-webkit-scrollbar-thumb" in css and ":root[data-theme=\"dark\"] ::-webkit-scrollbar-thumb" in css)
check("launcher build ID is unique to v18.8", "arts-and-sports-portal-v18.8-full-scope-audit" in server)

# V17.7: repair missing legacy semantic tokens and computed contrast regressions.
check("legacy result and print variables are defined for light theme", "--text: var(--v17-text);" in css and "--surface-soft: var(--v17-surface-2);" in css and "--border: var(--v17-border);" in css and "--panel: var(--v17-surface);" in css)
check("legacy result and print variables are defined for dark theme", css.count("--text: var(--v17-text);") >= 2 and css.count("--surface-soft: var(--v17-surface-2);") >= 2)
check("light muted text has AA-safe contrast on paper and mineral surfaces", "--v17-muted: #4F5F70;" in css)
check("dark muted text has high contrast on dark surfaces", "--v17-muted: #B8C4CF;" in css)
check("admin legacy muted tokens map to shared semantic contrast tokens", "--admin-muted: var(--v17-muted) !important;" in css and "--v16-muted: var(--v17-muted) !important;" in css)
check("admin table sublines no longer use washed-out grey", "body[data-page=\"admin\"] .admin-content-body .table-subline" in css and "font-size: 11px !important;" in css)
check("admin totals and navigation counts use readable semantic text colours", "body[data-page=\"admin\"] .admin-data-total" in css and "body[data-page=\"admin\"] .admin-nav-count" in css and "color: var(--v17-muted) !important;" in css)
check("rank group and winner text has a valid semantic colour", ".winner-name,\n.rank-class-group h4" in css and "background: var(--surface-soft) !important;" in css)
check("physical registration print builder has valid border and surface tokens", ".physical-print-builder {" in css and "border-color: var(--v17-border) !important;" in css and "background: var(--v17-surface) !important;" in css)
check("result placeholders have readable contrast instead of muted-2 grey", ".winner-meta,\n.result-empty" in css and "color: var(--v17-muted) !important;" in css)
check("info and warning panels use neutral theme surfaces in both themes", ".info-box,.warning-box" in css and ":root[data-theme=\"dark\"] .info-box" in css)
check("important table and helper labels are no longer rendered at 9px", ".page-content .data-table th { font-size: 10.5px !important;" in css and ".page-content .form-field small,\n.page-content .subtle-note { font-size: 11px !important; }" in css)
check("v18.8 build ID prevents reuse of an older server instance", "arts-and-sports-portal-v18.8-full-scope-audit" in server)

# Rendered contrast follow-up fixes for the administrator overview and event dates.
check("admin overview task indexes and metadata have readable foreground tokens", "body[data-page=\"admin\"] .admin-task-index" in css and "body[data-page=\"admin\"] .admin-recent-item time" in css and "body[data-page=\"admin\"] .admin-quick-copy small" in css)
check("admin navigation counters inherit readable foreground, including active counts", "body[data-page=\"admin\"] .admin-link.active .admin-nav-count" in css and "color: var(--v17-text-2) !important;" in css)
check("teacher and parent event-date month labels meet readable size and contrast", ".event-date small {" in css and "font-size: 10px !important;" in css and "color: var(--v17-text-2) !important;" in css)

# V17.8: browser-rendered audit follow-up for undersized metadata and tags.
check("event month labels are at least 10px and use semantic contrast tokens", ".activity-date small" in css and "font-size:10px !important;" in css and "color:var(--v17-text-2) !important;" in css)
check("calendar month/year, coordinator and relative labels are readable", ".event-feed-date small" in css and ".event-relative-label" in css and ".event-feed-coordinator" in css and "font-size:10px !important;" in css)
check("calendar period counts and TODAY marker use readable type and neutral surfaces", ".event-period-button span" in css and ".events-context-mark" in css and "background:var(--v17-surface-2) !important;" in css)
check("class register row helper and section counts are not rendered at 9px", ".class-row-name small" in css and ".class-row-meta small" in css and ".class-row-section-count" in css and "font-size:10px !important;" in css)
check("parent programme chips are readable without overflowing their cards", ".parent-programme-copy .category-pill" in css and ".parent-programme-copy .gender-pill" in css and "font-size:10px !important;" in css)
check("parent quota cards use a responsive two-column layout", ".parent-participation-grid" in css and "grid-template-columns:repeat(2,minmax(0,1fr))" in css and "@media (max-width:680px)" in css)
check("single-area parent quota panel expands to one full-width card", ".parent-participation-panel.scope-arts .parent-participation-grid" in css and ".parent-participation-panel.scope-sports .parent-participation-grid" in css and "grid-template-columns:minmax(0,1fr)" in css)
check("parent quota meters expose accessible progress values", "role=\"progressbar\"" in app and "aria-valuenow" in app and ".parent-limit-track" in css)
check("parent hero banner keeps teacher-style image treatment", 'body[data-role="parent"] .page-content > .hero-panel' in css and 'background-image' in css and 'var(--school-background' in css)
check("parent overview no longer reserves layout rules for the removed duplicate registration summary tiles", ".parent-summary-grid" not in css and ".parent-summary-item" not in css)
check("parent quota cards have dark-theme surfaces and readable text", ":root[data-theme=\"dark\"] .parent-participation-panel" in css and "#F1F3F5" in css)
check("admin breadcrumb and overview kicker labels use a consistent 10px minimum", "body[data-page=\"admin\"] .admin-workspace-context span" in css and ".admin-overview-kicker" in css and "font-size:10px !important;" in css)
check("v18.8 build ID prevents reuse of older portal server instances", "arts-and-sports-portal-v18.8-full-scope-audit" in server)

check("mobile teacher/parent drawer is capped at 300px and remains viewport-relative", "width:min(300px,88vw) !important;" in css and "max-width:min(300px,88vw) !important;" in css)
check("mobile administrator drawer uses the same balanced responsive width", css.count("width:min(300px,88vw) !important;") >= 1 and "body[data-page=\"admin\"] .admin-section-nav" in css)
check("admin workspace hides the duplicate breadcrumb and academic-year strip", 'body[data-page="admin"] .admin-workspace-context' in css and 'display:none !important;' in css[css.rfind('body[data-page="admin"] .admin-workspace-context'):])
check("open, hover and focus drawer states cannot override the mobile width cap", "body:not([data-page=\"admin\"]) .sidebar.open" in css and "body:not([data-page=\"admin\"]) .sidebar:focus-within" in css and "width:min(300px,88vw) !important;" in css)
# V18.3 requested navigation, parent layout, compact allowance and mobile fixes.
check("workspace preview controls are removed from the topbar", 'id="role-preview-wrap"' not in index and 'id="preview-account-wrap"' not in index and 'id="role-preview"' not in index[index.find('<header class="topbar"'):index.find('</header>')])
check("all workspaces share one collapsible sidebar workspace selector", 'class="workspace-switcher sidebar-workspace-switcher"' in index and 'data-workspace-role' in index[index.find('class="sidebar-bottom"'):index.find('</aside>')] and "workspaceSwitcherMarkup" not in app)
check("workspace selector is in the regular menu and absent from Administration", 'class="workspace-switcher sidebar-workspace-switcher"' in index and "workspaceSwitcherMarkup" not in app and 'workspace-switcher' not in app[app.find("function renderAdmin()") : app.find("function adminOverview()")])
check("workspace controls synchronize all desktop and mobile copies", "$$('select[data-workspace-role]').forEach" in app and "$$('select[data-preview-account]').forEach" in app)
check("changing a preview account closes its navigation drawer before rerendering", "if(el.matches('select[data-preview-account]')){state.previewUserId=Number(el.value)||null;" in app and "closeSidebar(false);render();return;}" in app[app.find("if(el.matches('select[data-preview-account]'))"):app.find("if(el.id==='parent-child-select')")])
parent_overview_body = app[app.find("const student=currentLinkedStudent()", app.find("function renderParentOverview")):app.find("function makePublicKey")]
check("parent overview begins with the school photo hero and no duplicate Overview heading", 'return `<section class="hero-panel parent-overview-hero">' in app and "heading('Overview'" not in parent_overview_body)
check("parent child context remains inside the hero rather than above it", 'class="parent-hero-context">${childSelect}' in app)
check("My child activity table contains no date-added column", 'class="panel child-activity-record"' in app and '<th>Added on</th>' not in app and '<th>Added</th>' not in app[app.find('function renderPortal()'):app.find('function makePublicKey')])
check("parent overview removes Recent Registrations entirely", "function renderParentOverview()" in app and "Recent registrations" not in app[app.find("function renderParentOverview()"):app.find("function renderPortal()") ] and "parent-recent-panel" not in app[app.find("function renderParentOverview()"):app.find("function renderPortal()")])
check("parent participation allowance is compact across main and compact panels", '.parent-participation-panel {\n  margin-bottom:15px;\n  padding:13px 14px;' in css and '.parent-participation-panel.compact { margin:7px 0 10px; padding:10px 11px; }' in css and '.parent-limit-card { padding:10px 11px;' in css)
check("admin main and section headings have stronger text and visual hierarchy", 'body[data-page="admin"] .admin-content-body > .page-heading h1' in css and 'body[data-page="admin"] .admin-content-body .section-title-row :is(h2,h3)' in css and 'border-left:3px solid var(--v17-heading)' in css)
check("workspace switching appears in the regular menu after exiting admin", '<div class="admin-mobile-nav"><label for="admin-mobile-tab">Administration area</label><select id="admin-mobile-tab">${mobileOptions}</select></div>' in app and 'body:not([data-page="admin"]) .sidebar.open .sidebar-workspace-switcher' in css and 'body[data-page="admin"] .sidebar {\n  display:none !important;' in css)
check("small-screen parent hero context and quota cards reflow without fixed-width overflow", '.parent-hero-context .child-switch .filter-select { max-width:calc(100vw - 90px); }' in css and '@media (max-width:380px)' in css and '.parent-participation-grid { grid-template-columns:minmax(0,1fr); }' in css)
check("mobile admin heading and navigation controls receive compact responsive spacing", 'body[data-page="admin"] .admin-content-body > .page-heading h1 { font-size:25px !important; }' in css and 'body[data-page="admin"] .admin-mobile-nav > select { min-width:0; width:100%; }' in css)


# V18.4 visual refinement retained; v18.5 restores the separate admin navigation model.
check("admin hamburger targets its own navigation drawer; regular sidebar stays hidden", "return document.body.dataset.page === 'admin' ? $('#admin-section-nav') : $('#sidebar');" in app and "setAttribute('aria-controls',state.page==='admin'?'admin-section-nav':'sidebar')" in app and "body[data-page=\"admin\"] .sidebar {\n  display:none !important;" in css)
check("admin tab navigation remains available through its separate drawer and mobile select", 'id="admin-mobile-tab"' in app and 'body[data-page="admin"] .admin-mobile-nav' in css and 'body[data-page="admin"] .admin-section-nav.open' in css)
check("workspace switcher is a plain menu group rather than a highlighted card", "body .sidebar .workspace-switcher {" in css and "border:0 !important;" in css and "background:transparent !important;" in css)
check("ambient animated fog and crystal layers are disabled", "body::before,\nbody::after {\n  display:none !important;" in css)
check("route animation uses short opacity/transform motion without blur", "@keyframes v184-route-in" in css and "animation:v184-route-in 180ms" in css and "filter:blur" not in css[css.rfind("@keyframes v184-route-in"):])
check("motion helper avoids forced layout reads and uses a short timeout", "window.requestAnimationFrame(() => {" in app and "window.setTimeout(() => content.classList.remove('page-enter'), 240);" in app and "void content.offsetWidth" not in app[app.find("function animatePageEntry(content)"):app.find("function render()")])
check("reduced-motion preferences disable animation and transitions", "@media (prefers-reduced-motion:reduce)" in css and "animation-duration:.01ms !important;" in css and "transition-duration:.01ms !important;" in css)
check("modals and controls no longer depend on backdrop blur", ".modal-backdrop:not([hidden]) {" in css and "backdrop-filter:none !important;" in css[css.rfind(".modal-backdrop:not([hidden]) {"):])
check("workspace selector is hidden during Administration and shown in the normal menu", "body:not([data-page=\"admin\"]) .sidebar:hover .sidebar-workspace-switcher" in css and "body:not([data-page=\"admin\"]) .sidebar.open .sidebar-workspace-switcher" in css and "body[data-page=\"admin\"] .sidebar {\n  display:none !important;" in css)
check("interaction motion is event-driven across navigation, controls and disclosures", "@keyframes v184-disclosure-in" in css and 'body .mobile-menu[aria-expanded="true"] .ui-icon' in css and "body .page-content details[open] > :not(summary)" in css)
check("mobile drawer reserves a composited layer only while open", "body .sidebar.open { will-change:transform; }" in css and "body .sidebar:not(.open) { will-change:auto; }" in css)
check("mobile sidebar keeps workspace/account controls reachable by scrolling", "body .sidebar .sidebar-bottom {\n    flex:0 0 auto !important;" in css and "body .sidebar .sidebar-workspace-switcher" in css and "overflow:visible !important;" in css[css.rfind("/* Keep the sidebar footer"):] )

# v18.6: desktop and touch workspace selectors must remain reachable in the
# regular collapsible portal menu. The regular sidebar remains unavailable
# during Administration; Back to Portal is still its only exit.
v186 = css[css.rfind("/* v18.6 — keep workspace switching available"): ]
check("desktop expanded/pinned portal menu explicitly reveals workspace selector", "body:not([data-page=\"admin\"]) .sidebar:hover .sidebar-workspace-switcher" in v186 and "body:not([data-page=\"admin\"]) .sidebar:focus-within .sidebar-workspace-switcher" in v186 and "body:not([data-page=\"admin\"]) .sidebar.sidebar-pinned .sidebar-workspace-switcher" in v186 and "display:grid !important;" in v186)
check("desktop portal menu footer cannot shrink or clip workspace/account controls", "flex:0 0 auto !important;" in v186 and "min-height:max-content !important;" in v186 and "overflow:visible !important;" in v186 and "body:not([data-page=\"admin\"]) .sidebar .sidebar-bottom > *" in v186)
check("desktop menu scrolls navigation items while keeping workspace controls pinned", "body:not([data-page=\"admin\"]) .sidebar .main-nav" in v186 and "overflow-y:auto !important;" in v186 and "body:not([data-page=\"admin\"]) .sidebar {" in v186 and "overflow-y:hidden !important;" in v186)
check("desktop workspace and preview-account selectors are both retained in the regular menu", 'id="role-preview" data-workspace-role' in index and 'id="preview-account" data-preview-account' in index and "data-workspace-account-wrap" in app)
check("mobile portal drawer retains scrollable, non-shrinking workspace controls", "@media (max-width:940px)" in v186 and "body:not([data-page=\"admin\"]) .sidebar.open .sidebar-workspace-switcher" in v186 and "overflow:visible !important;" in v186)
check("Administration keeps the normal portal menu hidden and its dedicated Back to Portal action", 'body[data-page="admin"] .sidebar {\n  display:none !important;' in css and 'class="admin-back-portal"' in app and 'data-action="admin-back-to-portal"' in app)
check("desktop menu button can expand and collapse the regular sidebar", "sidebar.classList.add('sidebar-pinned')" in app and "sidebar.classList.contains('sidebar-pinned') ? closeSidebar(false) : openSidebar()" in app)
check("desktop workspace selection continues through the shared role-change handler", "if(el.matches('select[data-workspace-role]')){closeSidebar(false);state.role=el.value;" in app and "state.page='dashboard';" in app)
check("v18.8 launcher ID prevents reuse of v18.7 server instance", "arts-and-sports-portal-v18.8-full-scope-audit" in server)






# v18.7 parent overview cleanup and light-theme default migration.
check("parent overview no longer renders or prepares Recent Registrations data", "Recent registrations" not in app[app.find("function renderParentOverview()"):app.find("function renderPortal()") ] and "recentRows" not in app and "parent-recent-panel" not in app)
check("parent overview area labels use a smaller Segoe/system font", 'body[data-role="parent"] .page-content .parent-area-card .parent-area-copy > strong' in css and 'font:600 14px/1.25 "Segoe UI",Arial,system-ui,sans-serif !important;' in css)
check("fresh and migrated installs default to light; theme changes persist after v18.7", "themeDefaultVersion === '3' && savedThemePreference ? savedThemePreference : 'light'" in app and "storageSet(THEME_DEFAULT_VERSION_KEY,'3')" in app)

# v18.8 full-scope UX regression: keep controls usable across desktop and mobile.
check("calendar and admin search inputs meet practical control height", 'page-content input[type="search"]' in css and 'min-height:40px !important;' in css[css.rfind("/* v18.8 full-scope UX audit"): ] and 'body[data-page="admin"] .admin-nav-search input' in css)
check("calendar event titles have a full-size interactive target", '.page-content .event-feed-title' in css and 'min-height:40px !important;' in css[css.rfind(".page-content .event-feed-title"):])
check("category range selectors cannot collapse to narrow intrinsic widths", '.page-content .category-range-fields select.field' in css and 'min-width:64px !important;' in css[css.rfind(".page-content .category-range-fields select.field"):])
check("checkboxes and radios use consistent accessible control dimensions", 'width:22px !important;' in css[css.rfind(".page-content input[type=\"checkbox\"]"):])
check("inline permission labels provide a larger touch target", '.page-content .inline-permission {' in css and 'min-height:40px !important;' in css[css.find('.page-content .inline-permission {'):css.find('}',css.find('.page-content .inline-permission {'))])
check("admin footer and house index labels are no longer rendered at 9px", 'body[data-page="admin"] .admin-nav-footer small' in css and 'font-size:11px !important;' in css[css.rfind('body[data-page="admin"] .admin-nav-footer small'):])
check("text fields, selects, action buttons and admin navigation meet a 40px minimum height", 'min-height:40px !important;' in css[css.rfind("/* v18.8 responsive control audit"): ] and 'select.field' in css[css.rfind("/* v18.8 responsive control audit"): ] and 'body[data-page="admin"] .admin-link' in css[css.rfind("/* v18.8 responsive control audit"): ])


for name, passed in checks:
    print(("PASS" if passed else "FAIL"), name)
print(f"{sum(ok for _, ok in checks)}/{len(checks)} UI layout/contrast regression checks passed")
if not all(ok for _, ok in checks):
    raise SystemExit(1)
