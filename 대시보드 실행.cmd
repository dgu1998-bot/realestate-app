@echo off
setlocal
pushd "%~dp0" || goto failed
where node.exe >nul 2>&1 || goto missing
node --env-file-if-exists=.env server.mjs --open
if errorlevel 1 goto failed
exit /b 0
:missing
echo Install Node.js 22 or newer, then run this file again.
pause
exit /b 1
:failed
echo Dashboard could not start. Check the error above.
pause
exit /b 1

