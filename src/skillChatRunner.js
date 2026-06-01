const DEFAULT_MAX_SKILL_ROUNDS = 5;
const SKILL_BLOCK_PATTERN = /```yui-skill\s*([\s\S]*?)```/g;

function normalizeAssistantMessage(message) {
  return {
    role: "assistant",
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
    input: request.input || {},
  }));
}

function buildSkillResultMessage(results) {
  return {
    role: "system",
    content: [
      "以下是 Yui skill 命令执行结果。请根据结果继续思考。",
      "如果还需要 skill，请继续只输出 yui-skill 代码块；如果信息足够，请直接回答用户。",
      "```yui-skill-result",
      JSON.stringify(results, null, 2),
      "```",
    ].join("\n"),
  };
}

async function executeSkillRequests(requests, executeSkillRequest) {
  return Promise.all(
    requests.map(async (request) => {
      try {
        const result = await executeSkillRequest(request);
        return {
          skill: request.skill,
          ok: true,
          result,
        };
      } catch (error) {
        return {
          skill: request.skill,
          ok: false,
          error: error.message,
        };
      }
    })
  );
}

async function runSkillAwareChat(chatClient, options = {}) {
  const messages = [...(options.messages || [])];
  const maxSkillRounds = options.maxSkillRounds ?? DEFAULT_MAX_SKILL_ROUNDS;

  for (let round = 0; round <= maxSkillRounds; round += 1) {
    const assistantMessage = normalizeAssistantMessage(
      await chatClient.createMessage("", {
        messages,
        onBeforeSend: options.onBeforeSend,
      })
    );

    messages.push(assistantMessage);

    const skillRequests = extractSkillRequests(assistantMessage.content);
    if (!skillRequests.length) {
      return {
        content: assistantMessage.content || "",
        messages,
        skillRounds: round,
      };
    }

    if (round === maxSkillRounds) {
      throw new Error(`Skill call loop exceeded max rounds: ${maxSkillRounds}`);
    }

    const skillResults = await executeSkillRequests(
      skillRequests,
      options.executeSkillRequest
    );
    messages.push(buildSkillResultMessage(skillResults));
  }

  throw new Error(`Skill call loop exceeded max rounds: ${maxSkillRounds}`);
}

module.exports = {
  DEFAULT_MAX_SKILL_ROUNDS,
  extractSkillRequests,
  runSkillAwareChat,
};
