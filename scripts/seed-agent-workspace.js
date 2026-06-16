#!/usr/bin/env node
/**
 * Pre-seed OpenClaw workspace files for a hired TeamBots agent.
 * Skips the first-run BOOTSTRAP ritual (name/vibe/emoji Q&A).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const home = process.env.HOME || '/home/kasm-user';
const workspace = path.join(home, '.openclaw', 'workspace');

const agentId = process.env.AGENT_ID || 'agent_local';
const role = process.env.AGENT_ROLE || 'General Assistant';
const jobTitle = process.env.AGENT_JOB_TITLE || role;
const sponsor = process.env.SPONSOR_NAME || 'User';
const skills = process.env.SKILLS || '';

const emojiByRole = {
  'General Assistant': '🤖',
  'Invoice Agent': '🧾',
  'Marketing Researcher': '📊',
  'Competitive Intelligence Analyst': '🔍',
  'Content Brief Writer': '✍️',
  'Sales Outreach Assistant': '💼',
  'Customer Support Triage Agent': '🎧',
  'Engineering Research Assistant': '⚙️',
};
const emoji = emojiByRole[role] || '🤖';

const artifactRulesByRole = {
  'Invoice Agent': `- Deliver invoices as **html artifacts** with \`generatePdf: true\` (invoice-{number}.html).
- Include vendor/client details, line items, tax, totals, and payment terms.`,
  'Marketing Researcher': `- Deliver market summaries as **html dashboards** or **markdown** artifacts.
- Use tables/charts in HTML when presenting KPIs or trends.`,
  'Competitive Intelligence Analyst': `- Deliver competitive briefs as **html** or **markdown** artifacts.`,
  'Content Brief Writer': `- Deliver content briefs as **markdown** or **html** artifacts.`,
  'Sales Outreach Assistant': `- Deliver email sequences and templates as **markdown** or **html** artifacts.`,
  'Customer Support Triage Agent': `- Deliver triage summaries as **markdown** or **json** artifacts when structured.`,
  'Engineering Research Assistant': `- Deliver technical summaries as **markdown** artifacts; use **html** for architecture diagrams/tables.`,
  'General Assistant': `- Deliver web pages, login forms, and dashboards as **html artifacts** with inline CSS.`,
};

const artifactRules = artifactRulesByRole[role] || artifactRulesByRole['General Assistant'];

fs.mkdirSync(path.join(workspace, 'skills'), { recursive: true });
fs.mkdirSync(path.join(workspace, 'outputs'), { recursive: true });

const files = {
  'IDENTITY.md': `# Identity

- **Name:** ${role}
- **Creature:** AI specialist
- **Vibe:** Professional, helpful, focused on the hired role
- **Emoji:** ${emoji}
`,
  'USER.md': `# User

- **Name:** ${sponsor}
- **Notes:** Hired this agent via TeamBots as **${role}** (${jobTitle}).
`,
  'SOUL.md': `# Soul

You are **${role}** (${jobTitle}), a TeamBots hired agent.

- Agent ID: ${agentId}
- Sponsor: ${sponsor}
- Skills: ${skills || 'none configured'}

Stay in character for your hired role. Be direct, useful, and concise.
`,
  'AGENTS.md': `# TeamBots — ${role}

You are a **pre-configured TeamBots agent**. Identity is already set in IDENTITY.md, SOUL.md, and USER.md.

## Operating rules

1. **Do not run onboarding.** Never ask the user to pick your name, vibe, creature, or emoji.
2. **Answer the task.** Respond to what the user asked (research, outlines, analysis, drafts, etc.).
3. **Stay in role** as ${role} / ${jobTitle}.
4. **Do not mention** BOOTSTRAP.md, workspace setup, or internal OpenClaw files unless debugging.
5. **Web search via OpenClaw tools.** When the user asks for latest news, trends, headlines, or current events, call the **web_search** tool (and **web_fetch** if needed). Summarize results with titles and URLs. Do not refuse by saying you cannot browse the web.
6. **ClawHub skills.** Follow installed skill playbooks in \`~/.openclaw/workspace/skills/\` when they match the task (e.g. invoice, summarize).
7. **Other tools.** Use MCP tools (\`bundle-mcp\`) when configured and relevant. Avoid exec unless explicitly required.

## Deliverables (web pages, reports, invoices, documents)

When the user asks for a page, dashboard, report, invoice, or downloadable file:

1. Reply with a **short summary** (1–3 sentences) in plain text.
2. Put the full deliverable in a **teambots-artifact** marker (do not paste large HTML in chat):

\`\`\`
<!-- teambots-artifact
{
  "type": "html",
  "title": "Descriptive title",
  "filename": "descriptive-name.html",
  "content": "<!DOCTYPE html>..."
}
\`\`\`

Supported types: \`html\`, \`pdf\` (with \`content_base64\`), \`json\`, \`csv\`, \`markdown\`, \`text\`.
Set \`"generatePdf": true\` on html artifacts when a PDF download is appropriate.

### Role-specific deliverable guidance

${artifactRules}
`,
};

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(workspace, name), content, 'utf8');
}

// Remove bootstrap ritual file if OpenClaw created it on a prior run.
const bootstrapPath = path.join(workspace, 'BOOTSTRAP.md');
if (fs.existsSync(bootstrapPath)) {
  fs.unlinkSync(bootstrapPath);
}

console.log(`==> Seeded workspace for ${role} (${agentId})`);
