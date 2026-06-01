@echo off
chcp 65001>nul
set "YUI_VECTOR_PROVIDER=qdrant"
set "QDRANT_URL=http://127.0.0.1:6333"
set "QDRANT_COLLECTION=yui_chat_memory"
set "OLLAMA_EMBEDDING_MODEL=bge-m3"

node "%~dp0..\src\skillCommand.js" %*
