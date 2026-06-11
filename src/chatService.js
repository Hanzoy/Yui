const { createDefaultChatClient } = require("./modelClient");
const { createMemoryStore } = require("./chatMemory");
const { createVectorMemory } = require("./qdrantMemory");
const { runSkillAwareChat } = require("./skillChatRunner");
const { checkSkillLoop } = require("./securityGuard");
const { createSkillExecutor } = require("./skills/executor");
const { createSkillRegistry } = require("./skills/registry");

function formatMessageTime(createdAt) {
  if (!createdAt) {
    return "unknown";
  }

  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  return Number.isNaN(date.getTime()) ? String(createdAt) : date.toISOString();
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

function formatMessageForModel(message) {
  return {
    role: toModelRole(message.role),
    content: `[created_at: ${formatMessageTime(message.createdAt)}]\n${message.content}`,
  };
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
    content: `The following are long-term memories retrieved from Qdrant because they are semantically related to the current user input. They may not be adjacent in time. Prefer them for facts and preferences, but do not repeat them mechanically.\n\n${content}`,
  };
}

async function safeSaveVectorMessage(service, message) {
  if (!service.vectorMemory.enabled) {
    return;
  }

  try {
    await service.vectorMemory.saveMessage(message);
  } catch (error) {
    service.logger.warn(`[VectorMemory] Failed to save message: ${error.message}`);
  }
}

async function safeSearchRelevantMemories(service, text) {
  if (!service.vectorMemory.enabled) {
    return [];
  }

  try {
    return await service.vectorMemory.searchRelevantMessages({
      sessionId: service.sessionId,
      text,
      limit: service.relevantMemoryLimit,
    });
  } catch (error) {
    service.logger.warn(`[VectorMemory] Failed to search relevant memories: ${error.message}`);
    return [];
  }
}

async function saveGeneratedFlowMessages(service, generatedMessages) {
  const messagesToSave = generatedMessages.slice(0, -1);

  for (const message of messagesToSave) {
    if (!message.content) {
      continue;
    }

    await service.memoryStore.saveMessage({
      sessionId: service.sessionId,
      role: message.flowRole || message.role,
      content: message.content,
    });
  }
}

class ChatService {
  constructor(options) {
    this.sessionId = options.sessionId;
    this.isNewSession = options.isNewSession;
    this.memoryStore = options.memoryStore;
    this.chatClient = options.chatClient;
    this.vectorMemory = options.vectorMemory;
    this.skillRegistry = options.skillRegistry;
    this.skillNames = options.skillNames;
    this.skillInstruction = options.skillInstruction;
    this.skillExecutor = options.skillExecutor;
    this.relevantMemoryLimit = options.relevantMemoryLimit;
    this.recentUserInputLimit = options.recentUserInputLimit;
    this.skillLoopReviewInterval = options.skillLoopReviewInterval;
    this.logger = options.logger || console;
  }

  getStatus() {
    return {
      sessionId: this.sessionId,
      isNewSession: this.isNewSession,
      provider: this.chatClient.provider,
      model: this.chatClient.model,
      vectorMemory: this.vectorMemory.enabled
        ? {
            enabled: true,
            baseUrl: this.vectorMemory.baseUrl,
            collection: this.vectorMemory.collection,
          }
        : {
            enabled: false,
          },
      skills: this.skillNames,
    };
  }

  async sendMessage(text, options = {}) {
    const relevantMemories = await safeSearchRelevantMemories(this, text);
    const relevantMemoryMessage = buildRelevantMemoryMessage(relevantMemories);
    const userMessage = await this.memoryStore.saveMessage({
      sessionId: this.sessionId,
      role: "user",
      content: text,
    });
    await safeSaveVectorMessage(this, userMessage);

    const recentMessages = await this.memoryStore.getMessagesSinceRecentUserInputs(
      this.sessionId,
      this.recentUserInputLimit
    );
    const recentMessagesWithTime = recentMessages.map(formatMessageForModel);
    const contextMessages = [
      ...(relevantMemoryMessage ? [relevantMemoryMessage] : []),
      {
        role: "system",
        content: this.skillInstruction,
      },
      {
        role: "system",
        content: `The following are messages from the current session, covering the latest ${this.recentUserInputLimit} user inputs and all messages produced during them. Each message includes created_at. Use them as the current conversation context.`,
      },
      ...recentMessagesWithTime,
    ];

    const result = await runSkillAwareChat(this.chatClient, {
      messages: contextMessages,
      loadSkillDoc: (skillName) => this.skillRegistry.getSkillDoc(skillName),
      executeSkillRequest: this.skillExecutor.execute,
      skillLoopReviewInterval: this.skillLoopReviewInterval,
      reviewSkillLoop: (review) =>
        checkSkillLoop({
          ...review,
          securityClient: this.chatClient,
        }),
      onBeforeSend: options.onBeforeSend,
    });
    const generatedMessages = result.messages.slice(contextMessages.length);
    await saveGeneratedFlowMessages(this, generatedMessages);

    const assistantMessage = await this.memoryStore.saveMessage({
      sessionId: this.sessionId,
      role: "assistant",
      content: result.content,
    });
    await safeSaveVectorMessage(this, assistantMessage);

    return {
      sessionId: this.sessionId,
      userMessage,
      assistantMessage,
      reply: result.content,
      relevantMemories,
      skillRounds: result.skillRounds,
      skillCallCount: result.skillCallCount,
    };
  }

  async getRecentMessages(limit = 50) {
    return this.memoryStore.getRecentMessageRecords(this.sessionId, limit);
  }

  async close() {
    await this.memoryStore.close();
  }
}

async function createChatService(options = {}) {
  const memoryStore = options.memoryStore || createMemoryStore();
  const chatClient = options.chatClient || createDefaultChatClient();
  const vectorMemory = options.vectorMemory || createVectorMemory();
  const skillRegistry = options.skillRegistry || (await createSkillRegistry());
  const chatService = new ChatService({
    sessionId: options.sessionId,
    isNewSession: Boolean(options.isNewSession),
    memoryStore,
    chatClient,
    vectorMemory,
    skillRegistry,
    skillNames: skillRegistry.getSkillNames(),
    skillInstruction: skillRegistry.getInstruction(),
    skillExecutor: null,
    relevantMemoryLimit: Number(process.env.QDRANT_MEMORY_LIMIT || 5),
    recentUserInputLimit: Number(process.env.YUI_RECENT_USER_INPUT_LIMIT || 20),
    skillLoopReviewInterval: Number(process.env.YUI_SKILL_LOOP_REVIEW_INTERVAL || 10),
    logger: options.logger || console,
  });
  chatService.skillExecutor = createSkillExecutor(skillRegistry, {
    get sessionId() {
      return chatService.sessionId;
    },
  });
  await memoryStore.initialize();
  return chatService;
}

module.exports = {
  ChatService,
  buildRelevantMemoryMessage,
  createChatService,
  formatMessageForModel,
  formatMessageTime,
};
