@echo off
rem Start Humanly Application & Local Model Manager
cd /d "%~dp0"

echo Starting Humanly Application Server...
start "" "http://127.0.0.1:3000"
node server.js
pause
