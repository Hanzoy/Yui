const path = require("path");

const SERVICE_ROOT = path.join(__dirname, "..");
const MODELS_ROOT = path.join(SERVICE_ROOT, "models");
const UPLOADS_ROOT = path.join(SERVICE_ROOT, "uploads");
const PUBLIC_ROOT = path.join(SERVICE_ROOT, "public");
const SENSE_VOICE_DIR = path.join(
  MODELS_ROOT,
  "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17"
);

const DEFAULT_PORT = Number(process.env.SPEECH_DEMO_PORT || 3301);
const SAMPLE_RATE = 16000;
const FRAME_MS = 20;
const FRAME_SAMPLES = (SAMPLE_RATE * FRAME_MS) / 1000;

function getConfig() {
  return {
    serviceRoot: SERVICE_ROOT,
    modelsRoot: MODELS_ROOT,
    uploadsRoot: UPLOADS_ROOT,
    publicRoot: PUBLIC_ROOT,
    port: DEFAULT_PORT,
    sampleRate: SAMPLE_RATE,
    frameMs: FRAME_MS,
    frameSamples: FRAME_SAMPLES,
    vadModelPath: path.join(MODELS_ROOT, "silero_vad.onnx"),
    senseVoice: {
      dir: SENSE_VOICE_DIR,
      modelPath: path.join(SENSE_VOICE_DIR, "model.int8.onnx"),
      tokensPath: path.join(SENSE_VOICE_DIR, "tokens.txt"),
      sampleAudioPath: path.join(SENSE_VOICE_DIR, "test_wavs", "zh.wav"),
    },
  };
}

module.exports = {
  getConfig,
};
