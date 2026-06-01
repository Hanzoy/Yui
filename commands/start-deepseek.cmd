@echo off
chcp 65001>nul
set "PGHOST=127.0.0.1"
set "PGPORT=5432"
set "PGDATABASE=postgres"
set "PGUSER=postgres"
set "PGPASSWORD=6282381"
set "PGCLIENTENCODING=UTF8"
set "YUI_MODEL_PROVIDER=deepseek"
set "YUI_VECTOR_PROVIDER=qdrant"
set "QDRANT_URL=http://127.0.0.1:6333"
set "QDRANT_COLLECTION=yui_chat_memory"
set "OLLAMA_EMBEDDING_MODEL=bge-m3"

if "%DEEPSEEK_API_KEY%"=="" (
  echo Please set DEEPSEEK_API_KEY before starting.
  echo Example: set "DEEPSEEK_API_KEY=sk-..."
  exit /b 1
)

node "%~dp0..\src\start.js" %*
