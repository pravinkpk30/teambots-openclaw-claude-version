#!/usr/bin/env bash
# =============================================================================
# scripts/kasm-diagnose.sh
#
# Run from your Mac (not inside KASM) to list active sessions and capacity.
# Reads KASM_BASE_URL, KASM_API_KEY, KASM_API_SECRET from ../.env or backend/.env
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "${SCRIPT_DIR}")"

# Load env
for f in "${ROOT_DIR}/.env" "${ROOT_DIR}/backend/.env"; do
  [[ -f "${f}" ]] && export $(grep -v '^#' "${f}" | xargs) 2>/dev/null || true
done

KASM_URL="${KASM_BASE_URL:-https://localhost}"
API_KEY="${KASM_API_KEY:-}"
API_SECRET="${KASM_API_SECRET:-}"
VERIFY_SSL="${KASM_VERIFY_SSL:-false}"
CURL_OPTS=()
[[ "${VERIFY_SSL}" == "false" ]] && CURL_OPTS+=(-k)

echo "=== KASM Diagnostics ==="
echo "Server: ${KASM_URL}"
echo ""

echo "--- Active sessions ---"
curl -s "${CURL_OPTS[@]}" \
  -X POST "${KASM_URL}/api/public/get_kasms" \
  -H "Content-Type: application/json" \
  -d "{\"api_key\":\"${API_KEY}\",\"api_key_secret\":\"${API_SECRET}\"}" \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
kasms = data.get('kasms', [])
print(f'Total: {len(kasms)} session(s)')
for k in kasms:
    print(f'  {k[\"kasm_id\"][:12]}…  status={k.get(\"operational_status\",\"?\")}  image={k.get(\"image\",{}).get(\"friendly_name\",\"?\")}')
"
echo ""
echo "=== Done ==="
