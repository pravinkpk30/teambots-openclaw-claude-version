/**
 * routes/webhooks.js
 *
 * POST /webhooks/agent-ready — called by kasm_start_agent.sh when the bridge is up
 *
 * Authenticated by the per-agent bridgeToken that we inject as TEAMBOTS_TOKEN
 * into the container environment at hire time.
 *
 * Note: chat responses no longer use a webhook. With KASM port mapping
 * (Approach 2) the backend calls the bridge directly over HTTP and gets the
 * reply synchronously — see routes/chat.js.
 */

'use strict';

const express  = require('express');
const router   = express.Router();
const registry = require('../services/registry');
const log      = require('../services/logger').webhook;

// ── Middleware: verify bearer token ─────────────────────────────────────────

function verifyToken(req, res, next) {
  const auth   = req.headers.authorization || '';
  const token  = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const agentId = req.body?.agent_id;

  if (!agentId || !token) {
    log.warn('webhook missing agent_id or token', { path: req.path, body: req.body });
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const agent = registry.get(agentId);
  if (!agent) {
    log.warn('webhook unknown agent', { agentId });
    return res.status(404).json({ error: 'Agent not found' });
  }

  if (agent.bridgeToken !== token) {
    log.warn('webhook token mismatch', { agentId });
    return res.status(403).json({ error: 'Forbidden' });
  }

  req.agent = agent;
  next();
}

// ── POST /webhooks/agent-ready ───────────────────────────────────────────────
// Body: { agent_id, bridge_port (optional) }
// Authorization: Bearer <bridgeToken>

router.post('/agent-ready', verifyToken, (req, res) => {
  const { agent_id } = req.body;
  registry.set(agent_id, { status: 'ready', readyAt: new Date().toISOString() });
  log.info('agent ready', { agent_id });
  return res.json({ ok: true });
});

module.exports = router;
