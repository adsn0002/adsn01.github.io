@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if not errorlevel 1 (
    py -3 start_portal.py
    if not errorlevel 1 goto :end
)

where python >nul 2>nul
if not errorlevel 1 (
    python start_portal.py
    if not errorlevel 1 goto :end
)

echo Python 3 was not found, so the local-server launcher could not start.
echo As a fallback, opening index.html directly may work, but saving is more reliable through the local server.
start "" "%~dp0index.html"
pause

:end
endlocal
