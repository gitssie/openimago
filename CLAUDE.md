
Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```sh
bun test --cwd packages/openimago
```

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Project Structure

```
openimago/
├── packages/
│   ├── openimago/       ← 后端 (Bun + Hono + Effect + Drizzle)
│   │   ├── src/
│   │   ├── tests/
│   │   ├── index.ts
│   │   └── package.json
│   └── web/             ← 前端 (Vue 3 + Vite + Quasar CLI)
│       └── package.json
├── docs/
├── CLAUDE.md
├── CONTEXT.md
└── package.json         ← workspace root
```

## Running

```sh
# Install all workspace deps
bun install

# Dev: backend (from project root)
bun --hot ./packages/openimago/index.ts

# Dev: frontend (from packages/web/)
cd packages/web && bun run dev

# Test backend
bun test --cwd packages/openimago
```

## Frontend

Vue 3 + Vite + Quasar CLI SPA in `packages/web/`.

- Dev: Vite dev server proxies `/api` → Hono backend at `http://localhost:8080`
- Prod: `bun run build` in packages/web/ → Hono serves static files from dist/

## Backend

Bun + Hono + Effect + Drizzle ORM + PostgreSQL in `packages/openimago/`.

## Agent skills

### Issue tracker

Beads (`bd` CLI), Dolt-backed graph issue tracker, data in `.beads/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Mapped to beads status: `○` open=needs-triage, `●` blocked=needs-info, `○` open=ready-for-agent/human, `❄` deferred=wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at repo root + `docs/adr/`. See `docs/agents/domain.md`.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.
