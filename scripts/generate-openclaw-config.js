#!/usr/bin/env node
/**
 * Write ~/.openclaw/openclaw.json from KASM hire env vars.
 * Schema matches OpenClaw 2026.6.x (gateway.mode/bind/auth, chatCompletions endpoint).
 * Registers models like gemini-3.5-flash that are not yet in OpenClaw's bundled catalog.
 *
 * Env:
 *   TEAMBOTS_ENABLE_WEB_SEARCH=true|false  (default true)
 *   TEAMBOTS_WEB_SEARCH_PROVIDER=duckduckgo|gemini|parallel-free|…
 *   TEAMBOTS_MCP_SERVERS='{"name":{command,args}|{url,transport}}'  (optional JSON)
 */
'use strict';

const fs = require('fs');
const path = require('path');

function loadOpenclawModels() {
  const candidates = [
    path.join(__dirname, '../bridge/openclaw_models'),
    path.join(__dirname, '../openclaw_models'),
    '/opt/teambots_openclaw/bridge/openclaw_models',
    '/opt/teambots_openclaw/openclaw_models',
  ];
  for (const modPath of candidates) {
    try {
      return require(modPath);
    } catch (err) {
      if (err.code !== 'MODULE_NOT_FOUND') throw err;
    }
  }
  throw new Error(`Cannot find openclaw_models.js (tried: ${candidates.join(', ')})`);
}

const {
  resolveModelRef,
  buildAgentsModelsAllowlist,
  buildProviderModelsEntry,
  buildProviderModelsCatalog,
  normalizeProvider,
} = loadOpenclawModels();

const home = process.env.HOME || '/home/kasm-user';
const provider = process.env.LLM_PROVIDER || 'google';
const apiKey = process.env.LLM_API_KEY || '';
const gatewayPort = parseInt(process.env.GATEWAY_PORT || '18789', 10);
const token =
  process.env.OPENCLAW_GATEWAY_TOKEN ||
  process.env.TEAMBOTS_TOKEN ||
  'local-dev-token';
const llmModel = process.env.LLM_MODEL || 'gemini-2.0-flash';
const agentRole = process.env.AGENT_ROLE || 'General Assistant';

const enableWebSearch = process.env.TEAMBOTS_ENABLE_WEB_SEARCH !== 'false';

function resolveWebSearchProvider() {
  if (process.env.TEAMBOTS_WEB_SEARCH_PROVIDER) {
    return process.env.TEAMBOTS_WEB_SEARCH_PROVIDER;
  }
  const p = normalizeProvider(provider);
  if (p === 'google') return 'gemini';
  // OpenClaw 2026.6.x rejects parallel-free at config validate; duckduckgo needs no extra API key.
  return 'duckduckgo';
}

function parseMcpServers() {
  const raw = process.env.TEAMBOTS_MCP_SERVERS;
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    console.warn('==> TEAMBOTS_MCP_SERVERS must be a JSON object — ignoring');
  } catch (err) {
    console.warn(`==> Invalid TEAMBOTS_MCP_SERVERS JSON — ignoring (${err.message})`);
  }
  return null;
}

const VALID_TOOL_PROFILES = new Set(['minimal', 'coding', 'messaging', 'full']);

function sanitizeToolsConfig(tools) {
  if (!tools || typeof tools !== 'object') return tools;

  if (!VALID_TOOL_PROFILES.has(tools.profile)) {
    console.warn(
      `==> Invalid tools.profile "${tools.profile}" — coercing to "minimal"`
    );
    tools.profile = 'minimal';
  }

  // Stale/broken combo: minimal + group:web → zero callable tools in OpenClaw 2026.6.x
  const allow = Array.isArray(tools.allow) ? tools.allow : [];
  if (tools.profile === 'minimal' && allow.includes('group:web')) {
    console.warn('==> Fixing tools: minimal + group:web is invalid — switching profile to messaging');
    tools.profile = 'messaging';
    tools.allow = allow.filter((t) => t !== 'group:web');
    if (tools.allow.length === 0) delete tools.allow;
  }

  return tools;
}

function buildToolsConfig() {
  const mcpServers = parseMcpServers();
  const hasMcp = mcpServers && Object.keys(mcpServers).length > 0;

  // minimal strips web_search/web_fetch BEFORE tools.allow is applied, so
  // tools.allow: ["group:web"] leaves zero callable tools (OpenClaw 2026.6.x).
  // Use messaging profile when web search is needed; it includes web tools.
  const profile = enableWebSearch ? 'messaging' : 'minimal';

  const tools = {
    profile,
    web: {
      search: {
        enabled: enableWebSearch,
        maxResults: 10,
        timeoutSeconds: 30,
        cacheTtlMinutes: 15,
      },
    },
  };

  if (enableWebSearch) {
    tools.web.search.provider = resolveWebSearchProvider();
  }

  if (hasMcp) {
    tools.allow = ['bundle-mcp'];
  }

  return { tools, mcpServers };
}

const { apiModelId, modelRef, provider: ocProvider } = resolveModelRef(
  provider,
  llmModel
);

const providers = {};
if (apiKey) {
  const oc = normalizeProvider(provider);
  const providerModels = buildProviderModelsCatalog(oc, modelRef, apiModelId);

  if (oc === 'google') {
    providers.google = { apiKey, models: providerModels };
    console.log(`==> Google models registered: ${providerModels.length} (primary: ${modelRef})`);
  }
  if (oc === 'anthropic') {
    providers.anthropic = { apiKey, models: providerModels };
    console.log(`==> Anthropic models registered: ${providerModels.length} (primary: ${modelRef})`);
  }
  if (oc === 'openai') {
    providers.openai = { apiKey, models: providerModels };
    console.log(`==> OpenAI models registered: ${providerModels.length} (primary: ${modelRef})`);
  }
}

const { tools, mcpServers } = buildToolsConfig();

const config = {
  gateway: {
    mode: 'local',
    port: gatewayPort,
    bind: 'loopback',
    auth: { mode: 'token', token },
    http: {
      endpoints: {
        chatCompletions: { enabled: true },
      },
    },
  },
  agents: {
    defaults: {
      workspace: path.join(home, '.openclaw', 'workspace'),
      skipBootstrap: true,
      model: { primary: modelRef },
      models: buildAgentsModelsAllowlist(ocProvider, modelRef, apiModelId),
      timeoutSeconds: 120,
    },
  },
  tools,
};

config.tools = sanitizeToolsConfig(config.tools);

if (mcpServers && Object.keys(mcpServers).length > 0) {
  config.mcp = { servers: mcpServers };
  console.log(`==> MCP servers configured: ${Object.keys(mcpServers).join(', ')}`);
}

if (Object.keys(providers).length) {
  config.models = { mode: 'merge', providers };
}

const dir = path.join(home, '.openclaw');
fs.mkdirSync(path.join(dir, 'workspace'), { recursive: true });
const outPath = path.join(dir, 'openclaw.json');
fs.writeFileSync(outPath, JSON.stringify(config, null, 2));
console.log(`==> Wrote ${outPath}`);
console.log(`==> OpenClaw primary model: ${modelRef}`);
console.log(`==> Agent role: ${agentRole}`);
console.log(`==> Tools profile: ${config.tools.profile}`);
console.log(`==> Web search: ${enableWebSearch ? `enabled (${tools.web.search.provider || 'auto'})` : 'disabled'}`);
