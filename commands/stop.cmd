@echo off
chcp 65001>nul
pushd "%~dp0.." >nul
docker compose down
set "YUI_EXIT_CODE=%ERRORLEVEL%"
popd >nul
exit /b %YUI_EXIT_CODE%
