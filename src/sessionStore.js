const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");

const SESSION_FILE_PATH = path.join(__dirname, "..", ".session.json");

async function loadSessionState() {
  try {
    const content = await fs.readFile(SESSION_FILE_PATH, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function saveSessionState(sessionId) {
  await fs.writeFile(
    SESSION_FILE_PATH,
    JSON.stringify({ sessionId }, null, 2),
    "utf8"
  );
}

async function resolveSessionId(argv = process.argv.slice(2)) {
  const shouldCreateNewSession = argv.length > 0;

  if (!shouldCreateNewSession) {
    const existingState = await loadSessionState();
    if (existingState?.sessionId) {
      return {
        sessionId: existingState.sessionId,
        isNewSession: false,
      };
    }
  }

  const sessionId = randomUUID();
  await saveSessionState(sessionId);
  return {
    sessionId,
    isNewSession: true,
  };
}

module.exports = {
  SESSION_FILE_PATH,
  resolveSessionId,
};
