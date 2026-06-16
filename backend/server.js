/**
 * server.js — TeamBots backend entry point
 */

'use strict';

const path = require('path');

// Load repo root .env first, then backend/.env (backend wins on conflicts).
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express  = require('express');
const cors     = require('cors');
const log      = require('./services/logger').api;

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ───────────────────────────────────────────────────────────────

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// Request logger
app.use((req, _res, next) => {
  log.info(`${req.method} ${req.path}`, { body: req.method === 'POST' ? req.body : undefined });
  next();
});

// ── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/agents/hire', require('./routes/hire'));
app.use('/api/agents',      require('./routes/agents'));
app.use('/api/agents',      (() => {
  // Chat sub-route: POST /api/agents/:agentId/chat
  const r = require('express').Router();
  r.use('/:agentId/chat', require('./routes/chat'));
  r.use('/:agentId/artifacts', require('./routes/artifacts'));
  return r;
})());
app.use('/webhooks',        require('./routes/webhooks'));

// Health
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// 404 fallback
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  log.info(`TeamBots backend listening on 0.0.0.0:${PORT}`);
  log.info(`Webhook base: ${process.env.TEAMBOTS_WEBHOOK_BASE || '(not set — set TEAMBOTS_WEBHOOK_BASE to your UTM host IP)'}`);
  log.info(`KASM server:  ${process.env.KASM_BASE_URL || '(not set)'}`);
  const imageId = process.env.KASM_IMAGE_ID || '';
  log.info(`KASM image:   ${imageId ? `${imageId.slice(0, 8)}…` : '(not set — copy from KASM Admin → Workspaces)'}`);
});
