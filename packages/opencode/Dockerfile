FROM opencode:latest

ENV TZ=Asia/Shanghai

# Set system timezone
RUN ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime

# ── Build a self-contained plugin bundle ───────────────────────────────
# The build context is packages/opencode/ (set by docker-compose.yml).
# We bundle src/plugins/openimago.ts into a single self-contained JS file
# with `bun build`. All relative imports (tools, lib) AND npm dependencies
# — including @opencode-ai/plugin (an unpublished dev build that cannot be
# `bun install`ed at runtime), effect, openai, @fal-ai/client, @google/genai
# and zod — are inlined. Only Node built-ins stay external. This removes
# the previous startup `bun install` step that failed to resolve the
# unpublished @opencode-ai/plugin dev version.
WORKDIR /tmp/opencode-build
COPY package.json tsconfig.json tsconfig.build.json ./
COPY src/ ./src/
RUN bun install && bun run build

# ── Copy the bundled plugin as the runtime plugin ──────────────────────
# OpenCode auto-discovers /root/.config/opencode/plugins/*.js.
# The bundle is fully self-contained, so no node_modules / package.json /
# `bun install` is needed in the config directory.
RUN mkdir -p /root/.config/opencode/plugins
RUN cp /tmp/opencode-build/dist/plugins/openimago.js /root/.config/opencode/plugins/openimago.js

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
