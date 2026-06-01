const DEFAULT_OLLAMA_EMBEDDING_URL = "http://127.0.0.1:11434/api/embed";
const DEFAULT_EMBEDDING_MODEL = "bge-m3";

function readEmbeddingFromResponse(data) {
  if (Array.isArray(data.embeddings?.[0])) {
    return data.embeddings[0];
  }

  if (Array.isArray(data.embedding)) {
    return data.embedding;
  }

  throw new Error("Embedding response did not include an embedding vector.");
}

async function embedText(text, options = {}) {
  const embeddingUrl =
    options.embeddingUrl ??
    process.env.OLLAMA_EMBEDDING_URL ??
    DEFAULT_OLLAMA_EMBEDDING_URL;
  const model =
    options.model ??
    process.env.OLLAMA_EMBEDDING_MODEL ??
    DEFAULT_EMBEDDING_MODEL;

  const response = await fetch(embeddingUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding HTTP ${response.status}: ${errorText}`);
  }

  return readEmbeddingFromResponse(await response.json());
}

module.exports = {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_OLLAMA_EMBEDDING_URL,
  embedText,
};
