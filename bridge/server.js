/**
 * bridge/server.js
 *
 * Runs INSIDE the KASM container.
 * Listens on 0.0.0.0:3100. With KASM port mapping (Approach 2) this port is
 * published to the KASM VM host, so the backend reaches it directly over HTTP.
 *
 * Endpoints:
 *   GET  /health           — liveness probe + reports agent_id/role
 *   POST /chat             — proxies message to OpenClaw gateway :18789
 *
 * Authentication: Bearer <TEAMBOTS_TOKEN> (injected by backend at hire time)
 */

'use strict';

const express = require('express');
const axios   = require('axios');
const fs      = require('fs');
const path    = require('path');

const BRIDGE_PORT    = parseInt(process.env.BRIDGE_PORT    || '3100',  10);
const GATEWAY_PORT   = parseInt(process.env.GATEWAY_PORT   || '18789', 10);
const GATEWAY_URL    = `http://127.0.0.1:${GATEWAY_PORT}`;
const AGENT_ID       = process.env.AGENT_ID    || 'unknown';
const AGENT_ROLE     = process.env.AGENT_ROLE  || 'General Assistant';
const BRIDGE_TOKEN   = process.env.TEAMBOTS_TOKEN;

// Log directory (writable inside container)
const LOG_DIR = process.env.TEAMBOTS_LOG_DIR || `${process.env.HOME || '/root'}/.teambots/logs`;
fs.mkdirSync(LOG_DIR, { recursive: true });

const logStream = fs.createWriteStream(path.join(LOG_DIR, 'bridge.log'), { flags: 'a' });
function log(level, msg, meta = {}) {
  const line = `${new Date().toISOString()} [${level}] ${msg} ${JSON.stringify(meta)}\n`;
  process.stdout.write(line);
  logStream.write(line);
}

// ── Express app ──────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

/** Verify Authorization: Bearer <TEAMBOTS_TOKEN> */
function auth(req, res, next) {
  if (!BRIDGE_TOKEN) return next(); // token not configured — open (dev only)
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token !== BRIDGE_TOKEN) {
    log('WARN', 'auth failed', { path: req.path, ip: req.ip });
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── GET /health ──────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ ok: true, agent_id: AGENT_ID, role: AGENT_ROLE, bridge: 'teambots-bridge' });
});

// ── POST /chat ───────────────────────────────────────────────────────────────
// Body: { message, conversation_id, user_id }
// Returns: { message, role:'assistant', ... }

app.post('/chat', auth, async (req, res) => {
  const { message, conversation_id = 'default', user_id = 'user' } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  log('INFO', 'chat request', { conversation_id, len: message.length });

  try {
    // Wait for OpenClaw gateway to be ready (retry up to 30s)
    const gatewayToken = await getGatewayToken();

    const gwRes = await axios.post(
      `${GATEWAY_URL}/v1/chat/completions`,
      {
        model: 'openclaw/default',
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user',   content: message },
        ],
        stream: false,
      },
      {
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${gatewayToken}`,
        },
        timeout: 90_000,
      }
    );

    const choice  = gwRes.data?.choices?.[0];
    const content = choice?.message?.content || '';
    log('INFO', 'chat ok', { conversation_id, responseLen: content.length });

    return res.json({
      message:         content,
      role:            'assistant',
      model:           gwRes.data?.model,
      conversation_id,
      agent_id:        AGENT_ID,
    });
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data || err.message;
    log('ERROR', 'chat error', { status, detail });
    return res.status(502).json({ error: 'Agent encountered an error', detail });
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Read the gateway token from ~/.teambots/token (written by kasm_start_agent.sh) */
function getGatewayToken() {
  const tokenFile = `${process.env.HOME || '/root'}/.teambots/token`;
  // Retry up to 30s while the gateway is still starting
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

function buildSystemPrompt() {
  return [
    `You are ${AGENT_ROLE}.`,
    `Agent ID: ${AGENT_ID}.`,
    `You are a pre-configured TeamBots hire — do NOT run OpenClaw onboarding or ask for name/vibe/emoji.`,
    `Answer the user's request directly in your hired role.`,
  ].join(' ');
}

// ── Start ────────────────────────────────────────────────────────────────────

app.listen(BRIDGE_PORT, '0.0.0.0', () => {
  log('INFO', `Bridge listening on 0.0.0.0:${BRIDGE_PORT}`, {
    agent_id: AGENT_ID,
    role: AGENT_ROLE,
  });
});
