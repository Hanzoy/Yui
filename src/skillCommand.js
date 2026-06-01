const path = require("path");
const { DEFAULT_SKILLS_ROOT } = require("./skills/registry");

async function readStdin() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function run() {
  const skillName = process.argv[2];

  if (!skillName) {
    throw new Error("Missing skill name.");
  }

  const skillsRoot = process.env.YUI_SKILLS_ROOT || DEFAULT_SKILLS_ROOT;
  const skillRoot = path.join(skillsRoot, skillName);
  const scriptPath = path.join(skillRoot, "scripts", "run.js");
  const script = require(scriptPath);

  if (typeof script.run !== "function") {
    throw new Error(`Skill script does not export run(): ${skillName}`);
  }

  const rawInput = await readStdin();
  const payload = rawInput ? JSON.parse(rawInput) : {};
  const result = await script.run(payload.input || {}, payload.context || {});
  process.stdout.write(JSON.stringify({ ok: true, result }));
}

run().catch((error) => {
  process.stdout.write(JSON.stringify({ ok: false, error: error.message }));
  process.exit(1);
});
