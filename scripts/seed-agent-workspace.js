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

fs.mkdirSync(path.join(workspace, 'skills'), { recursive: true });

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
