const path = require("path");
const { spawn } = require("child_process");

const DEFAULT_SKILL_COMMAND_PATH = path.join(__dirname, "..", "skillCommand.js");
const EVENT_PREFIX = "YUI_EVENT:";

function getContextValue(context, key) {
  const value = context[key];
  return typeof value === "function" ? value() : value;
}

function buildCommandPayload(input, context = {}) {
  return {
    input: input || {},
    context: {
      sessionId: getContextValue(context, "sessionId"),
    },
  };
}

function runSkillCommand(skillName, payload, options = {}) {
  const commandPath = options.commandPath || DEFAULT_SKILL_COMMAND_PATH;
  const timeoutMs = Number(options.timeoutMs || process.env.YUI_SKILL_TIMEOUT_MS || 30000);

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [commandPath, skillName], {
      cwd: path.join(__dirname, "..", ".."),
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let stderrBuffer = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Skill command timed out: ${skillName}`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      const lines = `${stderrBuffer}${chunk.toString()}`.split(/\r?\n/);
      stderrBuffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith(EVENT_PREFIX)) {
          try {
            const event = JSON.parse(line.slice(EVENT_PREFIX.length));
            options.onEvent?.(event);
          } catch (error) {
            stderr += `Invalid execution event: ${error.message}\n`;
          }
        } else if (line) {
          stderr += `${line}\n`;
        }
      }
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);

      if (stderrBuffer.startsWith(EVENT_PREFIX)) {
        try {
          const event = JSON.parse(stderrBuffer.slice(EVENT_PREFIX.length));
          options.onEvent?.(event);
        } catch (error) {
          stderr += `Invalid execution event: ${error.message}\n`;
        }
      } else {
        stderr += stderrBuffer;
      }

      let parsed;
      try {
        parsed = JSON.parse(stdout || "{}");
      } catch (error) {
        reject(new Error(`Skill command returned invalid JSON: ${error.message}; stderr=${stderr}`));
        return;
      }

      if (code !== 0 || parsed.ok === false) {
        reject(new Error(parsed.error || stderr || `Skill command failed: ${skillName}`));
        return;
      }

      resolve(parsed.result);
    });

    child.stdin.end(JSON.stringify(payload));
  });
}

function createSkillExecutor(registry, context = {}) {
  async function execute(request, executionOptions = {}) {
    const skill = registry.getSkill(request.skill);

    if (!skill) {
      throw new Error(`Unknown skill: ${request.skill}`);
    }

    return runSkillCommand(
      request.skill,
      buildCommandPayload(request.input, context),
      {
        commandPath: context.commandPath,
        timeoutMs: context.timeoutMs,
        onEvent: executionOptions.onEvent,
      }
    );
  }

  return {
    execute,
  };
}

module.exports = {
  DEFAULT_SKILL_COMMAND_PATH,
  buildCommandPayload,
  createSkillExecutor,
  runSkillCommand,
};
