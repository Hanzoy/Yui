const fs = require("fs/promises");
const express = require("express");
const multer = require("multer");
const http = require("http");
const { getConfig } = require("./config");
const { SpeechRecognizer } = require("./speechRecognizer");
const { createRealtimeServer } = require("./realtimeServer");

const config = getConfig();
const recognizer = new SpeechRecognizer();

async function ensureDirectories() {
  await fs.mkdir(config.uploadsRoot, { recursive: true });
  await fs.mkdir(config.publicRoot, { recursive: true });
}

function createUploadMiddleware() {
  return multer({
    dest: config.uploadsRoot,
    limits: {
      fileSize: 25 * 1024 * 1024,
    },
  });
}

function printRecognitionResult(result) {
  console.log("");
  if (result.filePath) {
    console.log(`[speech-demo] file: ${result.filePath}`);
  }

  if (typeof result.audioDurationSeconds === "number") {
    console.log(
      `[speech-demo] audio=${result.audioDurationSeconds.toFixed(2)}s elapsed=${result.elapsedSeconds.toFixed(2)}s rtf=${result.realTimeFactor.toFixed(3)}`
    );
  }

  if (result.source) {
    console.log(`[speech-demo] source: ${result.source} (${result.mode})`);
  }

  if (!result.segments.length) {
    console.log("[speech-demo] no speech detected");
    return;
  }

  for (const segment of result.segments) {
    console.log(
      `[speech-demo] ${segment.startTime.toFixed(2)}-${segment.endTime.toFixed(2)} ${segment.text}`
    );
  }

  console.log(`[speech-demo] fullText: ${result.fullText}`);
}

async function startServer() {
  await ensureDirectories();

  const app = express();
  const server = http.createServer(app);
  const upload = createUploadMiddleware();
  app.use(express.static(config.publicRoot));

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      message: "speech demo is running",
      sampleAudioPath: config.senseVoice.sampleAudioPath,
    });
  });

  app.post("/recognize", upload.single("audio"), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "Missing multipart file field: audio" });
      return;
    }

    try {
      const result = recognizer.recognizeFile(req.file.path);
      printRecognitionResult(result);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    } finally {
      await fs.rm(req.file.path, { force: true });
    }
  });

  app.post("/recognize/sample", async (_req, res) => {
    try {
      const result = recognizer.recognizeFile(config.senseVoice.sampleAudioPath);
      printRecognitionResult(result);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  createRealtimeServer({
    server,
    recognizer,
    config,
    printRecognitionResult,
  });

  server.listen(config.port, () => {
    console.log(`[speech-demo] listening on http://127.0.0.1:${config.port}`);
    console.log("[speech-demo] open / in the browser for live microphone demo");
    console.log("[speech-demo] ws endpoint: /ws");
    console.log("[speech-demo] POST /recognize with multipart field name: audio");
    console.log("[speech-demo] POST /recognize/sample to test the bundled sample");
  });
}

startServer().catch((error) => {
  console.error("[speech-demo] fatal error");
  console.error(error);
  process.exit(1);
});
