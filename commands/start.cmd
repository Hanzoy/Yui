@echo off
chcp 65001>nul
pushd "%~dp0.." >nul
echo Starting Yui with Docker Compose...
echo Web UI and API will be available after the app starts:
echo   Web UI:   http://127.0.0.1:3000
echo   API base: http://127.0.0.1:3000/api
echo.

docker compose up --build yui
set "YUI_EXIT_CODE=%ERRORLEVEL%"
popd >nul
exit /b %YUI_EXIT_CODE%
