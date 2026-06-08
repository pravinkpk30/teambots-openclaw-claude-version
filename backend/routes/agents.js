/**
 * routes/agents.js
 *
 * GET  /api/agents            — list agents (optionally filtered by ?user_id=)
 * GET  /api/agents/:agentId   — get single agent status
 * DELETE /api/agents/:agentId — terminate agent + destroy KASM session
 */

'use strict';

const express  = require('express');
const router   = express.Router();
const kasm     = require('../services/kasmApi');
const registry = require('../services/registry');
const log      = require('../services/logger').api;

router.get('/', (req, res) => {
  const { user_id } = req.query;
  const list = registry.list(user_id).map(sanitize);
  return res.json({ agents: list });
});

router.get('/:agentId', (req, res) => {
  const agent = registry.get(req.params.agentId);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  return res.json(sanitize(agent));
});

router.delete('/:agentId', async (req, res) => {
  const agent = registry.get(req.params.agentId);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  try {
    if (agent.kasmId && agent.kasmUserId) {
      await kasm.destroyKasm(agent.kasmUserId, agent.kasmId);
      log.info('KASM session destroyed', { agentId: req.params.agentId });
    }
  } catch (e) {
    log.warn('destroyKasm error (continuing)', { error: e.message });
  }

  registry.remove(req.params.agentId);
  return res.json({ ok: true });
});

/** Strip internal fields before returning to client */
function sanitize(agent) {
  const { bridgeToken, keepaliveTimer, ...safe } = agent;
  return safe;
}

module.exports = router;
