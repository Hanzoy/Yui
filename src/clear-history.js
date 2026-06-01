const { Pool } = require("pg");
const { DEFAULT_DB_CONFIG } = require("./chatMemory");
const { createVectorMemory } = require("./qdrantMemory");

async function main() {
  if (!DEFAULT_DB_CONFIG.password) {
    throw new Error(
      "PostgreSQL password is missing. Set PGPASSWORD before starting, or fill it in clear-history.cmd."
    );
  }

  const pool = new Pool(DEFAULT_DB_CONFIG);
  const vectorMemory = createVectorMemory();

  try {
    const result = await pool.query("TRUNCATE TABLE chat_messages RESTART IDENTITY");
    console.log("PostgreSQL chat history cleared.");
    console.log(result.command);

    if (!vectorMemory.enabled) {
      console.log("Qdrant vector memory is disabled. Skipped.");
      return;
    }

    const wasCleared = await vectorMemory.clear();
    console.log(
      wasCleared
        ? `Qdrant collection cleared: ${vectorMemory.collection}`
        : `Qdrant collection did not exist: ${vectorMemory.collection}`
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Failed to clear chat history:");
  console.error(error.message);
  process.exit(1);
});
