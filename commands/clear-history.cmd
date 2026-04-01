@echo off
chcp 65001>nul
set "PGHOST=127.0.0.1"
set "PGPORT=5432"
set "PGDATABASE=postgres"
set "PGUSER=postgres"
set "PGPASSWORD=6282381"
set "PGCLIENTENCODING=UTF8"

node "%~dp0..\src\clear-history.js"
