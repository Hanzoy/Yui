const EventEmitter = require("events");
const readline = require("readline");
const { createDefaultChatClient } = require("./modelClient");
const { createMemoryStore } = require("./chatMemory");
const { createVectorMemory } = require("./qdrantMemory");
const { resolveSessionId } = require("./sessionStore");
const { runSkillAwareChat } = require("./skillChatRunner");
const { checkSkillLoop } = require("./securityGuard");
const { createSkillExecutor } = require("./skills/executor");
const { createSkillRegistry } = require("./skills/registry");

function configureConsoleEncoding() {
  process.stdin.setEncoding("utf8");
}

function formatMessageTime(createdAt) {
  if (!createdAt) {
    return "unknown";
  }

  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  return Number.isNaN(date.getTime()) ? String(createdAt) : date.toISOString();
}

function formatMessageForModel(message) {
  return {
    role: toModelRole(message.role),
    content: `[created_at: ${formatMessageTime(message.createdAt)}]\n${message.content}`,
  };
}

function toModelRole(role) {
  if (role === "skill_request") {
    return "assistant";
  }

  if (role === "skill_response") {
    return "system";
  }

  return role;
}

function buildRelevantMemoryMessage(memories) {
  if (!memories.length) {
    return null;
  }

  const content = memories
    .map((memory, index) => {
      const score =
        typeof memory.score === "number" ? ` score=${memory.score.toFixed(4)}` : "";
      return [
        `${index + 1}. [role: ${memory.role}] [created_at: ${formatMessageTime(memory.createdAt)}]${score}`,
        memory.content,
      ].join("\n");
    })
    .join("\n\n");

  return {
    role: "system",
    content: `以下是从 Qdrant 检索到的、和当前用户输入语义相关的长期记忆。它们不一定按时间相邻，请优先用它们补充事实和偏好，不要机械复述。\n\n${content}`,
  };
}

async function safeSaveVectorMessage(app, message) {
  if (!app.vectorMemory.enabled) {
    return;
  }

  try {
    await app.vectorMemory.saveMessage(message);
  } catch (error) {
    console.warn(`[VectorMemory] Failed to save message: ${error.message}`);
  }
}

async function safeSearchRelevantMemories(app, text) {
  if (!app.vectorMemory.enabled) {
    return [];
  }

  try {
    return await app.vectorMemory.searchRelevantMessages({
      sessionId: app.sessionId,
      text,
      limit: app.relevantMemoryLimit,
    });
  } catch (error) {
    console.warn(`[VectorMemory] Failed to search relevant memories: ${error.message}`);
    return [];
  }
}

async function saveGeneratedFlowMessages(app, generatedMessages) {
  const messagesToSave = generatedMessages.slice(0, -1);

  for (const message of messagesToSave) {
    if (!message.content) {
      continue;
    }

    await app.memoryStore.saveMessage({
      sessionId: app.sessionId,
      role: message.flowRole || message.role,
      content: message.content,
    });
  }
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
    console.log(
      `Interactive chat started. Provider: ${app.chatClient.provider}. Model: ${app.chatClient.model}`
    );
    console.log(
      app.vectorMemory.enabled
        ? `Vector memory: Qdrant ${app.vectorMemory.baseUrl} / ${app.vectorMemory.collection}`
        : "Vector memory: disabled"
    );
    console.log(`Skills: ${app.skillNames.join(", ") || "none"}`);
    console.log(`Session ID: ${app.sessionId}`);
    console.log(
      app.isNewSession
        ? "Started a new session."
        : "Reusing the previous session."
    );
    console.log("Type your message and press Enter.");
    console.log('Type "/debug" to toggle debug mode.');
    console.log('Type "/exit" or "/quit" to stop.\n');
  });

  app.register("userInput", async ({ text }) => {
    console.log(`\n[User] ${text}`);
    const relevantMemories = await safeSearchRelevantMemories(app, text);
    const relevantMemoryMessage = buildRelevantMemoryMessage(relevantMemories);
    const userMessage = await app.memoryStore.saveMessage({
      sessionId: app.sessionId,
      role: "user",
      content: text,
    });
    await safeSaveVectorMessage(app, userMessage);
    const recentMessages = await app.memoryStore.getMessagesSinceRecentUserInputs(
      app.sessionId,
      app.recentUserInputLimit
    );
    const recentMessagesWithTime = recentMessages.map(formatMessageForModel);
    const contextMessages = [
      ...(relevantMemoryMessage ? [relevantMemoryMessage] : []),
      {
        role: "system",
        content: app.skillInstruction,
      },
      {
        role: "system",
        content: `以下是当前会话最近 ${app.recentUserInputLimit} 条用户输入以及这些输入期间产生的所有消息，每条消息都带有 created_at 时间，请结合这些聊天记录和时间来理解上下文并继续回复。`,
      },
      ...recentMessagesWithTime,
    ];
    const result = await runSkillAwareChat(app.chatClient, {
      messages: contextMessages,
      loadSkillDoc: (skillName) => app.skillRegistry.getSkillDoc(skillName),
      executeSkillRequest: app.skillExecutor.execute,
      skillLoopReviewInterval: app.skillLoopReviewInterval,
      reviewSkillLoop: checkSkillLoop,
      onBeforeSend: async (payload) => {
        if (!app.debugMode) {
          return;
        }

        console.log("[Debug] Sending payload to model:");
        console.log(JSON.stringify(payload, null, 2));
        console.log("");
      },
    });
    const generatedMessages = result.messages.slice(contextMessages.length);
    await saveGeneratedFlowMessages(app, generatedMessages);
    await app.emitAsync("modelReply", { text: result.content });
  });

  app.register("modelReply", async ({ text }) => {
    const assistantMessage = await app.memoryStore.saveMessage({
      sessionId: app.sessionId,
      role: "assistant",
      content: text,
    });
    await safeSaveVectorMessage(app, assistantMessage);
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

      if (text === "/debug") {
        app.debugMode = !app.debugMode;
        console.log(app.debugMode ? "[Debug] ON" : "[Debug] OFF");
        rl.prompt();
        return;
      }

      if (text === "/exit" || text === "/quit") {
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
  app.chatClient = createDefaultChatClient();
  app.vectorMemory = createVectorMemory();
  app.skillRegistry = await createSkillRegistry();
  app.skillNames = app.skillRegistry.getSkillNames();
  app.skillInstruction = app.skillRegistry.getInstruction();
  app.skillExecutor = createSkillExecutor(app.skillRegistry, {
    get sessionId() {
      return app.sessionId;
    },
  });
  app.relevantMemoryLimit = Number(process.env.QDRANT_MEMORY_LIMIT || 5);
  app.recentUserInputLimit = Number(process.env.YUI_RECENT_USER_INPUT_LIMIT || 20);
  app.skillLoopReviewInterval = Number(process.env.YUI_SKILL_LOOP_REVIEW_INTERVAL || 10);
  app.sessionId = sessionState.sessionId;
  app.isNewSession = sessionState.isNewSession;
  app.debugMode = false;
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
