const DEFAULT_SKILL_LOOP_REVIEW_INTERVAL = 10;
const SKILL_BLOCK_PATTERN = /```yui-skill\s*([\s\S]*?)```/g;
const MAX_EVENT_DETAIL_CHARS = 4000;

function eventDetail(value) {
  if (value === undefined) {
    return undefined;
  }

  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > MAX_EVENT_DETAIL_CHARS
    ? `${text.slice(0, MAX_EVENT_DETAIL_CHARS)}\n…`
    : text;
}

async function emitEvent(options, event) {
  if (typeof options.onEvent === "function") {
    await options.onEvent(event);
  }
}

function normalizeAssistantMessage(message) {
  return {
    role: "assistant",
    flowRole: "assistant",
    content: message.content ?? "",
  };
}

function toModelMessage(message) {
  return {
    role: message.role,
    content: message.content ?? "",
  };
}

function parseSkillBlock(block) {
  const parsed = JSON.parse(block.trim());
  return Array.isArray(parsed) ? parsed : [parsed];
}

function extractSkillRequests(content) {
  const requests = [];
  let match;

  while ((match = SKILL_BLOCK_PATTERN.exec(content)) !== null) {
    requests.push(...parseSkillBlock(match[1]));
  }

  return requests.map((request) => ({
    skill: request.skill,
    action: request.action || "run",
    input: request.input || {},
  }));
}

function buildSkillResponseMessage(responses) {
  return {
    role: "system",
    flowRole: "skill_response",
    content: [
      "以下是 Yui skill 响应。请根据响应继续思考。",
      "如果还需要 skill，请继续只输出 yui-skill 代码块；如果信息足够，请直接回答用户。",
      "```yui-skill-response",
      JSON.stringify(responses, null, 2),
      "```",
    ].join("\n"),
  };
}

async function handleSkillRequests(requests, options = {}) {
  return Promise.all(
    requests.map(async (request) => {
      await emitEvent(options, {
        type: "skill.started",
        skill: request.skill,
        action: request.action,
        detail: eventDetail(request.input),
      });

      try {
        if (request.action === "load") {
          const doc = await options.loadSkillDoc(request.skill);
          await emitEvent(options, {
            type: "skill.completed",
            skill: request.skill,
            action: "load",
            detail: eventDetail(doc),
          });
          return {
            skill: request.skill,
            action: "load",
            ok: true,
            doc,
          };
        }

        const result = await options.executeSkillRequest(request, {
          onEvent: (event) => emitEvent(options, event),
        });
        await emitEvent(options, {
          type: "skill.completed",
          skill: request.skill,
          action: "run",
          detail: eventDetail(result),
        });
        return {
          skill: request.skill,
          action: "run",
          ok: true,
          result,
        };
      } catch (error) {
        await emitEvent(options, {
          type: "skill.failed",
          skill: request.skill,
          action: request.action,
          error: error.message,
        });
        return {
          skill: request.skill,
          action: request.action,
          ok: false,
          error: error.message,
        };
      }
    })
  );
}

async function runSkillAwareChat(chatClient, options = {}) {
  const messages = [...(options.messages || [])];
  const reviewInterval =
    options.skillLoopReviewInterval ?? DEFAULT_SKILL_LOOP_REVIEW_INTERVAL;
  let skillCallCount = 0;
  let nextReviewAt = reviewInterval;

  for (let round = 0; ; round += 1) {
    await emitEvent(options, {
      type: "model.started",
      round: round + 1,
      provider: chatClient.provider,
      model: chatClient.model,
    });
    const assistantMessage = normalizeAssistantMessage(
      await chatClient.createMessage("", {
        messages: messages.map(toModelMessage),
        onBeforeSend: options.onBeforeSend,
      })
    );
    const skillRequests = extractSkillRequests(assistantMessage.content);

    if (skillRequests.length) {
      assistantMessage.flowRole = "skill_request";
    }

    messages.push(assistantMessage);
    await emitEvent(options, {
      type: "model.completed",
      round: round + 1,
      provider: chatClient.provider,
      model: chatClient.model,
      skillRequestCount: skillRequests.length,
      detail: skillRequests.length
        ? eventDetail(skillRequests)
        : eventDetail(assistantMessage.content),
    });

    if (!skillRequests.length) {
      return {
        content: assistantMessage.content || "",
        messages,
        skillRounds: round,
        skillCallCount,
      };
    }

    skillCallCount += skillRequests.length;

    const skillResponses = await handleSkillRequests(skillRequests, options);
    messages.push(buildSkillResponseMessage(skillResponses));

    if (reviewInterval > 0 && skillCallCount >= nextReviewAt) {
      while (nextReviewAt <= skillCallCount) {
        nextReviewAt += reviewInterval;
      }

      if (typeof options.reviewSkillLoop === "function") {
        await emitEvent(options, {
          type: "loop-review.started",
          skillCallCount,
        });
        await options.reviewSkillLoop({
          messages,
          skillCallCount,
          latestRequests: skillRequests,
        });
        await emitEvent(options, {
          type: "loop-review.completed",
          skillCallCount,
        });
      }
    }
  }
}

module.exports = {
  DEFAULT_SKILL_LOOP_REVIEW_INTERVAL,
  extractSkillRequests,
  runSkillAwareChat,
};
