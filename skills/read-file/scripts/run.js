const fs = require("fs/promises");
const path = require("path");

const DEFAULT_MAX_BYTES = 65536;
const MAX_ALLOWED_BYTES = 1024 * 1024;

function resolveRequestedPath(requestedPath) {
  if (!requestedPath) {
    throw new Error("read-file requires input.path.");
  }

  return path.resolve(String(requestedPath));
}

function resolveMaxBytes(value) {
  const maxBytes = Number(value || DEFAULT_MAX_BYTES);

  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new Error("maxBytes must be a positive number.");
  }

  return Math.min(Math.floor(maxBytes), MAX_ALLOWED_BYTES);
}

async function run(input = {}) {
  const filePath = resolveRequestedPath(input.path);
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw new Error(`Path is not a file: ${filePath}`);
  }

  const maxBytes = resolveMaxBytes(input.maxBytes);
  const encoding = input.encoding || "utf8";
  const handle = await fs.open(filePath, "r");

  try {
    const readBytes = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(readBytes);
    await handle.read(buffer, 0, readBytes, 0);

    return {
      path: filePath,
      encoding,
      bytes: readBytes,
      totalBytes: stat.size,
      truncated: stat.size > maxBytes,
      content: buffer.toString(encoding),
    };
  } finally {
    await handle.close();
  }
}

module.exports = {
  run,
};
