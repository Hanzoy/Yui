@echo off
chcp 65001>nul

pushd "%~dp0.." >nul
docker compose up -d postgres qdrant ollama ollama-init
if errorlevel 1 (
  popd >nul
  echo Failed to start Docker services. Please make sure Docker Desktop is running.
  exit /b 1
)

echo Waiting for PostgreSQL to be ready...
for /l %%i in (1,1,60) do (
  docker compose exec -T postgres pg_isready -U yui -d yui >nul 2>nul
  if not errorlevel 1 (
    goto postgres_ready
  )
  timeout /t 1 /nobreak >nul
)

echo PostgreSQL did not become ready within 60 seconds.
echo Run "docker compose logs postgres" from the project root to inspect startup logs.
popd >nul
exit /b 1

:postgres_ready
echo Waiting for Ollama to be ready...
for /l %%i in (1,1,60) do (
  docker compose exec -T ollama ollama list >nul 2>nul
  if not errorlevel 1 (
    goto ollama_ready
  )
  timeout /t 1 /nobreak >nul
)

echo Ollama did not become ready within 60 seconds.
echo Run "docker compose logs ollama" from the project root to inspect startup logs.
popd >nul
exit /b 1

:ollama_ready
docker compose exec -T ollama ollama list | findstr /C:"bge-m3" >nul
if errorlevel 1 (
  echo Pulling embedding model bge-m3 into the Ollama container...
  docker compose exec -T ollama ollama pull bge-m3
  if errorlevel 1 (
    echo Failed to pull bge-m3. Check Docker network access and try again.
    popd >nul
    exit /b 1
  )
)

popd >nul
exit /b 0
