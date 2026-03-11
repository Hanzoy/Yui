const OLLAMA_URL = "http://127.0.0.1:11434/api/chat";
const MODEL_NAME = "qwen3.5:9b";

async function chatWithOllama(message) {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      stream: false,
      messages: [
        {
          role: "user",
          content: message,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.message.content;
}

async function main() {
  const args = process.argv.slice(2);
  const message = args.length > 0 ? args.join(" ") : "你好，我们是第几次见面";

  console.log(`Sending to model: ${MODEL_NAME}`);
  console.log(`Prompt: ${message}\n`);

  try {
    const result = await chatWithOllama(message);
    console.log("Model response:");
    console.log(result);
  } catch (error) {
    console.error("Request failed:");
    console.error(error.message);
    process.exit(1);
  }
}

main();
