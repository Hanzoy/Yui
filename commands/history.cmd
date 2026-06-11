@echo off
chcp 65001>nul
call "%~dp0db-up.cmd" || exit /b 1
call "%~dp0yui-env.cmd"

node "%~dp0..\src\history.js"
pause
