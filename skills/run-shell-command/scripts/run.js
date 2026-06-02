const { spawn } = require("child_process");
const path = require("path");

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;
const DEFAULT_MAX_OUTPUT_CHARS = 12000;
const MAX_OUTPUT_CHARS = 100000;

function resolveTimeout(value) {
  const timeoutMs = Number(value || DEFAULT_TIMEOUT_MS);

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("timeoutMs must be a positive number.");
  }

  return Math.min(Math.floor(timeoutMs), MAX_TIMEOUT_MS);
}

function resolveMaxOutputChars(value) {
  const maxOutputChars = Number(value || DEFAULT_MAX_OUTPUT_CHARS);

  if (!Number.isFinite(maxOutputChars) || maxOutputChars <= 0) {
    throw new Error("maxOutputChars must be a positive number.");
  }

  return Math.min(Math.floor(maxOutputChars), MAX_OUTPUT_CHARS);
}

function truncateText(text, maxChars) {
  if (text.length <= maxChars) {
    return {
      text,
      truncated: false,
    };
  }

  return {
    text: text.slice(0, maxChars),
    truncated: true,
  };
}

async function run(input = {}) {
  const command = String(input.command || "").trim();

  if (!command) {
    throw new Error("run-shell-command requires input.command.");
  }

  const cwd = path.resolve(input.cwd || process.cwd());
  const timeoutMs = resolveTimeout(input.timeoutMs);
  const maxOutputChars = resolveMaxOutputChars(input.maxOutputChars);

  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
      {
        cwd,
        windowsHide: true,
      }
    );
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      const stdoutResult = truncateText(stdout, maxOutputChars);
      const stderrResult = truncateText(stderr, maxOutputChars);

      resolve({
        command,
        cwd,
        exitCode,
        timedOut,
        stdout: stdoutResult.text,
        stderr: stderrResult.text,
        stdoutTruncated: stdoutResult.truncated,
        stderrTruncated: stderrResult.truncated,
      });
    });
  });
}

module.exports = {
  run,
};
