// frontend/src/services/api.js
import axios from 'axios';

const BASE = process.env.REACT_APP_BACKEND_URL || '';

const api = axios.create({
  baseURL: `${BASE}/api`,
  headers: { 'Content-Type': 'application/json' },
});

// ── Agent Hire ────────────────────────────────────────────────────────────────
export async function hireAgent(payload) {
  const res = await api.post('/agents/hire', payload);
  return res.data; // { agent_id, status }
}

// ── Agent Status ──────────────────────────────────────────────────────────────
export async function getAgent(agentId) {
  const res = await api.get(`/agents/${agentId}`);
  return res.data;
}

export async function listAgents(userId) {
  const res = await api.get('/agents', { params: { user_id: userId } });
  return res.data.agents;
}

export async function fireAgent(agentId) {
  const res = await api.delete(`/agents/${agentId}`);
  return res.data;
}

// ── Chat ──────────────────────────────────────────────────────────────────────
export async function sendMessage(agentId, message, conversationId) {
  const res = await api.post(`/agents/${agentId}/chat`, {
    message,
    conversation_id: conversationId,
    user_id: 'demo_user',
  });
  return res.data;
}

export default api;
