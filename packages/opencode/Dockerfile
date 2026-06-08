FROM opencode:latest

ENV TZ=Asia/Shanghai

# Set system timezone
RUN ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime

# ── Build plugin project (TypeScript → JS) ─────────────────────────────
# The build context is packages/opencode/ (set by docker-compose.yml).
# We compile src/ into dist/ using Bun's tsc, then copy the whole
# compiled tree to /root/.config/opencode/.  This preserves relative
# imports so plugins, tools, and lib modules all resolve correctly
# without hand-copying each individual module.
WORKDIR /tmp/opencode-build
COPY package.json tsconfig.json tsconfig.build.json ./
COPY src/ ./src/
RUN bun install --production && bun run build

# ── Install runtime dependencies in config directory ───────────────────
# OpenCode runs "bun install" in /root/.config/opencode/ at startup to
# install plugin dependencies.  We pre-seed it during image build.
COPY package.json /root/.config/opencode/package.json

# ── Copy compiled output as runtime plugins ────────────────────────────
# OpenCode auto-discovers /root/.config/opencode/plugins/*.js.
# The whole dist/ tree is copied so relative imports between
# plugins ← tools ← lib resolve without extra wiring.
RUN mkdir -p /root/.config/opencode/plugins
RUN cp -r /tmp/opencode-build/dist/* /root/.config/opencode/

# ── Config ─────────────────────────────────────────────────────────────
COPY opencode.json /root/.config/opencode/opencode.json

# ── Clean up build directory ───────────────────────────────────────────
RUN rm -rf /tmp/opencode-build

# ── Python environment (for agent Python scripts) ──────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        python3-venv \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/* \
    && curl -LsSf https://astral.sh/uv/install.sh | UV_INSTALL_DIR=/usr/local/bin sh \
    && python3 --version \
    && uv --version

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
