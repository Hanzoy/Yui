const { randomUUID } = require("crypto");
const { embedText } = require("./embeddingClient");

const DEFAULT_QDRANT_URL = "http://127.0.0.1:6333";
const DEFAULT_QDRANT_COLLECTION = "yui_chat_memory";
const DEFAULT_RELEVANT_MEMORY_LIMIT = 5;

function isQdrantEnabled() {
  const provider = String(process.env.YUI_VECTOR_PROVIDER || "").toLowerCase();
  return (
    provider === "qdrant" ||
    process.env.QDRANT_ENABLED === "true" ||
    Boolean(process.env.QDRANT_URL)
  );
}

function joinUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function createHeaders(apiKey) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers["api-key"] = apiKey;
  }

  return headers;
}

function createQdrantMemory(options = {}) {
  const baseUrl = options.baseUrl ?? process.env.QDRANT_URL ?? DEFAULT_QDRANT_URL;
  const collection =
    options.collection ??
    process.env.QDRANT_COLLECTION ??
    DEFAULT_QDRANT_COLLECTION;
  const apiKey = options.apiKey ?? process.env.QDRANT_API_KEY;
  const headers = createHeaders(apiKey);
  let collectionReady = false;

  async function request(path, requestOptions = {}) {
    const response = await fetch(joinUrl(baseUrl, path), {
      ...requestOptions,
      headers: {
        ...headers,
        ...requestOptions.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Qdrant HTTP ${response.status}: ${errorText}`);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  async function collectionExists() {
    const response = await fetch(joinUrl(baseUrl, `/collections/${collection}`), {
      headers,
    });

    if (response.status === 404) {
      return false;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Qdrant HTTP ${response.status}: ${errorText}`);
    }

    return true;
  }

  async function ensureCollection(vectorSize) {
    if (collectionReady) {
      return;
    }

    if (await collectionExists()) {
      collectionReady = true;
      return;
    }

    await request(`/collections/${collection}`, {
      method: "PUT",
      body: JSON.stringify({
        vectors: {
          size: vectorSize,
          distance: "Cosine",
        },
      }),
    });
    collectionReady = true;
  }

  async function searchRelevantMessages({ sessionId, text, limit }) {
    const vector = await embedText(text, options.embedding);
    await ensureCollection(vector.length);
    const data = await request(`/collections/${collection}/points/search`, {
      method: "POST",
      body: JSON.stringify({
        vector,
        limit: limit ?? DEFAULT_RELEVANT_MEMORY_LIMIT,
        with_payload: true,
        filter: {
          must: [
            {
              key: "sessionId",
              match: {
                value: sessionId,
              },
            },
          ],
        },
      }),
    });

    return (data.result || []).map((point) => ({
      id: point.id,
      score: point.score,
      role: point.payload.role,
      content: point.payload.content,
      createdAt: point.payload.createdAt,
      messageId: point.payload.messageId,
    }));
  }

  async function saveMessage(message) {
    const vector = await embedText(message.content, options.embedding);
    await ensureCollection(vector.length);
    await request(`/collections/${collection}/points?wait=true`, {
      method: "PUT",
      body: JSON.stringify({
        points: [
          {
            id: randomUUID(),
            vector,
            payload: {
              messageId: message.id,
              sessionId: message.sessionId,
              role: message.role,
              content: message.content,
              createdAt:
                message.createdAt instanceof Date
                  ? message.createdAt.toISOString()
                  : message.createdAt,
            },
          },
        ],
      }),
    });
  }

  async function clear() {
    if (!(await collectionExists())) {
      collectionReady = false;
      return false;
    }

    await request(`/collections/${collection}`, {
      method: "DELETE",
    });
    collectionReady = false;
    return true;
  }

  return {
    baseUrl,
    collection,
    enabled: true,
    clear,
    saveMessage,
    searchRelevantMessages,
  };
}

function createDisabledQdrantMemory() {
  return {
    enabled: false,
    async clear() {
      return false;
    },
    async saveMessage() {},
    async searchRelevantMessages() {
      return [];
    },
  };
}

function createVectorMemory(options = {}) {
  if (!isQdrantEnabled()) {
    return createDisabledQdrantMemory();
  }

  return createQdrantMemory(options);
}

module.exports = {
  DEFAULT_QDRANT_COLLECTION,
  DEFAULT_QDRANT_URL,
  DEFAULT_RELEVANT_MEMORY_LIMIT,
  createQdrantMemory,
  createVectorMemory,
  isQdrantEnabled,
};
