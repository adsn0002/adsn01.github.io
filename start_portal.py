"""Start the School Arts & Sports Portal on a stable localhost address.

Uses only Python's standard library. Close this console or press Ctrl+C to stop it.
The port is kept stable between launches because browser localStorage is scoped
by origin (including the port number).
"""
from __future__ import annotations

import json
import os
import threading
import urllib.error
import urllib.request
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional, Tuple
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"
DEFAULT_PORT = 8765
PORT_RANGE = range(DEFAULT_PORT, DEFAULT_PORT + 21)
PORT_FILE = ROOT / ".portal-port"
BUILD_ID = "arts-and-sports-portal-v18.2-parent-overview-and-area-quota-fixes"

# Only the files required by the browser app are published. The Python launcher,
# bytecode, hidden files, backups and other files in the project folder stay private.
ALLOWED_ROOT_FILES = {
    "index.html", "poll.html", "poll-live.html",
    "app.js", "poll.js", "poll-live.js",
    "styles.css", "poll.css",
}
ALLOWED_ASSETS = {
    "arts-performance.jpg", "arts-workshop.jpg", "arts.svg",
    "campus-hero.jpg", "campus.svg", "mark.svg",
    "sports-football.jpg", "sports-sprint.jpg", "sports.svg", "student-import-template.csv",
    "arts-feature-new.webp", "arts-performance-new.webp",
    "sports-feature-new.webp", "sports-action-new.webp",
}
CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "base-uri 'none'; object-src 'none'; frame-ancestors 'none'; "
    "form-action 'self'; frame-src 'none'; "
    "script-src 'self'; script-src-attr 'none'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; font-src 'self' data:; "
    "connect-src 'self'; media-src 'self'; manifest-src 'self'"
)


class PortalHandler(SimpleHTTPRequestHandler):
    server_version = "SchoolPortalLocal"
    sys_version = ""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _is_expected_host(self) -> bool:
        # Prevent a hostile website from using DNS rebinding to address this
        # loopback server under an attacker-controlled Host name.
        expected = f"{HOST}:{self.server.server_port}"
        return self.headers.get("Host", "").strip().lower() == expected.lower()

    def _require_expected_host(self) -> bool:
        if self._is_expected_host():
            return True
        self.send_error(403, "This local portal only accepts its own loopback host.")
        return False

    def do_GET(self) -> None:
        if not self._require_expected_host():
            return
        if urlsplit(self.path).path == "/__portal_health":
            payload = json.dumps({"application": "School Arts & Sports Portal", "build": BUILD_ID}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        super().do_GET()

    def do_HEAD(self) -> None:
        if not self._require_expected_host():
            return
        super().do_HEAD()

    def _method_not_allowed(self) -> None:
        self.send_response(405)
        self.send_header("Allow", "GET, HEAD")
        self.send_header("Content-Length", "0")
        self.end_headers()

    # The portal has no HTTP write API. State changes stay in the browser's
    # local storage, so all mutation methods are deliberately unavailable.
    do_POST = _method_not_allowed
    do_PUT = _method_not_allowed
    do_PATCH = _method_not_allowed
    do_DELETE = _method_not_allowed
    do_OPTIONS = _method_not_allowed
    do_TRACE = _method_not_allowed
    do_CONNECT = _method_not_allowed

    def translate_path(self, path: str) -> str:
        """Resolve only explicitly published files inside the portal folder."""
        try:
            decoded = unquote(urlsplit(path).path, errors="strict")
        except (UnicodeDecodeError, ValueError):
            return str(ROOT / "__not_published__")
        if "\\" in decoded or "\x00" in decoded:
            return str(ROOT / "__not_published__")
        parts = [part for part in decoded.split("/") if part]
        if any(part in {".", ".."} or part.startswith(".") for part in parts):
            return str(ROOT / "__not_published__")
        if not parts:
            parts = ["index.html"]
        relative = "/".join(parts)
        allowed = relative in ALLOWED_ROOT_FILES or (
            len(parts) == 2 and parts[0] == "assets" and parts[1] in ALLOWED_ASSETS
        )
        if not allowed:
            return str(ROOT / "__not_published__")
        try:
            candidate = (ROOT / relative).resolve(strict=True)
            candidate.relative_to(ROOT)
        except (OSError, ValueError):
            return str(ROOT / "__not_published__")
        return str(candidate) if candidate.is_file() else str(ROOT / "__not_published__")

    def end_headers(self) -> None:
        # Response-header defence in depth. Keep this list central so successful
        # responses, 404s and method/host errors receive the same protections.
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", CONTENT_SECURITY_POLICY)
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Origin-Agent-Cluster", "?1")
        self.send_header("X-Permitted-Cross-Domain-Policies", "none")
        self.send_header("X-DNS-Prefetch-Control", "off")
        self.send_header(
            "Permissions-Policy",
            "accelerometer=(), autoplay=(), camera=(), display-capture=(), "
            "geolocation=(), gyroscope=(), magnetometer=(), microphone=(), "
            "midi=(), payment=(), usb=(), xr-spatial-tracking=(), "
            "clipboard-read=(), clipboard-write=(self)"
        )
        self.send_header("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:
        # Keep the server console readable; request failures are still visible.
        if args and str(args[1]).startswith("4"):
            super().log_message(fmt, *args)


def _saved_port() -> int:
    override = os.environ.get("SCHOOL_PORTAL_PORT", "").strip()
    if override:
        try:
            value = int(override)
            if 1024 <= value <= 65535:
                return value
        except ValueError:
            pass
    try:
        value = int(PORT_FILE.read_text(encoding="ascii").strip())
        if value in PORT_RANGE:
            return value
    except (OSError, ValueError):
        pass
    return DEFAULT_PORT


def _running_portal_build(port: int) -> Optional[str]:
    """Return the build ID when this port serves a School Portal instance."""
    url = f"http://{HOST}:{port}/__portal_health"
    try:
        with urllib.request.urlopen(url, timeout=0.5) as response:
            data = json.loads(response.read(2048).decode("utf-8"))
        if data.get("application") == "School Arts & Sports Portal":
            return str(data.get("build") or "unknown")
    except (OSError, ValueError, json.JSONDecodeError, urllib.error.URLError):
        pass
    return None


def _is_this_build_running(port: int) -> bool:
    return _running_portal_build(port) == BUILD_ID


def _save_port(port: int) -> None:
    """Persist the browser-data origin before opening the portal."""
    try:
        PORT_FILE.write_text(f"{port}\n", encoding="ascii")
    except OSError as exc:
        raise OSError(
            f"The portal could not save its stable browser-data port in {PORT_FILE}. "
            "Fix the folder's write permission and start the portal again; it was not started."
        ) from exc


def create_or_reuse_server() -> Tuple[Optional[ThreadingHTTPServer], int, bool]:
    """Return (server, port, reused); server is None when an existing copy is reused."""
    preferred = _saved_port()
    candidates = [preferred]
    if preferred not in PORT_RANGE:
        candidates.extend(PORT_RANGE)
    else:
        candidates.extend(port for port in PORT_RANGE if port != preferred)

    for port in candidates:
        try:
            server = ThreadingHTTPServer((HOST, port), PortalHandler)
        except OSError as bind_error:
            running_build = _running_portal_build(port)
            if running_build == BUILD_ID:
                return None, port, True
            if port == preferred:
                if running_build is not None:
                    raise OSError(
                        f"A different version of the School Portal is already running on the saved browser-data port {port}. "
                        "Close the older portal's console window completely, then start this build again. "
                        "This keeps the same browser address so your existing local data remains available."
                    ) from bind_error
                raise OSError(
                    f"The saved browser-data port {port} is occupied by another local app or service. "
                    "Close that program and start the portal again. Do not switch ports unless you intend to use a separate browser-data workspace."
                ) from bind_error
            continue

        server.daemon_threads = True
        try:
            _save_port(port)
        except OSError:
            server.server_close()
            raise
        return server, port, False

    raise OSError(
        f"No free local port was found between {candidates[0]} and {candidates[-1]}. "
        "Close another local server and run START_PORTAL.bat again."
    )


def main() -> int:
    if not (ROOT / "index.html").is_file() or not (ROOT / "app.js").is_file():
        print("Portal files are incomplete. Extract the entire ZIP before starting it.")
        return 1

    try:
        server, port, reused = create_or_reuse_server()
    except OSError as exc:
        print(f"Could not start the portal: {exc}")
        input("Press Enter to close this window...")
        return 1

    url = f"http://{HOST}:{port}/index.html"
    if reused:
        print("This build of the portal is already running; reusing its existing address.")
    else:
        thread = threading.Thread(target=server.serve_forever, name="school-portal-http", daemon=True)
        thread.start()
        print("School Arts & Sports Portal is running locally.")

    print(f"Address: {url}")
    print("Browser data will remain under this stable address between launches.")
    print("This server is available only on this computer.")
    print("Keep this window open while using the portal. Press Ctrl+C to stop it.")
    try:
        opened = webbrowser.open(url, new=2)
        if not opened:
            print("The browser did not open automatically. Copy the address above into your browser.")
    except Exception as exc:
        print(f"The browser could not be opened automatically ({exc}). Copy the address above into your browser.")

    if reused:
        return 0

    try:
        thread.join()
    except KeyboardInterrupt:
        print("\nStopping the portal server...")
    finally:
        server.shutdown()
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
