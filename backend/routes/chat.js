/**
 * routes/chat.js
 *
 * POST /api/agents/:agentId/chat
 *
 * ─── Approach 2: KASM port mapping (direct HTTP) ─────────────────────────────
 * KASM publishes the container's bridge port (:3100) to the KASM VM host via the
 * workspace Docker Run Config Override `ports`. The backend therefore reaches
 * the bridge directly over HTTP at ${KASM_BRIDGE_URL}/chat.
 *
 * No exec relay, no job files, no persistent worker, no webhook round-trip —
 * just a single authenticated HTTP call to the bridge, which proxies to the
 * OpenClaw gateway and returns the assistant reply synchronously.
 */

'use strict';

const express = require('express');
const axios   = require('axios');
const router  = express.Router({ mergeParams: true });
const registry = require('../services/registry');
const log      = require('../services/logger').chat;
const { enrichArtifacts } = require('../services/artifactUrls');

const CHAT_TIMEOUT_MS = parseInt(process.env.KASM_CHAT_TIMEOUT_MS || '120000', 10);

router.post('/', async (req, res) => {
  const { agentId } = req.params;
  const { message, conversation_id = 'default', user_id = 'user' } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  const agent = registry.get(agentId);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  if (agent.status !== 'ready') {
    return res.status(409).json({ error: `Agent is not ready (status: ${agent.status})` });
  }

  const bridgeUrl = agent.bridgeUrl || process.env.KASM_BRIDGE_URL;
  if (!bridgeUrl) {
    log.error('KASM_BRIDGE_URL not configured', { agentId });
    return res.status(500).json({ error: 'Bridge URL not configured on backend' });
  }

  log.info('chat request', { agentId, conversation_id, bridgeUrl });

  try {
    const response = await axios.post(
      `${bridgeUrl.replace(/\/$/, '')}/chat`,
      { message, conversation_id, user_id },
      {
        headers: { Authorization: `Bearer ${agent.bridgeToken}` },
        timeout: CHAT_TIMEOUT_MS,
      }
    );
    log.info('chat response received', { agentId, conversation_id });
    const payload = { ...response.data };
    if (payload.artifacts?.length) {
      payload.artifacts = enrichArtifacts(agentId, payload.artifacts, req);
    }
    return res.json(payload);
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data || err.message;
    log.error('chat failed', { agentId, status, detail });
    if (err.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'Agent timed out responding' });
    }
    return res.status(502).json({ error: 'Failed to reach agent bridge', detail });
  }
});

module.exports = router;
