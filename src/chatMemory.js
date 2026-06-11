const { Pool } = require("pg");

const DEFAULT_DB_CONFIG = {
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5433),
  database: process.env.PGDATABASE || "yui",
  user: process.env.PGUSER || "yui",
  password: String(process.env.PGPASSWORD ?? "yui_dev_password"),
};

function createMemoryStore(config = DEFAULT_DB_CONFIG) {
  const pool = new Pool(config);

  return {
    async initialize() {
      if (!config.password) {
        throw new Error(
          "PostgreSQL password is missing. Set PGPASSWORD before starting, or use the Docker defaults from docker-compose.yml."
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
      const result = await pool.query(
        `
          INSERT INTO chat_messages (session_id, role, content)
          VALUES ($1, $2, $3)
          RETURNING id, session_id, role, content, created_at
        `,
        [sessionId, role, content]
      );

      const row = result.rows[0];
      return {
        id: row.id,
        sessionId: row.session_id,
        role: row.role,
        content: row.content,
        createdAt: row.created_at,
      };
    },
    async getRecentMessages(sessionId, limit = 20) {
      const result = await pool.query(
        `
          SELECT role, content, created_at
          FROM (
            SELECT id, role, content, created_at
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
        createdAt: row.created_at,
      }));
    },
    async getRecentMessageRecords(sessionId, limit = 50) {
      const result = await pool.query(
        `
          SELECT id, session_id, role, content, created_at
          FROM (
            SELECT id, session_id, role, content, created_at
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
        id: row.id,
        sessionId: row.session_id,
        role: row.role,
        content: row.content,
        createdAt: row.created_at,
      }));
    },
    async getMessagesSinceRecentUserInputs(sessionId, userInputLimit = 20) {
      const result = await pool.query(
        `
          WITH recent_user_messages AS (
            SELECT id
            FROM chat_messages
            WHERE session_id = $1 AND role = 'user'
            ORDER BY id DESC
            LIMIT $2
          ),
          cutoff AS (
            SELECT COALESCE(MIN(id), 0) AS id
            FROM recent_user_messages
          )
          SELECT role, content, created_at
          FROM chat_messages
          WHERE session_id = $1
            AND id >= (SELECT id FROM cutoff)
          ORDER BY id ASC
        `,
        [sessionId, userInputLimit]
      );

      return result.rows.map((row) => ({
        role: row.role,
        content: row.content,
        createdAt: row.created_at,
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
