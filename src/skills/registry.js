const fs = require("fs/promises");
const path = require("path");

const DEFAULT_SKILLS_ROOT = path.join(__dirname, "..", "..", "skills");

function parseFrontmatter(content, skillPath) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);

  if (!match) {
    throw new Error(`Skill is missing YAML frontmatter: ${skillPath}`);
  }

  const metadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    metadata[key] = value.replace(/^["']|["']$/g, "");
  }

  if (!metadata.name || !metadata.description) {
    throw new Error(`Skill frontmatter requires name and description: ${skillPath}`);
  }

  return {
    metadata,
    body: content.slice(match[0].length).trim(),
  };
}

async function loadSkill(skillRoot) {
  const skillPath = path.join(skillRoot, "SKILL.md");
  const content = await fs.readFile(skillPath, "utf8");
  const parsed = parseFrontmatter(content, skillPath);

  return {
    name: parsed.metadata.name,
    description: parsed.metadata.description,
    body: parsed.body,
    root: skillRoot,
    scriptPath: path.join(skillRoot, "scripts", "run.js"),
  };
}

async function loadSkills(skillsRoot = process.env.YUI_SKILLS_ROOT || DEFAULT_SKILLS_ROOT) {
  const entries = await fs.readdir(skillsRoot, {
    withFileTypes: true,
  });
  const skills = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      skills.push(await loadSkill(path.join(skillsRoot, entry.name)));
    }
  }

  return skills;
}

function formatSkillForPrompt(skill) {
  return `- ${skill.name}: ${skill.description}`;
}

function buildSkillInstruction(skills) {
  const skillDocs = skills.map(formatSkillForPrompt).join("\n");

  return [
    "你可以使用外部 skills，但不能使用原生 tool_calls。",
    "常驻上下文只包含 skill 的 name 和 description。需要使用某个 skill 时，先加载该 skill 的详细说明，再根据说明执行。",
    "加载 skill 说明时，必须只输出一个 yui-skill 代码块，不要附加解释:",
    "```yui-skill",
    "{\"skill\":\"skill-name\",\"action\":\"load\"}",
    "```",
    "拿到 yui-skill-doc 后，如果需要执行 skill，再输出:",
    "```yui-skill",
    "{\"skill\":\"skill-name\",\"input\":{}}",
    "```",
    "如果一次需要多个请求，输出 JSON 数组:",
    "```yui-skill",
    "[{\"skill\":\"skill-name\",\"action\":\"load\"},{\"skill\":\"another-skill\",\"input\":{}}]",
    "```",
    "Yui 会把加载的说明作为 yui-skill-doc 发回给你，或运行独立 skill 命令并把 yui-skill-result 结果发回给你。",
    "拿到结果后，如果还需要 skill，可以继续按同一格式调用；如果信息足够，请直接给用户最终回答。",
    "",
    "Available skills:",
    skillDocs || "无",
  ].join("\n");
}

async function createSkillRegistry(options = {}) {
  const skillsRoot = options.skillsRoot || process.env.YUI_SKILLS_ROOT || DEFAULT_SKILLS_ROOT;
  const skills = options.skills || (await loadSkills(skillsRoot));
  const skillByName = new Map(skills.map((skill) => [skill.name, skill]));

  return {
    skillsRoot,
    getSkillNames() {
      return Array.from(skillByName.keys());
    },
    getSkill(name) {
      return skillByName.get(name);
    },
    getSkillDoc(name) {
      const skill = skillByName.get(name);

      if (!skill) {
        throw new Error(`Unknown skill: ${name}`);
      }

      return [
        `Skill: ${skill.name}`,
        `Description: ${skill.description}`,
        skill.body,
      ].join("\n");
    },
    getInstruction() {
      return buildSkillInstruction(skills);
    },
  };
}

module.exports = {
  DEFAULT_SKILLS_ROOT,
  buildSkillInstruction,
  createSkillRegistry,
  loadSkills,
  parseFrontmatter,
};
