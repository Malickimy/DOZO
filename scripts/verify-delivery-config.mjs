import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function requireFile(relativePath) {
  if (!existsSync(path.join(root, relativePath))) {
    errors.push(`Missing required file: ${relativePath}`);
    return false;
  }

  return true;
}

function readJson(relativePath) {
  try {
    return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
  } catch (error) {
    errors.push(`Invalid JSON in ${relativePath}: ${error.message}`);
    return null;
  }
}

const configPaths = [
  "opencode.json",
  "DOZO-App/opencode.json",
  "DOZO-Server/opencode.json",
  "DOZO-Dashboard/opencode.json",
  "DOZO-Website/opencode.json",
];

for (const configPath of configPaths) {
  const config = readJson(configPath);
  if (!config) continue;

  if (config.$schema !== "https://opencode.ai/config.json") {
    errors.push(`${configPath} must declare the OpenCode JSON schema.`);
  }
}

const rootConfig = readJson("opencode.json");
if (!rootConfig?.references) {
  errors.push("opencode.json must declare local references.");
} else {
  for (const referenceName of ["delivery-workflow", "dozo-website-agent"]) {
    const reference = rootConfig.references[referenceName];
    if (!reference || typeof reference.path !== "string") {
      errors.push(`opencode.json is missing local reference: ${referenceName}`);
      continue;
    }

    const referencePath = path.resolve(root, reference.path);
    if (!existsSync(referencePath)) {
      errors.push(`opencode.json reference ${referenceName} does not exist: ${reference.path}`);
    }
  }
}

const requiredAgents = [
  "delivery-coordinator",
  "github-task-runner",
  "dozo-app-agent",
  "dozo-server-agent",
  "dozo-dashboard-agent",
  "dozo-website-agent",
  "githuber",
  "contract",
  "qa",
  "qa-app",
  "qa-server",
  "qa-dashboard",
  "qa-website",
  "sprint",
];

for (const agentName of requiredAgents) {
  const relativePath = `.opencode/agent/${agentName}.md`;
  if (!requireFile(relativePath)) continue;

  const content = readFileSync(path.join(root, relativePath), "utf8");
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!frontmatter) {
    errors.push(`${relativePath} must have YAML frontmatter.`);
    continue;
  }

  if (!/^description:\s*(?:>|\S)/m.test(frontmatter[1])) {
    errors.push(`${relativePath} must declare a description.`);
  }

  if (!/^mode:\s*(?:primary|subagent|all)\s*$/m.test(frontmatter[1])) {
    errors.push(`${relativePath} must declare a supported agent mode.`);
  }
}

const requiredCommands = ["coordinate", "run-task"];
for (const commandName of requiredCommands) {
  const relativePath = `.opencode/command/${commandName}.md`;
  if (!requireFile(relativePath)) continue;

  const content = readFileSync(path.join(root, relativePath), "utf8");
  if (!/^agent:\s*\S+/m.test(content.split(/^---\s*$/m)[1] ?? "")) {
    errors.push(`${relativePath} must route to an agent.`);
  }
}

const labelsPath = ".github/labels.yml";
if (requireFile(labelsPath)) {
  const labelsText = readFileSync(path.join(root, labelsPath), "utf8");
  const labelNames = [...labelsText.matchAll(/^  - name: "([^"]+)"$/gm)].map((match) => match[1]);
  const uniqueLabelNames = new Set(labelNames);
  if (uniqueLabelNames.size !== labelNames.length) {
    errors.push(`${labelsPath} contains duplicate label names.`);
  }

  const requiredLabels = [
    "app",
    "server",
    "dashboard",
    "website",
    "root",
    "ready",
    "in-progress",
    "blocked",
    "in-review",
    "p0",
    "p1",
    "p2",
    "capability",
    "task",
    "bug",
    "maintenance",
    "qa",
  ];

  for (const label of requiredLabels) {
    if (!uniqueLabelNames.has(label)) errors.push(`${labelsPath} is missing ${label}.`);
  }

  const templatePaths = [
    ".github/ISSUE_TEMPLATE/config.yml",
    ".github/ISSUE_TEMPLATE/capability.yml",
    ".github/ISSUE_TEMPLATE/work-item.yml",
    ".github/ISSUE_TEMPLATE/bug.yml",
    ".github/ISSUE_TEMPLATE/maintenance.yml",
    ".github/ISSUE_TEMPLATE/qa.yml",
  ];
  for (const templatePath of templatePaths) {
    if (!requireFile(templatePath)) continue;
    const templateText = readFileSync(path.join(root, templatePath), "utf8");
    const templateLabels = [...templateText.matchAll(/^  - "([^"]+)"$/gm)].map((match) => match[1]);
    for (const label of templateLabels) {
      if (!uniqueLabelNames.has(label)) {
        errors.push(`${templatePath} refers to an undefined label: ${label}`);
      }
    }
  }
}

for (const relativePath of [
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".opencode/docs/delivery-workflow.md",
  "scripts/new-task-worktree.sh",
  "scripts/publish-task-branch.sh",
  "DOZO-Website/AGENTS.md",
  "DOZO-Website/README.md",
]) {
  requireFile(relativePath);
}

if (existsSync(path.join(root, ".opencode/agent"))) {
  const agentFiles = readdirSync(path.join(root, ".opencode/agent"));
  for (const fileName of agentFiles.filter((name) => name.endsWith(".md"))) {
    const content = readFileSync(path.join(root, ".opencode/agent", fileName), "utf8");
    if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
      errors.push(`.opencode/agent/${fileName} must start with YAML frontmatter.`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`error: ${error}`);
  process.exitCode = 1;
} else {
  console.log("Delivery configuration is structurally consistent.");
}
