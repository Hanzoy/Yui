const {
  DEFAULT_MODEL_NAME: DEFAULT_OLLAMA_MODEL_NAME,
  DEFAULT_OLLAMA_URL,
  chatWithOllama,
  createOllamaMessage,
} = require("./ollamaClient");
const {
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL_NAME,
  chatWithDeepSeek,
  createDeepSeekMessage,
} = require("./deepseekClient");

const DEFAULT_PROVIDER = "ollama";

function normalizeProvider(provider) {
  return String(provider || DEFAULT_PROVIDER).trim().toLowerCase();
}

function createDefaultChatClient(options = {}) {
  const provider = normalizeProvider(
    options.provider ?? process.env.YUI_MODEL_PROVIDER ?? process.env.MODEL_PROVIDER
  );

  if (provider === "deepseek") {
    const model = options.model ?? process.env.DEEPSEEK_MODEL ?? DEFAULT_DEEPSEEK_MODEL_NAME;

    return {
      provider,
      model,
      chat(message, chatOptions = {}) {
        return chatWithDeepSeek(message, {
          ...chatOptions,
          model,
          baseUrl: options.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? DEFAULT_DEEPSEEK_BASE_URL,
          apiKey: options.apiKey ?? process.env.DEEPSEEK_API_KEY,
        });
      },
      createMessage(message, chatOptions = {}) {
        return createDeepSeekMessage(message, {
          ...chatOptions,
          model,
          baseUrl: options.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? DEFAULT_DEEPSEEK_BASE_URL,
          apiKey: options.apiKey ?? process.env.DEEPSEEK_API_KEY,
        });
      },
    };
  }

  if (provider === "ollama") {
    const model = options.model ?? process.env.OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL_NAME;

    return {
      provider,
      model,
      chat(message, chatOptions = {}) {
        return chatWithOllama(message, {
          ...chatOptions,
          model,
          ollamaUrl: options.ollamaUrl ?? process.env.OLLAMA_URL ?? DEFAULT_OLLAMA_URL,
        });
      },
      createMessage(message, chatOptions = {}) {
        return createOllamaMessage(message, {
          ...chatOptions,
          model,
          ollamaUrl: options.ollamaUrl ?? process.env.OLLAMA_URL ?? DEFAULT_OLLAMA_URL,
        });
      },
    };
  }

  throw new Error(`Unsupported model provider: ${provider}`);
}

module.exports = {
  DEFAULT_PROVIDER,
  createDefaultChatClient,
  normalizeProvider,
};
