const path = require("path");
const { WebSocketServer } = require("ws");

function createRealtimeServer({ server, recognizer, config, printRecognitionResult }) {
  const wss = new WebSocketServer({
    server,
    path: "/ws",
  });

  wss.on("connection", (socket) => {
    const sessionId = createSessionId();
    const session = recognizer.createRealtimeSession();

    socket.send(
      JSON.stringify({
        type: "ready",
        sessionId,
        sampleRate: config.sampleRate,
        frameMs: config.frameMs,
        frameSamples: config.frameSamples,
      })
    );

    socket.on("message", (data, isBinary) => {
      try {
        if (!isBinary) {
          handleTextMessage({
            socket,
            session,
            sessionId,
            payload: data.toString(),
            printRecognitionResult,
          });
          return;
        }

        const segments = session.acceptPcm16Chunk(Buffer.from(data));
        emitSegments({
          socket,
          sessionId,
          segments,
          printRecognitionResult,
          sourceLabel: "realtime",
        });
      } catch (error) {
        socket.send(
          JSON.stringify({
            type: "error",
            message: error.message,
          })
        );
      }
    });

    socket.on("close", () => {
      const segments = session.flush();
      if (segments.length > 0) {
        printRecognitionResult({
          source: `ws:${sessionId}`,
          mode: "realtime",
          segments,
          fullText: segments.map((segment) => segment.text).join(" ").trim(),
        });
      }
    });
  });

  return wss;
}

function handleTextMessage({
  socket,
  session,
  sessionId,
  payload,
  printRecognitionResult,
}) {
  const message = JSON.parse(payload);

  if (message.type === "ping") {
    socket.send(JSON.stringify({ type: "pong", sessionId }));
    return;
  }

  if (message.type === "stop") {
    const segments = session.flush();
    emitSegments({
      socket,
      sessionId,
      segments,
      printRecognitionResult,
      sourceLabel: "realtime",
    });

    socket.send(
      JSON.stringify({
        type: "stopped",
        sessionId,
      })
    );
  }
}

function emitSegments({
  socket,
  sessionId,
  segments,
  printRecognitionResult,
  sourceLabel,
}) {
  for (const segment of segments) {
    printRecognitionResult({
      source: `${sourceLabel}:${sessionId}`,
      mode: "realtime-segment",
      segments: [segment],
      fullText: segment.text,
    });

    socket.send(
      JSON.stringify({
        type: "segment",
        sessionId,
        segment,
      })
    );
  }
}

function createSessionId() {
  return `speech-${Math.random().toString(36).slice(2, 10)}`;
}

module.exports = {
  createRealtimeServer,
};
