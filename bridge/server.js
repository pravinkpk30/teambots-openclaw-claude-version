/**
 * bridge/server.js
 *
 * Runs INSIDE the KASM container.
 * Listens on 0.0.0.0:3100. With KASM port mapping (Approach 2) this port is
 * published to the KASM VM host, so the backend reaches it directly over HTTP.
 *
 * Endpoints:
 *   GET  /health              — liveness probe + reports agent_id/role
 *   GET  /artifacts/:filename — serve persisted deliverables (HTML, PDF, etc.)
 *   POST /chat                — proxies message to OpenClaw gateway :18789
 *
 * Chat uses OpenClaw /v1/chat/completions (full agent run with tools + skills).
 * Workspace files (SOUL.md, AGENTS.md) and ClawHub skills load via the gateway.
 *
 * Authentication: Bearer <TEAMBOTS_TOKEN> (injected by backend at hire time)
 */

'use strict';

const express = require('express');
const axios   = require('axios');
const fs      = require('fs');
const path    = require('path');

const {
  ensureArtifactsDir,
  processResponseArtifacts,
  resolveArtifactPath,
  mimeForFilename,
} = require('./artifacts');
const { buildArtifactInstructions } = require('./artifactPrompt');

const BRIDGE_PORT    = parseInt(process.env.BRIDGE_PORT    || '3100',  10);
const GATEWAY_PORT   = parseInt(process.env.GATEWAY_PORT   || '18789', 10);
const GATEWAY_URL    = `http://127.0.0.1:${GATEWAY_PORT}`;
const AGENT_ID       = process.env.AGENT_ID    || 'unknown';
const AGENT_ROLE     = process.env.AGENT_ROLE  || 'General Assistant';
const LLM_PROVIDER   = process.env.LLM_PROVIDER || 'google';
const LLM_MODEL      = process.env.LLM_MODEL || 'gemini-2.0-flash';
const BRIDGE_TOKEN   = process.env.TEAMBOTS_TOKEN;
const CHAT_TIMEOUT_MS = parseInt(process.env.TEAMBOTS_CHAT_TIMEOUT_MS || '120000', 10);

function resolveModelRef() {
  if (process.env.MODEL_REF) return process.env.MODEL_REF;
  try {
    const { resolveModelRef: resolve } = require('/opt/teambots_openclaw/openclaw_models');
    return resolve(LLM_PROVIDER, LLM_MODEL).modelRef;
  } catch {
    return `${LLM_PROVIDER}/${LLM_MODEL}`;
  }
}

const MODEL_REF = resolveModelRef();

const LOG_DIR = process.env.TEAMBOTS_LOG_DIR || `${process.env.HOME || '/root'}/.teambots/logs`;
fs.mkdirSync(LOG_DIR, { recursive: true });
ensureArtifactsDir();

const logStream = fs.createWriteStream(path.join(LOG_DIR, 'bridge.log'), { flags: 'a' });
function log(level, msg, meta = {}) {
  const line = `${new Date().toISOString()} [${level}] ${msg} ${JSON.stringify(meta)}\n`;
  process.stdout.write(line);
  logStream.write(line);
}

const app = express();
app.use(express.json());

function auth(req, res, next) {
  if (!BRIDGE_TOKEN) return next();
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token !== BRIDGE_TOKEN) {
    log('WARN', 'auth failed', { path: req.path, ip: req.ip });
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    agent_id: AGENT_ID,
    role: AGENT_ROLE,
    bridge: 'teambots-bridge',
    web_search: process.env.TEAMBOTS_ENABLE_WEB_SEARCH !== 'false',
  });
});

app.get('/artifacts/:filename', auth, (req, res) => {
  const filePath = resolveArtifactPath(req.params.filename);
  if (!filePath) {
    return res.status(404).json({ error: 'Artifact not found' });
  }

  const filename = path.basename(filePath);
  const mime = mimeForFilename(filename);
  const download = req.query.download === '1' || req.query.download === 'true';

  res.setHeader('Content-Type', mime);
  if (download) {
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  } else if (mime.startsWith('text/html')) {
    res.setHeader('Content-Disposition', 'inline');
  }

  return res.sendFile(filePath);
});

app.post('/chat', auth, async (req, res) => {
  const { message, conversation_id = 'default' } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  log('INFO', 'chat request', { conversation_id, len: message.length, model: MODEL_REF });

  try {
    const gatewayToken = await getGatewayToken();

    // OpenClaw agent run: workspace SOUL.md/AGENTS.md + ClawHub skills + web_search tools.
    // Supplement with short instructions only for TeamBots-specific behavior (artifacts, no onboarding).
    const gwRes = await axios.post(
      `${GATEWAY_URL}/v1/chat/completions`,
      {
        model: 'openclaw/default',
        user: conversation_id ? `conv:${conversation_id}` : `agent:${AGENT_ID}`,
        messages: [
          { role: 'system', content: buildInstructions() },
          { role: 'user',   content: message },
        ],
        stream: false,
      },
      {
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${gatewayToken}`,
          'x-openclaw-model': MODEL_REF,
        },
        timeout: CHAT_TIMEOUT_MS,
      }
    );

    const choice  = gwRes.data?.choices?.[0];
    const rawContent = choice?.message?.content || '';
    if (!rawContent.trim() || rawContent.trim() === 'No response from OpenClaw.') {
      log('WARN', 'empty gateway reply', { conversation_id, finish: choice?.finish_reason });
      return res.status(502).json({
        error: 'Agent returned an empty response',
        detail: 'OpenClaw completed without text output. Check ~/.teambots/logs/openclaw-gateway.log',
      });
    }

    const { message: displayMessage, artifacts } = await processResponseArtifacts(rawContent, {
      conversationId: conversation_id,
      agentRole: AGENT_ROLE,
      log,
    });

    log('INFO', 'chat ok', {
      conversation_id,
      responseLen: displayMessage.length,
      artifactCount: artifacts.length,
    });

    return res.json({
      message:         displayMessage,
      role:            'assistant',
      model:           gwRes.data?.model,
      conversation_id,
      agent_id:        AGENT_ID,
      artifacts,
    });
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data || err.message;
    log('ERROR', 'chat error', { status, detail });
    return res.status(502).json({ error: 'Agent encountered an error', detail });
  }
});

function getGatewayToken() {
  const tokenFile = `${process.env.HOME || '/root'}/.teambots/token`;
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      if (fs.existsSync(tokenFile)) {
        try {
          const tok = fs.readFileSync(tokenFile, 'utf8').trim();
          if (tok) return resolve(tok);
        } catch (_) {}
      }
      if (++attempts > 30) return reject(new Error('Gateway token not available'));
      setTimeout(check, 1000);
    };
    check();
  });
}

/** Short supplement merged into OpenClaw instructions — workspace files carry persona/rules. */
function buildInstructions() {
  return [
    `TeamBots hire ${AGENT_ID} (${AGENT_ROLE}). Do NOT run OpenClaw onboarding or ask for name/vibe/emoji.`,
    `Use the web_search tool when the user asks for latest news, current trends, headlines, or live information.`,
    `Cite source titles and URLs from search results. Do not refuse by saying you cannot browse the web.`,
    buildArtifactInstructions(AGENT_ROLE),
  ].join('\n\n');
}

app.listen(BRIDGE_PORT, '0.0.0.0', () => {
  log('INFO', `Bridge listening on 0.0.0.0:${BRIDGE_PORT}`, {
    agent_id: AGENT_ID,
    role: AGENT_ROLE,
  });
});
