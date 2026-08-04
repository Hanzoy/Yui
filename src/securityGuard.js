const fs = require("fs/promises");
const path = require("path");
const { createDefaultChatClient } = require("./modelClient");
const {
  createChatClientOptions,
  getSecurityModel,
  readModelConfig,
} = require("./modelConfigStore");

const DEFAULT_SECURITY_PROMPT_PATH = path.join(__dirname, "..", "SECURITY.md");
const DEFAULT_MAX_REVIEW_CHARS = 12000;

class SecurityRejectionError extends Error {
  constructor(reason) {
    super(`当前执行的命令被安全系统驳回：${reason}`);
    this.name = "SecurityRejectionError";
    this.reason = reason;
  }
}

async function loadSecurityPrompt(promptPath = process.env.YUI_SECURITY_PROMPT || DEFAULT_SECURITY_PROMPT_PATH) {
  return fs.readFile(promptPath, "utf8");
}

function isSecurityEnabled(modelConfig) {
  return modelConfig?.security?.enabled !== false;
}

function truncateForReview(value) {
  const maxChars = Number(process.env.YUI_SECURITY_MAX_REVIEW_CHARS || DEFAULT_MAX_REVIEW_CHARS);
  const text = JSON.stringify(value);

  if (text.length <= maxChars) {
    return {
      truncated: false,
      value,
    };
  }

  return {
    truncated: true,
    value: text.slice(0, maxChars),
  };
}

function parseSecurityDecision(text) {
  const trimmed = String(text || "").trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : trimmed);

  return {
    allowed: parsed.allowed === true,
    reason: String(parsed.reason || (parsed.allowed === true ? "allowed" : "rejected")),
  };
}

function createSecurityClient(modelConfig) {
  return createDefaultChatClient(
    createChatClientOptions(getSecurityModel(modelConfig))
  );
}

async function emitSecurityEvent(options, event) {
  if (typeof options.onEvent !== "function") {
    return;
  }

  await options.onEvent({
    ...event,
    source: "security",
  });
}

async function reviewWithSecurityModel(review, options = {}) {
  const modelConfig = options.modelConfig || (await readModelConfig());

  if (!isSecurityEnabled(modelConfig)) {
    await emitSecurityEvent(options, {
      type: "security.skipped",
      phase: review.phase,
      reason: "安全审查已关闭",
    });
    return {
      allowed: true,
      reason: "security disabled",
    };
  }

  const prompt = await loadSecurityPrompt();
  const client = options.securityClient || createSecurityClient(modelConfig);
  await emitSecurityEvent(options, {
    type: "security.started",
    phase: review.phase,
    provider: client.provider,
    model: client.model,
  });

  try {
    const response = await client.chat("", {
      includeSoul: false,
      think: false,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: prompt,
        },
        {
          role: "user",
          content: JSON.stringify(review, null, 2),
        },
      ],
    });
    const decision = parseSecurityDecision(response);
    await emitSecurityEvent(options, {
      type: "security.completed",
      phase: review.phase,
      provider: client.provider,
      model: client.model,
      allowed: decision.allowed,
      reason: decision.reason,
    });
    return decision;
  } catch (error) {
    await emitSecurityEvent(options, {
      type: "security.failed",
      phase: review.phase,
      provider: client.provider,
      model: client.model,
      error: error.message,
    });
    throw error;
  }
}

async function assertAllowed(review, options = {}) {
  let decision;

  try {
    decision = await reviewWithSecurityModel(review, options);
  } catch (error) {
    throw new SecurityRejectionError(`security review failed: ${error.message}`);
  }

  if (!decision.allowed) {
    throw new SecurityRejectionError(decision.reason);
  }

  return decision;
}

async function checkSkillInput({ skillName, input, context }, options = {}) {
  const reviewedInput = truncateForReview(input);
  return assertAllowed({
    phase: "input",
    skillName,
    input: reviewedInput.value,
    inputTruncated: reviewedInput.truncated,
    context: {
      sessionId: context?.sessionId,
    },
  }, options);
}

async function checkSkillOutput({ skillName, input, output }, options = {}) {
  const reviewedInput = truncateForReview(input);
  const reviewedOutput = truncateForReview(output);
  return assertAllowed({
    phase: "output",
    skillName,
    input: reviewedInput.value,
    inputTruncated: reviewedInput.truncated,
    output: reviewedOutput.value,
    outputTruncated: reviewedOutput.truncated,
  }, options);
}

async function checkSkillLoop({
  messages,
  skillCallCount,
  latestRequests,
  securityClient,
  modelConfig,
  onEvent,
}) {
  const reviewedMessages = truncateForReview(messages);
  const reviewedRequests = truncateForReview(latestRequests);

  return assertAllowed({
    phase: "skill-loop",
    instruction: "判断当前整体 skill 调用流程是否陷入无意义死循环、重复调用、无法收敛的工具调用链。如果已经陷入死循环，allowed=false；如果仍在合理推进任务，allowed=true。",
    skillCallCount,
    messages: reviewedMessages.value,
    messagesTruncated: reviewedMessages.truncated,
    latestRequests: reviewedRequests.value,
    latestRequestsTruncated: reviewedRequests.truncated,
  }, { securityClient, modelConfig, onEvent });
}

module.exports = {
  DEFAULT_SECURITY_PROMPT_PATH,
  SecurityRejectionError,
  checkSkillInput,
  checkSkillLoop,
  checkSkillOutput,
  createSecurityClient,
  isSecurityEnabled,
  parseSecurityDecision,
  reviewWithSecurityModel,
};
