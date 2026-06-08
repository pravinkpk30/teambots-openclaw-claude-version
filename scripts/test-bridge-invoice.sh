#!/usr/bin/env bash
# =============================================================================
# scripts/test-bridge-invoice.sh
# Run INSIDE the KASM container to test the Invoice Agent skill.
# =============================================================================
set -euo pipefail

BRIDGE_PORT="${BRIDGE_PORT:-3100}"
BRIDGE_TOKEN="${TEAMBOTS_TOKEN:-}"

MESSAGE="Create invoice INV-2026-001 for Acme Corp (billing@acme.com, 100 Main St, New York).
Items: 3 hours web development at \$120/hour, 1 domain renewal at \$15.
Apply 8% sales tax. Payment due in 14 days.
Vendor: TeamBots Labs, billing@teambots.ai, Tax ID 98-7654321."

echo "=== Invoice Agent Test ==="
echo ""

REQ=$(python3 -c "
import json, sys
print(json.dumps({
  'message': sys.argv[1],
  'conversation_id': 'invoice_test',
  'user_id': 'test_user'
}))
" "${MESSAGE}")

curl -s \
  -X POST "http://127.0.0.1:${BRIDGE_PORT}/chat" \
  -H "Content-Type: application/json" \
  ${BRIDGE_TOKEN:+-H "Authorization: Bearer ${BRIDGE_TOKEN}"} \
  -d "${REQ}" \
  --max-time 120 | python3 -m json.tool

echo ""
echo "=== Done ==="
