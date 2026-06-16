/**
 * routes/artifacts.js
 *
 * GET /api/agents/:agentId/artifacts/:filename
 * Proxies artifact files from the agent bridge (HTML, PDF, JSON, CSV, etc.)
 */

'use strict';

const express  = require('express');
const axios    = require('axios');
const registry = require('../services/registry');
const log      = require('../services/logger').chat;

const router = express.Router({ mergeParams: true });

router.get('/:filename', async (req, res) => {
  const { agentId, filename } = req.params;

  const agent = registry.get(agentId);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  if (agent.status !== 'ready') {
    return res.status(409).json({ error: `Agent is not ready (status: ${agent.status})` });
  }

  const bridgeUrl = agent.bridgeUrl || process.env.KASM_BRIDGE_URL;
  if (!bridgeUrl) {
    return res.status(500).json({ error: 'Bridge URL not configured on backend' });
  }

  const qs = req.originalUrl.includes('?')
    ? req.originalUrl.slice(req.originalUrl.indexOf('?'))
    : '';

  const target = `${bridgeUrl.replace(/\/$/, '')}/artifacts/${encodeURIComponent(filename)}${qs}`;

  try {
    const response = await axios.get(target, {
      headers: { Authorization: `Bearer ${agent.bridgeToken}` },
      responseType: 'stream',
      timeout: 30_000,
      validateStatus: (s) => s < 500,
    });

    if (response.status === 404) {
      return res.status(404).json({ error: 'Artifact not found' });
    }
    if (response.status >= 400) {
      return res.status(response.status).json({ error: 'Failed to fetch artifact' });
    }

    const passHeaders = ['content-type', 'content-disposition', 'content-length'];
    for (const h of passHeaders) {
      if (response.headers[h]) res.setHeader(h, response.headers[h]);
    }

    log.info('artifact served', { agentId, filename });
    return response.data.pipe(res);
  } catch (err) {
    log.error('artifact proxy failed', { agentId, filename, detail: err.message });
    return res.status(502).json({ error: 'Failed to reach agent bridge for artifact' });
  }
});

module.exports = router;
