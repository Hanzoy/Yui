const startButton = document.getElementById("startButton");
const stopButton = document.getElementById("stopButton");
const connectionState = document.getElementById("connectionState");
const latestText = document.getElementById("latestText");
const segmentsList = document.getElementById("segments");

const sampleRate = 16000;
const frameMs = 20;
const frameSamples = (sampleRate * frameMs) / 1000;

let socket = null;
let audioContext = null;
let sourceNode = null;
let workletNode = null;
let mediaStream = null;
let monitorGainNode = null;

startButton.addEventListener("click", startStreaming);
stopButton.addEventListener("click", stopStreaming);

async function startStreaming() {
  if (socket) {
    return;
  }

  setConnectionState("正在连接...");
  latestText.textContent = "正在初始化麦克风";

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    socket = new WebSocket(getWebSocketUrl());
    socket.binaryType = "arraybuffer";

    socket.addEventListener("open", async () => {
      setConnectionState("WebSocket 已连接");
      await setupAudioGraph();
      startButton.disabled = true;
      stopButton.disabled = false;
      latestText.textContent = "监听中，开始说话吧";
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      handleServerMessage(message);
    });

    socket.addEventListener("close", () => {
      teardownAudioGraph();
      socket = null;
      startButton.disabled = false;
      stopButton.disabled = true;
      setConnectionState("监听已结束");
    });

    socket.addEventListener("error", () => {
      latestText.textContent = "WebSocket 连接出错";
    });
  } catch (error) {
    await teardownAudioGraph();
    socket = null;
    setConnectionState("启动失败");
    latestText.textContent = error.message;
  }
}

async function stopStreaming() {
  if (!socket) {
    return;
  }

  socket.send(JSON.stringify({ type: "stop" }));
  socket.close();
    await teardownAudioGraph();
    socket = null;
    startButton.disabled = false;
    stopButton.disabled = true;
    setConnectionState("已停止监听");
}

async function setupAudioGraph() {
  audioContext = new AudioContext({
    sampleRate,
    latencyHint: "interactive",
  });

  await audioContext.audioWorklet.addModule("/pcm-processor.js");

  sourceNode = audioContext.createMediaStreamSource(mediaStream);
  workletNode = new AudioWorkletNode(audioContext, "pcm-processor", {
    processorOptions: {
      frameSamples,
    },
  });

  workletNode.port.onmessage = (event) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const pcmFrame = float32ToInt16(event.data);
    socket.send(pcmFrame.buffer);
  };

  sourceNode.connect(workletNode);
  monitorGainNode = audioContext.createGain();
  monitorGainNode.gain.value = 0;
  workletNode.connect(monitorGainNode);
  monitorGainNode.connect(audioContext.destination);
}

function handleServerMessage(message) {
  if (message.type === "ready") {
    setConnectionState(`已连接 (${message.sessionId})`);
    return;
  }

  if (message.type === "segment") {
    latestText.textContent = message.segment.text;
    prependSegment(message.segment);
    return;
  }

  if (message.type === "error") {
    latestText.textContent = message.message;
  }
}

function prependSegment(segment) {
  const item = document.createElement("li");
  item.textContent = `${segment.startTime.toFixed(2)} - ${segment.endTime.toFixed(2)}  ${segment.text}`;
  segmentsList.prepend(item);
}

function setConnectionState(text) {
  connectionState.textContent = text;
}

function getWebSocketUrl() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${location.host}/ws`;
}

function float32ToInt16(float32Array) {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = sample < 0 ? sample * 32768 : sample * 32767;
  }
  return int16Array;
}

async function teardownAudioGraph() {
  if (workletNode) {
    workletNode.port.onmessage = null;
    workletNode.disconnect();
    workletNode = null;
  }

  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }

  if (monitorGainNode) {
    monitorGainNode.disconnect();
    monitorGainNode = null;
  }

  if (audioContext) {
    await audioContext.close();
    audioContext = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
}
