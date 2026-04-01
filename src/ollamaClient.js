const fs = require("fs/promises");
const path = require("path");

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434/api/chat";
const DEFAULT_MODEL_NAME = "qwen3.5:9b";
const DEFAULT_SOUL_PATH = path.join(__dirname, "..", "SOUL.md");

async function loadSoulPrompt(soulPath = DEFAULT_SOUL_PATH) {
  const content = await fs.readFile(soulPath, "utf8");
  return content.trim();
}

async function buildMessages(message, options = {}) {
  const soulPath = options.soulPath ?? DEFAULT_SOUL_PATH;
  const soulPrompt = options.includeSoul === false ? "" : await loadSoulPrompt(soulPath);

  if (options.messages) {
    return soulPrompt
      ? [{ role: "system", content: soulPrompt }, ...options.messages]
      : options.messages;
  }

  const messages = [];
  if (soulPrompt) {
    messages.push({ role: "system", content: soulPrompt });
  }

  messages.push({
    role: "user",
    content: message,
  });

  return messages;
}

async function chatWithOllama(message, options = {}) {
  const ollamaUrl = options.ollamaUrl ?? DEFAULT_OLLAMA_URL;
  const model = options.model ?? DEFAULT_MODEL_NAME;
  const messages = await buildMessages(message, options);
  const payload = {
    model,
    stream: false,
    messages,
  };

  if (typeof options.onBeforeSend === "function") {
    await options.onBeforeSend(payload);
  }

  const response = await fetch(ollamaUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.message.content;
}

module.exports = {
  DEFAULT_MODEL_NAME,
  DEFAULT_OLLAMA_URL,
  DEFAULT_SOUL_PATH,
  buildMessages,
  chatWithOllama,
  loadSoulPrompt,
};
