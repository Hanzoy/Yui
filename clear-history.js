const { Pool } = require("pg");
const { DEFAULT_DB_CONFIG } = require("./chatMemory");

async function main() {
  if (!DEFAULT_DB_CONFIG.password) {
    throw new Error(
      "PostgreSQL password is missing. Set PGPASSWORD before starting, or fill it in clear-history.cmd."
    );
  }

  const pool = new Pool(DEFAULT_DB_CONFIG);

  try {
    const result = await pool.query("TRUNCATE TABLE chat_messages RESTART IDENTITY");
    console.log("Chat history cleared.");
    console.log(result.command);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Failed to clear chat history:");
  console.error(error.message);
  process.exit(1);
});
