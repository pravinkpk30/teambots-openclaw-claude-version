#!/usr/bin/env bash
# =============================================================================
# scripts/kasm-cleanup-sessions.sh
#
# Destroys ALL active KASM sessions to free up capacity.
# Run from your Mac when you get "No resources available".
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "${SCRIPT_DIR}")"

for f in "${ROOT_DIR}/.env" "${ROOT_DIR}/backend/.env"; do
  [[ -f "${f}" ]] && export $(grep -v '^#' "${f}" | xargs) 2>/dev/null || true
done

KASM_URL="${KASM_BASE_URL:-https://localhost}"
API_KEY="${KASM_API_KEY:-}"
API_SECRET="${KASM_API_SECRET:-}"
VERIFY_SSL="${KASM_VERIFY_SSL:-false}"
CURL_OPTS=()
[[ "${VERIFY_SSL}" == "false" ]] && CURL_OPTS+=(-k)

echo "=== KASM Session Cleanup ==="
echo "WARNING: This will destroy ALL active sessions."
read -rp "Continue? (y/N) " confirm
[[ "${confirm}" != "y" ]] && { echo "Aborted."; exit 0; }

# Get all sessions
SESSIONS=$(curl -s "${CURL_OPTS[@]}" \
  -X POST "${KASM_URL}/api/public/get_kasms" \
  -H "Content-Type: application/json" \
  -d "{\"api_key\":\"${API_KEY}\",\"api_key_secret\":\"${API_SECRET}\"}" \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
for k in data.get('kasms', []):
    print(k['kasm_id'] + ' ' + k.get('user_id', ''))
" 2>/dev/null || true)

if [[ -z "${SESSIONS}" ]]; then
  echo "No active sessions found."
  exit 0
fi

while IFS=' ' read -r kasm_id user_id; do
  echo "Destroying session ${kasm_id}…"
  curl -s "${CURL_OPTS[@]}" \
    -X POST "${KASM_URL}/api/public/destroy_kasm" \
    -H "Content-Type: application/json" \
    -d "{\"api_key\":\"${API_KEY}\",\"api_key_secret\":\"${API_SECRET}\",\"kasm_id\":\"${kasm_id}\",\"user_id\":\"${user_id}\"}" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print('  OK' if 'error' not in str(d).lower() else '  WARN: ' + str(d))"
done <<< "${SESSIONS}"

echo "=== Done ==="
