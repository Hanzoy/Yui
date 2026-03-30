const EventEmitter = require("events");
const readline = require("readline");
const { DEFAULT_MODEL_NAME, chatWithOllama } = require("./ollamaClient");
const { createMemoryStore } = require("./chatMemory");
const { resolveSessionId } = require("./sessionStore");

function configureConsoleEncoding() {
  process.stdin.setEncoding("utf8");
}

class ChatApp extends EventEmitter {
  register(eventName, handler) {
    this.on(eventName, handler);
  }

  async emitAsync(eventName, payload) {
    const handlers = this.listeners(eventName);
    for (const handler of handlers) {
      await handler(payload);
    }
  }
}

function registerDefaultEvents(app) {
  app.register("startup", async () => {
    console.log(`Interactive chat started. Model: ${DEFAULT_MODEL_NAME}`);
    console.log(`Session ID: ${app.sessionId}`);
    console.log(
      app.isNewSession
        ? "Started a new session."
        : "Reusing the previous session."
    );
    console.log("Type your message and press Enter.");
    console.log('Type "exit" or "quit" to stop.\n');
  });

  app.register("userInput", async ({ text }) => {
    console.log(`\n[User] ${text}`);
    await app.memoryStore.saveMessage({
      sessionId: app.sessionId,
      role: "user",
      content: text,
    });
    const recentMessages = await app.memoryStore.getRecentMessages(app.sessionId, 20);
    const reply = await chatWithOllama(text, {
      messages: recentMessages,
    });
    await app.emitAsync("modelReply", { text: reply });
  });

  app.register("modelReply", async ({ text }) => {
    await app.memoryStore.saveMessage({
      sessionId: app.sessionId,
      role: "assistant",
      content: text,
    });
    console.log(`[Model] ${text}\n`);
  });

  app.register("error", async ({ error }) => {
    console.error(`[Error] ${error.message}\n`);
  });

  app.register("shutdown", async () => {
    await app.memoryStore.close();
    console.log("Bye.");
  });
}

function startConsoleInput(app) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> ",
  });
  let queue = Promise.resolve();

  rl.prompt();

  rl.on("line", (line) => {
    queue = queue.then(async () => {
      const text = line.trim();

      if (!text) {
        rl.prompt();
        return;
      }

      if (text === "exit" || text === "quit") {
        await app.emitAsync("shutdown");
        rl.close();
        return;
      }

      try {
        await app.emitAsync("userInput", { text });
      } catch (error) {
        await app.emitAsync("error", { error });
      }

      rl.prompt();
    });
  });

  rl.on("close", () => {
    queue.finally(() => {
      process.exit(0);
    });
  });
}

async function main() {
  configureConsoleEncoding();
  const argv = process.argv.slice(2);
  const sessionState = await resolveSessionId(argv);
  const app = new ChatApp();
  app.memoryStore = createMemoryStore();
  app.sessionId = sessionState.sessionId;
  app.isNewSession = sessionState.isNewSession;
  await app.memoryStore.initialize();
  registerDefaultEvents(app);
  await app.emitAsync("startup");
  startConsoleInput(app);
}

main().catch((error) => {
  console.error("Fatal error:");
  console.error(error.message);
  process.exit(1);
});
