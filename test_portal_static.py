from pathlib import Path
from html.parser import HTMLParser
import re
ROOT=Path(__file__).resolve().parent

class MarkupAudit(HTMLParser):
    def __init__(self): super().__init__(); self.inline_scripts=0; self.inline_handlers=[]; self.csp=0
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if tag.lower()=='script' and not a.get('src'): self.inline_scripts+=1
        for key in a:
            if key.lower().startswith('on'): self.inline_handlers.append((tag,key))
        if tag.lower()=='meta' and a.get('http-equiv','').lower()=='content-security-policy': self.csp+=1

checks=[]
def check(name,ok): checks.append((name,bool(ok)))

for filename in ('index.html','poll.html','poll-live.html'):
    parser=MarkupAudit(); parser.feed((ROOT/filename).read_text(encoding='utf-8'))
    check(f'{filename}: meta CSP present',parser.csp==1)
    check(f'{filename}: no inline script blocks',parser.inline_scripts==0)
    check(f'{filename}: no inline event-handler attributes',not parser.inline_handlers)

app=(ROOT/'app.js').read_text(encoding='utf-8')
check('House Team picker escapes student names', "${esc(student.name)}" in app and 'data-group-team-students' in app)
check('shared option builder escapes values and labels', 'function selectOptions' in app and '${esc(value)}' in app and '${esc(label)}' in app)
check('demo reset snapshots and restores portal storage', "case 'demo-reset'" in app and 'snapshotPortalDataStorage()' in app and 'restorePortalDataStorage(storageSnapshot)' in app)
check('parent results are scoped to linked children', 'const childIds=new Set(children.map(student=>Number(student.id)))' in app and 'childIds.has(Number(result.studentId))' in app)
parent_results=app[app.index('  function renderResults() {'):app.index('  function physicalPrintFiltersMarkup() {')]
check('parent results view contains no Sahodaya output', "if(state.role==='parent')" in parent_results and 'Sahodaya' not in parent_results.split('    const f=state.resultsFilters',1)[0])
parent_overview=app[app.index('  function renderParentOverview() {'):app.index('  function renderPortal() {')]
parent_portal=app[app.index('  function renderPortal() {'):app.index('  function makePublicKey()')]
check('parent programme table omits Sahodaya', 'Sahodaya' not in parent_overview)
check('parent child activity table omits Sahodaya', 'Sahodaya' not in parent_portal)
check('parent overview omits the duplicate Student Activity child identity banner', 'parent-overview-intro' not in parent_overview and 'STUDENT ACTIVITY' not in parent_overview)
check('parent overview removes duplicate registration number tiles already covered by participation limits', 'parent-summary-grid' not in parent_overview and 'Arts registrations' not in parent_overview and 'Eligible choices' not in parent_overview)
check('parent participation activity region follows the hero directly', parent_overview.index('class="hero-panel parent-overview-hero"') < parent_overview.index('parentParticipationPanel(student)') and 'parent-summary-grid' not in parent_overview and 'parent-overview-intro' not in parent_overview)
check('parent Arts page shows only Arts participation allowance', "parentParticipationPanel(parentStudent,true,participationScope)" in app and "const participationScope=kind==='arts'||kind==='sports'?kind:'all';" in app and 'scope-${scope}' in app and '.parent-participation-panel.scope-arts' in (ROOT/'styles.css').read_text(encoding='utf-8'))
check('parent Sports page shows only Sports participation allowance', "showArts=scope===\'all\'||scope===\'arts\'" in app and "showSports=scope===\'all\'||scope===\'sports\'" in app and '.parent-participation-panel.scope-sports' in (ROOT/'styles.css').read_text(encoding='utf-8'))
check('parent overview retains the combined Arts and Sports participation allowance', 'parentParticipationPanel(student)' in parent_overview and "showGroups=scope===\'all\'||scope===\'groups\'" in app)
check('parent navigation uses Results-only label', 'data-roles="parent">Results</span>' in (ROOT/'index.html').read_text(encoding='utf-8'))
check('administrator uses a single consistent modern system font stack', 'body[data-page="admin"] *,' in (ROOT/'styles.css').read_text(encoding='utf-8') and 'font-family:Inter,ui-sans-serif,system-ui' in (ROOT/'styles.css').read_text(encoding='utf-8'))
admin_render=app[app.index('  function renderAdmin() {'):app.index('  function adminOverview() {')]
check('admin navigation groups are permanently visible, not accordion-only', '<section class="admin-nav-group' in admin_render and '<details class="admin-nav-group"' not in admin_render)
check('admin retains its separate section navigation and hides the regular portal menu', 'admin-workspace-v2' in admin_render and 'admin-section-nav' in admin_render and 'admin-content-v2' in admin_render and 'body[data-page="admin"] .sidebar {\n  display:none !important;' in (ROOT/'styles.css').read_text(encoding='utf-8'))
check('admin section index has working search control', 'id=\"admin-nav-search\"' in admin_render and "if(el.id==='admin-nav-search')" in app)
check('Back to Portal is inside the separate Administration navigation', 'data-action="admin-back-to-portal"' in admin_render and 'class="admin-back-portal"' in admin_render and 'data-action="admin-back-to-portal"' not in (ROOT/'index.html').read_text(encoding='utf-8'))
check('admin mobile navigation selector is present and handled', 'id=\"admin-mobile-tab\"' in admin_render and "if(el.id==='admin-mobile-tab'" in app)
check('all original administration tab routes remain mapped', all(("case '%s':content=" % tab) in admin_render for tab in ['students','movement','incomplete','admins','teachers','parents','class-teachers','houses','programmes','registrations','rules','windows','events','school','elections','data','audit']))
check('admin overview uses a flat metrics strip rather than metric cards', 'admin-stats-strip' in app and 'admin-metric-grid' not in app[app.index('  function adminOverview() {'):app.index('  function adminStudents() {')])
check('admin page mode is reflected on body for scoped layout', 'document.body.dataset.page = state.page;' in app)
check('admin workspace has responsive mobile selector and breakpoints', '.admin-mobile-nav { display:none; }' in (ROOT/'styles.css').read_text(encoding='utf-8') and '@media (max-width:850px)' in (ROOT/'styles.css').read_text(encoding='utf-8'))
check('admin typography uses the shared Inter/system UI stack', 'body[data-page="admin"] *,' in (ROOT/'styles.css').read_text(encoding='utf-8') and 'font-family:Inter,ui-sans-serif,system-ui' in (ROOT/'styles.css').read_text(encoding='utf-8'))
check('admin task navigation is text-first, not icon tile grid', 'admin-quick-copy' in app and 'admin-quick-icon' not in app[app.index('  function adminOverview() {'):app.index('  function adminStudents() {')])
for name in ('arts-feature-new.webp','arts-performance-new.webp','sports-feature-new.webp','sports-action-new.webp'):
    check(f'new programme image exists: {name}',(ROOT/'assets'/name).is_file())
for asset in ('arts-feature-new.webp','arts-performance-new.webp','sports-feature-new.webp','sports-action-new.webp'):
    check(f'app references new art/sports asset: {asset}',asset in app or asset in (ROOT/'styles.css').read_text(encoding='utf-8'))
for marker,label in [
    ('Student archive could not be saved','student archive save guard'),
    ('Programme archive could not be saved','programme archive save guard'),
    ('The programme choice could not be saved','parent registration save guard'),
    ('The bulk move could not be saved','bulk student move save guard'),
    ('Parent portal access could not be saved','parent access save guard'),
    ('The class-teacher assignment could not be saved','class teacher save guard'),
    ('House assignments could not be saved','mass house assignment save guard'),
    ('Student restore could not be saved','student restore save guard'),
    ('Programme restore could not be saved','programme restore save guard'),
    ('Programme copy could not be saved','programme duplicate save guard'),
    ('The registration removal could not be saved','registration removal save guard'),
    ('The rank could not be cleared','rank clear save guard'),
    ('The event could not be deleted','event delete save guard'),
    ('The account change could not be saved','account disable save guard'),
    ('The student record could not be saved','new student save guard'),
    ('The section assignment could not be saved','unsectioned assignment save guard'),
    ('The student move could not be saved','individual student movement save guard'),
    ('Programme deadlines could not be saved','bulk deadline save guard'),
    ('Publication settings could not be saved','publication visibility save guard'),
    ('Parent portal access could not be saved','parent access save guard'),
    ('The house assignment could not be saved','teacher house assignment save guard'),
    ('Demo reset failed and rollback could not be verified','demo reset rollback failure path'),
]: check(label,marker in app)

server=(ROOT/'start_portal.py').read_text(encoding='utf-8')
supabase_setup=(ROOT/'supabase'/'setup.sql').read_text(encoding='utf-8')
atomic_migration=(ROOT/'supabase'/'migrations'/'20261124080328_atomic_demo_workspace_publish.sql').read_text(encoding='utf-8')
check('shared workspace publishing uses one atomic Supabase RPC', "portal_storage_replace_workspace" in app and "const writeResponse=await fetch(rpcUrl" in app and "for(const row of remoteRows)" not in app)
check('atomic publish RPC is SECURITY INVOKER and validates payload size', 'security invoker' in supabase_setup.lower() and 'octet_length(item->>\'value\') > 2000000' in supabase_setup and 'jsonb_array_length(p_rows) > 1000' in supabase_setup)
check('database setup narrows anonymous grants and removes truncate/trigger/reference', 'revoke truncate, references, trigger on table public.portal_storage from anon' in supabase_setup and 'revoke all privileges on table public.portal_storage from authenticated' in supabase_setup)
check('database setup constrains storage key format and value size', 'portal_storage_key_format_check' in supabase_setup and 'portal_storage_value_size_check' in supabase_setup)
check('local launcher serves the Supabase browser config', '"supabase-config.js"' in server)
check('local launcher serves the Benhill crest', '"benhill-crest.jpg"' in server)
check('local launcher CSP permits the configured Supabase origin', "connect-src 'self' https://fockkhxdvplmldoobnze.supabase.co" in server)
check('atomic publish migration matches the checked-in setup function', 'portal_storage_replace_workspace' in atomic_migration and 'security invoker' in atomic_migration.lower())
check('launcher build ID is unique to v18.8 full-scope audit', 'arts-and-sports-portal-v18.8-full-scope-audit' in server)
styles=(ROOT/'styles.css').read_text(encoding='utf-8')
check('v16 whole-site palette uses warm paper, mineral blue-grey and restrained school brick', '--v16-paper: #F5F1E9' in styles and '--v16-mineral: #DCE4EB' in styles and '--v16-brick: #822811' in styles)
check('v16 dark theme provides matching school palette tokens', '--v16-paper: #151E29' in styles and '--v16-mineral: #253448' in styles and '--v16-brick: #D4937D' in styles)
check('admin scope maps palette tokens without self-referential custom properties', '--ink: var(--v16-ink)' in styles and '--surface: var(--v16-surface-solid)' in styles and '--shadow: var(--v16-shadow)' in styles)
check('whole-site palette applies to parent and teacher shared components', 'body:not([data-page="admin"]) .sidebar' in styles and '.hero-panel, .detail-hero' in styles and '.programme-card' in styles and '.child-profile-card' in styles)
check('admin palette explicitly remaps legacy scoped tokens to v16 shared theme', '--admin-canvas: var(--v16-paper)' in styles and '--admin-accent: var(--v16-brick)' in styles and '--paper: var(--v16-paper)' in styles and '--brand: var(--v16-brick)' in styles)
check('responsive overlap guardrails include global grids and nested children', '.page-content > *' in styles and 'grid-template-columns: repeat(auto-fit, minmax(min(100%' in styles and '.table-wrap { width: 100%' in styles)
check('reduced-motion accessibility fallback is present', '@media (prefers-reduced-motion: reduce)' in styles)
check('page transition only animates on route changes', 'function animatePageEntry(content)' in app and 'const routeChanged = lastRenderedPage !== motionKey' in app and "state.page === 'admin' ? state.adminTab" in app and "state.role === 'parent' ? state.parentTab" in app)
check('standalone poll pages share v16 school palette and reduced-motion system', '--paper:#F5F1E9' in (ROOT/'poll.css').read_text(encoding='utf-8') and '--surface-2:#DCE4EB' in (ROOT/'poll.css').read_text(encoding='utf-8') and 'prefers-reduced-motion:reduce' in (ROOT/'poll.css').read_text(encoding='utf-8'))
check('admin mobile workspace removes main offset and allows topbar wrapping', 'body[data-page=\"admin\"] .main-area { margin-left: 0; }' in styles and 'body[data-page=\"admin\"] .topbar { height: auto' in styles)
# V16 whole-site design system, navigation rail, motion and responsive safeguards.
check('duplicate workspace rail removed from the single-navigation shell', 'class="workspace-rail"' not in (ROOT/'index.html').read_text(encoding='utf-8'))
check('workspace rail handlers and branding references removed', "$('#rail-home')?.addEventListener" not in app and "rail-school-logo" not in app)
check('teacher and parent use the regular collapsible menu while admin keeps its independent section navigation', 'body .sidebar:hover' in styles and 'body .sidebar:focus-within' in styles and 'body[data-page="admin"] .sidebar {\n  display:none !important;' in styles and 'body[data-page="admin"] .admin-workspace-v2 { grid-template-columns:224px minmax(0,1fr) !important; gap:0 !important; }' in styles)
check('mobile sidebar has drawer, scrim, escape close and scroll lock', 'body .sidebar.open' in styles and '.mobile-scrim.open' in styles and "event.key==='Escape'" in app and 'sidebar-open' in app)
check('mobile menu declares sidebar control state and uses explicit open/close handlers', 'aria-controls="sidebar"' in (ROOT/'index.html').read_text(encoding='utf-8') and 'function openSidebar()' in app and "setAttribute('aria-expanded','true')" in app and "setAttribute('aria-expanded','false')" in app)
check('light and dark theme use independent semantic contrast tokens', '--v17-text: #26384B' in styles and '--v17-text: #F2F5F7' in styles and '--v17-heading: #E6A994' in styles)
check('global student search is a plain field, not a glass panel', '.topbar .global-search' in styles and 'backdrop-filter:none !important' in styles and 'background:var(--v17-surface) !important' in styles)
check('animated fog and crystal shapes continuously zoom and drift', 'v17-fog-wander' in styles and 'v17-crystal-breathe' in styles and 'scale(1.12)' in styles)
check('custom scrollbar colours cover light and dark mode', '::-webkit-scrollbar-thumb' in styles and 'scrollbar-color: #65798D #202D3B' in styles)
check('hero and school images remain sharp', 'img#school-logo' in styles and 'filter: none !important' in styles)
check('dark mode updates browser theme colour meta', "themeMeta.content=state.theme==='dark'?'#111923':'#F5F1E9'" in app)
check('V16 removes green/evergreen from functional action palette', '--v16-action: #344A61' in styles and '--v16-action: #286b60' not in styles and '--v16-action: #79b9a9' not in styles)
check('V16 palette uses brick only as limited accent and headings', '--v16-brick: #822811' in styles and 'body[data-page="admin"] .admin-overview-lead h1' in styles)
check('V16 legacy green status dots are mapped to brick or slate neutrals', '.admin-system-state i { background: var(--v16-action)' in styles and '.sidebar-status i { background: var(--v16-brick)' in styles)
check('V16 glass navigation pane and blurred translucent surfaces are present', 'backdrop-filter: blur(22px) saturate(135%)' in styles and '--v16-glass:' in styles)
check('V16 ambient fog and floating crystal animations are defined', 'v16-fog-drift' in styles and 'v16-crystal-float' in styles)
check('V16 page, modal, cards and chart transitions are defined', 'v16-page-arrive' in styles and 'v16-dialog-arrive' in styles and 'v16-chart-grow' in styles)
check('V16 reduced-motion fallback disables animation and smooth scroll', '@media (prefers-reduced-motion: reduce)' in styles and 'animation-duration:.01ms' in styles)
check('V16 role-aware responsive rail and side navigation are present', '@media (max-width: 940px)' in styles and 'body:not([data-page="admin"]) .main-area' in styles and 'body[data-page="admin"] .main-area' in styles)
check('V17 layout containment guards forms, toolbars, grids and modal dimensions', '.page-content :is(.form-field,.filter-field,.form-grid > *, .settings-grid > *, .toolbar > *, .filter-drawer > *)' in styles and 'max-height: min(92dvh,900px)' in styles)
check('V17 removes mobile sidebar blur to prevent stuck/blurred drawer', 'backdrop-filter: none !important' in styles and 'body .sidebar.open' in styles)

# V17.2 mobile, parent catalogue, navigation visibility, and icon fixes.
index=(ROOT/'index.html').read_text(encoding='utf-8')
check('local SVG icon sprite is embedded and offline', 'id="icon-house"' in index and 'id="icon-search"' in index and 'class="ui-icon"' in index)
check('main navigation uses consistent SVG icons rather than text glyphs', '<use href="#icon-house"></use>' in index and '<use href="#icon-users"></use>' in index and '<span class="nav-icon">⌂</span>' not in index)
check('parents have Arts, Sports and Group Items programme navigation', all(f'data-page="{page}" data-roles="admin,teacher,parent"' in index for page in ('arts','sports','groups')))
check('parents cannot see staff-only sections because hidden rules win', 'data-roles="admin,teacher">STAFF WORKSPACE' in index and '#main-nav [hidden]' in styles and "node.hidden=!allowed" in app)
check('parent overview is summary-only and links to programme areas', 'function renderParentOverview()' in app and 'Choose an activity area' in app and 'data-page="${area.key}"' in app and 'programmeCards' not in app[app.index('  function renderParentOverview() {'):app.index('  function renderPortal() {')])
check('parent overview includes the shared school-image hero panel', 'class="hero-panel parent-overview-hero"' in parent_overview and 'PARENT PORTAL' in parent_overview and 'dashboardBackground' not in parent_overview)
check('parent overview removes Recent Registrations and its unused lookup', 'Recent registrations' not in parent_overview and 'parent-recent-panel' not in parent_overview and 'recentRows' not in parent_overview and 'const regs=registrationsFor(student.id)' not in parent_overview)
check('parent overview area labels use a smaller Segoe/system font', 'body[data-role="parent"] .page-content .parent-area-card .parent-area-copy > strong' in (ROOT/'styles.css').read_text(encoding='utf-8') and 'font:600 14px/1.25 "Segoe UI",Arial,system-ui,sans-serif !important;' in (ROOT/'styles.css').read_text(encoding='utf-8'))
check('archived Arts/Sports programmes do not consume active participation quotas', 'programme&&!programme.archived&&programme.area===area' in app[app.index('  function selectedProgrammeCount('):app.index('  function quotaStatus(')])

check('theme default migrates to light and remembers later explicit selections', "themeDefaultVersion === '3' && savedThemePreference ? savedThemePreference : 'light'" in app and "storageSet(THEME_DEFAULT_VERSION_KEY,'3')" in app)
check('parent participation panel displays separate Arts and Sports totals', 'function parentParticipationPanel(student, compact=false, scope=\'all\')' in app and 'artsUsed' in app and 'sportsUsed' in app and 'maxArtsOnstage' in app and 'maxSports' in app)
check('parent participation limits show Onstage/Offstage and Track/Field usage', "meter('Onstage'" in app and "meter('Offstage'" in app and "meter('Track'" in app and "meter('Field'" in app)
check('parent Sports quota documents full allocations from configured caps', 'fullSportsAllocations' in app and 'sportsAllocationNote' in app and 'maxSportsTrack' in app and 'maxSportsField' in app)
check('parent registration pages keep participation limits visible', 'parentParticipationPanel(parentStudent,true,participationScope)' in app)
check('Group Items remain separate from individual Arts and Sports quotas', "if(programme.category==='Group Item'){counts.groups++;continue;}" in app and 'maxGroup' in app)
check('parent programme pages use compact dedicated cards', 'function parentProgrammeCard(p, student)' in app and 'parent-compact-programme-grid' in app and "rows.map(p=>parentProgrammeCard(p,currentLinkedStudent()))" in app)
check('parent registration is directly available within programme area pages', "btn('Register child','portal-select'" in app and "case 'portal-select'" in app)
check('parent programme routes are permitted while staff detail routes stay restricted', "arts: ['admin','teacher','parent'], sports: ['admin','teacher','parent'], groups: ['admin','teacher','parent']" in app and "'programme-detail': ['admin','teacher']" in app)
check('mobile drawer uses root stacking order above its scrim', '.app-shell { position:relative !important; z-index:auto !important;' in styles and '.sidebar { z-index:1300; }' in styles and '.mobile-scrim { z-index:1200; }' in styles)
check('mobile drawer locks background scrolling without fixed-body jump hacks', "document.body.classList.add('sidebar-open')" in app and 'body.sidebar-open { overflow:hidden' in styles and "document.body.style.position='fixed'" not in app and 'overscroll-behavior:contain' in styles)
check('mobile drawer handles focus and Escape close', "first.focus({preventScroll:true})" in app and "closeSidebar(true)" in app and "event.key==='Escape'" in app)
check('school hero photo has fixed mobile height and cannot stretch vertically', '.page-content .hero-panel, .page-content .detail-hero' in styles and 'height:158px !important' in styles and 'max-height:158px !important' in styles)
check('dark theme uses muted dark control surfaces instead of bright element fills', ':root[data-theme="dark"] .btn-primary' in styles and 'background:#263544 !important' in styles and '--v17-surface:#1A2530' in styles)
check('parent programme cards do not expose school-wide entry counts', 'parentProgrammeCard(p, student)' in app and 'recordCount(p.id)' not in app[app.index('  function parentProgrammeCard('):app.index('  function renderProgrammeList(')])

# V17.3 admin navigation, prototype-note removal, neutral controls and menu responsiveness.
check('admin uses its dedicated section drawer while the regular portal menu stays hidden', "function navigationForCurrentPage() {\n    return document.body.dataset.page === 'admin' ? $('#admin-section-nav') : $('#sidebar');\n  }" in app and 'body[data-page="admin"] .admin-section-nav.open' in styles and 'body[data-page="admin"] .sidebar {\n  display:none !important;' in styles)
check('admin mobile menu targets its own drawer and keeps the section selector', "setAttribute('aria-controls',state.page==='admin'?'admin-section-nav':'sidebar')" in app and 'id="admin-mobile-tab"' in admin_render and 'body[data-page="admin"] .admin-mobile-nav' in styles)
check('admin section index remains full width on desktop', 'width:224px !important' in styles and 'flex:0 0 224px !important' in styles)
check('admin workspace has no blank column gap', 'grid-template-columns:224px minmax(0,1fr) !important; gap:0 !important' in styles)
check('active admin tab does not highlight count or summary numbers', 'body[data-page="admin"] .admin-link.active small' in styles and 'background:transparent !important' in styles and 'body[data-page="admin"] .admin-attention-total' in styles)
check('prototype notices removed from site shell and admin overview', 'id="preview-notice"' not in index and 'admin-prototype-note' not in app and '.preview-notice,.admin-prototype-note { display:none !important; }' in styles)
check('visible admin content no longer advertises prototype mode', 'Prototype mode' not in index and 'Prototype limitation' not in app and 'This workspace is available in the prototype' not in app)
check('bright info and warning surfaces remapped to neutral theme tokens', '.info-box,.warning-box,.notice-box,.status-banner,.empty-state' in styles and 'background:var(--v17-surface-2) !important' in styles)
check('dark-mode info and warning surfaces use subdued dark neutral fills', ':root[data-theme="dark"] .info-box' in styles and 'background:#29343E !important' in styles)
check('admin mobile navigation uses its own drawer and admin-specific overlay state', 'body[data-page="admin"] .admin-section-nav.open' in styles and 'body[data-page="admin"].admin-sidebar-open' in styles and 'body[data-page="admin"] .admin-section-nav { display:flex !important;' in styles)
check('admin mobile drawer locks background scrolling without opening the regular portal menu', 'body[data-page="admin"].admin-sidebar-open' in styles and 'overflow:hidden !important;' in styles and "document.body.classList.remove('sidebar-open','admin-sidebar-open')" in app)
check('admin mobile drawer click-away handler is installed', "const adminNav=$('#admin-section-nav'),target=event.target" in app)
check('fast sidebar timing avoids expensive blur and long closing delay', 'transition:transform 135ms cubic-bezier(.2,.75,.25,1),box-shadow 120ms ease !important' in styles and 'backdrop-filter:none !important' in styles)
check('desktop admin mobile button remains hidden while its section index stays visible', 'body[data-page="admin"] .mobile-menu { display:none !important; }' in styles and 'body[data-page="admin"] .admin-section-nav { position:sticky' in styles)
check('light-mode sidebar menu uses readable dark text on mineral background', 'background:#DCE4EB !important' in styles and 'color:#243545 !important' in styles)
check('admin search/count summary labels use transparent backgrounds', 'body[data-page="admin"] .admin-nav-count' in styles and 'background:transparent !important' in styles)

for name,marker in [
    ('CSP','Content-Security-Policy'),('HSTS intentionally omitted note','HSTS belongs on a verified HTTPS deployment'),
    ('COEP','Cross-Origin-Embedder-Policy'),('COOP','Cross-Origin-Opener-Policy'),
    ('CORP','Cross-Origin-Resource-Policy'),('Origin-Agent-Cluster','Origin-Agent-Cluster'),
    ('no-cache','must-revalidate'),('permissions policy','Permissions-Policy'),
]:
    if name=='HSTS intentionally omitted note':
        check(name,marker in (ROOT/'SECURITY.md').read_text(encoding='utf-8'))
    else: check(name,marker in server)

# Ensure every published root file and static asset named by the allowlist exists.
for name in ('index.html','poll.html','poll-live.html','app.js','poll.js','poll-live.js','styles.css','poll.css'):
    check(f'published file exists: {name}',(ROOT/name).is_file())
for name in ('arts-performance.jpg','arts-workshop.jpg','arts.svg','campus-hero.jpg','campus.svg','mark.svg','sports-football.jpg','sports-sprint.jpg','sports.svg','student-import-template.csv'):
    check(f'published asset exists: {name}',(ROOT/'assets'/name).is_file())

for name,ok in checks: print(('PASS' if ok else 'FAIL'),name)
print(f'{sum(ok for _,ok in checks)}/{len(checks)} static regression checks passed')
if not all(ok for _,ok in checks): raise SystemExit(1)
