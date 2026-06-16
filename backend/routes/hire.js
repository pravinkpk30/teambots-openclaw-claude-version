/**
 * routes/hire.js
 *
 * POST /api/agents/hire
 *
 * Flow:
 *  1. Create a throw-away KASM user
 *  2. Request a KASM session with the OpenClaw image, injecting all env vars
 *  3. Poll until KASM reports the container is running
 *  4. Return 202 — agent status moves to 'ready' when the container posts
 *     to POST /webhooks/agent-ready
 */

'use strict';

const express  = require('express');
const { v4: uuid } = require('uuid');
const crypto   = require('crypto');
const router   = express.Router();
const kasm     = require('../services/kasmApi');
const registry = require('../services/registry');
const log      = require('../services/logger').hire;

router.post('/', async (req, res) => {
  const {
    role = 'General Assistant',
    job_title = 'AI Assistant',
    sponsor = 'User',
    llm_provider = 'google',
    llm_model = 'gemini-2.0-flash',
    llm_api_key,
    skills = '',
    enable_web_search,
    user_id: tbUserId = 'demo_user',
  } = req.body;

  if (!llm_api_key) {
    return res.status(400).json({ error: 'llm_api_key is required' });
  }

  const imageId = process.env.KASM_IMAGE_ID;
  if (!imageId) {
    return res.status(500).json({ error: 'KASM_IMAGE_ID not configured on backend' });
  }

  const agentId     = `agent_${crypto.randomBytes(6).toString('hex')}`;
  const bridgeToken = crypto.randomBytes(32).toString('hex');
  // Username must be unique per session; use agent ID
  const kasmUsername = `tb_${agentId}`;
  const kasmPassword = crypto.randomBytes(16).toString('hex');

  // The URL the container will POST to when the bridge is ready and for chat responses
  const webhookBase = (process.env.TEAMBOTS_WEBHOOK_BASE || 'http://localhost:4000').replace(/\/$/, '');

  const webSearchEnabled = enable_web_search !== false && enable_web_search !== 'false';

  log.info('hire start', { agentId, role, tbUserId, webSearchEnabled });

  try {
    // 1 — Create KASM user
    const kasmUser = await kasm.createUser(kasmUsername, kasmPassword);
    const kasmUserId = kasmUser.user_id;

    registry.set(agentId, {
      status: 'provisioning',
      role, job_title, sponsor,
      llmProvider: llm_provider,
      llmModel: llm_model,
      bridgeToken,
      // Direct HTTP endpoint of the bridge, published by KASM port mapping.
      bridgeUrl: process.env.KASM_BRIDGE_URL,
      kasmUserId,
      tbUserId,
      hiredAt: new Date().toISOString(),
    });

    // 2 — Request KASM session — inject all env vars the bridge/gateway need
    const envVars = {
      AGENT_ID:          agentId,
      AGENT_ROLE:        role,
      AGENT_JOB_TITLE:   job_title,
      SPONSOR_NAME:      sponsor,
      LLM_PROVIDER:      llm_provider,
      LLM_MODEL:         llm_model,
      LLM_API_KEY:       llm_api_key,
      SKILLS:            skills,
      TEAMBOTS_ENABLE_WEB_SEARCH: webSearchEnabled ? 'true' : 'false',
      // Token the bridge uses to authenticate the ready webhook + incoming chat
      TEAMBOTS_TOKEN:    bridgeToken,
      // Webhook endpoint the bridge calls when it comes online (agent-ready only)
      TEAMBOTS_WEBHOOK:  `${webhookBase}/webhooks`,
    };

    if (process.env.TEAMBOTS_WEB_SEARCH_PROVIDER) {
      envVars.TEAMBOTS_WEB_SEARCH_PROVIDER = process.env.TEAMBOTS_WEB_SEARCH_PROVIDER;
    }
    if (process.env.TEAMBOTS_MCP_SERVERS) {
      envVars.TEAMBOTS_MCP_SERVERS = process.env.TEAMBOTS_MCP_SERVERS;
    }

    const kasmSession = await kasm.requestKasm({
      userId:  kasmUserId,
      imageId,
      envVars,
    });
    const kasmId = kasmSession.kasm_id;

    // Build a full, clickable URL to view the live KASM session in a browser.
    // request_kasm returns a relative kasm_url (/#/connect/kasm/<id>/<user>/<token>).
    const kasmBase = (process.env.KASM_BASE_URL || '').replace(/\/$/, '');
    const kasmUrl  = kasmSession.kasm_url
      ? `${kasmBase}${kasmSession.kasm_url}`
      : null;

    registry.set(agentId, { kasmId, kasmUserId, kasmUrl, status: 'kasm_provisioning' });

    // 3 — Poll until running
    const timeoutS = parseInt(process.env.KASM_SESSION_READY_TIMEOUT_S || '180', 10);
    await kasm.waitForRunning(kasmUserId, kasmId, timeoutS);
    registry.set(agentId, { status: 'kasm_running' });

    // 4 — Start keepalive so KASM doesn't reap the idle session
    registry.startKeepalive(agentId);

    log.info('hire success - waiting for bridge ready webhook', { agentId, kasmId });

    return res.status(202).json({
      agent_id: agentId,
      status:   'kasm_running',
      kasm_url: kasmUrl,
      message:  'Container is running. Waiting for agent bridge to come online…',
    });
  } catch (err) {
    log.error('hire failed', { agentId, error: err.message, stack: err.stack });
    registry.set(agentId, { status: 'error', errorMessage: err.message });
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
