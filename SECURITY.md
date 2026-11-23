# Security notes — School Arts & Sports Portal

## Protections added in this build

- A restrictive Content Security Policy blocks inline scripts, inline event handlers, plug-ins, framing, and third-party network connections. Inline styles remain enabled because the current UI uses style attributes for layout and image sizing.
- The local HTTP server binds to `127.0.0.1`, checks the expected Host header, serves an allowlist of required UI files only, rejects traversal and hidden-file paths, and does not provide HTTP write methods or CORS access.
- Response headers disable MIME sniffing and framing, suppress referrer leakage, isolate cross-origin resources, disable caching of school data, and restrict unused browser capabilities.
- Student, staff, programme, event, house-name, announcement, import, and backup text fields have size/control-character validation. Backup collections have record-count limits and image data URLs are restricted to supported raster formats.
- Legacy teacher-permission migration rebuilds permission maps from known teacher IDs and ignores prototype-sensitive or unknown keys.
- CSV export already neutralizes spreadsheet formula-leading cells; XLSX parsing is bounded by compressed input and expanded workbook limits.
- Dynamic text is HTML-escaped before it is placed in HTML templates; the House Team picker and shared button renderer escape their text. The voting page assigns school names to `textContent` without pre-escaping.

## Important limitations

This is still a browser-local prototype. It stores school records in the browser's `localStorage`; it has no authenticated server-side user session, no server-side role enforcement, no central database, and no server-side audit authority. The role selector is a preview tool, not a login system. Anyone with access to the same Windows/browser profile can inspect or alter that local data, and a person with operating-system access can copy the portal data.

The local server intentionally listens only on the same computer. Do not change the bind address to `0.0.0.0`, port-forward it, or expose it to a school LAN/Internet. A CSP and local-only server reduce browser attack surface, but they do not make this prototype suitable for public deployment or confidential production records.

For production use, the final authentication phase must move authorization and sensitive data operations to a trusted backend, enforce roles on every server endpoint, use secure sessions/CSRF protection, protect backups, and keep server-side audit logs.


## HTTP response headers

The local server sends a defensive header set on successful responses and HTTP errors: Content-Security-Policy, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, Cross-Origin-Opener-Policy, Cross-Origin-Embedder-Policy, Cross-Origin-Resource-Policy, Origin-Agent-Cluster, X-DNS-Prefetch-Control, X-Permitted-Cross-Domain-Policies, Cache-Control, Pragma and Expires. No permissive CORS header is sent.

Strict-Transport-Security (HSTS) is intentionally not sent because this launcher serves plain HTTP on 127.0.0.1; HSTS belongs on a verified HTTPS deployment and cannot make this HTTP listener encrypted. X-XSS-Protection is also omitted because it is obsolete and can create compatibility/security problems; CSP is the modern control. Clear-Site-Data is not used because it could erase the portal's localStorage records. The CSP continues to allow inline styles because the existing UI uses style attributes, but inline JavaScript and event-handler attributes are blocked.
