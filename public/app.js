const messagesEl = document.querySelector("#messages");
const statusText = document.querySelector("#statusText");
const form = document.querySelector("#chatForm");
const input = document.querySelector("#messageInput");
const sendButton = document.querySelector("#sendButton");
const newSessionButton = document.querySelector("#newSessionButton");
const chatTab = document.querySelector("#chatTab");
const configTab = document.querySelector("#configTab");
const chatView = document.querySelector("#chatView");
const configView = document.querySelector("#configView");
const modelList = document.querySelector("#modelList");
const addLocalButton = document.querySelector("#addLocalButton");
const addDeepSeekButton = document.querySelector("#addDeepSeekButton");
const saveModelsButton = document.querySelector("#saveModelsButton");

let modelConfig = {
  activeModelId: "",
  models: [],
};

function formatTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderMessage(message, options = {}) {
  const role = options.role || message.role || "system";
  const item = document.createElement("article");
  item.className = `message ${role}`;

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${role} ${formatTime(message.createdAt)}`.trim();

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = message.content || "";

  item.append(meta, bubble);
  messagesEl.append(item);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return item;
}

function renderError(error) {
  renderMessage({
    role: "error",
    content: error.message || String(error),
  });
}

function setBusy(isBusy) {
  sendButton.disabled = isBusy;
  newSessionButton.disabled = isBusy;
  saveModelsButton.disabled = isBusy;
}

function resizeInput() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

function setView(viewName) {
  const isConfig = viewName === "config";
  chatView.classList.toggle("active", !isConfig);
  configView.classList.toggle("active", isConfig);
  chatTab.classList.toggle("active", !isConfig);
  configTab.classList.toggle("active", isConfig);

  if (isConfig) {
    loadModels().catch(renderError);
  }
}

async function loadStatus() {
  const status = await requestJson("/api/session");
  statusText.textContent = `${status.provider} / ${status.model} / ${status.sessionId}`;
}

async function loadMessages() {
  const data = await requestJson("/api/messages?limit=80");
  messagesEl.textContent = "";

  for (const message of data.messages) {
    if (message.role === "skill_request" || message.role === "skill_response") {
      continue;
    }
    renderMessage(message);
  }
}

function modelField(labelText, input) {
  const label = document.createElement("label");
  label.className = "model-field";
  const labelSpan = document.createElement("span");
  labelSpan.textContent = labelText;
  label.append(labelSpan, input);
  return label;
}

function createInput(value, placeholder, datasetKey, type = "text") {
  const inputEl = document.createElement("input");
  inputEl.type = type;
  inputEl.value = value || "";
  inputEl.placeholder = placeholder || "";
  inputEl.dataset.key = datasetKey;
  return inputEl;
}

function createProviderSelect(provider) {
  const select = document.createElement("select");
  select.dataset.key = "provider";

  for (const value of ["ollama", "deepseek"]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value === "deepseek" ? "DeepSeek" : "Local Ollama";
    option.selected = provider === value;
    select.append(option);
  }

  return select;
}

function renderModelCard(model, index) {
  const card = document.createElement("article");
  card.className = "model-card";
  card.dataset.index = String(index);

  const header = document.createElement("div");
  header.className = "model-card-header";

  const active = document.createElement("label");
  active.className = "active-choice";
  const radio = document.createElement("input");
  radio.type = "radio";
  radio.name = "activeModel";
  radio.checked = model.id === modelConfig.activeModelId;
  radio.addEventListener("change", () => {
    modelConfig.activeModelId = model.id;
  });
  active.append(radio, document.createTextNode("Active"));

  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Remove";
  remove.disabled = modelConfig.models.length <= 1;
  remove.addEventListener("click", () => {
    modelConfig.models.splice(index, 1);
    if (!modelConfig.models.some((item) => item.id === modelConfig.activeModelId)) {
      modelConfig.activeModelId = modelConfig.models[0]?.id || "";
    }
    renderModels();
  });

  header.append(active, remove);

  const provider = createProviderSelect(model.provider);
  provider.addEventListener("change", () => {
    model.provider = provider.value;
    if (model.provider === "deepseek") {
      model.baseUrl ||= "https://api.deepseek.com";
      model.model ||= "deepseek-v4-pro";
    } else {
      model.ollamaUrl ||= "http://ollama:11434/api/chat";
      model.model ||= "qwen3.5:9b";
    }
    renderModels();
  });

  card.append(
    header,
    modelField("Name", createInput(model.name, "My model", "name")),
    modelField("Provider", provider),
    modelField("Model", createInput(model.model, "model name", "model"))
  );

  if (model.provider === "deepseek") {
    card.append(
      modelField("Base URL", createInput(model.baseUrl, "https://api.deepseek.com", "baseUrl")),
      modelField(
        "API key",
        createInput(model.apiKey, "sk-...", "apiKey", "password")
      )
    );
  } else {
    card.append(
      modelField(
        "Ollama URL",
        createInput(model.ollamaUrl, "http://ollama:11434/api/chat", "ollamaUrl")
      )
    );
  }

  card.addEventListener("input", (event) => {
    const key = event.target.dataset.key;
    if (!key) {
      return;
    }
    model[key] = event.target.value;
  });

  return card;
}

function renderModels() {
  modelList.textContent = "";
  modelConfig.models.forEach((model, index) => {
    modelList.append(renderModelCard(model, index));
  });
}

async function loadModels() {
  modelConfig = await requestJson("/api/models");
  renderModels();
}

function createModel(provider) {
  const id = crypto.randomUUID
    ? crypto.randomUUID()
    : `${provider}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  if (provider === "deepseek") {
    return {
      id,
      name: "DeepSeek",
      provider,
      model: "deepseek-v4-pro",
      baseUrl: "https://api.deepseek.com",
      apiKey: "",
    };
  }

  return {
    id,
    name: "Local Ollama",
    provider: "ollama",
    model: "qwen3.5:9b",
    ollamaUrl: "http://ollama:11434/api/chat",
  };
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = input.value.trim();

  if (!message) {
    return;
  }

  input.value = "";
  resizeInput();
  renderMessage({
    role: "user",
    content: message,
    createdAt: new Date().toISOString(),
  });

  setBusy(true);
  try {
    const result = await requestJson("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });
    renderMessage(result.assistantMessage);
  } catch (error) {
    renderError(error);
  } finally {
    setBusy(false);
    input.focus();
  }
});

input.addEventListener("input", resizeInput);
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

newSessionButton.addEventListener("click", async () => {
  setBusy(true);
  try {
    await requestJson("/api/session/new", {
      method: "POST",
    });
    messagesEl.textContent = "";
    await loadStatus();
  } catch (error) {
    renderError(error);
  } finally {
    setBusy(false);
    input.focus();
  }
});

chatTab.addEventListener("click", () => setView("chat"));
configTab.addEventListener("click", () => setView("config"));

addLocalButton.addEventListener("click", () => {
  const model = createModel("ollama");
  modelConfig.models.push(model);
  modelConfig.activeModelId ||= model.id;
  renderModels();
});

addDeepSeekButton.addEventListener("click", () => {
  const model = createModel("deepseek");
  modelConfig.models.push(model);
  modelConfig.activeModelId ||= model.id;
  renderModels();
});

saveModelsButton.addEventListener("click", async () => {
  setBusy(true);
  try {
    modelConfig = await requestJson("/api/models", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(modelConfig),
    });
    renderModels();
    await loadStatus();
  } catch (error) {
    renderError(error);
  } finally {
    setBusy(false);
  }
});

async function boot() {
  try {
    await loadStatus();
    await loadMessages();
    await loadModels();
  } catch (error) {
    statusText.textContent = "Disconnected";
    renderError(error);
  }
}

boot();
