const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getSecurityStatus,
  normalizeConfig,
  redactConfig,
} = require("../src/modelConfigStore");
const { reviewWithSecurityModel } = require("../src/securityGuard");
const { runSkillAwareChat } = require("../src/skillChatRunner");

const localModel = {
  id: "local",
  name: "Local",
  provider: "ollama",
  model: "qwen-test",
  ollamaUrl: "http://ollama.test/api/chat",
};
const cloudModel = {
  id: "cloud",
  name: "Cloud",
  provider: "deepseek",
  model: "deepseek-test",
  baseUrl: "https://deepseek.test",
  apiKey: "secret",
};

test("legacy model config assigns the active model to security review", () => {
  const config = normalizeConfig({
    activeModelId: cloudModel.id,
    models: [localModel, cloudModel],
  });

  assert.deepEqual(config.security, {
    enabled: true,
    modelId: cloudModel.id,
  });
  assert.deepEqual(getSecurityStatus(config), {
    enabled: true,
    modelId: cloudModel.id,
    provider: "deepseek",
    model: "deepseek-test",
  });
});

test("chat and security roles can select different models", () => {
  const config = normalizeConfig({
    activeModelId: cloudModel.id,
    models: [localModel, cloudModel],
    security: {
      enabled: false,
      modelId: localModel.id,
    },
  });

  assert.deepEqual(getSecurityStatus(config), {
    enabled: false,
    modelId: localModel.id,
    provider: "ollama",
    model: "qwen-test",
  });
  assert.equal(redactConfig(config).models[1].apiKey, "********");
});

test("security review reports the configured reviewer in execution events", async () => {
  const events = [];
  const securityClient = {
    provider: "deepseek",
    model: "security-test",
    async chat() {
      return '{"allowed":true,"reason":"safe"}';
    },
  };
  const decision = await reviewWithSecurityModel(
    {
      phase: "input",
      skillName: "get-current-time",
      input: {},
    },
    {
      modelConfig: normalizeConfig({
        activeModelId: cloudModel.id,
        models: [cloudModel],
        security: {
          enabled: true,
          modelId: cloudModel.id,
        },
      }),
      securityClient,
      onEvent: (event) => events.push(event),
    }
  );

  assert.deepEqual(decision, { allowed: true, reason: "safe" });
  assert.deepEqual(
    events.map((event) => event.type),
    ["security.started", "security.completed"]
  );
  assert.equal(events[0].model, "security-test");
});

test("skill-aware chat emits model, security, and skill trace events", async () => {
  const replies = [
    {
      role: "assistant",
      content:
        '```yui-skill\n{"skill":"get-current-time","input":{"timezone":"Asia/Shanghai"}}\n```',
    },
    {
      role: "assistant",
      content: "现在是测试时间。",
    },
  ];
  const events = [];
  const chatClient = {
    provider: "deepseek",
    model: "chat-test",
    async createMessage() {
      return replies.shift();
    },
  };

  const result = await runSkillAwareChat(chatClient, {
    messages: [],
    loadSkillDoc: async () => "",
    executeSkillRequest: async (_request, options) => {
      await options.onEvent({
        type: "security.started",
        phase: "input",
        provider: "deepseek",
        model: "security-test",
      });
      await options.onEvent({
        type: "security.completed",
        phase: "input",
        provider: "deepseek",
        model: "security-test",
        allowed: true,
      });
      return { now: "2026-07-30T12:00:00+08:00" };
    },
    onEvent: (event) => events.push(event),
  });

  assert.equal(result.content, "现在是测试时间。");
  assert.equal(result.skillCallCount, 1);
  assert.deepEqual(
    events.map((event) => event.type),
    [
      "model.started",
      "model.completed",
      "skill.started",
      "security.started",
      "security.completed",
      "skill.completed",
      "model.started",
      "model.completed",
    ]
  );
});
