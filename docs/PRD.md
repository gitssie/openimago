# openimago — OpenCode AI 前置路由管理系统 PRD

## Problem Statement

OpenCode 是一个强大的 AI Agent 引擎，但它是一个面向单用户的工具 — 没有用户管理、多租户隔离、项目组织能力。当企业需要让多个用户共享同一个 OpenCode 服务时，缺少一个前置管理平台来做用户认证、权限控制、工作空间隔离和会话路由。

当前 OpenCode 仅提供 Basic Auth（单组 username/password），没有用户模型、没有多用户数据隔离、没有项目/工作空间概念。团队需要一个管理平台来：

- 多用户接入共享 OpenCode 服务
- 每个用户的数据严格隔离
- 用户可以创建项目（共享工作目录），在项目内进行多次 AI 会话
- 平台统一管理 LLM API Key、计费、使用量

## Solution

构建一个独立的前置管理平台（Platform），部署在 OpenCode 之前，作为反向代理和用户管理入口。

架构：

```
用户浏览器 → Platform (TS+Effect+Bun) → 反向代理 → OpenCode 容器 (:3000)
              │                                    │
              ├─ /auth/*           平台自管         ├─ 共享 PostgreSQL
              ├─ /api/platform/*   平台自管         └─ 共享 /mnt/cos (volume)
              └─ /api/*            透传 OpenCode
                                   自动注入 ?directory=&workspace=
```

核心设计：

- **平台自建前端 UI**，不嵌入 OpenCode UI，只调 OpenCode API
- **共享进程模型** — 一个 OpenCode 容器服务所有用户，通过 workspaceId + directory 隔离
- **共享 PostgreSQL** — Platform 和 OpenCode 共用同一数据库，Platform 可以直接查询 OpenCode 的 `session` 表
- **共享 Volume** — `/mnt/cos` 目录通过容器 volume 共享，Platform 负责目录创建/注册，OpenCode 使用
- **SSE 透传** — Platform 代理 OpenCode 的 SSE 端点，透传 `directory`/`workspace` 参数，不做额外过滤

## User Stories

1. As a platform admin, I want to register a new user account, so that users can access the AI platform
2. As a platform user, I want to log in with email/password, so that I can securely access my workspace
3. As a platform user, I want to log in with GitHub OAuth, so that I don't need to remember another password
4. As a platform user, I want to create a project, so that I can organize my AI conversations around a topic
5. As a platform user, I want to start a new AI conversation within a project, so that I can ask questions in context of my project files
6. As a platform user, I want to start a new independent AI conversation (no project), so that I can quickly ask a standalone question
7. As a platform user, I want to see all my conversations (across all projects), so that I can find past work
8. As a platform user, I want to see conversations within a specific project, so that I can focus on project-related work
9. As a platform user, I want to receive real-time SSE events for my active conversation, so that I can see streaming AI responses
10. As a platform user, I want to archive a project, so that I can clean up my workspace without losing data
11. As a platform user, I want to archive a conversation, so that I can declutter my history
12. As a platform user, I want to view and manage my account settings, so that I can update my profile
13. As a platform admin, I want to view all users on the platform, so that I can manage access
14. As a platform admin, I want to assign admin role to users, so that I can delegate management
15. As a platform admin, I want the platform to probe OpenCode health, so that I can detect service outages
16. As a developer, I want to deploy Platform and OpenCode as separate containers, so that I can scale and maintain them independently
17. As a developer, I want Platform to forward all OpenCode API requests transparently, so that OpenCode's full API surface is available to the frontend
18. As a platform user, I want SSE events scoped to my workspace/userId, so that I only see events relevant to me
19. As a platform user, I want to upload files to my project working directory through the platform, so that OpenCode can read them as context
20. As a platform admin, I want to configure a global LLM provider key, so that all users share the same provider without managing individual keys

## Implementation Decisions

### 1. Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript + Effect (matching OpenCode's stack)
- **HTTP Framework**: Hono (for reverse proxy, SSE passthrough, middleware)
- **Database**: PostgreSQL (shared with OpenCode)
- **ORM**: Drizzle ORM (matching OpenCode)
- **Auth**: JWT + OAuth (via community library)
- **Deployment**: Docker Compose (Platform + OpenCode + PostgreSQL)

### 2. Database Schema

#### Users Table (platform-managed)

```sql
users
  id              text PRIMARY KEY     -- 即 userId，同时也是 workspaceId
  username        text NOT NULL UNIQUE
  display_name    text
  email           text UNIQUE
  password_hash   text
  role            text NOT NULL DEFAULT 'user'  -- 'admin' | 'user'
  created_at      timestamptz
  updated_at      timestamptz
```

#### User Auths Table (multi-provider login)

```sql
user_auths
  id            text PRIMARY KEY
  user_id       text NOT NULL REFERENCES users(id)
  provider      text NOT NULL  -- 'password' | 'github' | 'google'
  provider_id   text           -- OAuth provider user ID, null for password
  password_hash text           -- only for provider='password'
  created_at    timestamptz

  UNIQUE(user_id, provider)
```

#### Projects Table (platform-managed)

```sql
projects
  id              text PRIMARY KEY    -- 目录名 proj_xxx
  user_id         text NOT NULL REFERENCES users(id)
  name            text NOT NULL
  description     text
  full_path       text NOT NULL UNIQUE  -- /mnt/cos/{id}
  status          text NOT NULL DEFAULT 'active'  -- 'active' | 'archived'
  created_at      timestamptz
  updated_at      timestamptz
```

#### Work Dirs Table (directory registry)

```sql
work_dirs
  id            text PRIMARY KEY       -- 目录名 dir_xxx
  user_id       text NOT NULL REFERENCES users(id)
  project_id    text REFERENCES projects(id)  -- null if independent session
  type          text NOT NULL           -- 'project' | 'session'
  full_path     text NOT NULL UNIQUE    -- /mnt/cos/{id}
  status        text NOT NULL DEFAULT 'active'  -- 'active' | 'archived'
  created_at    timestamptz
  updated_at    timestamptz
```

#### OpenCode's Session Table (leveraged, not duplicated)

Platform queries OpenCode's `session` table directly (shared PG) with filters:
```sql
WHERE workspace_id = :userId
  AND directory = :fullPath   -- for project-scoped queries
```

### 3. Routing Design

**核心原则：前端不传递 directory, directory 是 openimago 后端统一处理的。前端只关心 userId 和 projectId。**

| 类别 | 前端请求 | openimago 处理 |
|------|---------|---------------|
| **平台自管** | `POST /auth/login` | 验证密码，签发 JWT |
| | `POST /auth/register` | 创建用户，返回 JWT |
| | `POST /auth/oauth/:provider` | OAuth 流程 |
| | `GET /api/platform/projects` | 查 projects 表，返回用户的项目列表 |
| | `POST /api/platform/projects` | 创建项目：生成 proj_id → mkdir → 插入 projects + work_dirs |
| | `DELETE /api/platform/projects/:id` | 设置 status = archived |

| **需目录+转发** | `POST /api/platform/sessions` | 解析 body.projectId → 确定目录（已有或新建）→ mkdir(如需要) → 注册 work_dirs → 转发 OpenCode POST /session?workspace=userId&directory=... → 返回结果给前端 |
| | `POST /api/session/:id/prompt` | 查 session 表拿 directory → 转发 OpenCode POST /api/session/:id/prompt?workspace=userId&directory=... |
| | `GET /api/event` | 转发 OpenCode GET /event?workspace=userId（directory 由 workspace 过滤即可） |

| **仅需 workspace** | `GET /api/session` | 转发 OpenCode GET /api/session?workspace=userId |
| | `GET /api/session/:id/message` | 转发 OpenCode GET /api/session/:id/message?workspace=userId |
| | `POST /api/session/:id/wait` | 转发 OpenCode POST /api/session/:id/wait?workspace=userId |

| **透传（无注入）** | `GET /health` | 直接转发或平台自检 |
| | `GET /global/event` | 转发 OpenCode GET /global/event |

**directory 决定规则（后端统一处理，前端不传）：**

```
POST /api/platform/sessions (新会话)
  → body 有 projectId
      查 projects 表拿到 fullPath → 目录已存在，直接使用
  → body 无 projectId
      生成 dir_uuid → mkdir -p /mnt/cos/{dir_uuid} → 使用新目录

POST /api/session/:id/prompt (发消息)
  → 从 session 表查该 session 的 directory 字段
  → 注入 ?directory=... 转发

GET /api/event (SSE)
  → 不传 directory, 只传 ?workspace=userId
  → OpenCode 自身按 workspace 过滤事件
```

### 4. Directory Lifecycle (Complete Flow)

This is the most critical logic in openimago. Every request that reaches OpenCode MUST have a valid, existing `directory` — OpenCode's `InstanceStore.load()` calls `Project.fromDirectory()` which does `fs.up({ targets: [".git"], start: directory })` and will fail if the path doesn't exist.

#### 4.1 When Directories Are Created

There are exactly two scenarios:

**Scenario A: Project Created** — directory is created once, persists forever
```
用户 POST /api/platform/projects { name: "AI 视频" }
  → openimago:
      1. 生成 proj_id = "proj_" + nanoid
      2. mkdir -p /mnt/cos/{proj_id}
      3. INSERT INTO projects (id, user_id, name, full_path, status) VALUES (...)
      4. INSERT INTO work_dirs (id, user_id, type, project_id, full_path, status) VALUES (...)
      5. 返回 { project: { id, fullPath: "/mnt/cos/{proj_id}", ... } }
```

**Scenario B: Independent Session Started** — directory created per session
```
用户 POST /api/platform/sessions (没有 projectId)
  → openimago:
      1. 生成 dir_id = "dir_" + nanoid
      2. mkdir -p /mnt/cos/{dir_id}
      3. INSERT INTO work_dirs (id, user_id, type, full_path, status) VALUES (...)
      4. 返回 { workDir: { id, fullPath: "/mnt/cos/{dir_id}", ... } }

用户 POST /api/platform/sessions { projectId: "proj_abc" }
  → openimago:
      1. 验证 projectId 存在且属于当前用户 (SELECT FROM projects WHERE id = ? AND user_id = ?)
      2. 查到 project.fullPath = "/mnt/cos/proj_abc" (目录已存在, 不创建)
      3. INSERT INTO work_dirs (id, user_id, type, project_id, full_path, status) VALUES (...)
      4. 返回 { workDir: { fullPath: "/mnt/cos/proj_abc", ... } }
```

#### 4.2 How Directory Reaches Every Request

用户前端拿到 `fullPath` 后，所有后续 API 请求都用它：

```
前端请求 GET /api/session
  → openimago 拦截:

      1. 解析 JWT → userId
      2. 解析请求中的 directory 参数（来自前端，或从 work_dirs 查）
      3. 如果前端没传 directory → 从 work_dirs 取用户最近的活跃目录
      4. 验证 directory 属于该用户（SELECT FROM work_dirs WHERE full_path = ? AND user_id = ?）
      5. 构建目标 URL: http://opencode:3000/session
         + "?directory=" + encodeURIComponent(directory)
         + "&workspace=" + encodeURIComponent(userId)
      6. 添加 Basic Auth header
      7. 转发请求（GET/POST/PUT/DELETE/WebSocket）
      8. 流式返回 OpenCode 的 response body
```

#### 4.3 Key Rules

| Rule | Description |
|------|-------------|
| **Create before use** | Any directory referenced in `?directory=` MUST already exist on disk. openimago calls `mkdir -p` before the first reference. |
| **Ownership check** | Every proxied request MUST verify the directory belongs to the requesting user (query `work_dirs` table). |
| **Project sessions reuse directory** | Multiple sessions in the same project share ONE directory (`/mnt/cos/{proj_id}`). No new `mkdir`. |
| **Independent sessions get their own directory** | Each gets a unique `dir_` directory. |
| **No physical deletion** | Directories are never `rm -rf`. Only soft-delete via `status = 'archived'`. |
| **Two isolation layers** | `directory` isolates file context; `workspace_id=userId` isolates data in `session` table queries. Both are injected on every proxy request. |

#### 4.4 Directory ↔ Session Relationship

```
┌─────────────────────────────────────────────────┐
│                  work_dirs                       │
├──────────┬────────┬─────────────────────────────┤
│ type     │ 目录    │ 对应 OpenCode session 数     │
├──────────┼────────┼─────────────────────────────┤
│ project  │ 1 个   │ N 个 session 共享此目录       │
│ session  │ 1 个   │ 1 个 session 使用此目录       │
└──────────┴────────┴─────────────────────────────┘

Session 查询：
  -- 查 project 下所有 session
  SELECT * FROM session
  WHERE workspace_id = 'user_xxx'
    AND directory = '/mnt/cos/proj_abc'

  -- 查用户最近活跃的 session
  SELECT * FROM session
  WHERE workspace_id = 'user_xxx'
  ORDER BY time_created DESC
  LIMIT 20
```

### 6. SSE Passthrough

Platform proxies `/api/event` directly to OpenCode's `/event` endpoint:
- Passthrough the `?directory=` and `?workspace=` query parameters
- No server-side filtering by Platform — OpenCode's SSE internally filters by directory/workspace
- Stream response directly to the browser (text/event-stream)

### 7. Authentication Model

- **User → Platform**: JWT token (contains userId, role, exp)
- **Platform → OpenCode**: Shared Basic Auth credentials (configured via env vars)
- Platform validates JWT on every request, extracts userId, injects `?workspace=userId` when proxying

### 8. OpenCode Integration

- All OpenCode API endpoints are proxied through `/api/*`
- Platform never needs to modify OpenCode source code
- OpenCode's existing `WorkspaceRoutingMiddleware` handles `?directory=` and `?workspace=` natively
- Platform configures OpenCode with `OPENCODE_SERVER_USERNAME` / `OPENCODE_SERVER_PASSWORD` for system-level auth

### 9. Project ID in OpenCode

All sessions in this deployment will have `project_id = 'global'` (the default sentinel) since working directories are not git repositories. Data isolation is achieved through `workspace_id` and `directory` field filtering. If future requirements need custom project IDs, a small OpenCode-side extension to accept `?project=` query param would be needed.

### 10. LLM Provider Management

Phase 1: Platform configures a single global LLM provider key (set via OpenCode's environment variables or config). All users share the same provider configuration. Token usage counting leverages OpenCode's built-in `tokens_input` / `tokens_output` fields on the session table.

### 11. Deployment Topology

```
docker-compose.yml:
  services:
    postgres:
      image: pg
      volumes: pgdata
    opencode:
      build: ./opencode
      command: opencode serve
      environment:
        OPENCODE_SERVER_USERNAME: ...
        OPENCODE_SERVER_PASSWORD: ...
        DATABASE_URL: postgres://...
      volumes:
        - cos_data:/mnt/cos
    platform:
      build: ./platform
      ports: ["5467:5467"]
      environment:
        DATABASE_URL: postgres://...
        OPENCODE_URL: http://opencode:3000
        OPENCODE_AUTH: basic:...
      volumes:
        - cos_data:/mnt/cos
volumes:
  cos_data:
```

## Modules

### Platform Modules (to be built)

| Module | Responsibility | Deep/Shallow |
|--------|---------------|-------------|
| `auth/` | JWT issue/verify, password hashing, OAuth callbacks | Shallow — standard auth patterns |
| `user/` | User CRUD, user_auths management | Shallow — standard CRUD |
| `project/` | Project + work_dirs CRUD | Shallow — standard CRUD |
| `proxy/` | Reverse proxy core: routing, directory injection, SSE passthrough | Deep — encapsulates OpenCode proxy protocol, testable with mock OpenCode |
| `server/` | App bootstrap, middleware composition, health check | Shallow — assembly only |
| `db/` | Drizzle schema, migrations | Standard |

The **proxy module** is the deepest and most valuable to test in isolation — it encodes the rules for directory injection, workspace passthrough, and SSE streaming.

### OpenCode Modules (leveraged, not modified)

| Module | How Platform Uses It |
|--------|---------------------|
| `server/httpapi/` | Routes proxied through `/api/*` |
| `session/session.sql.ts` | Session table read by Platform for listing |
| `server/routes/.../workspace-routing.ts` | Handles `?directory=` / `?workspace=` natively |
| `server/routes/.../event.ts` | SSE endpoint proxied by Platform |

## Testing Decisions

### What Makes a Good Test

- Test external behavior only (API contract, not internal implementation)
- Use real HTTP requests against the Platform server (Hono's `app.fetch` makes this trivial)
- For proxy tests: use a mock OpenCode backend (simple Bun server that echoes request info)
- Database tests: use testcontainers-postgres or in-memory SQLite via Drizzle's `libsql` driver

### Modules to Test

| Module | What to Test | Prior Art |
|--------|-------------|-----------|
| `auth/` | Login success/failure, JWT expiry, OAuth redirect | Standard API auth tests |
| `proxy/` | Directory injection on forwarded request, workspace query passthrough, SSE stream forwarding, auth rejection if no JWT | OpenCode's own `workspace-routing.ts` tests would be similar (Hono request/response testing) |
| `project/` | CRUD operations, directory creation, user isolation (user A can't see user B's projects) | Standard CRUD + Drizzle tests |

### Test Approach

- Unit tests: Effect functions that transform request configs
- Integration: `app.fetch()` with mock OpenCode backend
- No e2e tests in phase 1

## Out of Scope

- OpenCode source code modifications — Platform works as an external reverse proxy
- Per-user LLM API keys (BYOK) — Phase 2
- Rate limiting / resource quotas — Phase 2
- Audit logging — Phase 2
- Multi-node Platform scaling — Phase 2
- Real-time multi-user collaboration on same session — Phase 2
- Custom provider management UI — Phase 2
- Workflow / pipeline / scheduled tasks — Phase 2
- OpenCode UI embedding or iframe — not planned; Platform has own frontend

## Further Notes

### Glossary (CONTEXT.md)

Terms established during the design process:

- **Platform**: The management system being built. Handles auth, projects, directory lifecycle, and reverse proxy to OpenCode.
- **OpenCode**: The AI agent engine. Runs as a shared backend service.
- **User**: A person with a platform account. Has `userId` which doubles as `workspaceId` for OpenCode data isolation.
- **Project**: A user-created named work space. Has a persistent directory at `/mnt/cos/{projectId}`. Multiple sessions can share the same project directory.
- **Session (OpenCode)**: An AI conversation record in OpenCode's `session` table. Created by OpenCode when a prompt is sent. Has `directory`, `workspace_id`, `project_id` fields.
- **WorkDir**: Platform's registry table (`work_dirs`) mapping user/project to filesystem directories. Tracks who owns which directory.
- **workspaceId**: OpenCode's built-in multi-tenant isolation field. Platform sets `workspaceId = userId` on every proxied request.
- **directory**: The filesystem working directory passed to OpenCode. `/mnt/cos/{id}`. Must exist before any OpenCode API call.
- **SSE Passthrough**: Platform forwards OpenCode's Server-Sent Events stream without additional filtering — OpenCode natively filters by `directory` and `workspace`.

### Key Design Rationale

- **No OpenCode modification**: All isolation is achieved through OpenCode's existing `directory` and `workspaceId` mechanism. Platform only injects these parameters.
- **No platform_sessions table**: OpenCode's `session` table is sufficient. Platform queries it directly via shared PostgreSQL.
- **Soft-delete only**: Directories and project records are archived, never physically deleted. Simplifies lifecycle management.
- **Single OpenCode container**: Keeps resource usage low (GPU memory, context cache). Adequate for moderate user counts.

---

## OpenCode Internal Reference

This section maps every OpenCode source file and function that the Platform interacts with. A coder agent implementing this PRD should read these files to understand the exact integration points.

### Key File Index (all paths relative to `packages/opencode/src/`)

| File | Relevance | What Platform Needs From It |
|------|-----------|---------------------------|
| `server/server.ts` | OpenCode HTTP bootstrap | Understand how OpenCode listens; not directly used by Platform |
| `server/auth.ts` | OpenCode auth | Platform uses shared Basic Auth credentials when proxying — read `required()` and `authorized()` |
| `server/cors.ts` | CORS config | Not needed; Platform handles CORS |
| `server/routes/instance/httpapi/server.ts` | Route assembly | Main route tree — understand what routes exist |
| `server/routes/instance/httpapi/api.ts` | API groups | All API group definitions: RootHttpApi, InstanceHttpApi, OpenCodeHttpApi |
| `server/routes/instance/httpapi/middleware/workspace-routing.ts` | **CRITICAL** | How OpenCode reads `?directory=` / `?workspace=` — this is the core integration point |
| `server/routes/instance/httpapi/middleware/instance-context.ts` | **CRITICAL** | How directory resolves into InstanceContext and WorkspaceRef |
| `server/routes/instance/httpapi/middleware/authorization.ts` | Auth | How OpenCode validates Basic Auth on proxied requests |
| `server/routes/instance/httpapi/event.ts` | SSE | Instance SSE endpoint — Platform proxies this |
| `server/routes/instance/httpapi/handlers/global.ts` | SSE | Global SSE endpoint — Platform may proxy this |
| `server/routes/instance/httpapi/groups/v2/session.ts` | API defs | V2 session API route definitions (list, prompt, compact, wait, context) |
| `server/routes/instance/httpapi/handlers/v2/session.ts` | Handlers | V2 session handler implementations |
| `server/routes/instance/httpapi/groups/session.ts` | API defs | Legacy session API routes (create, list, etc.) — older but has create endpoint |
| `session/session.sql.ts` | **CRITICAL** | DB schema: SessionTable, MessageTable, PartTable — Platform queries these directly |
| `session/session.ts` | Business logic | Session create/get/list/remove logic — read `createNext()` and `create()` to understand what happens when Platform proxies |
| `session/schema.ts` | Types | SessionID, MessageID branded types |
| `session/prompt.ts` | Prompt engine | 2139-line file handling AI prompts; not directly used, but good to know flow |
| `v2/session.ts` | V2 session service | V2Session service (create is stub, list/messages are implemented) |
| `project/project.ts` | Project discovery | `fromDirectory()` — determines how directory resolves to project_id |
| `project/project.sql.ts` | Project DB schema | For reference — Platform won't write to this table |
| `project/instance-store.ts` | Instance loading | How `provide()` loads per-directory instance context |
| `project/instance-context.ts` | Context type | InstanceContext = { directory, worktree, project } |
| `effect/instance-state.ts` | **CRITICAL** | How workspaceID is read per-request — `InstanceState.workspaceID` |
| `effect/instance-ref.ts` | Context refs | `WorkspaceRef` Context.Reference — how workspaceId flows in Effect context |
| `control-plane/workspace.sql.ts` | Workspace table | For reference only |
| `control-plane/workspace-context.ts` | Workspace context | `WorkspaceContext.workspaceID` — fallback for workspaceID resolution |
| `bus/` | Event bus | Not directly used by Platform, but SSE endpoints depend on it |

### Critical Code Paths

#### Path A (FULL): openimago 目录解析 → 注入 → OpenCode 内部处理

**此流程因路由类型而异，不是所有请求都走完整路径。**

```
═══ A1: POST /api/platform/sessions（新建对话，需目录创建）══════════════

用户前端 POST /api/platform/sessions { projectId?: string }
  │
  ├─ openimago 解析 JWT → userId
  │
  ├─ 判断是否有关联 projectId:
  │   ├─ 有: 查 projects 表 → project.fullPath (目录已存在, 跳过 mkdir)
  │   └─ 无: 生成 dir_uuid → mkdir -p /mnt/cos/{dir_uuid}
  │            → 插入 work_dirs (user_id, type='session', full_path)
  │
  ├─ 转发到 OpenCode:
  │     POST http://opencode:3000/session
  │     ?directory=/mnt/cos/{dir}
  │     &workspace={userId}
  │     Authorization: Basic ...
  │     body 原样透传
  │
  ╰─ OpenCode 返回 session 记录 → openimago 返回给前端
     (session.directory = /mnt/cos/{dir})

═══ A2: POST /api/session/:id/prompt（发消息，需目录注入）═══════════════

用户前端 POST /api/session/:id/prompt { prompt: {...} }
  │
  ├─ openimago 解析 JWT → userId
  │
  ├─ 查 session 表（共享 PG）:
  │     SELECT directory FROM session WHERE id = :sessionId
  │
  ├─ 转发到 OpenCode:
  │     POST http://opencode:3000/api/session/:id/prompt
  │     ?directory=/mnt/cos/{dir}
  │     &workspace={userId}
  │     Authorization: Basic ...
  │     body 原样透传
  │
  ╰─ OpenCode 处理 prompt → 流式返回 SSE / 返回 response

═══ A3: GET /api/session（查列表，仅需 workspace）═══════════════════════

用户前端 GET /api/session
  │
  ├─ openimago 解析 JWT → userId
  │
  ├─ 转发到 OpenCode:
  │     GET http://opencode:3000/api/session
  │     ?workspace={userId}     ← 不需要 directory
  │     Authorization: Basic ...
  │
  ╰─ OpenCode 查询 session 表:
      SELECT ... FROM session WHERE workspace_id = :userId

═══ A4: GET /api/event（SSE，仅需 workspace）════════════════════════════

用户前端 GET /api/event
  │
  ├─ openimago 解析 JWT → userId
  │
  ├─ 转发到 OpenCode:
  │     GET http://opencode:3000/event
  │     ?workspace={userId}     ← 不需要 directory
  │     Authorization: Basic ...
  │
  ╰─ OpenCode 流式返回 SSE (text/event-stream)
     openimago 原样透传 response body 给前端
```

#### Path B: What Session.create() Actually Does

```
Session.create(input?)
  │
  ├─ InstanceState.context → { directory, worktree, project }
  │
  ├─ InstanceState.workspaceID → userId (or undefined)
  │
  └─ createNext({
        id: SessionID.descending(),    // generates "ses_xxx"
        directory: ctx.directory,       // /mnt/cos/{dir}
        workspaceID: input.workspaceID, // userId
        projectID: ctx.project.id,      // "global" in this deployment
        path: sessionPath(worktree, directory),
        slug: Slug.create(),
        version: InstallationVersion,
        ...
      })
        ├─ writes to session table (PG)
        ├─ sync.run(Created, ...)
        └─ bus.publish(Updated, ...)  // → SSE subscribers receive event
```

**Key insight**: `createNext` reads `directory` from `InstanceState.context` which was set by the middleware from `?directory=`. The Platform only needs to pass this query param — OpenCode handles everything else.

#### Path C: Session Listing by workspace + directory

Platform's frontend queries sessions:

```
GET /api/session?workspace=user1&directory=/mnt/cos/proj_a
  │
  └─ v2/session.ts:179-216  (V2Session.list)
       builds SQL: SELECT ... FROM session
       WHERE workspace_id = :workspace  → user1
         AND directory = :directory      → /mnt/cos/proj_a
       ORDER BY time_created DESC
```

This is a **direct PostgreSQL query** — OpenCode reads from the shared DB. Platform can make the same queries.

#### Path D: SSE Streaming

```
GET /event?directory=/mnt/cos/xxx&workspace=user1
  │
  ├─ event.ts
  │   subscribes to bus.subscribeAll() for this instance
  │
  ├─ emits "server.connected" first
  │
  ├─ emits heartbeat every 10s
  │
  └─ encodes events as SSE text/event-stream
       → each event payload is bus data scoped to directory

Global SSE:
GET /global/event?workspace=user1
  │
  ├─ handlers/global.ts
  │   subscribes to GlobalBus
  │
  └─ GlobalEvent envelope includes { directory, workspace? }
      → Platform can filter by workspace on the fly
```

### OpenCode API Endpoints Platform Must Proxy

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/session` | List sessions — proxy with `?workspace=userId` |
| `POST` | `/api/session/:id/prompt` | Send prompt — proxy with `?directory=` |
| `POST` | `/api/session/:id/compact` | Compact session |
| `POST` | `/api/session/:id/wait` | Wait for idle |
| `GET` | `/api/session/:id/context` | Get context messages |
| `GET` | `/event` | Instance SSE — proxy with `?directory=` |
| `GET` | `/global/event` | Global SSE — proxy with `?workspace=` |
| `GET` | `/session` | List sessions (legacy) |
| `POST` | `/session` | Create session (legacy) |
| `POST` | `/session/:id/prompt` | Send prompt (legacy) |
| `GET` | `/file/**` | File operations |
| `GET` | `/config` | Config routes |
| `GET` | `/project` | Project routes |
| `POST` | `/experimental/workspace` | Workspace routes |
| WebSocket | `/pty/connect` | PTY WebSocket — Hono supports WS upgrade |

### OpenCode SDK Integration

openimago adds `@opencode-ai/sdk` as a direct npm dependency:

```bash
npm install @opencode-ai/sdk
```

#### 1. Client Setup

openimago uses the **client-only** mode (OpenCode runs as a separate container):

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"

const client = createOpencodeClient({
  baseUrl: "http://opencode:3000",
  headers: {
    Authorization: "Basic " + btoa(`${username}:${password}`),
  },
})
```

#### 2. SDK Types

All OpenCode API types are importable directly from the package:

```typescript
import type { Session, Message, Part, Event, GlobalEvent, Prompt } from "@opencode-ai/sdk"
```

Key types used by openimago:

| Type | Usage |
|------|-------|
| `Session` | Session record with `id`, `workspaceID`, `directory`, `projectID`, `title`, `time` |
| `Event` | Union of all SSE event types (`session.created`, `session.updated`, text-delta, etc.) |
| `GlobalEvent` | Global SSE envelope `{ directory, workspace?, payload }` |
| `Message` | UserMessage \| AssistantMessage |
| `Part` | Union of TextPart, ToolPart, ReasoningPart, FilePart, etc. |
| `Prompt` | Prompt input `{ text, files?, agents?, references? }` |

#### 3. Type-safe Client API

The SDK exposes type-safe methods for all OpenCode API endpoints. openimago can use these for **backend-to-backend** calls, or simply use the types for proxy response handling.

```typescript
// Backend usage — openimago calling OpenCode directly
const sessions = await client.session.list({ query: { workspace: userId } })
const result = await client.session.prompt({ path: sessionId, body: { prompt } })

// Type-only usage — openimago uses fetch() for proxy, but types responses
import type { Session } from "@opencode-ai/sdk"
// response from proxy → cast to Session for type safety
```

Key client methods:

| Method | Description |
|--------|-------------|
| `session.list()` | List sessions |
| `session.get({ path })` | Get session by ID |
| `session.create({ body })` | Create session |
| `session.delete({ path })` | Delete session |
| `session.update({ path, body })` | Update session (title, etc.) |
| `session.prompt({ path, body })` | Send prompt (returns AssistantMessage) |
| `session.messages({ path })` | List messages in session |

Note: For the reverse proxy architecture, openimago primarily uses raw `fetch()` forwarding for `/api/*` routes. The SDK client is available for backend-specific operations (e.g., session creation orchestration, health checks, or future event-driven workflows).

### Database Schema (Shared PostgreSQL)

OpenCode's tables live alongside Platform's tables in the same PostgreSQL database:

```
OpenCode tables (read by Platform):
  session           ← Platform queries this for session listing
  message           ← session messages
  part              ← message parts
  todo              ← session todos
  session_message   ← v2 session messages
  permission        ← project permissions
  project           ← project records (all "global" in this deployment)
  workspace         ← workspace records

Platform tables (managed by Platform):
  users             ← user accounts
  user_auths        ← multi-provider login
  projects          ← user projects
  work_dirs         ← directory registry
```

### Key Implementation Gotchas

1. **Directory must exist before OpenCode API call**: `InstanceStore.load()` calls `fromDirectory()` which does `fs.up({ targets: [".git"], start: directory })`. If the directory doesn't exist on disk, this fails. **Platform must `mkdir -p` before proxying.**

2. **Session create does not accept custom directory param**: `Session.create()` reads `directory` from `InstanceState.context`, not from a function argument. The directory must be injected via middleware (`?directory=` query param).

3. **V2 session API has no create endpoint**: The `V2Session.create` at `v2/session.ts:169` is a stub (`return {} as any`). Session creation must go through the legacy `POST /session` API, or Platform can INSERT into the `session` table directly (but will miss sync/bus events).

4. **All sessions get project_id = "global"**: Since working directories under `/mnt/cos/` are not git repos, `fromDirectory()` always returns `ProjectID.global`. Platform relies on `workspace_id` + `directory` for isolation.

5. **SSE doesn't carry workspaceId in instance mode**: Instance SSE (`/event`) is scoped to a directory, so events are already filtered. Global SSE (`/global/event`) has `workspace` in the `GlobalEvent` envelope and can be filtered by Platform.

6. **auth.json vs env vars**: OpenCode stores provider auth in `auth.json` in the state directory, not in the session DB. Platform needs to ensure OpenCode's `auth.json` is pre-configured with the global provider key.

---

## Appendix A: API Contracts (TDD-Ready)

Every Platform endpoint defined as request/response schema. A coder agent can use these as the specification for RED→GREEN loops.

### Conventions

- Base URL: `http://platform:5467`
- Auth header: `Authorization: Bearer <jwt>`
- Error response shape (all endpoints):
  ```json
  { "error": { "code": "ERROR_CODE", "message": "Human-readable" } }
  ```
- HTTP status codes: 200 (success), 400 (bad request), 401 (unauthorized), 403 (forbidden), 404 (not found), 500 (server error)

### A.1 Auth Endpoints

#### `POST /auth/register`

```
Request:
  Body: {
    username: string       // 3-32 chars, alphanumeric
    email: string          // valid email
    password: string       // min 8 chars
    displayName?: string
  }

Response 201:
  Body: {
    user: { id, username, email, displayName, role, createdAt }
    token: string           // JWT
  }

Errors:
  400 — { code: "VALIDATION_ERROR" }       // invalid input
  409 — { code: "CONFLICT" }               // username or email taken
```

#### `POST /auth/login`

```
Request:
  Body: {
    email: string
    password: string
  }

Response 200:
  Body: {
    user: { id, username, email, displayName, role, createdAt }
    token: string
  }

Errors:
  401 — { code: "INVALID_CREDENTIALS" }
```

#### `GET /auth/oauth/:provider` (redirect)

```
Params: provider = "github" | "google"
Response 302: Redirect to OAuth provider
```

#### `GET /auth/oauth/:provider/callback`

```
Query: { code: string }
Response 200: { user, token }
Errors: 401 — { code: "OAUTH_FAILED" }
```

#### `GET /auth/me`

```
Headers: Authorization: Bearer <jwt>
Response 200: { id, username, email, displayName, role, createdAt }
Errors: 401 — { code: "UNAUTHORIZED" }
```

### A.2 Project Endpoints

#### `POST /api/platform/projects`

```
Headers: Authorization: Bearer <jwt>
Request:
  Body: {
    name: string           // 1-64 chars
    description?: string
  }

Response 201:
  Body: {
    project: {
      id: string           // "proj_" + nanoid
      name: string
      description: string | null
      fullPath: string     // "/mnt/cos/" + id
      status: "active"
      createdAt: string
    }
  }

Side effects:
  - Creates directory /mnt/cos/{id} (mkdir -p)
  - Inserts work_dirs record (type = "project")
  - Inserts projects record

Errors:
  400 — { code: "VALIDATION_ERROR" }
```

#### `GET /api/platform/projects`

```
Headers: Authorization: Bearer <jwt>
Query: { status?: "active" | "archived" }

Response 200:
  Body: {
    projects: Array<{
      id, name, description, fullPath, status,
      sessionCount: number,    // SELECT COUNT(*) FROM session WHERE directory = fullPath
      createdAt, updatedAt
    }>
  }
```

#### `PATCH /api/platform/projects/:id`

```
Headers: Authorization: Bearer <jwt>
Params: id
Request Body: { name?: string, description?: string, status?: "archived" }
Response 200: { project: { ... } }
Errors:
  403 — { code: "FORBIDDEN" }    // not owner
  404 — { code: "NOT_FOUND" }
```

### A.3 WorkDir Endpoints

#### `POST /api/platform/sessions`

```
Headers: Authorization: Bearer <jwt>
Request:
  Body: {
    projectId?: string      // if creating session inside a project
  }

Response 201:
  Body: {
    workDir: {
      id: string            // "dir_" + nanoid
      userId: string
      projectId: string | null
      type: "session"
      fullPath: string      // "/mnt/cos/" + id
      status: "active"
      createdAt: string
    }
  }

Side effects:
  - If projectId provided: verify project exists and belongs to user
  - Creates directory /mnt/cos/{id} (mkdir -p)
  - If projectId: reuses project's fullPath as directory instead
  - Inserts work_dirs record

Logic:
  if projectId:
    verifyProjectOwnership(userId, projectId)
    directory = project.fullPath   // /mnt/cos/{projectId}
  else:
    directory = "/mnt/cos/dir_" + nanoid
    mkdir(directory)
```

#### `GET /api/platform/work-dirs`

```
Headers: Authorization: Bearer <jwt>
Query: { projectId?: string, type?: "project" | "session" }

Response 200:
  Body: { workDirs: Array<{ id, userId, projectId, type, fullPath, status, createdAt }> }
```

### A.4 Proxy Endpoints (Passthrough)

All OpenCode endpoints proxied through `/api/*`:

| Incoming | Forwarded To |
|----------|-------------|
| `GET /api/session` | `GET opencode:3000/session?directory={dir}&workspace={userId}` |
| `POST /api/session/:id/prompt` | `POST opencode:3000/session/:id/prompt?directory={dir}&workspace={userId}` |
| `GET /api/event` | `GET opencode:3000/event?directory={dir}&workspace={userId}` |

**Proxy behavior**:
- Inject `directory` from `work_dirs` (most recent matching the user's context)
- Inject `workspace={userId}` from JWT
- Inject Basic Auth header from platform config
- Stream response body as-is (including SSE)
- Forward request body and Content-Type as-is
- Forward WebSocket upgrade

### A.5 Health Endpoint

#### `GET /health`

```
Response 200:
  Body: {
    status: "ok",
    opencode: "connected" | "disconnected",
    db: "connected" | "disconnected",
    uptime: number    // seconds
  }
```

---

## Appendix B: Interface Definitions (TDD-Ready)

These are the service interfaces that coder agents should build and test against. Each interface is designed to be a **deep module** — small surface area, rich behavior inside.

### B.1 AuthService

```typescript
interface AuthService {
  register(input: { username, email, password, displayName? }): Effect<{ user, token }, ValidationError | ConflictError>
  login(input: { email, password }): Effect<{ user, token }, InvalidCredentialsError>
  verifyToken(token: string): Effect<{ userId, role }, UnauthorizedError>
  oauthStart(provider: "github" | "google"): Effect<{ redirectUrl }>
  oauthCallback(provider: "github" | "google", code: string): Effect<{ user, token }, OAuthFailedError>
}
```

### B.2 ProjectService

```typescript
interface ProjectService {
  create(input: { userId, name, description? }): Effect<Project>
  list(input: { userId, status? }): Effect<Array<Project & { sessionCount }>>
  update(input: { projectId, userId, name?, description?, status? }): Effect<Project, NotFoundError | ForbiddenError>
}
```

### B.3 WorkDirService

```typescript
interface WorkDirService {
  createSessionDir(input: { userId, projectId? }): Effect<WorkDir>
    // if projectId → reuse project's fullPath
    // else → generate new dir, mkdir, register in work_dirs

  list(input: { userId, projectId?, type? }): Effect<Array<WorkDir>>
  getByUserAndPath(userId: string, fullPath: string): Effect<WorkDir, NotFoundError>
  archive(id: string): Effect<void>
}
```

### B.4 ProxyService (deepest module)

```typescript
interface ProxyService {
  // The core proxy — builds the target URL, injects params, forwards
  forward(request: {
    method: string
    path: string        // e.g. "/session/list"
    query: Record<string, string>
    headers: Record<string, string>
    body?: ReadableStream | string
    directory: string   // resolved by caller
    userId: string
  }): Promise<Response>
    // 1. Merge query params: { ...request.query, directory, workspace: userId }
    // 2. Build target URL: opencodeBaseUrl + path + "?" + mergedQuery
    // 3. Add Basic Auth header
    // 4. Forward using fetch()
    // 5. Return raw Response (stream body for SSE)

  // Helper: resolve the directory for a given user request context
  resolveDirectory(userId: string, projectId?: string): Effect<string>
}
```

### B.5 HealthService

```typescript
interface HealthService {
  check(): Effect<{ status, opencode, db, uptime }>
}
```

---

## Appendix C: Behavior Specification (What to Test)

Per module, the behaviors that matter. These are the **tracer bullet candidates** — each one is a single RED→GREEN cycle.

### C.1 Auth Behaviors

| # | Behavior | Verifies |
|---|----------|----------|
| 1 | User can register with valid username/email/password | 201 + user + token returned |
| 2 | Registration rejects duplicate email | 409 |
| 3 | Registration rejects weak password (< 8 chars) | 400 |
| 4 | User can login with correct email/password | 200 + token returned |
| 5 | Login with wrong password returns 401 | 401 |
| 6 | Login with unregistered email returns 401 | 401 |
| 7 | Token verification returns userId for valid token | decoded payload matches |
| 8 | Token verification rejects expired token | 401 |
| 9 | Token verification rejects tampered token | 401 |
| 10 | GET /auth/me returns user info for valid token | 200 + user fields |
| 11 | GET /auth/me without token returns 401 | 401 |

### C.2 Project Behaviors

| # | Behavior | Verifies |
|---|----------|----------|
| 1 | User can create a project | 201 + project with generated id, fullPath |
| 2 | Creating a project creates the directory on disk | fs.exists(fullPath) |
| 3 | Creating a project inserts a work_dirs record | work_dirs table has matching record |
| 4 | User can list own projects | only user's projects returned |
| 5 | User cannot see other user's projects | 403 or filtered out |
| 6 | Archiving a project sets status | 200 + status changed |
| 7 | Creating project with empty name returns 400 | 400 |

### C.3 WorkDir Behaviors

| # | Behavior | Verifies |
|---|----------|----------|
| 1 | Creating a session dir generates unique path | 201 + fullPath = /mnt/cos/dir_* |
| 2 | Creating a session dir with projectId reuses project path | fullPath = project's fullPath |
| 3 | Creating a session dir creates the directory | fs.exists(fullPath) |
| 4 | Invalid projectId returns 404 | 404 |

### C.4 Proxy Behaviors

| # | Behavior | Verifies |
|---|----------|----------|
| 1 | All proxied requests inject `?workspace=userId` from JWT | forwarded URL has ?workspace=... |
| 2 | `POST /api/platform/sessions` with projectId reuses project's directory | forwards with ?directory=/mnt/cos/proj_... |
| 3 | `POST /api/platform/sessions` without projectId creates new directory | mkdir + work_dirs insert + forwards with ?directory=... |
| 4 | `POST /api/session/:id/prompt` looks up directory from session table | forwarded URL has ?directory=... matching session's directory |
| 5 | `POST /api/session/:id/prompt` with invalid session returns 404 | 404 before forwarding |
| 6 | `GET /api/session` injects workspace but NOT directory | forwarded URL has ?workspace= but no ?directory= |
| 7 | `GET /api/event` injects workspace but NOT directory | forwarded URL has ?workspace= but no ?directory= |
| 8 | Proxy injects Basic Auth header | forwarded headers have Authorization: Basic |
| 9 | Proxy passes through request body | forwarded request body matches original |
| 10 | Proxy returns OpenCode response as-is | status, body, headers match |
| 11 | Proxy streams SSE response | chunked transfer, content-type: text/event-stream |
| 12 | Proxy returns 502 when OpenCode unreachable | 502 + error message |
| 13 | Proxy rejects request without valid JWT | 401 before proxying |

### C.5 Health Behaviors

| # | Behavior | Verifies |
|---|----------|----------|
| 1 | Health check returns ok when everything is up | 200 + status = "ok" |
| 2 | Health check detects OpenCode down | status = "ok", opencode = "disconnected" |
| 3 | Health check detects DB down | status = "ok", db = "disconnected" |

---

## Appendix D: Tracer Bullet (First RED→GREEN Cycle)

The recommended first tracer bullet for a coder agent:

**Test: `"User can register with valid credentials"`**

```typescript
test("user can register with valid credentials", async () => {
  const app = createTestApp(/* test DI */)
  const res = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "alice",
        email: "alice@example.com",
        password: "password123",
      }),
    }),
  )
  expect(res.status).toBe(201)
  const body = await res.json()
  expect(body.user.username).toBe("alice")
  expect(body.user.email).toBe("alice@example.com")
  expect(body.token).toBeDefined()
  expect(typeof body.token).toBe("string")
})
```

Why this one first:
1. Auth is a dependency for every other endpoint
2. It's entirely self-contained (no OpenCode dependency)
3. It validates the entire stack: HTTP routing, validation, DB, JWT generation
4. Once passing, all "needs auth" tests can reuse the generated token

---

## Appendix E: Environment Variables

```
# Required
DATABASE_URL=postgres://user:pass@postgres:5432/opencode
JWT_SECRET=<random-256-bit-key>

# OpenCode connection
OPENCODE_URL=http://opencode:3000
OPENCODE_AUTH_USERNAME=opencode      # default
OPENCODE_AUTH_PASSWORD=<set-me>

# Optional
PORT=5467                            # default
HOST=0.0.0.0                         # default
COS_BASE_PATH=/mnt/cos               # default
LOG_LEVEL=info                       # debug | info | warn | error
```
