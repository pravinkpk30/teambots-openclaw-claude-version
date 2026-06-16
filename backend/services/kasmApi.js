/**
 * kasmApi.js — Thin wrapper around the KASM Developer API.
 *
 * Key points:
 *  - All requests use api_key + api_key_secret in the JSON body (not headers).
 *  - SSL verification can be disabled for self-signed KASM certs (UTM/local VM).
 *  - Chat is delivered via direct HTTP to the bridge (Approach 2: port mapping),
 *    so no exec_command_kasm relay is needed here.
 */

'use strict';

const https = require('https');
const axios = require('axios');
const log   = require('./logger').kasm;

const agent = new https.Agent({
  rejectUnauthorized: process.env.KASM_VERIFY_SSL !== 'false',
});

function client() {
  return axios.create({
    baseURL: process.env.KASM_BASE_URL,
    httpsAgent: agent,
    timeout: 30_000,
  });
}

function auth() {
  return {
    api_key:        process.env.KASM_API_KEY,
    api_key_secret: process.env.KASM_API_SECRET,
  };
}

/**
 * Create a throw-away KASM user for an agent session.
 * Returns { user_id, username }.
 */
async function createUser(username, password) {
  const body = {
    ...auth(),
    target_user: {
      username,
      password,
      first_name: 'Agent',
      last_name:  'Bot',
      organization: 'teambots',
      locked: false,
      disabled: false,
    },
  };
  const res = await client().post('/api/public/create_user', body);
  log.info('createUser', { username, user_id: res.data?.user?.user_id });
  return res.data.user;
}

/**
 * Provision a KASM session (container) for a user.
 * The KASM Developer API expects the `environment` dict (NOT
 * `environment_variables`) to inject env vars into the container at startup.
 * See https://www.kasmweb.com/docs/latest/developers/developer_api.html
 * Returns the full kasm object (includes kasm_id, status, etc.)
 */
async function requestKasm({ userId, imageId, envVars }) {
  const environment = sanitizeEnvironment(envVars);
  const body = {
    ...auth(),
    user_id:  userId,
    image_id: imageId,
    environment,
  };
  const res = await client().post('/api/public/request_kasm', body);

  // request_kasm returns the kasm fields either nested under `kasm` or flat at
  // the top level (varies by KASM version). Normalize to a single object.
  const kasm = res.data?.kasm || (res.data?.kasm_id ? res.data : null);

  if (!kasm) {
    // KASM returns { error_message: "..." } on failure (bad image_id,
    // no resources, invalid run config, etc.) — surface it instead of
    // crashing later on kasm.kasm_id.
    const reason = res.data?.error_message || JSON.stringify(res.data) || 'unknown error';
    log.error('requestKasm failed', { reason, image_id: imageId, env_keys: Object.keys(environment) });
    if (reason === 'Invalid Request') {
      throw new Error(
        `KASM request_kasm failed: Invalid Request — KASM_IMAGE_ID is likely wrong or stale (${imageId}). ` +
        'After rebuilding/re-registering the workspace, copy the fresh Image ID from KASM Admin → Workspaces into backend/.env (or root .env for docker compose), then restart the backend.'
      );
    }
    throw new Error(`KASM request_kasm failed: ${reason}`);
  }

  log.info('requestKasm', { kasm_id: kasm.kasm_id, status: kasm.operational_status || kasm.status });
  return kasm;
}

/**
 * Poll until operational_status === 'running' or timeout.
 * Returns the final kasm object.
 */
async function waitForRunning(userId, kasmId, timeoutS = 180) {
  const deadline = Date.now() + timeoutS * 1000;
  while (Date.now() < deadline) {
    const res = await client().post('/api/public/get_kasm_status', {
      ...auth(),
      user_id: userId,
      kasm_id: kasmId,
    });
    const kasm = res.data?.kasm || res.data;
    const status = kasm?.operational_status || kasm?.status;
    log.info('pollStatus', { kasm_id: kasmId, status });
    if (status === 'running') return kasm;
    if (status === 'stopped' || status === 'error') {
      throw new Error(`KASM session entered ${status} state`);
    }
    await sleep(4000);
  }
  throw new Error(`Timed out waiting for KASM session to reach running state`);
}

/**
 * Send a keepalive so KASM doesn't terminate idle sessions.
 */
async function keepalive(userId, kasmId) {
  try {
    await client().post('/api/public/keepalive_kasm', {
      ...auth(),
      user_id: userId,
      kasm_id: kasmId,
    });
  } catch (e) {
    log.warn('keepalive failed', { kasm_id: kasmId, error: e.message });
  }
}

/**
 * Destroy a KASM session (clean up after agent is fired).
 */
async function destroyKasm(userId, kasmId) {
  const res = await client().post('/api/public/destroy_kasm', {
    ...auth(),
    user_id: userId,
    kasm_id: kasmId,
  });
  log.info('destroyKasm', { kasm_id: kasmId });
  return res.data;
}

/**
 * List all sessions visible to the API key.
 */
async function getKasms() {
  const res = await client().post('/api/public/get_kasms', { ...auth() });
  return res.data?.kasms || [];
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Drop empty optional values — KASM rejects some blank environment entries. */
function sanitizeEnvironment(envVars) {
  return Object.fromEntries(
    Object.entries(envVars).filter(([, value]) => value !== '' && value != null)
  );
}

module.exports = { createUser, requestKasm, waitForRunning, keepalive, destroyKasm, getKasms };
