@echo off
cd /d "%~dp0"
start "" http://localhost:3200
call npm run dev
pause
