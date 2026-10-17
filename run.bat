@echo off
echo Starting Personal Dictionary local server with auto-reload...
py serve.py %*
if errorlevel 1 (
    python serve.py %*
)
pause
