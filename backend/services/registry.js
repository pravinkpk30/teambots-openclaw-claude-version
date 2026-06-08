/**
 * registry.js — In-memory store for active agents.
 *
 * Production TODO: replace with Redis or PostgreSQL.
 *
 * An agent record:
 * {
 *   agentId,           // teambots agent ID  (agent_<hex>)
 *   userId,            // KASM user ID
 *   kasmId,            // KASM session ID
 *   bridgeToken,       // shared secret sent by container on /webhooks/agent-ready
 *   status,            // 'provisioning' | 'kasm_running' | 'ready' | 'error'
 *   role, llmProvider, llmModel,
 *   hiredAt, userId (teambots user),
 *   keepaliveTimer,    // NodeJS interval handle
 * }
 */

'use strict';

const kasmApi = require('./kasmApi');

/** @type {Map<string, object>} */
const agents = new Map();

// ── Agent CRUD ──────────────────────────────────────────────────────────────

function set(agentId, data) {
  const existing = agents.get(agentId) || {};
  agents.set(agentId, { ...existing, ...data, agentId });
}

function get(agentId) {
  return agents.get(agentId) || null;
}

function list(userId) {
  const all = [...agents.values()];
  return userId ? all.filter(a => a.tbUserId === userId) : all;
}

function remove(agentId) {
  const agent = agents.get(agentId);
  if (agent?.keepaliveTimer) clearInterval(agent.keepaliveTimer);
  agents.delete(agentId);
}

/** Start a KASM keepalive interval so idle sessions aren't reaped. */
function startKeepalive(agentId) {
  const intervalS = parseInt(process.env.KASM_KEEPALIVE_INTERVAL_S || '60', 10);
  const timer = setInterval(async () => {
    const agent = agents.get(agentId);
    if (!agent) { clearInterval(timer); return; }
    await kasmApi.keepalive(agent.kasmUserId, agent.kasmId);
  }, intervalS * 1000);
  set(agentId, { keepaliveTimer: timer });
}

module.exports = { set, get, list, remove, startKeepalive };
