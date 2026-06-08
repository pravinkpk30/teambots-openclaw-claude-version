#!/usr/bin/env bash
# =============================================================================
# kasm_start_agent.sh
#
# Entry point that runs INSIDE the KASM container (launched by custom_startup.sh
# via xterm). Sequence:
#
#   1. Setup directories + logging
#   2. Generate per-session gateway token and write to ~/.teambots/token
#   3. Write OpenClaw config (~/.openclaw/openclaw.json)
#   4. Install any requested ClawHub skills
#   5. Start OpenClaw gateway (background)
#   6. Wait for gateway /healthz (OpenClaw 2026.6+ liveness probe)
#   7. Start TeamBots bridge on :3100 (background)
#   8. POST /webhooks/agent-ready so backend marks agent as 'ready'
#   9. Keep-alive loop (keeps xterm alive so KASM doesn't kill the session)
#
# Chat delivery: the backend reaches the bridge directly over HTTP via KASM
# port mapping (host :3100 -> container :3100). No job queue / worker needed.
# =============================================================================
set -euo pipefail

# ── Env defaults ──────────────────────────────────────────────────────────────
AGENT_ID="${AGENT_ID:-agent_local}"
AGENT_ROLE="${AGENT_ROLE:-General Assistant}"
LLM_PROVIDER="${LLM_PROVIDER:-google}"
LLM_MODEL="${LLM_MODEL:-gemini-2.0-flash}"
LLM_API_KEY="${LLM_API_KEY:-}"
SKILLS="${SKILLS:-}"
TEAMBOTS_WEBHOOK="${TEAMBOTS_WEBHOOK:-}"
TEAMBOTS_TOKEN="${TEAMBOTS_TOKEN:-}"
BRIDGE_PORT="${BRIDGE_PORT:-3100}"
GATEWAY_PORT="${GATEWAY_PORT:-18789}"

TB_HOME="${HOME:-/root}/.teambots"
LOG_DIR="${TEAMBOTS_LOG_DIR:-${TB_HOME}/logs}"
TOKEN_FILE="${TB_HOME}/token"
OC_DIR="${HOME:-/root}/.openclaw"
OC_CONFIG="${OC_DIR}/openclaw.json"
BRIDGE_DIR="/opt/teambots_openclaw/bridge"

# ── Setup ─────────────────────────────────────────────────────────────────────
mkdir -p "${LOG_DIR}" "${TB_HOME}" "${OC_DIR}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_DIR}/startup.log"; }
die() { log "ERROR: $*"; exit 1; }

# ~/.openclaw may exist root-owned (image build, npm global, or KASM persistent
# profile). Ensure kasm-user can write openclaw.json before proceeding.
ensure_writable_dir() {
  local dir="$1"
  [[ -w "${dir}" ]] && return 0
  log "WARN: ${dir} is not writable (owner: $(stat -c '%U:%G' "${dir}" 2>/dev/null || echo unknown))"
  if command -v sudo >/dev/null 2>&1; then
    sudo chown -R "$(id -un):$(id -gn)" "${dir}" 2>/dev/null \
      && log "Fixed ownership on ${dir}" \
      && return 0
  fi
  die "${dir} is not writable. Run: sudo chown -R \$(id -un) ${dir}"
}
ensure_writable_dir "${OC_DIR}"
ensure_writable_dir "${TB_HOME}"

log "=== TeamBots Agent Starting ==="
log "AGENT_ID=${AGENT_ID}  ROLE=${AGENT_ROLE}  PROVIDER=${LLM_PROVIDER}  MODEL=${LLM_MODEL}"

# ── 1. Validate LLM key ───────────────────────────────────────────────────────
[[ -z "${LLM_API_KEY}" ]] && die "LLM_API_KEY is not set. Cannot start without an API key."

# ── 2. Generate gateway token ─────────────────────────────────────────────────
GATEWAY_TOKEN="$(openssl rand -hex 32)"
echo -n "${GATEWAY_TOKEN}" > "${TOKEN_FILE}"
log "Gateway token written to ${TOKEN_FILE}"

# ── 3. Write OpenClaw config (OpenClaw 2026.6.x via generate-openclaw-config.js) ─
# Do NOT use the legacy schema (gateway.host, http.chat_completions, api_key snake_case).
# That format aborts gateway startup on OpenClaw 2026.6.1+.
case "${LLM_PROVIDER}" in
  google|gemini)   OC_PROVIDER="google"    ;;
  anthropic|claude) OC_PROVIDER="anthropic" ;;
  openai)           OC_PROVIDER="openai"    ;;
  *)                OC_PROVIDER="${LLM_PROVIDER}" ;;
esac

case "${OC_PROVIDER}" in
  google)    export GEMINI_API_KEY="${LLM_API_KEY}" ;;
  anthropic) export ANTHROPIC_API_KEY="${LLM_API_KEY}" ;;
  openai)    export OPENAI_API_KEY="${LLM_API_KEY}" ;;
esac
export OPENCLAW_GATEWAY_TOKEN="${GATEWAY_TOKEN}"
export LLM_PROVIDER="${OC_PROVIDER}"

mkdir -p "${OC_DIR}/workspace"
node /opt/teambots_openclaw/scripts/generate-openclaw-config.js \
  >> "${LOG_DIR}/startup.log" 2>&1 \
  || die "generate-openclaw-config.js failed — see startup.log"

# Validate before starting — invalid config makes gateway exit immediately.
if openclaw config validate >> "${LOG_DIR}/startup.log" 2>&1; then
  log "OpenClaw config validated OK"
else
  tail -n 20 "${LOG_DIR}/startup.log" | tee -a "${LOG_DIR}/startup.log" || true
  die "OpenClaw config invalid — run: openclaw config validate"
fi

# ── 4. Install ClawHub skills (per-agent, based on the hired role) ─────────────
# Skills are installed at runtime (NOT baked into the image) so one image can
# serve every agent type and each hire only pulls the skills its role needs.
# Installs into the OpenClaw workspace skills directory. See https://docs.openclaw.ai/clawhub/
if [[ -n "${SKILLS}" ]]; then
  IFS=',' read -ra SKILL_LIST <<< "${SKILLS}"
  for skill in "${SKILL_LIST[@]}"; do
    skill="$(echo "${skill}" | xargs)"  # trim whitespace
    [[ -z "${skill}" ]] && continue
    log "Installing skill: ${skill}"
    openclaw skills install "${skill}" >> "${LOG_DIR}/skill-install.log" 2>&1 \
      && log "==> Skill installed: ${skill}" \
      || log "WARN: skill install failed for ${skill} — continuing"
  done
  openclaw skills list >> "${LOG_DIR}/skill-install.log" 2>&1 || true
fi

# ── 5. Start OpenClaw gateway ─────────────────────────────────────────────────
# Use `gateway run` (foreground process), NOT `gateway start` (systemd/launchd
# service — unavailable inside KASM containers and exits without listening).
log "Starting OpenClaw gateway on :${GATEWAY_PORT}..."
# --force: release stale listener from a previous failed session on the same port.
openclaw gateway run --port "${GATEWAY_PORT}" --force --token "${GATEWAY_TOKEN}" \
  >> "${LOG_DIR}/openclaw-gateway.log" 2>&1 &
GATEWAY_PID=$!
log "Gateway PID=${GATEWAY_PID}"

# ── 6. Wait for gateway health ────────────────────────────────────────────────
# OpenClaw 2026.6+ serves /healthz (liveness) and /readyz (readiness), NOT /health.
log "Waiting for gateway /healthz..."
GATEWAY_READY=false
for i in $(seq 1 60); do
  if ! kill -0 "${GATEWAY_PID}" 2>/dev/null; then
    log "ERROR: gateway process exited during startup (attempt ${i})"
    tail -n 30 "${LOG_DIR}/openclaw-gateway.log" >> "${LOG_DIR}/startup.log" 2>/dev/null || true
    die "Gateway process crashed — see ~/.teambots/logs/openclaw-gateway.log"
  fi

  HEALTHZ_CODE=$(curl -o /dev/null -s -w "%{http_code}" \
    "http://127.0.0.1:${GATEWAY_PORT}/healthz" 2>/dev/null || true)
  if [[ "${HEALTHZ_CODE}" == "200" ]]; then
    GATEWAY_READY=true
    log "==> Gateway is live (attempt ${i}, /healthz HTTP ${HEALTHZ_CODE})"
    break
  fi

  if (( i % 10 == 0 )); then
    log "Still waiting for /healthz (attempt ${i}, last HTTP ${HEALTHZ_CODE:-000})"
  fi
  sleep 2
done
${GATEWAY_READY} || {
  log "ERROR: gateway never responded on /healthz"
  tail -n 30 "${LOG_DIR}/openclaw-gateway.log" >> "${LOG_DIR}/startup.log" 2>/dev/null || true
  die "Gateway did not become ready within 120 seconds — see ~/.teambots/logs/openclaw-gateway.log"
}

# Optional readiness gate — chatCompletions may stay disabled until /readyz is green.
log "Waiting for gateway /readyz..."
for i in $(seq 1 30); do
  READYZ_CODE=$(curl -o /dev/null -s -w "%{http_code}" \
    "http://127.0.0.1:${GATEWAY_PORT}/readyz" 2>/dev/null || true)
  if [[ "${READYZ_CODE}" == "200" ]]; then
    log "==> Gateway is ready for traffic (attempt ${i}, /readyz HTTP ${READYZ_CODE})"
    break
  fi
  if (( i == 30 )); then
    log "WARN: /readyz still HTTP ${READYZ_CODE:-000} after 30s — continuing anyway"
  fi
  sleep 1
done

# ── 7. Start TeamBots bridge ──────────────────────────────────────────────────
log "Starting TeamBots bridge on :${BRIDGE_PORT}..."
cd "${BRIDGE_DIR}"
AGENT_ID="${AGENT_ID}" \
AGENT_ROLE="${AGENT_ROLE}" \
TEAMBOTS_TOKEN="${TEAMBOTS_TOKEN}" \
BRIDGE_PORT="${BRIDGE_PORT}" \
GATEWAY_PORT="${GATEWAY_PORT}" \
TEAMBOTS_LOG_DIR="${LOG_DIR}" \
  node server.js >> "${LOG_DIR}/bridge-stdout.log" 2>&1 &
BRIDGE_PID=$!
log "Bridge PID=${BRIDGE_PID}"

# Wait for bridge health
for i in $(seq 1 20); do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    "http://127.0.0.1:${BRIDGE_PORT}/health" 2>/dev/null || true)
  if [[ "${HTTP_CODE}" == "200" ]]; then
    log "==> Bridge is ready (attempt ${i})"
    break
  fi
  sleep 1
done

# ── 8. Notify backend: agent is ready ────────────────────────────────────────
if [[ -n "${TEAMBOTS_WEBHOOK}" && -n "${TEAMBOTS_TOKEN}" ]]; then
  WEBHOOK_URL="${TEAMBOTS_WEBHOOK}/agent-ready"
  log "Notifying backend: ${WEBHOOK_URL}"
  for attempt in 1 2 3; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST "${WEBHOOK_URL}" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${TEAMBOTS_TOKEN}" \
      -d "{\"agent_id\":\"${AGENT_ID}\"}" 2>/dev/null || true)
    if [[ "${HTTP_CODE}" == "200" ]]; then
      log "==> TeamBots webhook notified successfully (attempt ${attempt})"
      break
    fi
    log "WARN: webhook attempt ${attempt} returned HTTP ${HTTP_CODE}, retrying..."
    sleep 3
  done
else
  log "WARN: TEAMBOTS_WEBHOOK or TEAMBOTS_TOKEN not set — skipping ready notification (local mode)"
fi

# ── 9. Keep-alive ─────────────────────────────────────────────────────────────
log "Agent is running. Gateway PID=${GATEWAY_PID}, Bridge PID=${BRIDGE_PID}"
log "Press Ctrl+C to stop."

# Trap SIGINT/SIGTERM for clean shutdown
cleanup() {
  log "Shutting down..."
  kill "${BRIDGE_PID}" "${GATEWAY_PID}" 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM

# Periodic health logging
while true; do
  sleep 30
  GW_OK=$(curl -s -o /dev/null -w "%{http_code}" \
    "http://127.0.0.1:${GATEWAY_PORT}/healthz" 2>/dev/null || echo "ERR")
  BR_OK=$(curl -s -o /dev/null -w "%{http_code}" \
    "http://127.0.0.1:${BRIDGE_PORT}/health" 2>/dev/null || echo "ERR")
  log "heartbeat gateway=${GW_OK} bridge=${BR_OK}"
done
