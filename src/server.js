const path = require("path");
const express = require("express");
const { createChatService } = require("./chatService");
const { createDefaultChatClient } = require("./modelClient");
const {
  createChatClientOptions,
  getActiveModel,
  readModelConfig,
  redactConfig,
  writeModelConfig,
} = require("./modelConfigStore");
const { resolveSessionId } = require("./sessionStore");

const DEFAULT_PORT = 3000;

function normalizeLimit(value, fallback = 50) {
  const limit = Number(value || fallback);
  if (!Number.isFinite(limit)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), 200);
}

async function createServer() {
  const app = express();
  const publicDir = path.join(__dirname, "..", "public");
  let modelConfig = await readModelConfig();
  let service = await createChatService({
    ...(await resolveSessionId(process.argv.slice(2))),
    chatClient: createDefaultChatClient(createChatClientOptions(getActiveModel(modelConfig))),
  });
  let queue = Promise.resolve();

  function enqueue(work) {
    const next = queue.then(work, work);
    queue = next.catch(() => {});
    return next;
  }

  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", process.env.YUI_CORS_ORIGIN || "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  });
  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(publicDir));

  app.get("/api/health", (req, res) => {
    res.json({
      ok: true,
      status: service.getStatus(),
    });
  });

  app.get("/api/session", (req, res) => {
    res.json(service.getStatus());
  });

  app.get("/api/models", (req, res) => {
    res.json(redactConfig(modelConfig));
  });

  app.put("/api/models", async (req, res, next) => {
    try {
      const currentModelsById = new Map(modelConfig.models.map((model) => [model.id, model]));
      const incomingModels = Array.isArray(req.body?.models) ? req.body.models : [];
      const mergedModels = incomingModels.map((model) => {
        const current = currentModelsById.get(model.id);

        if (
          current?.provider === "deepseek" &&
          model.provider === "deepseek" &&
          model.apiKey === "********"
        ) {
          return {
            ...model,
            apiKey: current.apiKey,
          };
        }

        return model;
      });
      const savedConfig = await writeModelConfig({
        activeModelId: req.body?.activeModelId,
        models: mergedModels,
      });
      modelConfig = savedConfig;
      service.chatClient = createDefaultChatClient(
        createChatClientOptions(getActiveModel(modelConfig))
      );
      res.json(redactConfig(modelConfig));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/session/new", async (req, res, next) => {
    try {
      const result = await enqueue(async () => {
        await service.close();
        service = await createChatService({
          ...(await resolveSessionId(["new-session"])),
          chatClient: createDefaultChatClient(
            createChatClientOptions(getActiveModel(modelConfig))
          ),
        });
        return service.getStatus();
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/messages", async (req, res, next) => {
    try {
      const messages = await service.getRecentMessages(normalizeLimit(req.query.limit));
      res.json({
        sessionId: service.sessionId,
        messages,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/chat", async (req, res, next) => {
    try {
      const message = String(req.body?.message || "").trim();

      if (!message) {
        res.status(400).json({
          error: "message is required",
        });
        return;
      }

      const result = await enqueue(() => service.sendMessage(message));
      res.json({
        sessionId: result.sessionId,
        userMessage: result.userMessage,
        assistantMessage: result.assistantMessage,
        reply: result.reply,
        relevantMemories: result.relevantMemories,
        skillCallCount: result.skillCallCount,
      });
    } catch (error) {
      next(error);
    }
  });

  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({
      error: error.message,
    });
  });

  return app;
}

async function main() {
  const port = Number(process.env.YUI_WEB_PORT || process.env.PORT || DEFAULT_PORT);
  const app = await createServer();

  app.listen(port, () => {
    console.log("Yui service is running.");
    console.log(`Web UI:   http://127.0.0.1:${port}`);
    console.log(`API base: http://127.0.0.1:${port}/api`);
    console.log(`Chat API: POST http://127.0.0.1:${port}/api/chat`);
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:");
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  createServer,
};
