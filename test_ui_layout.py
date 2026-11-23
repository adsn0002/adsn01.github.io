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
check("admin mobile drawer uses its own backdrop in the correct layer", "body[data-page=\"admin\"].admin-sidebar-open .main-area::before" in css and "body[data-page=\"admin\"] .mobile-scrim { display:none !important; }" in css)
check("mobile menu controls remain within the viewport at 320px", "@media (max-width:380px)" in css and ".breadcrumb { max-width:54px !important; }" in css and ".global-search { flex-basis:80px !important; max-width:112px !important; }" in css)
check("mobile header hides optional role/account selectors", ".year-pill,.role-preview,.account-preview,.top-user { display:none !important; }" in css)
check("tables scroll inside their own wrapper rather than forcing page width", ".page-content .table-wrap { width: 100%; max-width: 100%; min-width: 0; overflow-x: auto !important" in css and ".page-content .data-table { width: 100%; max-width: none; }" in css)
check("forms and page grids can shrink without child overflow", ".page-content :is(.form-field,.filter-field,.form-grid > *, .settings-grid > *, .toolbar > *, .filter-drawer > *) { min-width: 0; max-width: 100%; }" in css)
check("modals remain inside viewport height", "max-height: min(92dvh,900px)" in css and ".modal-body { min-width: 0; max-width: 100%; overflow: auto" in css)

# Drawer behaviour and focus management.
check("both normal and admin drawers have visible mobile close controls", 'id="sidebar-close"' in index and 'id="admin-nav-close"' in app and ".sidebar-mobile-close,.admin-nav-close { display:grid !important" in css)
check("drawer open state makes background inert and aria-hidden", "node.inert=!!open" in app and "node.setAttribute('aria-hidden','true')" in app)
check("drawer traps keyboard focus and closes with Escape", "if(event.key==='Tab'&&!isDrawerOpen)return" not in app and "if(event.key!=='Tab'||!isDrawerOpen)return" in app and "event.key==='Escape'" in app and "last.focus({preventScroll:true})" in app)
check("drawer close restores focus after background is re-enabled", "setNavigationBackgroundInert(false,false)" in app and "returnTarget.focus({preventScroll:true})" in app)
check("switching workspace role clears drawer and inert state", "if(el.id==='role-preview'){closeSidebar(false);state.role=el.value;" in app)
check("admin drawer outside click is handled", "adminNav?.classList.contains('open')&&!adminNav.contains(target)" in app)

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
check("admin navigation always exposes a Back to Portal exit action", 'data-action="admin-back-to-portal"' in app and 'Back to Portal' in app)
check("Back to Portal action is restricted to administrators", "'admin-back-to-portal'" in app[app.find("const adminOnly = new Set"):app.find("if (adminOnly.has(action)")])
check("Back to Portal resets admin tab and navigates to portal dashboard", "case 'admin-back-to-portal':" in app and "state.adminTab='overview';" in app and "navigate('dashboard');" in app)
check("Back to Portal control has full-width theme-aware visible styling", 'body[data-page="admin"] .admin-back-portal' in css and 'background:var(--v17-surface-2)' in css and 'color:var(--v17-text)' in css)
check("Back to Portal control has keyboard-visible focus treatment", '.admin-back-portal:focus-visible' in css and 'outline-offset:2px' in css)
check("admin overview quick links use theme-aware neutral text", "body[data-page=\"admin\"] .admin-inline-link,\nbody[data-page=\"admin\"] .admin-quick-action:hover .admin-quick-copy strong" in css and "color:var(--v17-text-2) !important" in css)
check("admin recent markers and area bars use one neutral tone", "body[data-page=\"admin\"] .admin-recent-mark,\nbody[data-page=\"admin\"] .admin-recent-item:nth-child(2n) .admin-recent-mark" in css and "background:var(--v17-muted-2) !important" in css)
check("success/warning/error toasts use muted theme surfaces", ".toast.success,.toast.warning,.toast.error {\n  background:var(--v17-surface-2) !important;" in css)
check("dark-mode toast surface remains dark and neutral", ":root[data-theme=\"dark\"] .toast.success" in css and "background:#26333F !important" in css)
check("admin selected counts are not highlighted with the active row", "body[data-page=\"admin\"] .admin-link.active small" in css and "background:transparent !important" in css)
check("light/dark input placeholders use theme-specific readable values", "--v17-placeholder:#5E6F80" in css and "--v17-placeholder:#B7C3CE" in css)
check("reduced motion disables navigation, chart and ambient transitions", "@media (prefers-reduced-motion: reduce)" in css and "animation-duration:.01ms" in css and "transition:none !important" in css)
check("custom scrollbar tracks and thumbs are defined for both themes", "::-webkit-scrollbar-thumb" in css and ":root[data-theme=\"dark\"] ::-webkit-scrollbar-thumb" in css)
check("launcher build ID is unique to v18.2", "arts-and-sports-portal-v18.2-parent-overview-and-area-quota-fixes" in server)

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
check("v18.2 build ID prevents reuse of an older server instance", "arts-and-sports-portal-v18.2-parent-overview-and-area-quota-fixes" in server)

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
check("v18.2 build ID prevents reuse of older portal server instances", "arts-and-sports-portal-v18.2-parent-overview-and-area-quota-fixes" in server)

check("mobile teacher/parent drawer is capped at 300px and remains viewport-relative", "width:min(300px,88vw) !important;" in css and "max-width:min(300px,88vw) !important;" in css)
check("mobile administrator drawer uses the same balanced responsive width", css.count("width:min(300px,88vw) !important;") >= 1 and "body[data-page=\"admin\"] .admin-section-nav" in css)
check("admin workspace hides the duplicate breadcrumb and academic-year strip", 'body[data-page="admin"] .admin-workspace-context' in css and 'display:none !important;' in css[css.rfind('body[data-page="admin"] .admin-workspace-context'):])
check("open, hover and focus drawer states cannot override the mobile width cap", "body:not([data-page=\"admin\"]) .sidebar.open" in css and "body:not([data-page=\"admin\"]) .sidebar:focus-within" in css and "width:min(300px,88vw) !important;" in css)
for name, passed in checks:
    print(("PASS" if passed else "FAIL"), name)
print(f"{sum(ok for _, ok in checks)}/{len(checks)} UI layout/contrast regression checks passed")
if not all(ok for _, ok in checks):
    raise SystemExit(1)
