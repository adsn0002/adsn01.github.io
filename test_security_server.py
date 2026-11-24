import importlib.util, threading, http.client, json
from http.server import ThreadingHTTPServer

spec = importlib.util.spec_from_file_location('portal_start', str(__import__('pathlib').Path(__file__).with_name('start_portal.py')))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
server = ThreadingHTTPServer(('127.0.0.1', 0), mod.PortalHandler)
server.daemon_threads = True
port = server.server_port
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
checks=[]
def request(method, path, host=None):
    c=http.client.HTTPConnection('127.0.0.1', port, timeout=3)
    headers={'Host': host or f'127.0.0.1:{port}'}
    c.request(method,path,headers=headers)
    r=c.getresponse(); body=r.read(); result=(r.status,dict(r.getheaders()),body); c.close(); return result
try:
    status, headers, body = request('GET','/index.html')
    checks.append(('index served', status == 200))
    checks.append(('CSP blocks inline scripts/handlers', "script-src 'self'" in headers.get('Content-Security-Policy','') and "script-src-attr 'none'" in headers.get('Content-Security-Policy','')))
    checks.append(('framing denied', headers.get('X-Frame-Options') == 'DENY' and "frame-ancestors 'none'" in headers.get('Content-Security-Policy','')))
    checks.append(('referrer suppressed', headers.get('Referrer-Policy') == 'no-referrer'))
    checks.append(('MIME sniffing disabled', headers.get('X-Content-Type-Options') == 'nosniff'))
    checks.append(('cache disabled', headers.get('Cache-Control') == 'no-store, no-cache, max-age=0, must-revalidate'))
    checks.append(('Pragma cache disabled', headers.get('Pragma') == 'no-cache'))
    checks.append(('Expires cache disabled', headers.get('Expires') == '0'))
    checks.append(('COOP enabled', headers.get('Cross-Origin-Opener-Policy') == 'same-origin'))
    checks.append(('COEP enabled', headers.get('Cross-Origin-Embedder-Policy') == 'require-corp'))
    checks.append(('CORP enabled', headers.get('Cross-Origin-Resource-Policy') == 'same-origin'))
    checks.append(('Origin isolated', headers.get('Origin-Agent-Cluster') == '?1'))
    checks.append(('DNS prefetch disabled', headers.get('X-DNS-Prefetch-Control') == 'off'))
    checks.append(('Permissions restricted', 'camera=()' in headers.get('Permissions-Policy','') and 'clipboard-write=(self)' in headers.get('Permissions-Policy','')))
    checks.append(('Cross-domain policies disabled', headers.get('X-Permitted-Cross-Domain-Policies') == 'none'))
    checks.append(('No CORS wildcard', 'Access-Control-Allow-Origin' not in headers))
    checks.append(('launcher hidden', request('GET','/start_portal.py')[0] == 404))
    checks.append(('hidden file blocked', request('GET','/.portal-port')[0] == 404))
    checks.append(('encoded traversal blocked', request('GET','/%2e%2e/start_portal.py')[0] == 404))
    checks.append(('unknown assets blocked', request('GET','/assets/nope.js')[0] == 404))
    checks.append(('valid asset served', request('GET','/assets/mark.svg')[0] == 200))
    checks.append(('sports SVG asset served', request('GET','/assets/sports.svg')[0] == 200))
    crest_status, crest_headers, crest_body = request('GET','/assets/benhill-crest.jpg')
    checks.append(('Benhill school crest is served', crest_status == 200 and next((v for k,v in crest_headers.items() if k.lower()=='content-type'),'').startswith('image/jpeg') and len(crest_body)>1000))
    config_status, config_headers, config_body = request('GET','/supabase-config.js')
    checks.append(('Supabase browser config is served', config_status == 200 and b'PORTAL_SUPABASE_CONFIG' in config_body))
    checks.append(('local CSP permits the configured Supabase API origin', 'https://fockkhxdvplmldoobnze.supabase.co' in headers.get('Content-Security-Policy','')))
    for asset in ('arts-feature-new.webp','arts-performance-new.webp','sports-feature-new.webp','sports-action-new.webp'):
        asset_status, asset_headers, asset_body = request('GET',f'/assets/{asset}')
        checks.append((f'new image served: {asset}', asset_status == 200 and next((v for k,v in asset_headers.items() if k.lower()=='content-type'),'').startswith('image/webp') and len(asset_body)>1000))
    wrong_status,wrong_headers,_=request('GET','/index.html','attacker.example')
    checks.append(('wrong Host blocked', wrong_status == 403))
    checks.append(('security headers on Host rejection', wrong_headers.get('X-Content-Type-Options') == 'nosniff' and "frame-ancestors 'none'" in wrong_headers.get('Content-Security-Policy','')))
    checks.append(('POST blocked', request('POST','/')[0] == 405))
    checks.append(('PUT blocked', request('PUT','/')[0] == 405))
    checks.append(('PATCH blocked', request('PATCH','/')[0] == 405))
    checks.append(('DELETE blocked', request('DELETE','/')[0] == 405))
    checks.append(('OPTIONS blocked', request('OPTIONS','/')[0] == 405))
    checks.append(('TRACE blocked', request('TRACE','/')[0] == 405))
    checks.append(('double-encoded traversal blocked', request('GET','/%252e%252e/start_portal.py')[0] == 404))
    checks.append(('backslash path blocked', request('GET','/..%5cstart_portal.py')[0] == 404))
    error_status,error_headers,_=request('GET','/not-published')
    checks.append(('security headers on 404', error_status == 404 and error_headers.get('X-Content-Type-Options') == 'nosniff' and error_headers.get('Content-Security-Policy') == headers.get('Content-Security-Policy')))
    head_status,head_headers,head_body=request('HEAD','/index.html')
    checks.append(('HEAD response protected and bodyless', head_status == 200 and head_headers.get('X-Frame-Options') == 'DENY' and len(head_body) == 0))
    status, _, health = request('GET','/__portal_health')
    try: parsed=json.loads(health)
    except Exception: parsed={}
    checks.append(('health endpoint build id', status == 200 and parsed.get('build') == mod.BUILD_ID))
finally:
    server.shutdown(); server.server_close(); thread.join(timeout=2)
for name, ok in checks:
    print(('PASS' if ok else 'FAIL'), name)
print(f'{sum(ok for _,ok in checks)}/{len(checks)} checks passed')
if not all(ok for _,ok in checks): raise SystemExit(1)
