FROM opencode:latest

ENV TZ=Asia/Shanghai

# Set system timezone
RUN ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime

# Config → /root/.config/opencode/
COPY opencode.json /root/.config/opencode/opencode.json

# Python environment (for agent Python scripts)
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
