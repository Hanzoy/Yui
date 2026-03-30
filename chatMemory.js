const { Pool } = require("pg");

const DEFAULT_DB_CONFIG = {
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "postgres",
  user: process.env.PGUSER || "postgres",
  password: String(process.env.PGPASSWORD ?? ""),
};

function createMemoryStore(config = DEFAULT_DB_CONFIG) {
  const pool = new Pool(config);

  return {
    async initialize() {
      if (!config.password) {
        throw new Error(
          "PostgreSQL password is missing. Set PGPASSWORD before starting, for example: $env:PGPASSWORD=\"your_password\""
        );
      }

      await pool.query(`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id BIGSERIAL PRIMARY KEY,
          session_id UUID NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    },
    async saveMessage({ sessionId, role, content }) {
      await pool.query(
        `
          INSERT INTO chat_messages (session_id, role, content)
          VALUES ($1, $2, $3)
        `,
        [sessionId, role, content]
      );
    },
    async getRecentMessages(sessionId, limit = 20) {
      const result = await pool.query(
        `
          SELECT role, content
          FROM (
            SELECT id, role, content
            FROM chat_messages
            WHERE session_id = $1
            ORDER BY id DESC
            LIMIT $2
          ) recent_messages
          ORDER BY id ASC
        `,
        [sessionId, limit]
      );

      return result.rows.map((row) => ({
        role: row.role,
        content: row.content,
      }));
    },
    async close() {
      await pool.end();
    },
  };
}

module.exports = {
  DEFAULT_DB_CONFIG,
  createMemoryStore,
};
