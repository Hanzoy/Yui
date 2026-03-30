const { Pool } = require("pg");
const { DEFAULT_DB_CONFIG } = require("./chatMemory");

function configureConsoleEncoding() {
  process.stdin.setEncoding("utf8");
  if (process.stdout.setDefaultEncoding) {
    process.stdout.setDefaultEncoding("utf8");
  }
  if (process.stderr.setDefaultEncoding) {
    process.stderr.setDefaultEncoding("utf8");
  }
}

function formatRecord(row) {
  return [
    "----------------------------------------",
    `id: ${row.id}`,
    `session_id: ${row.session_id}`,
    `role: ${row.role}`,
    `created_at: ${row.created_at.toISOString()}`,
    "content:",
    row.content,
  ].join("\n");
}

async function main() {
  configureConsoleEncoding();

  if (!DEFAULT_DB_CONFIG.password) {
    throw new Error(
      "PostgreSQL password is missing. Set PGPASSWORD before starting, or fill it in start.cmd/history.cmd."
    );
  }

  const pool = new Pool(DEFAULT_DB_CONFIG);

  try {
    const result = await pool.query(`
      SELECT id, session_id, role, content, created_at
      FROM chat_messages
      ORDER BY id DESC
      LIMIT 20
    `);

    if (result.rows.length === 0) {
      console.log("No chat history found.");
      return;
    }

    for (const row of result.rows) {
      console.log(formatRecord(row));
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Failed to load history:");
  console.error(error.message);
  process.exit(1);
});
