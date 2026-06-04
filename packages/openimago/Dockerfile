# ---- openimago Backend (Bun + Hono) ----
FROM oven/bun:1

WORKDIR /app

# The backend package does not depend on other workspace packages,
# so we can install it independently.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Expose default port
EXPOSE 5467

ENTRYPOINT ["bun", "run", "index.ts"]
