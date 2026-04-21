$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serviceRoot = Split-Path -Parent $scriptDir
$modelsRoot = Join-Path $serviceRoot "models"
$archivePath = Join-Path $modelsRoot "sensevoice.tar.bz2"
$senseVoiceDir = Join-Path $modelsRoot "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17"
$vadPath = Join-Path $modelsRoot "silero_vad.onnx"

New-Item -ItemType Directory -Force -Path $modelsRoot | Out-Null

if (-not (Test-Path $vadPath)) {
  Write-Host "Downloading silero VAD model..."
  Invoke-WebRequest `
    -Uri "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx" `
    -OutFile $vadPath
}

if (-not (Test-Path $senseVoiceDir)) {
  Write-Host "Downloading SenseVoice model package..."
  if (Test-Path $archivePath) {
    Remove-Item $archivePath -Force
  }

  cmd /c curl -L --retry 3 --retry-delay 2 -o "$archivePath" "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2"

  Write-Host "Extracting SenseVoice model package..."
  tar -xf $archivePath -C $modelsRoot
  Remove-Item $archivePath -Force
}

Write-Host "Models ready:"
Write-Host " - $vadPath"
Write-Host " - $senseVoiceDir"
