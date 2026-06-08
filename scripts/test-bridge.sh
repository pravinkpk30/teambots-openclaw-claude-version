#!/usr/bin/env bash
# =============================================================================
# scripts/test-bridge.sh
#
# Run INSIDE the KASM container's xterm to verify the bridge is working.
# Bypasses the backend, Mac networking, and job file relay entirely.
#
# Usage:
#   bash /opt/teambots_openclaw/scripts/test-bridge.sh
#   MESSAGE="Create an invoice for Acme Corp" bash /opt/teambots_openclaw/scripts/test-bridge.sh
# =============================================================================
set -euo pipefail

BRIDGE_PORT="${BRIDGE_PORT:-3100}"
TOKEN_FILE="${HOME:-/root}/.teambots/token"
MESSAGE="${MESSAGE:-Hello! What can you do?}"
BRIDGE_TOKEN="${TEAMBOTS_TOKEN:-}"

echo "=== TeamBots Bridge Test ==="
echo "Bridge: http://127.0.0.1:${BRIDGE_PORT}"
echo ""

# ── Health check ──────────────────────────────────────────────────────────────
echo "--- /health ---"
curl -sf "http://127.0.0.1:${BRIDGE_PORT}/health" | python3 -m json.tool
echo ""

# ── Chat test ─────────────────────────────────────────────────────────────────
echo "--- /chat ---"
echo "Message: ${MESSAGE}"
echo ""

REQ=$(python3 -c "
import json
print(json.dumps({
  'message': '${MESSAGE}',
  'conversation_id': 'test_$(date +%s)',
  'user_id': 'test_user'
}))
")

curl -s \
  -X POST "http://127.0.0.1:${BRIDGE_PORT}/chat" \
  -H "Content-Type: application/json" \
  ${BRIDGE_TOKEN:+-H "Authorization: Bearer ${BRIDGE_TOKEN}"} \
  -d "${REQ}" \
  --max-time 90 | python3 -m json.tool

echo ""
echo "=== Done ==="
