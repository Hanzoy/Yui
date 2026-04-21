const fs = require("fs");
const sherpaOnnx = require("sherpa-onnx-node");
const { getConfig } = require("./config");

function ensureFileExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

function createRecognizer(config) {
  return new sherpaOnnx.OfflineRecognizer({
    featConfig: {
      sampleRate: config.sampleRate,
      featureDim: 80,
    },
    modelConfig: {
      senseVoice: {
        model: config.senseVoice.modelPath,
        useInverseTextNormalization: 1,
        language: "auto",
      },
      tokens: config.senseVoice.tokensPath,
      numThreads: 2,
      provider: "cpu",
      debug: 0,
    },
  });
}

function createVad(config) {
  return new sherpaOnnx.Vad(
    {
      sileroVad: {
        model: config.vadModelPath,
        threshold: 0.5,
        minSpeechDuration: 0.25,
        minSilenceDuration: 0.5,
        maxSpeechDuration: 20,
        windowSize: 512,
      },
      sampleRate: config.sampleRate,
      debug: 0,
      numThreads: 1,
      provider: "cpu",
    },
    60
  );
}

function formatSegmentResult(segment, result, sampleRate) {
  const startTime = Number((segment.start / sampleRate).toFixed(2));
  const endTime = Number(
    ((segment.start + segment.samples.length) / sampleRate).toFixed(2)
  );

  return {
    startTime,
    endTime,
    text: (result.text || "").trim(),
    language: result.lang || "",
    emotion: result.emotion || "",
    event: result.event || "",
  };
}

class SpeechRecognizer {
  constructor() {
    this.config = getConfig();
    ensureFileExists(this.config.vadModelPath, "VAD model");
    ensureFileExists(this.config.senseVoice.modelPath, "SenseVoice model");
    ensureFileExists(this.config.senseVoice.tokensPath, "SenseVoice tokens");
    this.recognizer = createRecognizer(this.config);
  }

  recognizeFile(wavePath) {
    ensureFileExists(wavePath, "Wave file");

    const wave = sherpaOnnx.readWave(wavePath);
    if (wave.sampleRate !== this.config.sampleRate) {
      throw new Error(
        `Unsupported sample rate ${wave.sampleRate}. Expected ${this.config.sampleRate} Hz mono wav.`
      );
    }

    const vad = createVad(this.config);
    const segments = [];
    const windowSize = vad.config.sileroVad.windowSize;
    const startedAt = Date.now();

    for (let i = 0; i < wave.samples.length; i += windowSize) {
      vad.acceptWaveform(wave.samples.subarray(i, i + windowSize));
      this.collectDetectedSegments(vad, wave.sampleRate, segments);
    }

    vad.flush();
    this.collectDetectedSegments(vad, wave.sampleRate, segments);

    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    const audioDurationSeconds = wave.samples.length / wave.sampleRate;

    return {
      filePath: wavePath,
      elapsedSeconds,
      audioDurationSeconds,
      realTimeFactor: elapsedSeconds / audioDurationSeconds,
      segments,
      fullText: segments.map((segment) => segment.text).join(" ").trim(),
    };
  }

  createRealtimeSession() {
    return new RealtimeSpeechSession(this);
  }

  collectDetectedSegments(vad, sampleRate, segments) {
    while (!vad.isEmpty()) {
      const segment = vad.front();
      vad.pop();

      const stream = this.recognizer.createStream();
      stream.acceptWaveform({
        samples: segment.samples,
        sampleRate,
      });

      this.recognizer.decode(stream);
      const result = this.recognizer.getResult(stream);
      const formatted = formatSegmentResult(segment, result, sampleRate);

      if (formatted.text) {
        segments.push(formatted);
      }
    }
  }
}

class RealtimeSpeechSession {
  constructor(parent) {
    this.parent = parent;
    this.config = parent.config;
    this.vad = createVad(this.config);
    this.clientFrameBuffer = [];
    this.vadWindowBuffer = [];
  }

  acceptPcm16Chunk(chunk) {
    const floatSamples = int16ToFloat32(chunk);
    const segments = [];

    for (const sample of floatSamples) {
      this.clientFrameBuffer.push(sample);
    }

    while (this.clientFrameBuffer.length >= this.config.frameSamples) {
      const frame = this.clientFrameBuffer.splice(0, this.config.frameSamples);
      this.vadWindowBuffer.push(...frame);
      segments.push(...this.drainVadWindows());
    }

    return segments;
  }

  flush() {
    const segments = [];

    if (this.clientFrameBuffer.length > 0) {
      this.vadWindowBuffer.push(...this.clientFrameBuffer);
      this.clientFrameBuffer.length = 0;
    }

    segments.push(...this.drainVadWindows(true));
    this.vad.flush();
    segments.push(...this.drainVadSegments());
    return segments;
  }

  drainVadWindows(flushRemaining = false) {
    const segments = [];
    const windowSize = this.vad.config.sileroVad.windowSize;

    while (this.vadWindowBuffer.length >= windowSize) {
      const window = this.vadWindowBuffer.splice(0, windowSize);
      this.vad.acceptWaveform(Float32Array.from(window));
      segments.push(...this.drainVadSegments());
    }

    if (flushRemaining && this.vadWindowBuffer.length > 0) {
      const paddedWindow = new Float32Array(windowSize);
      paddedWindow.set(this.vadWindowBuffer);
      this.vadWindowBuffer.length = 0;
      this.vad.acceptWaveform(paddedWindow);
      segments.push(...this.drainVadSegments());
    }

    return segments;
  }

  drainVadSegments() {
    const segments = [];
    this.parent.collectDetectedSegments(
      this.vad,
      this.config.sampleRate,
      segments
    );
    return segments;
  }
}

function int16ToFloat32(buffer) {
  const int16 = new Int16Array(
    buffer.buffer,
    buffer.byteOffset,
    Math.floor(buffer.byteLength / Int16Array.BYTES_PER_ELEMENT)
  );
  const float32 = new Float32Array(int16.length);

  for (let i = 0; i < int16.length; i += 1) {
    float32[i] = int16[i] / 32768;
  }

  return float32;
}

module.exports = {
  SpeechRecognizer,
  RealtimeSpeechSession,
};
