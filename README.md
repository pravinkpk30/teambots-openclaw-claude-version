# TeamBots + OpenClaw + KASM

Hire AI agents from a React UI. Each agent runs in a **KASM workspace** container
with **OpenClaw** (gateway + skills) and a **TeamBots bridge** that relays chat
between the React app and the agent.

---

## Architecture

```
React UI (localhost:3000)
    │  POST /api/agents/hire
    │  POST /api/agents/:id/chat
    │  GET  /api/agents/:id  (status polling)
    ▼
Backend (localhost:4000)
    │  KASM Developer API: createUser → requestKasm → waitForRunning
    │  Chat: POST http://<kasm-vm-ip>:3100/chat   (direct HTTP)
    ▼
KASM VM (e.g. 192.168.64.3)
  │  KASM port mapping: host :3100 ──▶ container :3100
  └── Docker container (your-image/teambots-openclaw:latest)
        ├── kasm_start_agent.sh (started by xterm)
        │     ├── openclaw gateway  :18789  ← LLM provider API
        │     └── bridge/server.js  :3100   ← /health, /chat
        │
        │   DIRECT CHAT FLOW (Approach 2 — port mapping):
        │   backend → POST <kasm-vm-ip>:3100/chat  (Bearer bridgeToken)
        │   bridge  → OpenClaw gateway → LLM → reply
        │   bridge  → returns reply synchronously → backend → React
        │
        └── POST /webhooks/agent-ready → Backend → agent.status = 'ready'
```

### Why KASM port mapping?

KASM containers run on a Docker bridge network (`172.18.x.x`) that your Mac
cannot reach directly. The KASM **Docker Run Config Override** mirrors the
docker-py `Container.run()` kwargs, so use `ports` (equivalent to `-p 3100:3100`)
to publish the bridge port to the VM host. Configure it once on the workspace:

```json
{ "ports": { "3100/tcp": 3100 } }
```

The backend then calls `http://<kasm-vm-ip>:3100/chat` directly — no exec relay,
no job files, no pending-promise registry, no chat webhook round-trip. The only
remaining webhook is `agent-ready`, which tells the backend the bridge is up.

---

## Prerequisites

| Component        | Requirement                                      |
|------------------|--------------------------------------------------|
| KASM Workspaces  | Running VM, Developer API enabled                |
| Node.js          | v20+ (backend + frontend)                        |
| Docker           | `docker buildx` for multi-platform builds        |
| LLM API key      | Google Gemini, Anthropic, or OpenAI              |

---

## Step 1 — Build & push the Docker image

```bash
# From project root:
docker buildx build \
  -f docker/Dockerfile \
  --platform linux/amd64,linux/arm64 \
  --no-cache --tag yourdockeruser/teambots-openclaw:latest \
  --push .
```

---

## Step 2 — Register in KASM Admin

1. **KASM Admin → Workspaces → Add Workspace**
2. Docker image: `yourdockeruser/teambots-openclaw:latest`
3. Memory: at least **2048 MB**
4. Enable **Allow environment variable override**
5. **Docker Run Config Override** — publish the bridge port to the VM host
   (mirrors docker-py `Container.run(ports=...)`):

```json
{ "ports": { "3100/tcp": 3100 } }
```

6. Copy the **Image ID** (32-char hex)

---

## Step 3 — Configure backend

```bash
cd backend
cp ../.env.example .env
```

Edit `backend/.env` (or root `.env`):

```env
KASM_BASE_URL=https://192.168.64.3       # your KASM VM IP
KASM_API_KEY=your_api_key
KASM_API_SECRET=your_api_secret
KASM_IMAGE_ID=abc123...                  # from KASM Admin → Workspaces
KASM_VERIFY_SSL=false                    # false for self-signed cert

# CRITICAL — direct bridge URL (Approach 2 port mapping).
# KASM VM IP + the host_port you set in the workspace Docker Run Config.
KASM_BRIDGE_URL=http://192.168.64.3:3100

# IP the container uses to reach your Mac for the agent-ready webhook.
# Mac + UTM: use the UTM host-only IP (NOT Wi-Fi, NOT localhost)
TEAMBOTS_WEBHOOK_BASE=http://192.168.64.1:4000

FRONTEND_URL=http://localhost:3000
```

**Finding the UTM host IP:**
```bash
# Inside the KASM VM or any container:
ip route show default
# The gateway IP is your Mac's UTM interface IP
```

Allow port 4000 through macOS Firewall if curl from the KASM VM fails.

---

## Step 4 — Start backend + frontend

```bash
# Terminal 1
cd backend && npm install && npm start

# Terminal 2
cd frontend && npm install && npm start
```

Open http://localhost:3000

---

## Step 5 — Hire an agent

1. Select an agent profile
2. Choose LLM provider + model
3. Paste your API key
4. Click **Hire**
5. Wait for status: `kasm_running` → `ready` (webhook from container)
6. Chat opens automatically

---

## Step 6 — Verify inside KASM (debugging)

Open the KASM session in your browser. The xterm shows startup logs.

```bash
# Health checks
curl -sf http://127.0.0.1:3100/health | python3 -m json.tool
curl -sf http://127.0.0.1:18789/healthz

# Quick chat test (bypasses Mac backend entirely)
bash /opt/teambots_openclaw/scripts/test-bridge.sh

# Invoice agent test
bash /opt/teambots_openclaw/scripts/test-bridge-invoice.sh

# Tail all logs
tail -f ~/.teambots/logs/startup.log
tail -f ~/.teambots/logs/bridge.log
```

**From your Mac — verify the bridge is reachable via the port mapping:**
```bash
curl -sf http://192.168.64.3:3100/health | python3 -m json.tool
```

**If test-bridge.sh works inside KASM but the Mac call above fails:**
- Confirm the workspace **Docker Run Config Override** has `"ports": {"3100/tcp": 3100}`
- Confirm `KASM_BRIDGE_URL` in `backend/.env` uses the KASM VM IP + mapped host port
- Confirm no firewall on the KASM VM blocks the published host port

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Gateway did not become ready` / `HTTP 000` on `/healthz` | **Stale Docker image** — `/opt/teambots_openclaw/kasm_start_agent.sh` still writes the pre-2026.6 config (`gateway.host`, `chat_completions`, `api_key`). Rebuild from this repo. Check: `grep -q '"host"' ~/.openclaw/openclaw.json && echo STALE` |
| `OpenClaw config is invalid` (models.providers / gateway.http) | Same — old startup script or Step-1 Python with incomplete `models.providers`. Use `node scripts/generate-openclaw-config.js` (2026.6.x schema). Never use `gateway.host` or `api_key` snake_case. |
| `sed: Permission denied` on `/opt/teambots_openclaw/` | Scripts are root-owned in the image. Copy to home: `cp /opt/teambots_openclaw/kasm_start_agent.sh ~/kasm_start_agent.sh` (after rebuild), or rebuild the image. |
| `Invalid Request` on hire | `KASM_IMAGE_ID` is wrong/stale — copy fresh ID from KASM Admin |
| `No resources available` | Run `bash scripts/kasm-cleanup-sessions.sh` to free slots |
| Webhook never arrives (`kasm_running` forever) | `TEAMBOTS_WEBHOOK_BASE` must be UTM host IP, not Wi-Fi or localhost |
| Bridge `/chat` returns 404 | Run `scripts/fix-openclaw-chat-api.sh` inside KASM xterm |
| `Failed to reach agent bridge` / `ETIMEDOUT` | `ports` mapping missing in Docker Run Config Override, or `KASM_BRIDGE_URL` wrong — verify `curl http://<kasm-vm-ip>:3100/health` from your Mac |
| `request_kasm failed: An Unexpected Error occurred` | Invalid Docker Run Config Override — use docker-py kwargs (`ports`, not `port_map`); also check for host-port `3100` conflict |
| Agent asks name/vibe/emoji instead of doing the task | OpenClaw **first-run bootstrap** — workspace missing SOUL.md/IDENTITY.md and `skipBootstrap`. Fixed by `seed-agent-workspace.js` + `skipBootstrap: true`. Rebuild image or re-hire after fix. |
| Web search tool error / "No response from OpenClaw." | OpenClaw tried `web_search` (not configured in KASM) or returned empty tool-only output. Fixed with `tools.profile: minimal` in config. Check `tail -f ~/.teambots/logs/bridge.log` for chat activity (xterm only shows heartbeats). |

---

## Project layout

```
teambots-openclaw/
├── backend/
│   ├── server.js              # Express entry point
│   ├── routes/
│   │   ├── hire.js            # POST /api/agents/hire
│   │   ├── chat.js            # POST /api/agents/:id/chat (direct HTTP to bridge)
│   │   ├── agents.js          # GET/DELETE /api/agents
│   │   └── webhooks.js        # POST /webhooks/agent-ready
│   └── services/
│       ├── kasmApi.js         # KASM Developer API wrapper
│       ├── registry.js        # In-memory agent store
│       └── logger.js          # Winston per-component loggers
├── bridge/
│   └── server.js              # Runs inside container, proxies to OpenClaw
├── docker/
│   └── Dockerfile             # Builds the KASM workspace image
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── HirePage.jsx   # Agent selection + hire form
│       │   └── ChatPage.jsx   # Chat interface
│       ├── components/
│       │   ├── AgentCard.jsx
│       │   ├── ChatBubble.jsx
│       │   └── StatusBadge.jsx
│       └── services/
│           ├── api.js          # Axios client
│           └── agentProfiles.js
├── scripts/
│   ├── test-bridge.sh
│   ├── test-bridge-invoice.sh
│   ├── kasm-diagnose.sh
│   ├── kasm-cleanup-sessions.sh
│   ├── fix-openclaw-chat-api.sh
│   └── generate-token.sh
├── kasm_start_agent.sh        # Container entry point (gateway+bridge+worker)
├── custom_startup.sh          # KASM xterm launcher
└── docker-compose.yml         # Local dev (backend + frontend only)
```

---

## Production checklist

- [ ] Replace in-memory registry with Redis/PostgreSQL
- [ ] Encrypt LLM API keys at rest
- [ ] HTTPS for backend (Let's Encrypt or Caddy)
- [ ] Rate-limit `/api/agents/hire`
- [ ] KASM multi-node with autoscaling
- [ ] Persist conversation history (per agent_id + conversation_id)
- [ ] Agent heartbeat monitoring
- [ ] Graceful shutdown with session cleanup
