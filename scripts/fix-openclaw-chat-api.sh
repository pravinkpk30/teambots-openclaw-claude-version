#!/usr/bin/env bash
# =============================================================================
# scripts/fix-openclaw-chat-api.sh
#
# Run INSIDE the KASM container if bridge /chat returns a 404 from OpenClaw.
# Some OpenClaw versions ship with the HTTP chat API disabled.
# This script patches ~/.openclaw/openclaw.json and restarts the gateway.
# =============================================================================
set -euo pipefail

TOKEN_FILE="${HOME:-/root}/.teambots/token"
GATEWAY_PORT="${GATEWAY_PORT:-18789}"

echo "=== Fix OpenClaw Chat API ==="

python3 -c "
import json, os
cfg_path = os.path.expanduser('~/.openclaw/openclaw.json')
if not os.path.exists(cfg_path):
    print(f'Config not found at {cfg_path}')
    exit(1)
with open(cfg_path) as f:
    cfg = json.load(f)
cfg.setdefault('gateway', {}).setdefault('http', {})['chat_completions'] = True
cfg['gateway']['http']['models'] = True
with open(cfg_path, 'w') as f:
    json.dump(cfg, f, indent=2)
print('Patched config:')
print(json.dumps(cfg['gateway']['http'], indent=2))
"

echo ""
echo "Now kill the gateway and re-run kasm_start_agent.sh:"
echo "  pkill -f 'openclaw gateway' && bash /opt/teambots_openclaw/kasm_start_agent.sh"
