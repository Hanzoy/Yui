const { buildMessages, DEFAULT_SOUL_PATH } = require("./ollamaClient");

const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL_NAME = "deepseek-v4-pro";

function joinUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function readApiKey(options = {}) {
  const apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error(
      "DeepSeek API key is missing. Set DEEPSEEK_API_KEY before starting."
    );
  }

  return apiKey;
}

function applyOptionalParameters(payload, options = {}) {
  const passthroughKeys = [
    "max_tokens",
    "response_format",
    "stop",
    "temperature",
    "top_p",
    "tools",
    "tool_choice",
    "user_id",
  ];

  for (const key of passthroughKeys) {
    if (options[key] !== undefined) {
      payload[key] = options[key];
    }
  }

  if (typeof options.think === "boolean") {
    payload.thinking = {
      type: options.think ? "enabled" : "disabled",
    };
  }

  if (options.thinking) {
    payload.thinking = options.thinking;
  }

  if (options.reasoning_effort) {
    payload.reasoning_effort = options.reasoning_effort;
  }
}

async function createDeepSeekMessage(message, options = {}) {
  const baseUrl = options.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? DEFAULT_DEEPSEEK_BASE_URL;
  const apiKey = readApiKey(options);
  const model = options.model ?? process.env.DEEPSEEK_MODEL ?? DEFAULT_DEEPSEEK_MODEL_NAME;
  const messages = await buildMessages(message, options);
  const payload = {
    model,
    messages,
    stream: false,
  };

  applyOptionalParameters(payload, options);

  if (typeof options.onBeforeSend === "function") {
    await options.onBeforeSend(payload);
  }

  const response = await fetch(joinUrl(baseUrl, "/chat/completions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const responseMessage = data.choices?.[0]?.message;

  if (!responseMessage) {
    throw new Error("DeepSeek response did not include an assistant message.");
  }

  return responseMessage;
}

async function chatWithDeepSeek(message, options = {}) {
  const responseMessage = await createDeepSeekMessage(message, options);
  const content = responseMessage.content;

  if (typeof content !== "string") {
    throw new Error("DeepSeek response did not include message content.");
  }

  return content;
}

async function chatWithThinking(message, options = {}) {
  return chatWithDeepSeek(message, {
    ...options,
    think: true,
  });
}

async function chatWithoutThinking(message, options = {}) {
  return chatWithDeepSeek(message, {
    ...options,
    think: false,
  });
}

module.exports = {
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL_NAME,
  DEFAULT_SOUL_PATH,
  chatWithDeepSeek,
  chatWithThinking,
  chatWithoutThinking,
  createDeepSeekMessage,
};
