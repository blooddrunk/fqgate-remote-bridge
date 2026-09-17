@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-phase4.ps1" %*
exit /b %errorlevel%
