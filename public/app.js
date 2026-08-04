const elements = {
  messages: document.querySelector("#messages"),
  statusText: document.querySelector("#statusText"),
  form: document.querySelector("#chatForm"),
  input: document.querySelector("#messageInput"),
  sendButton: document.querySelector("#sendButton"),
  newSessionButton: document.querySelector("#newSessionButton"),
  chatView: document.querySelector("#chatView"),
  configView: document.querySelector("#configView"),
  navItems: [...document.querySelectorAll(".nav-item")],
  serviceDot: document.querySelector("#serviceDot"),
  serviceLabel: document.querySelector("#serviceLabel"),
  sessionShort: document.querySelector("#sessionShort"),
  chatModelMini: document.querySelector("#chatModelMini"),
  securityModelMini: document.querySelector("#securityModelMini"),
  executionTimeline: document.querySelector("#executionTimeline"),
  executionState: document.querySelector("#executionState"),
  traceStepCount: document.querySelector("#traceStepCount"),
  traceSkillCount: document.querySelector("#traceSkillCount"),
  traceDuration: document.querySelector("#traceDuration"),
  modelList: document.querySelector("#modelList"),
  chatModelSelect: document.querySelector("#chatModelSelect"),
  securityModelSelect: document.querySelector("#securityModelSelect"),
  securityEnabled: document.querySelector("#securityEnabled"),
  addLocalButton: document.querySelector("#addLocalButton"),
  addDeepSeekButton: document.querySelector("#addDeepSeekButton"),
  saveModelsButton: document.querySelector("#saveModelsButton"),
  saveState: document.querySelector("#saveState"),
  toast: document.querySelector("#toast"),
};

let modelConfig = {
  activeModelId: "",
  models: [],
  security: {
    enabled: true,
    modelId: "",
  },
};
let traceStats = {
  steps: 0,
  skills: 0,
  startedAt: 0,
};
let toastTimer;

function formatTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(value) {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    return "—";
  }
  if (milliseconds < 1000) {
    return `${Math.round(milliseconds)} ms`;
  }
  return `${(milliseconds / 1000).toFixed(milliseconds < 10000 ? 1 : 0)} s`;
}

function providerLabel(provider) {
  return provider === "deepseek" ? "DeepSeek" : "Ollama";
}

function securityPhaseLabel(phase) {
  const labels = {
    input: "输入审查",
    output: "输出审查",
    "skill-loop": "循环审查",
  };
  return labels[phase] || "安全审查";
}

function showToast(message, tone = "success") {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.className = `toast visible ${tone}`;
  toastTimer = setTimeout(() => {
    elements.toast.className = "toast";
  }, 2800);
}

function setBusy(isBusy) {
  elements.sendButton.disabled = isBusy;
  elements.newSessionButton.disabled = isBusy;
  elements.saveModelsButton.disabled = isBusy;
  elements.addLocalButton.disabled = isBusy;
  elements.addDeepSeekButton.disabled = isBusy;
}

function resizeInput() {
  elements.input.style.height = "auto";
  elements.input.style.height = `${Math.min(elements.input.scrollHeight, 180)}px`;
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

function renderEmptyMessages() {
  if (elements.messages.querySelector(".message")) {
    return;
  }

  const empty = document.createElement("div");
  empty.className = "empty-conversation";
  empty.innerHTML = `
    <div class="empty-orbit" aria-hidden="true"><span>Y</span></div>
    <p class="eyebrow">READY WHEN YOU ARE</p>
    <h2>从一个目标开始</h2>
    <p>发送消息后，右侧会实时显示记忆检索、模型思考、Skill 调用和安全审查过程。</p>
  `;
  elements.messages.append(empty);
}

function removeEmptyMessages() {
  elements.messages.querySelector(".empty-conversation")?.remove();
}

function renderMessage(message, options = {}) {
  removeEmptyMessages();
  const role = options.role || message.role || "system";
  const item = document.createElement("article");
  item.className = `message ${role}${options.pending ? " pending" : ""}`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent =
    role === "user" ? "你" : role === "error" ? "!" : "Y";

  const content = document.createElement("div");
  content.className = "message-content";
  const meta = document.createElement("div");
  meta.className = "message-meta";
  const roleName =
    role === "user"
      ? "你"
      : role === "assistant"
        ? "Yui"
        : role === "error"
          ? "运行错误"
          : "系统";
  meta.textContent = `${roleName}${formatTime(message.createdAt) ? ` · ${formatTime(message.createdAt)}` : ""}`;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = message.content || "";
  content.append(meta, bubble);
  item.append(avatar, content);
  elements.messages.append(item);
  elements.messages.scrollTop = elements.messages.scrollHeight;
  return item;
}

function renderError(error) {
  renderMessage({
    role: "error",
    content: error.message || String(error),
    createdAt: new Date().toISOString(),
  });
}

function setTraceState(state, label) {
  elements.executionState.className = `trace-state ${state}`;
  elements.executionState.querySelector("strong").textContent = label;
}

function renderEmptyTrace(message = "发送消息后，这里会实时记录 Yui 的每一步。") {
  if (elements.executionTimeline.querySelector(".trace-item")) {
    return;
  }

  const empty = document.createElement("div");
  empty.className = "empty-trace";
  empty.innerHTML = `<span aria-hidden="true">⌁</span><p>${message}</p>`;
  elements.executionTimeline.append(empty);
}

function clearTrace() {
  elements.executionTimeline.textContent = "";
  traceStats = {
    steps: 0,
    skills: 0,
    startedAt: Date.now(),
  };
  elements.traceStepCount.textContent = "0";
  elements.traceSkillCount.textContent = "0";
  elements.traceDuration.textContent = "—";
  setTraceState("running", "执行中");
}

function tracePresentation(event) {
  switch (event.type) {
    case "queue.waiting":
      return ["进入执行队列", "等待当前任务完成", "queue"];
    case "flow.started":
      return ["开始处理请求", `${providerLabel(event.provider)} · ${event.model}`, "flow"];
    case "memory.started":
      return ["检索长期记忆", event.enabled ? "正在查询 Qdrant" : "长期记忆未启用", "memory"];
    case "memory.completed":
      return [
        "记忆检索完成",
        event.enabled ? `找到 ${event.count || 0} 条相关记忆` : "已跳过",
        "memory",
      ];
    case "context.started":
      return ["组装对话上下文", "读取最近消息与 Skill 索引", "context"];
    case "context.completed":
      return [
        "上下文准备完成",
        `${event.messageCount || 0} 条消息 · ${event.skillCount || 0} 个 Skill`,
        "context",
      ];
    case "model.started":
      return [
        `模型推理 · 第 ${event.round || 1} 轮`,
        `${providerLabel(event.provider)} · ${event.model}`,
        "model",
      ];
    case "model.completed":
      return [
        event.skillRequestCount ? "模型请求执行 Skill" : "模型生成最终回答",
        event.skillRequestCount
          ? `${event.skillRequestCount} 个调用请求`
          : `${providerLabel(event.provider)} · ${event.model}`,
        "model",
      ];
    case "skill.started":
      return [
        event.action === "load" ? `加载 ${event.skill}` : `执行 ${event.skill}`,
        event.action === "load" ? "读取 Skill 使用说明" : "Skill 已进入安全执行链",
        "skill",
      ];
    case "skill.completed":
      return [
        event.action === "load" ? `${event.skill} 已加载` : `${event.skill} 执行完成`,
        event.action === "load" ? "说明已回填给模型" : "结果已回填给模型",
        "skill",
      ];
    case "skill.failed":
      return [`${event.skill} 执行失败`, event.error || "未知错误", "error"];
    case "security.started":
      return [
        securityPhaseLabel(event.phase),
        `${providerLabel(event.provider)} · ${event.model}`,
        "security",
      ];
    case "security.completed":
      return [
        event.allowed ? `${securityPhaseLabel(event.phase)}通过` : `${securityPhaseLabel(event.phase)}拒绝`,
        event.reason || (event.allowed ? "允许继续" : "已终止"),
        event.allowed ? "security" : "error",
      ];
    case "security.skipped":
      return [`${securityPhaseLabel(event.phase)}已跳过`, event.reason || "安全审查已关闭", "muted"];
    case "security.failed":
      return [`${securityPhaseLabel(event.phase)}失败`, event.error || "审查模型调用失败", "error"];
    case "loop-review.started":
      return ["检查 Skill 调用循环", `已累计 ${event.skillCallCount || 0} 次调用`, "security"];
    case "loop-review.completed":
      return ["Skill 调用循环正常", "允许继续执行", "security"];
    case "history.skill-request":
      return ["历史 Skill 请求", "来自当前会话记录", "skill"];
    case "history.skill-response":
      return ["历史 Skill 响应", "来自当前会话记录", "skill"];
    case "flow.completed":
      return [
        "任务执行完成",
        `${event.skillCallCount || 0} 次 Skill 调用 · ${formatDuration(event.durationMs)}`,
        "success",
      ];
    case "flow.failed":
      return ["任务执行中止", event.error || "未知错误", "error"];
    default:
      return [event.type || "执行事件", "", "muted"];
  }
}

function appendTraceEvent(event, options = {}) {
  elements.executionTimeline.querySelector(".empty-trace")?.remove();
  const [title, subtitle, tone] = tracePresentation(event);
  const item = document.createElement("article");
  item.className = `trace-item ${tone}`;

  const rail = document.createElement("div");
  rail.className = "trace-rail";
  rail.innerHTML = "<span></span>";

  const content = document.createElement("div");
  content.className = "trace-content";
  const heading = document.createElement("div");
  heading.className = "trace-item-heading";
  const titleEl = document.createElement("strong");
  titleEl.textContent = title;
  const time = document.createElement("time");
  time.textContent = formatTime(event.at || event.createdAt);
  heading.append(titleEl, time);
  content.append(heading);

  if (subtitle) {
    const subtitleEl = document.createElement("p");
    subtitleEl.textContent = subtitle;
    content.append(subtitleEl);
  }

  if (event.detail) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "查看详情";
    const pre = document.createElement("pre");
    pre.textContent = event.detail;
    details.append(summary, pre);
    content.append(details);
  }

  item.append(rail, content);
  elements.executionTimeline.append(item);
  elements.executionTimeline.scrollTop = elements.executionTimeline.scrollHeight;

  traceStats.steps += 1;
  if (event.type === "skill.started") {
    traceStats.skills += 1;
  }
  elements.traceStepCount.textContent = String(traceStats.steps);
  elements.traceSkillCount.textContent = String(traceStats.skills);

  if (event.type === "flow.completed") {
    elements.traceDuration.textContent = formatDuration(event.durationMs);
    setTraceState("complete", "已完成");
  } else if (event.type === "flow.failed" || event.type === "security.failed") {
    elements.traceDuration.textContent = formatDuration(
      event.durationMs || Date.now() - traceStats.startedAt
    );
    setTraceState("failed", "已中止");
  } else if (!options.historical) {
    setTraceState("running", "执行中");
  }
}

function renderHistoricalTrace(message) {
  appendTraceEvent(
    {
      type:
        message.role === "skill_request"
          ? "history.skill-request"
          : "history.skill-response",
      createdAt: message.createdAt,
      detail: message.content,
    },
    { historical: true }
  );
}

async function loadStatus() {
  const status = await requestJson("/api/session");
  const memoryLabel = status.vectorMemory?.enabled ? "长期记忆已启用" : "长期记忆已关闭";
  elements.statusText.textContent = `${providerLabel(status.provider)} / ${status.model} · ${status.skills.length} 个 Skill · ${memoryLabel}`;
  elements.serviceDot.className = "status-dot online";
  elements.serviceLabel.textContent = "服务在线";
  elements.sessionShort.textContent = `会话 ${status.sessionId.slice(0, 8)}`;
  elements.chatModelMini.textContent = status.model;
  elements.securityModelMini.textContent = status.security?.enabled
    ? status.security.model
    : "已关闭";
  return status;
}

async function loadMessages() {
  const data = await requestJson("/api/messages?limit=100");
  elements.messages.textContent = "";
  elements.executionTimeline.textContent = "";
  traceStats = { steps: 0, skills: 0, startedAt: 0 };

  for (const message of data.messages) {
    if (message.role === "skill_request" || message.role === "skill_response") {
      renderHistoricalTrace(message);
    } else {
      renderMessage(message);
    }
  }

  renderEmptyMessages();
  renderEmptyTrace(
    elements.executionTimeline.querySelector(".trace-item")
      ? ""
      : "发送消息后，这里会实时记录 Yui 的每一步。"
  );
  if (elements.executionTimeline.querySelector(".trace-item")) {
    setTraceState("idle", "历史记录");
  } else {
    setTraceState("idle", "等待任务");
  }
}

async function streamChat(message, onTrace) {
  const response = await fetch("/api/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  if (!response.body) {
    throw new Error("浏览器不支持流式响应。");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completedResult;
  let streamedError;

  function consumeBlock(block) {
    const lines = block.split(/\r?\n/);
    let eventName = "message";
    const dataLines = [];

    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    if (!dataLines.length) {
      return;
    }

    const data = JSON.parse(dataLines.join("\n"));
    if (eventName === "trace") {
      onTrace(data);
    } else if (eventName === "complete") {
      completedResult = data;
    } else if (eventName === "error") {
      streamedError = new Error(data.error || "Yui 执行失败");
    }
  }

  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";
    blocks.filter(Boolean).forEach(consumeBlock);

    if (done) {
      if (buffer.trim()) {
        consumeBlock(buffer);
      }
      break;
    }
  }

  if (streamedError) {
    throw streamedError;
  }
  if (!completedResult) {
    throw new Error("执行流意外结束，未收到最终结果。");
  }
  return completedResult;
}

function markConfigDirty() {
  elements.saveState.textContent = "有未保存的修改";
  elements.saveState.className = "save-state dirty";
}

function markConfigSaved() {
  elements.saveState.textContent = "配置已同步";
  elements.saveState.className = "save-state saved";
}

function modelOptionText(model) {
  return `${model.name} · ${providerLabel(model.provider)} / ${model.model}`;
}

function populateModelSelect(select, selectedId) {
  select.textContent = "";
  for (const model of modelConfig.models) {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = modelOptionText(model);
    option.selected = model.id === selectedId;
    select.append(option);
  }
}

function renderRoleSelectors() {
  modelConfig.security ||= {
    enabled: true,
    modelId: modelConfig.activeModelId,
  };
  populateModelSelect(elements.chatModelSelect, modelConfig.activeModelId);
  populateModelSelect(elements.securityModelSelect, modelConfig.security.modelId);
  elements.securityEnabled.checked = modelConfig.security.enabled !== false;
  elements.securityModelSelect.disabled = !elements.securityEnabled.checked;
}

function createInput(value, placeholder, datasetKey, type = "text") {
  const input = document.createElement("input");
  input.type = type;
  input.value = value || "";
  input.placeholder = placeholder || "";
  input.dataset.key = datasetKey;
  input.autocomplete = type === "password" ? "new-password" : "off";
  return input;
}

function createProviderSelect(provider) {
  const select = document.createElement("select");
  select.dataset.key = "provider";

  for (const value of ["ollama", "deepseek"]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value === "deepseek" ? "DeepSeek API" : "Local Ollama";
    option.selected = provider === value;
    select.append(option);
  }
  return select;
}

function field(labelText, input, hint) {
  const label = document.createElement("label");
  label.className = "model-field";
  const title = document.createElement("span");
  title.textContent = labelText;
  label.append(title, input);
  if (hint) {
    const hintEl = document.createElement("small");
    hintEl.textContent = hint;
    label.append(hintEl);
  }
  return label;
}

function renderModelCard(model, index) {
  const card = document.createElement("article");
  card.className = "model-card";
  card.dataset.index = String(index);

  const header = document.createElement("div");
  header.className = "model-card-header";
  const identity = document.createElement("div");
  identity.className = "model-identity";
  const number = document.createElement("span");
  number.textContent = String(index + 1).padStart(2, "0");
  const title = document.createElement("div");
  const heading = document.createElement("h3");
  heading.textContent = model.name || "未命名模型";
  const badges = document.createElement("div");
  badges.className = "model-badges";
  const provider = document.createElement("span");
  provider.className = `provider-badge ${model.provider}`;
  provider.textContent = providerLabel(model.provider);
  badges.append(provider);

  if (model.id === modelConfig.activeModelId) {
    const badge = document.createElement("span");
    badge.className = "purpose-badge chat";
    badge.textContent = "对话";
    badges.append(badge);
  }
  if (modelConfig.security?.enabled && model.id === modelConfig.security.modelId) {
    const badge = document.createElement("span");
    badge.className = "purpose-badge security";
    badge.textContent = "审查";
    badges.append(badge);
  }

  title.append(heading, badges);
  identity.append(number, title);

  const remove = document.createElement("button");
  remove.className = "remove-model";
  remove.type = "button";
  remove.textContent = "移除";
  remove.disabled = modelConfig.models.length <= 1;
  remove.addEventListener("click", () => {
    modelConfig.models.splice(index, 1);
    if (!modelConfig.models.some((item) => item.id === modelConfig.activeModelId)) {
      modelConfig.activeModelId = modelConfig.models[0]?.id || "";
    }
    if (!modelConfig.models.some((item) => item.id === modelConfig.security?.modelId)) {
      modelConfig.security.modelId = modelConfig.activeModelId;
    }
    renderModels();
    markConfigDirty();
  });
  header.append(identity, remove);

  const fields = document.createElement("div");
  fields.className = "model-fields";
  const providerSelect = createProviderSelect(model.provider);
  fields.append(
    field("显示名称", createInput(model.name, "例如：主力模型", "name")),
    field("服务类型", providerSelect),
    field("模型名称", createInput(model.model, "模型标识", "model"))
  );

  if (model.provider === "deepseek") {
    fields.append(
      field(
        "Base URL",
        createInput(model.baseUrl, "https://api.deepseek.com", "baseUrl")
      ),
      field(
        "API Key",
        createInput(model.apiKey, "sk-...", "apiKey", "password"),
        model.hasApiKey ? "已保存密钥；留空或保持掩码不会覆盖。" : "仅保存在本地配置文件中。"
      )
    );
  } else {
    fields.append(
      field(
        "Ollama URL",
        createInput(
          model.ollamaUrl,
          "http://ollama:11434/api/chat",
          "ollamaUrl"
        ),
        "Docker 内部默认使用 ollama 服务名。"
      )
    );
  }

  card.addEventListener("input", (event) => {
    const key = event.target.dataset.key;
    if (!key) {
      return;
    }
    model[key] = event.target.value;
    heading.textContent = model.name || "未命名模型";
    renderRoleSelectors();
    markConfigDirty();
  });

  providerSelect.addEventListener("change", () => {
    model.provider = providerSelect.value;
    if (model.provider === "deepseek") {
      model.baseUrl ||= "https://api.deepseek.com";
      model.model = model.model || "deepseek-v4-pro";
      model.apiKey ||= "";
    } else {
      model.ollamaUrl ||= "http://ollama:11434/api/chat";
      model.model = model.model || "qwen3.5:9b";
    }
    renderModels();
    markConfigDirty();
  });

  card.append(header, fields);
  return card;
}

function renderModels() {
  elements.modelList.textContent = "";
  modelConfig.models.forEach((model, index) => {
    elements.modelList.append(renderModelCard(model, index));
  });
  renderRoleSelectors();
}

async function loadModels() {
  modelConfig = await requestJson("/api/models");
  modelConfig.security ||= {
    enabled: true,
    modelId: modelConfig.activeModelId,
  };
  renderModels();
  markConfigSaved();
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

function setView(viewName) {
  const isConfig = viewName === "config";
  elements.chatView.classList.toggle("active", !isConfig);
  elements.configView.classList.toggle("active", isConfig);
  elements.navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.view === viewName);
  });
  document.title = isConfig ? "模型与安全 · Yui" : "对话与执行 · Yui";
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = elements.input.value.trim();
  if (!message) {
    return;
  }

  elements.input.value = "";
  resizeInput();
  renderMessage({
    role: "user",
    content: message,
    createdAt: new Date().toISOString(),
  });
  const pendingMessage = renderMessage(
    {
      role: "assistant",
      content: "Yui 正在处理，执行细节会实时显示在右侧。",
      createdAt: new Date().toISOString(),
    },
    { pending: true }
  );

  clearTrace();
  setBusy(true);
  try {
    const result = await streamChat(message, appendTraceEvent);
    pendingMessage.remove();
    renderMessage(result.assistantMessage);
    await loadStatus();
  } catch (error) {
    pendingMessage.remove();
    renderError(error);
    if (!elements.executionTimeline.querySelector(".trace-item.error")) {
      appendTraceEvent({
        type: "flow.failed",
        at: new Date().toISOString(),
        durationMs: Date.now() - traceStats.startedAt,
        error: error.message,
      });
    }
  } finally {
    setBusy(false);
    elements.input.focus();
  }
});

elements.input.addEventListener("input", resizeInput);
elements.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    elements.form.requestSubmit();
  }
});

elements.newSessionButton.addEventListener("click", async () => {
  setBusy(true);
  try {
    await requestJson("/api/session/new", { method: "POST" });
    elements.messages.textContent = "";
    elements.executionTimeline.textContent = "";
    renderEmptyMessages();
    renderEmptyTrace();
    setTraceState("idle", "等待任务");
    elements.traceStepCount.textContent = "0";
    elements.traceSkillCount.textContent = "0";
    elements.traceDuration.textContent = "—";
    await loadStatus();
    showToast("新会话已创建");
  } catch (error) {
    renderError(error);
  } finally {
    setBusy(false);
    elements.input.focus();
  }
});

elements.navItems.forEach((item) => {
  item.addEventListener("click", () => setView(item.dataset.view));
});

elements.chatModelSelect.addEventListener("change", () => {
  modelConfig.activeModelId = elements.chatModelSelect.value;
  renderModels();
  markConfigDirty();
});

elements.securityModelSelect.addEventListener("change", () => {
  modelConfig.security.modelId = elements.securityModelSelect.value;
  renderModels();
  markConfigDirty();
});

elements.securityEnabled.addEventListener("change", () => {
  modelConfig.security.enabled = elements.securityEnabled.checked;
  renderModels();
  markConfigDirty();
});

elements.addLocalButton.addEventListener("click", () => {
  const model = createModel("ollama");
  modelConfig.models.push(model);
  modelConfig.activeModelId ||= model.id;
  modelConfig.security.modelId ||= model.id;
  renderModels();
  markConfigDirty();
  elements.modelList.lastElementChild?.scrollIntoView({ behavior: "smooth" });
});

elements.addDeepSeekButton.addEventListener("click", () => {
  const model = createModel("deepseek");
  modelConfig.models.push(model);
  modelConfig.activeModelId ||= model.id;
  modelConfig.security.modelId ||= model.id;
  renderModels();
  markConfigDirty();
  elements.modelList.lastElementChild?.scrollIntoView({ behavior: "smooth" });
});

elements.saveModelsButton.addEventListener("click", async () => {
  setBusy(true);
  elements.saveState.textContent = "正在保存…";
  try {
    modelConfig = await requestJson("/api/models", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(modelConfig),
    });
    renderModels();
    markConfigSaved();
    await loadStatus();
    showToast("模型与安全配置已生效");
  } catch (error) {
    elements.saveState.textContent = "保存失败";
    elements.saveState.className = "save-state error";
    showToast(error.message, "error");
  } finally {
    setBusy(false);
  }
});

async function boot() {
  renderEmptyMessages();
  renderEmptyTrace();
  try {
    await Promise.all([loadStatus(), loadMessages(), loadModels()]);
    elements.input.focus();
  } catch (error) {
    elements.serviceDot.className = "status-dot offline";
    elements.serviceLabel.textContent = "连接失败";
    elements.statusText.textContent = "无法连接 Yui 服务";
    renderError(error);
  }
}

boot();
