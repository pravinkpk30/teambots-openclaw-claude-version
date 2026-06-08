#!/usr/bin/env node
/**
 * Write ~/.openclaw/openclaw.json from KASM hire env vars.
 * Schema matches OpenClaw 2026.6.x (gateway.mode/bind/auth, chatCompletions endpoint).
 * Registers models like gemini-3.5-flash that are not yet in OpenClaw's bundled catalog.
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
  buildGoogleProviderModels,
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

const { apiModelId, modelRef, needsOpenClawRegistration } = resolveModelRef(
  provider,
  llmModel
);

const providers = {};
if (apiKey) {
  if (provider === 'google' || provider === 'gemini') {
    providers.google = { apiKey };
    if (needsOpenClawRegistration) {
      providers.google.models = buildGoogleProviderModels(apiModelId, modelRef);
      console.log(
        `==> Registering custom Google model in OpenClaw: ${modelRef} (API id: ${apiModelId})`
      );
    }
  }
  if (provider === 'anthropic') providers.anthropic = { apiKey };
  if (provider === 'openai') providers.openai = { apiKey };
}

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
      model: { primary: modelRef },
      models: buildAgentsModelsAllowlist(modelRef, apiModelId),
      timeoutSeconds: 120,
    },
  },
};

if (Object.keys(providers).length) {
  config.models = { mode: 'merge', providers };
}

const dir = path.join(home, '.openclaw');
fs.mkdirSync(path.join(dir, 'workspace'), { recursive: true });
const outPath = path.join(dir, 'openclaw.json');
fs.writeFileSync(outPath, JSON.stringify(config, null, 2));
console.log(`==> Wrote ${outPath}`);
console.log(`==> OpenClaw primary model: ${modelRef}`);
