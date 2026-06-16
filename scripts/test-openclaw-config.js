#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'teambots-oc-config-'));
process.env.HOME = tmpHome;
process.env.LLM_PROVIDER = 'google';
process.env.LLM_MODEL = 'gemini-2.0-flash';
process.env.LLM_API_KEY = 'test-key';
process.env.TEAMBOTS_ENABLE_WEB_SEARCH = 'true';
process.env.TEAMBOTS_MCP_SERVERS = JSON.stringify({
  example: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-fetch'] },
});

require('../scripts/generate-openclaw-config.js');

const cfg = JSON.parse(fs.readFileSync(path.join(tmpHome, '.openclaw/openclaw.json'), 'utf8'));

if (!cfg.tools?.web?.search?.enabled) {
  console.error('FAIL: web search should be enabled');
  process.exit(1);
}
if (cfg.tools.web.search.provider !== 'gemini') {
  console.error('FAIL: expected gemini provider for google hire');
  process.exit(1);
}
if (cfg.tools.profile !== 'messaging') {
  console.error('FAIL: expected messaging profile when web search enabled');
  process.exit(1);
}
if (cfg.tools.allow?.includes('group:web')) {
  console.error('FAIL: group:web must not be in allow (breaks with minimal/messaging policy)');
  process.exit(1);
}
if (!cfg.tools.allow?.includes('bundle-mcp')) {
  console.error('FAIL: bundle-mcp should be allowed when MCP configured');
  process.exit(1);
}
if (!cfg.mcp?.servers?.example) {
  console.error('FAIL: MCP servers missing');
  process.exit(1);
}

// Invoice-style: web search off → minimal, no group:web
const { execFileSync } = require('child_process');
const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'teambots-oc-config-'));
execFileSync(process.execPath, [path.join(__dirname, 'generate-openclaw-config.js')], {
  env: {
    ...process.env,
    HOME: tmp2,
    TEAMBOTS_ENABLE_WEB_SEARCH: 'false',
    TEAMBOTS_MCP_SERVERS: '',
    LLM_PROVIDER: 'google',
    LLM_MODEL: 'gemini-2.0-flash',
    LLM_API_KEY: 'test-key',
  },
});
const cfg2 = JSON.parse(fs.readFileSync(path.join(tmp2, '.openclaw/openclaw.json'), 'utf8'));
if (cfg2.tools.profile !== 'minimal' || cfg2.tools.web.search.enabled !== false) {
  console.error('FAIL: invoice-style config should be minimal without web search');
  process.exit(1);
}

console.log('OK — openclaw.json tool policy configured');
console.log(JSON.stringify({ tools: cfg.tools, mcpKeys: Object.keys(cfg.mcp.servers) }, null, 2));

// OpenAI hire
const tmp3 = fs.mkdtempSync(path.join(os.tmpdir(), 'teambots-oc-config-'));
execFileSync(process.execPath, [path.join(__dirname, 'generate-openclaw-config.js')], {
  env: {
    ...process.env,
    HOME: tmp3,
    LLM_PROVIDER: 'openai',
    LLM_MODEL: 'gpt-4o',
    LLM_API_KEY: 'sk-test',
    TEAMBOTS_ENABLE_WEB_SEARCH: 'true',
    TEAMBOTS_MCP_SERVERS: '',
  },
});
const cfg3 = JSON.parse(fs.readFileSync(path.join(tmp3, '.openclaw/openclaw.json'), 'utf8'));
if (cfg3.agents?.defaults?.model?.primary !== 'openai/gpt-4o') {
  console.error('FAIL: expected openai/gpt-4o primary model');
  process.exit(1);
}
if (!cfg3.models?.providers?.openai?.apiKey) {
  console.error('FAIL: openai apiKey missing');
  process.exit(1);
}
const openaiModelIds = (cfg3.models?.providers?.openai?.models || []).map((m) => m.id);
if (!openaiModelIds.includes('gpt-4o')) {
  console.error('FAIL: gpt-4o must be in models.providers.openai.models[]');
  process.exit(1);
}
console.log('OK — OpenAI gpt-4o config');

// OpenAI gpt-4o-mini (known model — must still be in providers.models[])
const tmp4 = fs.mkdtempSync(path.join(os.tmpdir(), 'teambots-oc-config-'));
execFileSync(process.execPath, [path.join(__dirname, 'generate-openclaw-config.js')], {
  env: {
    ...process.env,
    HOME: tmp4,
    LLM_PROVIDER: 'openai',
    LLM_MODEL: 'gpt-4o-mini',
    LLM_API_KEY: 'sk-test',
    TEAMBOTS_ENABLE_WEB_SEARCH: 'false',
    TEAMBOTS_MCP_SERVERS: '',
  },
});
const cfg4 = JSON.parse(fs.readFileSync(path.join(tmp4, '.openclaw/openclaw.json'), 'utf8'));
if (cfg4.agents?.defaults?.model?.primary !== 'openai/gpt-4o-mini') {
  console.error('FAIL: expected openai/gpt-4o-mini primary model');
  process.exit(1);
}
const miniIds = (cfg4.models?.providers?.openai?.models || []).map((m) => m.id);
if (!miniIds.includes('gpt-4o-mini')) {
  console.error('FAIL: gpt-4o-mini must be in models.providers.openai.models[]');
  process.exit(1);
}
console.log('OK — OpenAI gpt-4o-mini config');

// OpenAI + web search (marketing-style) must not use invalid parallel-free provider
const tmp5 = fs.mkdtempSync(path.join(os.tmpdir(), 'teambots-oc-config-'));
execFileSync(process.execPath, [path.join(__dirname, 'generate-openclaw-config.js')], {
  env: {
    ...process.env,
    HOME: tmp5,
    LLM_PROVIDER: 'openai',
    LLM_MODEL: 'gpt-4o-mini',
    LLM_API_KEY: 'sk-test',
    TEAMBOTS_ENABLE_WEB_SEARCH: 'true',
    TEAMBOTS_MCP_SERVERS: '',
  },
});
const cfg5 = JSON.parse(fs.readFileSync(path.join(tmp5, '.openclaw/openclaw.json'), 'utf8'));
if (cfg5.tools.web.search.provider === 'parallel-free') {
  console.error('FAIL: parallel-free is not a valid OpenClaw web search provider');
  process.exit(1);
}
if (cfg5.tools.web.search.provider !== 'duckduckgo') {
  console.error('FAIL: expected duckduckgo web search provider for OpenAI hire');
  process.exit(1);
}
console.log('OK — OpenAI web search provider');
