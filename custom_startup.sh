#!/usr/bin/env bash
# =============================================================================
# custom_startup.sh
#
# KASM calls this script when the workspace session starts.
# It opens an xterm that runs kasm_start_agent.sh so users can see startup
# logs in the KASM browser window.
#
# The xterm is kept OPEN after the agent script exits (success or failure) so
# startup errors remain visible for debugging instead of the window vanishing.
# =============================================================================

# Give the desktop a moment to initialise
sleep 2

# Launch the agent startup script in a visible xterm. If the script exits
# (including a fatal `die`), drop into an interactive shell so the logs/error
# stay on screen rather than the window closing.
xterm \
  -fa 'Monospace' \
  -fs 11 \
  -bg '#1e1e2e' \
  -fg '#cdd6f4' \
  -title 'TeamBots Agent' \
  -geometry 200x50+0+0 \
  -e bash -c '
    AGENT_SCRIPT="${HOME}/kasm_start_agent.sh"
    if [[ ! -f "${AGENT_SCRIPT}" ]]; then
      cp /opt/teambots_openclaw/kasm_start_agent.sh "${AGENT_SCRIPT}" 2>/dev/null || true
      chmod +x "${AGENT_SCRIPT}" 2>/dev/null || true
    fi
    bash "${AGENT_SCRIPT:-/opt/teambots_openclaw/kasm_start_agent.sh}"
    echo
    echo "============================================================"
    echo " kasm_start_agent.sh exited with code $? "
    echo " Logs: ~/.teambots/logs/   (startup.log, openclaw-gateway.log)"
    echo " This shell stays open for debugging. Type commands or close."
    echo "============================================================"
    exec bash
  ' &
