const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");
const {
  DEFAULT_MODEL_NAME: DEFAULT_OLLAMA_MODEL_NAME,
  DEFAULT_OLLAMA_URL,
} = require("./ollamaClient");
const {
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL_NAME,
} = require("./deepseekClient");

const MODEL_CONFIG_PATH = path.join(__dirname, "..", "config", "ai-models.local.json");

function createDefaultConfig() {
  const defaultModel = {
    id: "local-ollama",
    name: "Local Ollama",
    provider: "ollama",
    model: process.env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL_NAME,
    ollamaUrl: process.env.OLLAMA_URL || DEFAULT_OLLAMA_URL,
  };

  return {
    activeModelId: defaultModel.id,
    models: [defaultModel],
    security: {
      enabled: process.env.YUI_SECURITY_ENABLED !== "false",
      modelId: defaultModel.id,
    },
  };
}

async function readModelConfig() {
  try {
    const content = await fs.readFile(MODEL_CONFIG_PATH, "utf8");
    return normalizeConfig(JSON.parse(content));
  } catch (error) {
    if (error.code === "ENOENT") {
      return createDefaultConfig();
    }
    throw error;
  }
}

async function writeModelConfig(config) {
  const normalized = normalizeConfig(config);
  await fs.mkdir(path.dirname(MODEL_CONFIG_PATH), {
    recursive: true,
  });
  await fs.writeFile(MODEL_CONFIG_PATH, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

function normalizeProvider(provider) {
  const normalized = String(provider || "ollama").trim().toLowerCase();
  return normalized === "deepseek" ? "deepseek" : "ollama";
}

function normalizeModel(model) {
  const provider = normalizeProvider(model.provider);
  const id = String(model.id || randomUUID()).trim();
  const name = String(model.name || "").trim();
  const normalized = {
    id,
    name: name || (provider === "deepseek" ? "DeepSeek" : "Local Ollama"),
    provider,
    model: String(
      model.model ||
        (provider === "deepseek" ? DEFAULT_DEEPSEEK_MODEL_NAME : DEFAULT_OLLAMA_MODEL_NAME)
    ).trim(),
  };

  if (provider === "deepseek") {
    normalized.baseUrl = String(model.baseUrl || DEFAULT_DEEPSEEK_BASE_URL).trim();
    normalized.apiKey = String(model.apiKey || "").trim();
  } else {
    let ollamaUrl = String(model.ollamaUrl || DEFAULT_OLLAMA_URL).trim();
    const configuredOllamaUrl = process.env.OLLAMA_URL;

    if (
      configuredOllamaUrl &&
      model.id === "local-ollama" &&
      /^http:\/\/(127\.0\.0\.1|localhost):11434\//.test(ollamaUrl)
    ) {
      ollamaUrl = configuredOllamaUrl;
    }

    normalized.ollamaUrl = ollamaUrl;
  }

  return normalized;
}

function normalizeConfig(config = {}) {
  const rawModels = Array.isArray(config.models) ? config.models : [];
  const models = rawModels.length
    ? rawModels.map(normalizeModel)
    : createDefaultConfig().models;
  const activeModelId = models.some((model) => model.id === config.activeModelId)
    ? config.activeModelId
    : models[0].id;
  const rawSecurity = config.security || {};
  const requestedSecurityModelId =
    rawSecurity.modelId || config.securityModelId || activeModelId;
  const securityModelId = models.some((model) => model.id === requestedSecurityModelId)
    ? requestedSecurityModelId
    : activeModelId;

  return {
    activeModelId,
    models,
    security: {
      enabled:
        typeof rawSecurity.enabled === "boolean"
          ? rawSecurity.enabled
          : process.env.YUI_SECURITY_ENABLED !== "false",
      modelId: securityModelId,
    },
  };
}

function getActiveModel(config) {
  const normalized = normalizeConfig(config);
  return (
    normalized.models.find((model) => model.id === normalized.activeModelId) ||
    normalized.models[0]
  );
}

function getSecurityModel(config) {
  const normalized = normalizeConfig(config);
  return (
    normalized.models.find((model) => model.id === normalized.security.modelId) ||
    getActiveModel(normalized)
  );
}

function getSecurityStatus(config) {
  const normalized = normalizeConfig(config);
  const model = getSecurityModel(normalized);

  return {
    enabled: normalized.security.enabled,
    modelId: model.id,
    provider: model.provider,
    model: model.model,
  };
}

function redactModel(model) {
  if (model.provider !== "deepseek") {
    return model;
  }

  return {
    ...model,
    apiKey: model.apiKey ? "********" : "",
    hasApiKey: Boolean(model.apiKey),
  };
}

function redactConfig(config) {
  const normalized = normalizeConfig(config);
  return {
    activeModelId: normalized.activeModelId,
    models: normalized.models.map(redactModel),
    security: normalized.security,
  };
}

function createChatClientOptions(model) {
  if (model.provider === "deepseek") {
    return {
      provider: "deepseek",
      model: model.model,
      baseUrl: model.baseUrl,
      apiKey: model.apiKey,
    };
  }

  return {
    provider: "ollama",
    model: model.model,
    ollamaUrl: model.ollamaUrl,
  };
}

module.exports = {
  MODEL_CONFIG_PATH,
  createChatClientOptions,
  createDefaultConfig,
  getActiveModel,
  getSecurityModel,
  getSecurityStatus,
  normalizeConfig,
  readModelConfig,
  redactConfig,
  writeModelConfig,
};
