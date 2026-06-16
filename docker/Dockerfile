# =============================================================================
# docker/Dockerfile
#
# Builds the TeamBots + OpenClaw image on top of the official KASM base.
#
# Build (from project root):
#   docker buildx build \
#     -f docker/Dockerfile \
#     --platform linux/amd64,linux/arm64 \
#     --tag yourdockerhubuser/teambots-openclaw:latest \
#     --push .
# =============================================================================

FROM kasmweb/core-ubuntu-jammy:1.17.0

# ── System deps ───────────────────────────────────────────────────────────────
USER root

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    jq \
    python3 \
    python3-pip \
    openssl \
    xterm \
    wkhtmltopdf \
    && rm -rf /var/lib/apt/lists/*

# ── Node.js 22 ────────────────────────────────────────────────────────────────
# OpenClaw 2026.6.1 requires Node >= 22.19. Node 20 makes `openclaw` refuse to
# run ("Node.js v22.19+ is required").
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# ── OpenClaw ──────────────────────────────────────────────────────────────────
# Install OpenClaw globally so `openclaw` is on PATH.
# IMPORTANT: pin the version. The npm `latest` dist-tag for `openclaw` points to
# a stale 0.0.1 placeholder that ships NO `openclaw` binary. The real CLI is
# published under calendar versions (see github.com/openclaw/openclaw/releases).
ARG OPENCLAW_VERSION=2026.6.1
RUN npm install -g "openclaw@${OPENCLAW_VERSION}" \
    && node --version \
    && openclaw --version

# ── Project files ─────────────────────────────────────────────────────────────
WORKDIR /opt/teambots_openclaw

# Copy bridge and install its deps
COPY bridge/ ./bridge/
RUN cd bridge && npm install --production

# Copy scripts and startup files
COPY scripts/          ./scripts/
COPY bridge/openclaw_models.js ./openclaw_models.js
COPY kasm_start_agent.sh ./kasm_start_agent.sh
COPY custom_startup.sh   ./custom_startup.sh

# Make scripts executable
RUN chmod +x \
    kasm_start_agent.sh \
    custom_startup.sh \
    scripts/test-bridge.sh \
    scripts/test-bridge-invoice.sh \
    scripts/kasm-diagnose.sh \
    scripts/kasm-cleanup-sessions.sh

# ── KASM custom startup hook ───────────────────────────────────────────────────
# KASM runs $STARTUPDIR/custom_startup.sh if it exists
RUN cp /opt/teambots_openclaw/custom_startup.sh "${STARTUPDIR}/custom_startup.sh" \
    && chmod +x "${STARTUPDIR}/custom_startup.sh"

# Runtime dirs for kasm-user. OpenClaw/npm may create ~/.openclaw as root during
# image build or on persistent profiles — pre-create with correct ownership so
# kasm_start_agent.sh can write openclaw.json at hire time.
RUN mkdir -p /home/kasm-user/.openclaw /home/kasm-user/.teambots/logs /home/kasm-user/.teambots/artifacts \
    && chown -R 1000:1000 /home/kasm-user/.openclaw /home/kasm-user/.teambots \
    && chown -R 1000:1000 /opt/teambots_openclaw

# ── Switch back to KASM default user ─────────────────────────────────────────
USER 1000

WORKDIR /home/kasm-user

# Expose bridge port. Publish it to the KASM VM host via the workspace
# Docker Run Config Override: {"ports": {"3100/tcp": 3100}}
EXPOSE 3100
