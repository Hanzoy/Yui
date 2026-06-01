const { createVectorMemory } = require("../../../src/qdrantMemory");

async function run(input = {}, context = {}) {
  const query = String(input.query || "").trim();
  const limit = Number(input.limit || process.env.QDRANT_MEMORY_LIMIT || 5);

  if (!query) {
    throw new Error("search-memory requires a non-empty query.");
  }

  const vectorMemory = createVectorMemory();
  if (!vectorMemory.enabled) {
    return {
      enabled: false,
      query,
      memories: [],
    };
  }

  const memories = await vectorMemory.searchRelevantMessages({
    sessionId: context.sessionId,
    text: query,
    limit,
  });

  return {
    enabled: true,
    query,
    memories,
  };
}

module.exports = {
  run,
};
