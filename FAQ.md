# TeamBots KASM Agent — Questions & Answers

This document collects common questions and answers about the TeamBots + OpenClaw + KASM setup, written in simple terms. For full architecture and setup steps, see [WORKFLOW.md](./WORKFLOW.md) and [README.md](./README.md).

---

## Table of contents

1. [What is xterm?](#1-what-is-xterm)
2. [Why does nothing show in the xterm when I chat?](#2-why-does-nothing-show-in-the-xterm-when-i-chat)
3. [Is the agent working if the terminal only shows heartbeats?](#3-is-the-agent-working-if-the-terminal-only-shows-heartbeats)
4. [bridgeToken vs gateway token — two different secrets](#4-bridgetoken-vs-gateway-token--two-different-secrets)
5. [Where is bridgeToken stored in the KASM session?](#5-where-is-bridgetoken-stored-in-the-kasm-session)
6. [What is `~/.teambots/token` and what is it for?](#6-what-is-teambotstoken-and-what-is-it-for)
7. [Workflow of both tokens (diagram)](#7-workflow-of-both-tokens-diagram)
8. [Does the bridge verify the gateway token?](#8-does-the-bridge-verify-the-gateway-token)
9. [Who writes SOUL.md, AGENTS.md, IDENTITY.md?](#9-who-writes-soulmd-agentsmd-identitymd)
10. [Where are those files stored?](#10-where-are-those-files-stored)
11. [Purpose of each workspace file](#11-purpose-of-each-workspace-file)
12. [Why is the webhook URL different from the bridge URL?](#12-why-is-the-webhook-url-different-from-the-bridge-url)
13. [My KASM VM is 192.168.64.3 — why use 192.168.64.1 for webhook?](#13-my-kasm-vm-is-192168643--why-use-192168641-for-webhook)
14. [Why is ClawHub not installed in the Docker image?](#14-why-is-clawhub-not-installed-in-the-docker-image)
15. [Quick reference tables](#15-quick-reference-tables)

---

## 1. What is xterm?

**xterm** is a basic **terminal window** on Linux — a GUI window where you run shell commands, like Terminal.app on a Mac.

In this project, KASM runs `custom_startup.sh`, which **opens an xterm** titled **"TeamBots Agent"** so you can **see startup logs** inside the KASM browser session.

```
KASM starts container
  → custom_startup.sh
      → opens xterm (visible window)
          → runs kasm_start_agent.sh inside it
```

**Why use it?**

- You see gateway/bridge startup messages and errors on screen.
- If startup fails, the window stays open for debugging.
- **Chat does not run through xterm** — chat uses HTTP in the background.

---

## 2. Why does nothing show in the xterm when I chat?

**That is normal.**

| Activity | Where it runs | Visible in xterm? |
|----------|---------------|-------------------|
| Startup (`kasm_start_agent.sh`) | xterm | Yes |
| Heartbeat every 30s | xterm | Yes (`heartbeat gateway=200 bridge=200`) |
| Chat messages | HTTP → bridge `:3100` | **No** |

To see chat activity, use log files inside the container:

```bash
tail -f ~/.teambots/logs/bridge.log
tail -f ~/.teambots/logs/openclaw-gateway.log
```

---

## 3. Is the agent working if the terminal only shows heartbeats?

**Partially — it depends.**

| Signal | Meaning |
|--------|---------|
| `heartbeat gateway=200 bridge=200` | Gateway and bridge are **up and healthy** |
| Backend `chat.log` shows `chat response received` | **Mac → bridge → OpenClaw** path works |
| Bad or empty replies in the UI | Pipeline works, but **agent/LLM behavior** may need fixes (tools, bootstrap, config) |

Heartbeats only prove **services are running**, not that every chat answer is good.

---

## 4. bridgeToken vs gateway token — two different secrets

There are **two separate tokens**. Do not confuse them.

| Name | Also called | Created by | Purpose |
|------|-------------|------------|---------|
| **bridgeToken** | `TEAMBOTS_TOKEN` (env) | Backend at **hire** | Protect **bridge** and **webhooks** |
| **Gateway token** | contents of `~/.teambots/token` | `kasm_start_agent.sh` at **container startup** | Protect **OpenClaw gateway** on port 18789 |

They are **different random values** for **different hops** in the chain.

---

## 5. Where is bridgeToken stored in the KASM session?

### On the backend (Mac)

- Generated in `hire.js`: `crypto.randomBytes(32).toString('hex')`
- Stored in **in-memory registry** as `agent.bridgeToken`
- **Not** sent to the frontend (stripped in API responses)

### In the KASM container

- Injected by KASM as environment variable **`TEAMBOTS_TOKEN`**
- Used by:
  - **Bridge** — to validate incoming `POST /chat` from your backend
  - **`kasm_start_agent.sh`** — to authenticate `POST /webhooks/agent-ready`

**It is NOT stored in `~/.teambots/token`.** That file holds the gateway token instead.

---

## 6. What is `~/.teambots/token` and what is it for?

**Path:** `/home/kasm-user/.teambots/token`

**Created by:** `kasm_start_agent.sh` at startup:

```bash
GATEWAY_TOKEN="$(openssl rand -hex 32)"
echo -n "${GATEWAY_TOKEN}" > ~/.teambots/token
```

**Same token is also written to:**

- `~/.openclaw/openclaw.json` → `gateway.auth.token`
- `openclaw gateway run --token "${GATEWAY_TOKEN}"`

**Used by:**

- **OpenClaw gateway** — rejects requests without correct `Authorization: Bearer …`
- **Bridge** — reads this file and sends the token when calling `POST /v1/chat/completions`

**Purpose:** Only the local bridge (inside the same container) should talk to OpenClaw on `127.0.0.1:18789`.

---

## 7. Workflow of both tokens (diagram)

```
═══════════════════════════════════════════════════════════════════
HIRE (backend on Mac)
═══════════════════════════════════════════════════════════════════
  bridgeToken = random hex
  ├── Saved in registry[agentId].bridgeToken
  └── Injected into container as env TEAMBOTS_TOKEN


═══════════════════════════════════════════════════════════════════
CONTAINER STARTUP (kasm_start_agent.sh)
═══════════════════════════════════════════════════════════════════
  GATEWAY_TOKEN = new random hex (different from bridgeToken!)
  ├── Written to ~/.teambots/token
  ├── Written to openclaw.json (gateway.auth.token)
  └── Passed to: openclaw gateway run --token ...


═══════════════════════════════════════════════════════════════════
AGENT-READY (container → Mac)
═══════════════════════════════════════════════════════════════════
  kasm_start_agent.sh
    POST http://192.168.64.1:4000/webhooks/agent-ready
    Authorization: Bearer TEAMBOTS_TOKEN   ← bridgeToken


═══════════════════════════════════════════════════════════════════
CHAT — step 1: Mac → bridge
═══════════════════════════════════════════════════════════════════
  backend chat.js
    POST http://192.168.64.3:3100/chat
    Authorization: Bearer bridgeToken      ← must match TEAMBOTS_TOKEN
  bridge validates token ✓


═══════════════════════════════════════════════════════════════════
CHAT — step 2: bridge → OpenClaw
═══════════════════════════════════════════════════════════════════
  bridge reads ~/.teambots/token
    POST http://127.0.0.1:18789/v1/chat/completions
    Authorization: Bearer <gateway token from file>
  OpenClaw gateway validates token ✓
```

**Summary:**

- **bridgeToken** = “Is this request from our TeamBots backend?”
- **Gateway token** = “Is this request allowed to use OpenClaw inside this container?”

---

## 8. Does the bridge verify the gateway token?

**No — the bridge does not verify the gateway token itself.**

What the bridge does:

1. Checks that `~/.teambots/token` **exists**
2. Reads a **non-empty** string from the file
3. Sends it as `Authorization: Bearer …` to OpenClaw

What **OpenClaw** does:

- Compares the Bearer token to its configured token
- Returns **401** if wrong

| Direction | Who verifies? |
|-----------|----------------|
| Backend → bridge (`POST /chat`) | **Bridge** compares to `TEAMBOTS_TOKEN` ✓ |
| Bridge → OpenClaw (`/v1/chat/completions`) | **OpenClaw** validates; bridge only forwards ✓ |

The bridge **trusts** the file because `kasm_start_agent.sh` wrote the same token into the file and into OpenClaw at startup.

---

## 9. Who writes SOUL.md, AGENTS.md, IDENTITY.md?

**Not the backend at hire. Not the LLM during chat (in normal TeamBots flow).**

| When | Who writes |
|------|------------|
| Hire (backend) | Only env vars (`AGENT_ROLE`, etc.) — **no .md files** |
| Container startup | **`seed-agent-workspace.js`** (called from `kasm_start_agent.sh`) |
| OpenClaw default (disabled here) | Could run bootstrap Q&A if `skipBootstrap` were false |

**TeamBots flow:**

```
Hire → KASM starts container → kasm_start_agent.sh
  → seed-agent-workspace.js   ← writes SOUL.md, AGENTS.md, IDENTITY.md, USER.md
  → start gateway + bridge
```

Content comes from hire env: `AGENT_ROLE`, `AGENT_ID`, `SPONSOR_NAME`, `SKILLS`, etc.

**Also written:** `USER.md` (who hired the agent).

**Removed if present:** `BOOTSTRAP.md` (OpenClaw onboarding file that causes name/vibe/emoji questions).

---

## 10. Where are those files stored?

Inside the KASM container:

```
/home/kasm-user/.openclaw/workspace/
├── AGENTS.md
├── IDENTITY.md
├── SOUL.md
├── USER.md
├── skills/          ← ClawHub skills installed here
└── (no BOOTSTRAP.md after seeding)
```

- Configured in `openclaw.json` → `agents.defaults.workspace`
- Live **inside the container**, not on your Mac
- **Recreated** on each new hire/session when startup runs again

**Check inside KASM:**

```bash
ls -la ~/.openclaw/workspace/
cat ~/.openclaw/workspace/SOUL.md
```

---

## 11. Purpose of each workspace file

OpenClaw **loads these into the agent’s context** on every chat turn. They tell the AI **who it is** and **how to behave**.

| File | Simple purpose | Example content |
|------|----------------|-----------------|
| **IDENTITY.md** | Name, vibe, emoji | “Name: Marketing Researcher, Emoji: 📊” |
| **SOUL.md** | Persona and role | “You are Marketing Researcher, agent_id=…” |
| **AGENTS.md** | Rules / operating instructions | “Don’t run onboarding; answer the task directly” |
| **USER.md** | Who the user/sponsor is | Sponsor name from hire form |

**Without these files**, OpenClaw may run its **bootstrap ritual** and ask “What should I call you? Pick my vibe, emoji…” instead of doing the hired job.

**With TeamBots seeding + `skipBootstrap: true`**, the agent should behave as the hired role immediately.

---

## 12. Why is the webhook URL different from the bridge URL?

They serve **different directions** and **different services**.

| Setting | Example | Direction | Port | Service |
|---------|---------|-----------|------|---------|
| **`TEAMBOTS_WEBHOOK_BASE`** | `http://192.168.64.1:4000` | Container → **Mac** | 4000 | Node **backend** |
| **`KASM_BRIDGE_URL`** | `http://192.168.64.3:3100` | **Mac** → KASM VM | 3100 | **TeamBots bridge** |

```
Mac (backend :4000)                    KASM VM (bridge :3100)
192.168.64.1  ◄──── webhook ────  192.168.64.3
              ──── chat ────────►
```

| Event | URL used |
|-------|----------|
| Container says “I’m ready” | `{TEAMBOTS_WEBHOOK_BASE}/webhooks/agent-ready` |
| User sends chat message | `{KASM_BRIDGE_URL}/chat` |

**They are not interchangeable** — each machine must use an address that works **from its side of the network**.

---

## 13. My KASM VM is 192.168.64.3 — why use 192.168.64.1 for webhook?

**`.3` and `.1` are different machines on the same virtual network.**

Typical UTM `192.168.64.0/24` layout:

| IP | Usually is |
|----|------------|
| **192.168.64.1** | **Your Mac** (host / default gateway from VM) |
| **192.168.64.3** | **KASM VM** (where Docker/containers run) |

So:

- **`KASM_BRIDGE_URL=…192.168.64.3:3100`** — correct: Mac reaches the KASM VM where the bridge is published.
- **`TEAMBOTS_WEBHOOK_BASE=…192.168.64.1:4000`** — correct: container reaches the **Mac** where the backend runs.

The IP does **not change** between webhook and bridge — you always need **two different targets**.

**Find the right webhook IP from inside the container:**

```bash
ip route show default
# Gateway IP → use for TEAMBOTS_WEBHOOK_BASE

curl -s http://<that-ip>:4000/health
# Should return HTTP 200
```

If `.1` does not work on your network, use whatever IP successfully reaches your Mac backend from inside the container.

---

## 14. Why is ClawHub not installed in the Docker image?

**ClawHub is the skill catalog** ([clawhub.ai/skills](https://clawhub.ai/skills)). **OpenClaw** is installed in the image and can **download skills from ClawHub** at runtime.

The Dockerfile installs **OpenClaw 2026.6.1**, not every skill pre-baked.

**Skills are installed when each session starts:**

```bash
openclaw skills install summarize
openclaw skills install invoice
```

Triggered by `kasm_start_agent.sh` using the `SKILLS` env var from hire (from `agentProfiles.js`).

**Why runtime install instead of bake into image?**

| Reason | Explanation |
|--------|-------------|
| One image, many roles | Marketing needs `summarize`; Invoice needs `invoice` — different skills per hire |
| Smaller image | Don’t download all skills for all roles at build time |
| Per-hire config | Only install what that agent profile needs |
| Updates | ClawHub skills can update without rebuilding the image |

**Where skills land:**

```
~/.openclaw/workspace/skills/
```

**If install fails** (e.g. `WARN: skill install failed for summarize`):

- Startup continues — basic chat can still work
- Check `~/.teambots/logs/skill-install.log`
- Verify skill slug matches ClawHub
- Container needs internet at startup

**Optional:** You *could* bake common skills into the Dockerfile, but then every agent gets them and you lose per-role flexibility.

---

## 15. Quick reference tables

### Tokens

| Token | Created | Stored (container) | Stored (backend) | Protects |
|-------|---------|-------------------|------------------|----------|
| bridgeToken | Hire | `TEAMBOTS_TOKEN` env | `registry.bridgeToken` | Bridge `/chat`, webhook |
| Gateway token | Startup | `~/.teambots/token` | *(not stored)* | OpenClaw `:18789` |

### URLs

| Variable | Points to | Used for |
|----------|-----------|----------|
| `TEAMBOTS_WEBHOOK_BASE` | Mac backend `:4000` | `agent-ready` webhook |
| `KASM_BRIDGE_URL` | KASM VM `:3100` | Chat `POST /chat` |
| `KASM_BASE_URL` | KASM API (HTTPS) | Hire, destroy, keepalive |

### Workspace files

| File | Written by | Location |
|------|------------|----------|
| AGENTS.md | `seed-agent-workspace.js` | `~/.openclaw/workspace/` |
| SOUL.md | `seed-agent-workspace.js` | `~/.openclaw/workspace/` |
| IDENTITY.md | `seed-agent-workspace.js` | `~/.openclaw/workspace/` |
| USER.md | `seed-agent-workspace.js` | `~/.openclaw/workspace/` |
| openclaw.json | `generate-openclaw-config.js` | `~/.openclaw/` |

### Logs to check

| Log | Location | Shows |
|-----|----------|-------|
| `bridge.log` | `~/.teambots/logs/` (container) | Chat requests/responses |
| `startup.log` | `~/.teambots/logs/` (container) | Gateway/bridge startup |
| `chat.log` | `backend/logs/` (Mac) | Backend → bridge chat calls |
| `webhook.log` | `backend/logs/` (Mac) | agent-ready callbacks |

---

## Related documentation

- [WORKFLOW.md](./WORKFLOW.md) — Full architecture, port mapping, setup checklist
- [README.md](./README.md) — Quick start and troubleshooting

---

*This FAQ reflects the TeamBots OpenClaw KASM port-mapping architecture (`teambots-openclaw-claude-version`).*
