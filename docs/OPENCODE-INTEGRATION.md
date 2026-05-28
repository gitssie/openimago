# openimago — OpenCode 集成手册

## 1. 共享资源

| 资源 | 用途 |
|------|------|
| PostgreSQL | 两边共用。openimago 直接 `SELECT` OpenCode 的 session/message/part 表 |
| Volume `/mnt/cos` | 两边容器都可读写。openimago 负责 `mkdir`，OpenCode 负责使用 |

## 2. 路由分类 (F / C / E)

| 类 | 含义 | 实现位置 |
|----|------|---------|
| **F (Fetch)** | 直接查 PG，不经过 OpenCode HTTP | openimago 的 route handler 内用 drizzle 查 |
| **C (Command)** | 转发到 OpenCode HTTP | proxy service 构造请求 + fetch |
| **E (Event)** | SSE 流透传 | proxy service streaming fetch |

### 2.1 各路由分类

| 前端路径 | 类 | 行为 |
|---------|:--:|------|
| `GET /api/session` | F | 直查 session 表 |
| `GET /api/session/:id` | F | 直查 session 表 |
| `GET /api/session/:id/message` | F | 直查 message 表 |
| `POST /api/platform/sessions` | C | 建目录 → workDirService → forward POST /session |
| `POST /api/session/:id/prompt` | C | proxy + directory |
| `POST /api/session/:id/abort` | C | proxy + directory |
| `POST /api/session/:id/fork` | C | proxy + directory |
| `POST /api/session/:id/compact` | C | proxy + directory |
| `GET /api/session/:id/context` | C | proxy + directory |
| `POST /api/session/:id/wait` | C | proxy, 仅 workspace |
| `DELETE /api/session/:id` | C | proxy, 仅 workspace |
| `PATCH /api/session/:id` | C | proxy, 仅 workspace |
| `GET /api/event` | E | proxy SSE, streaming 透传 |

## 3. drizzle 表映射

openimago 定义自己的 drizzle schema 来读 OpenCode 的表。

### 3.1 session 表（已实现：`src/db/session-schema.ts`）

```typescript
import { pgTable, text, bigint, integer, doublePrecision, jsonb, index } from "drizzle-orm/pg-core"

export const SessionTable = pgTable("session", {
  id: text().primaryKey(),              // "ses_xxx"
  project_id: text().notNull(),          // 始终 "global"
  workspace_id: text(),                  // = userId
  parent_id: text(),                     // 父 session id
  slug: text().notNull(),
  directory: text().notNull(),           // "/mnt/cos/xxx"
  path: text(),
  title: text().notNull(),               // 会话标题
  version: text().notNull(),
  cost: doublePrecision().notNull().default(0),
  tokens_input: bigint({ mode: "number" }).notNull().default(0),
  tokens_output: bigint({ mode: "number" }).notNull().default(0),
  tokens_reasoning: bigint({ mode: "number" }).notNull().default(0),
  tokens_cache_read: bigint({ mode: "number" }).notNull().default(0),
  tokens_cache_write: bigint({ mode: "number" }).notNull().default(0),
  agent: text(),
  model: jsonb(),
  time_created: bigint({ mode: "number" }).notNull(),
  time_updated: bigint({ mode: "number" }).notNull(),
  time_compacting: bigint({ mode: "number" }),
  time_archived: bigint({ mode: "number" }),
  // ... 更多字段见 OpenCode session.sql.ts
})
```

**注意**: openimago **不**定义 migration，此 schema 只读。列名用 snake_case 匹配 OpenCode 表。

### 3.2 message 表（需新增：`src/db/message-schema.ts`）

```typescript
import { pgTable, text, jsonb, bigint, index } from "drizzle-orm/pg-core"

export const MessageTable = pgTable("message", {
  id: text().primaryKey(),                // "msg_xxx"
  session_id: text().notNull(),           // FK → session.id
  time_created: bigint({ mode: "number" }).notNull(),
  time_updated: bigint({ mode: "number" }).notNull(),
  data: jsonb().notNull(),                // 消息内容（info + parts）
})
```

F 类 `GET /api/session/:id/message` 需要读此表。

### 3.3 part 表（需新增：`src/db/part-schema.ts`）

```typescript
export const PartTable = pgTable("part", {
  id: text().primaryKey(),
  message_id: text().notNull(),
  session_id: text().notNull(),
  time_created: bigint({ mode: "number" }).notNull(),
  time_updated: bigint({ mode: "number" }).notNull(),
  data: jsonb().notNull(),
})
```

现阶段 F 类不读 part 表，留作扩展。

## 4. F 类实现（直接查 PG）

### 4.1 会话列表 — `GET /api/session`

**请求参数**（对齐 OpenCode SessionsQuery）：

| 参数 | 类型 | 说明 |
|------|------|------|
| `workspace` | string | 必填，= userId |
| `directory` | string | 按目录过滤 |
| `path` | string | 按路径精确或前缀过滤 |
| `roots` | boolean | 只查根 session |
| `start` | number | time_created >= start |
| `search` | string | title LIKE %search% |
| `order` | "asc" \| "desc" | 默认 desc |
| `limit` | number | 默认 50，最大 200 |
| `cursor` | string | base64url 编码的游标 |

**cursor 格式**（与 OpenCode 一致）：

```typescript
// cursor 是 base64url(JSON.stringify({ id, time, order, directory?, path?, workspaceID?, roots?, start?, search? }))
// 解析后：
type Cursor = {
  id: string
  time: number
  order: "asc" | "desc"
  direction: "previous" | "next"
  directory?: string
  path?: string
  workspaceID?: string
  roots?: boolean
  start?: number
  search?: string
}
```

**实现代码**：

```typescript
// proxy/routes.ts — F 类 handler
import { and, or, eq, like, isNull, gte, gt, lt, asc, desc } from "drizzle-orm"

// 注意：这是 F 类，不走 proxyRequest！
routes.get("/api/session", async (c) => {
  const userId = c.get("userId") as string
  const query = c.req.query()

  // 1. 解析 cursor
  let cursor: Cursor | undefined
  if (query.cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(query.cursor, "base64url").toString())
      cursor = decoded as Cursor
    } catch {
      return c.json({ error: { code: "INVALID_CURSOR", message: "Bad cursor" } }, 400)
    }
  }

  // 2. 构建 conditions
  const conditions: any[] = [eq(SessionTable.workspace_id, userId)]

  // cursor 中带了 filters → 用 cursor 的 filters，忽略 query 的
  const filters = cursor ?? query
  if (filters.directory) conditions.push(eq(SessionTable.directory, filters.directory))
  if (filters.path) conditions.push(or(eq(SessionTable.path, filters.path), like(SessionTable.path, `${filters.path}/%`))!)
  if (filters.roots) conditions.push(isNull(SessionTable.parent_id))
  if (filters.start) conditions.push(gte(SessionTable.time_created, Number(filters.start)))
  if (filters.search) conditions.push(like(SessionTable.title, `%${filters.search}%`))

  // 3. 游标分页
  const direction = cursor?.direction ?? "next"
  let order: "asc" | "desc" = query.order === "asc" ? "asc" : "desc"
  if (direction === "previous" && order === "asc") order = "desc"
  if (direction === "previous" && order === "desc") order = "asc"
  if (cursor) {
    conditions.push(
      order === "asc"
        ? or(gt(SessionTable.time_created, cursor.time), and(eq(SessionTable.time_created, cursor.time), gt(SessionTable.id, cursor.id)))!
        : or(lt(SessionTable.time_created, cursor.time), and(eq(SessionTable.time_created, cursor.time), lt(SessionTable.id, cursor.id)))!,
    )
  }

  // 4. 查询
  const limit = Math.min(Number(query.limit) || 50, 200)
  const rows = await db
    .select()
    .from(SessionTable)
    .where(and(...conditions))
    .orderBy(order === "asc" ? asc(SessionTable.time_created) : desc(SessionTable.time_created), order === "asc" ? asc(SessionTable.id) : desc(SessionTable.id))
    .limit(limit)

  const items = (direction === "previous" ? rows.toReversed() : rows)
  const first = items[0]
  const last = items.at(-1)

  // 5. 生成游标
  const cursorFor = (session: typeof items[0], dir: "previous" | "next") => {
    if (!session) return undefined
    const obj = { id: session.id, time: session.time_created, order, direction: dir, ...filters }
    return Buffer.from(JSON.stringify(obj)).toString("base64url")
  }

  return c.json({
    items,
    cursor: {
      previous: cursorFor(first, "previous"),
      next: cursorFor(last, "next"),
    },
  })
})
```

### 4.2 会话详情 — `GET /api/session/:id`

```typescript
routes.get("/api/session/:id", async (c) => {
  const userId = c.get("userId") as string
  const sessionId = c.req.param("id")

  const [session] = await db
    .select()
    .from(SessionTable)
    .where(and(eq(SessionTable.id, sessionId), eq(SessionTable.workspace_id, userId)))
    .limit(1)

  if (!session) return c.json({ error: { code: "NOT_FOUND", message: "Session not found" } }, 404)
  return c.json(session)
})
```

### 4.3 会话消息 — `GET /api/session/:id/message`

参数与 OpenCode V2Session.messages() 一致：

| 参数 | 类型 | 说明 |
|------|------|------|
| `order` | "asc" \| "desc" | 默认 desc |
| `limit` | number | 默认无限制 |
| `cursor` | string | base64url({ id, time, order, direction }) |

```typescript
routes.get("/api/session/:id/message", async (c) => {
  const sessionId = c.req.param("id")
  const query = c.req.query()

  // 先确认 session 存在
  const [session] = await db
    .select({ id: SessionTable.id })
    .from(SessionTable)
    .where(and(eq(SessionTable.id, sessionId), eq(SessionTable.workspace_id, c.get("userId"))))
    .limit(1)
  if (!session) return c.json({ error: { code: "NOT_FOUND" } }, 404)

  // 查询 MessageTable
  const order = query.order === "asc" ? "asc" : "desc"
  const limit = query.limit ? Math.min(Number(query.limit), 200) : undefined
  const conditions: any[] = [eq(MessageTable.session_id, sessionId)]

  if (query.cursor) {
    let cursor: any
    try { cursor = JSON.parse(Buffer.from(query.cursor, "base64url").toString()) } catch { return c.json({ error: { code: "INVALID_CURSOR" } }, 400) }
    const direction = cursor.direction ?? "next"
    let effOrder = order
    if (direction === "previous" && effOrder === "asc") effOrder = "desc"
    if (direction === "previous" && effOrder === "desc") effOrder = "asc"
    conditions.push(
      effOrder === "asc"
        ? or(gt(MessageTable.time_created, cursor.time), and(eq(MessageTable.time_created, cursor.time), gt(MessageTable.id, cursor.id)))!
        : or(lt(MessageTable.time_created, cursor.time), and(eq(MessageTable.time_created, cursor.time), lt(MessageTable.id, cursor.id)))!,
    )
  }

  let queryBuilder = db
    .select()
    .from(MessageTable)
    .where(and(...conditions))
    .orderBy(order === "asc" ? asc(MessageTable.time_created) : desc(MessageTable.time_created), order === "asc" ? asc(MessageTable.id) : desc(MessageTable.id))

  if (limit) queryBuilder = queryBuilder.limit(limit)
  const rows = await queryBuilder

  // cursor 编码同 session list
  // ...
  return c.json({ items: rows, cursor: { previous, next } })
})
```

## 5. C 类实现（转发 OpenCode）

### 5.1 proxy service（已实现：`src/proxy/service.ts`）

```typescript
export async function proxyRequest(
  config: ProxyConfig,
  incomingUrl: string,
  method: string,
  incomingHeaders: Headers,
  body: ReadableStream<Uint8Array> | null | undefined,
  directory: string | undefined,     // undefined = 不注入
  userId: string,                    // 始终注入 workspace
) {
  const url = new URL(incomingUrl)
  const targetPath = url.pathname.replace(/^\/api/, "")  // /api/session → /session
  const targetUrl = new URL(targetPath, config.opencodeUrl)

  const searchParams = new URLSearchParams()
  searchParams.set("workspace", userId)
  if (directory) searchParams.set("directory", directory)

  // 保留原始 query params（覆盖 workspace/directory）
  for (const [k, v] of url.searchParams) {
    if (k !== "workspace" && k !== "directory") searchParams.set(k, v)
  }
  targetUrl.search = searchParams.toString()

  const headers = new Headers(incomingHeaders)
  headers.delete("host")
  headers.delete("authorization")
  headers.set("Authorization", `Basic ${config.basicAuth}`)

  try {
    const response = await fetch(targetUrl.toString(), {
      method,
      headers,
      body: method !== "GET" && method !== "HEAD" ? body : undefined,
    })
    return new Response(response.body, { status: response.status, headers: response.headers })
  } catch {
    return new Response(
      JSON.stringify({ error: { code: "OPENCODE_UNREACHABLE", message: "OpenCode service unavailable" } }),
      { status: 502, headers: { "content-type": "application/json" } },
    )
  }
}
```

### 5.2 加 directory 的 C 类路由

middleware 在转发前查 session 表取 directory（已实现：`src/server/middleware.ts`）：

```typescript
// middleware 匹配路由模式 → 提取 sessionId → SELECT directory → c.set("directory", dir)
// proxy/routes.ts 的 handler 从 context 取: c.get("directory") as string

routes.post("/api/session/:id/prompt", (c) => {
  const userId = c.get("userId") as string
  const directory = c.get("directory") as string    // middleware 已注入
  return proxyRequest(config, c.req.url, "POST", c.req.raw.headers, c.req.raw.body, directory, userId)
})
```

### 5.3 不加 directory 的 C 类路由

```typescript
routes.post("/api/session/:id/wait", (c) => {
  const userId = c.get("userId") as string
  return proxyRequest(config, c.req.url, "POST", c.req.raw.headers, null, undefined, userId)
  //                                                                    ^^^^^^^^^ 不传 directory
})
```

### 5.4 新建对话（混合：建目录 + 转发）

由 `workDirRoutes` 处理，不经过 proxy middleware。已实现 `src/workdir/routes.ts` + `src/workdir/service.ts`。

**工作流**：

```
workDirRoutes POST /

  → WorkDirService.createSessionDir({ userId, projectId? })
       ├─ 有 projectId → 查 projects 表 → 用已有 fullPath
       └─ 无 projectId → dirId() → mkdir(fullPath)
     → INSERT work_dirs
     → return workDir

  → forward(config, { method: "POST", path: "/session", directory: workDir.fullPath, userId, body })

  → return { session, workDir }
```

### 5.5 取消生成 — 正确方式

前端调用 `POST /api/session/:id/abort`，openimago 转发到 `POST /session/:id/abort?directory=...&workspace=...`。

**不要**通过浏览器 `AbortSignal` 取消 fetch。理由：

```
❌ 浏览器关闭 SSE 连接 → AbortSignal 传播 → OpenCode 请求中断
   → OpenCode 内部 AI 生成还在跑 → 浪费资源
   → 用户刷新页面重连后，AI 还在继续

✅ 前端主动 POST /api/session/:id/abort
   → OpenCode 收到后终止 agent loop
   → 发布 session.updated 事件 → SSE 推送 → 前端收到
```

### 5.6 SSE（E 类 — streaming 透传）

```typescript
routes.get("/api/event", (c) => {
  const userId = c.get("userId") as string
  return proxyRequest(config, c.req.url, "GET", c.req.raw.headers, null, undefined, userId)
  //                                                            ^^^^^^^^^ 不传 directory
})
```

`proxyRequest` 的 `new Response(response.body, ...)` 天然支持 streaming，浏览器端 `EventSource` 正常接收。

### 5.7 SSE 事件契约与前端状态规则

openimago 前端通过 `/api/event` 接收 OpenCode 的 SSE 事件流。以下是关键事件及其处理规则。

#### 5.7.1 事件 payload 格式

OpenCode 在不同层次发出的事件 payload 结构有差异，前端必须兼容两种格式：

**格式 A — Bus 事件（SSE 直出）**：
```typescript
{
  type: "session.created",
  properties: {
    sessionID: "ses_xxx",
    info: Session          // 完整 Session 信息
  }
}
```

**格式 B — Sync 事件（持久化层）**：
```typescript
{
  type: "session.created.1",
  aggregate: "sessionID",
  data: {
    sessionID: "ses_xxx",
    info: Session
  }
}
```

**前端归一化规则**：
- `payload.properties?.info` **或** `payload.data?.info` → 统一取 `info`
- `payload.properties?.sessionID` **或** `payload.data?.sessionID` → 统一取 `sessionID`
- 优先检查 `properties`，fallback 到 `data`

**关键 Session 事件**：

| 事件类型 | payload 结构 | 触发时机 |
|---------|-------------|---------|
| `session.created` | `{ properties: { sessionID, info } }` | 新建会话（包括后端 openimago 转发创建） |
| `session.updated` | `{ properties: { sessionID, info } }` | 标题变更、时间戳更新、权限变更等 |
| `session.deleted` | `{ properties: { sessionID, info } }` | 会话被删除 |
| `session.error` | `{ properties: { sessionID?, error } }` | 会话出错 |
| `session.diff` | `{ properties: { sessionID, diff } }` | 文件变更摘要 |

**Session Info 核心字段**：
```typescript
interface Session {
  id: string            // "ses_xxx"
  parentID?: string     // 子会话的父会话 ID — 必须保留
  directory: string     // "/mnt/cos/xxx"
  title: string         // 会话标题 — 可为空字符串 ""
  time: {
    created: number     // Unix ms
    updated: number     // Unix ms
    archived?: number   // Unix ms
  }
  // ... 其他字段
}
```

#### 5.7.2 前端状态管理规则

**规则 1：`session.created` 等同于 `session.updated`**

后端 openimago 通过 `POST /api/platform/sessions` 创建会话时会转发到 OpenCode，OpenCode 创建成功后发出 `session.created` 事件。前端**必须**用此事件将新会话注入本地状态。两种事件的处理逻辑完全一致：以 `info` 为准，upsert 到会话列表。

```typescript
// 伪代码 — session.created 和 session.updated 共用同一 handler
function handleSessionEvent(event) {
  const { sessionID, info } = normalizePayload(event)
  updateOrInsertSession(sessionID, info)  // upsert
}
```

**规则 2：禁止乐观假数据**

前端**不得**在等待 OpenCode 响应前自行构造临时 Session 对象插入列表。创建会话的正确流程：

```
用户操作 → POST /api/platform/sessions (body: { title?, projectId? })
         → openimago mkdir → forward POST /session
         → OpenCode 返回 Session → openimago 返回前端
         → SSE 推送 session.created → 前端 upsert 到列表
```

错误做法（必须避免）：
```typescript
// ❌ 禁止：假乐观更新
const fakeId = "pending_" + Date.now()
sessions.unshift({ id: fakeId, title: "新会话", ... })

// ❌ 禁止：硬编码 title
const newSession = { id: response.id, title: "Untitled", ... }
```

**规则 3：标题为空就是空，UI 层做 fallback**

- `Session.title` 可能为空字符串 `""` — OpenCode 允许无标题会话
- **Store / Service 层**：空标题 `""` 保持为空，不要用 `"Untitled"` 或类似硬编码替换
- **UI 渲染层**：仅在此层做 fallback 显示，如 `session.title || "未命名会话"`
- 错误示例：`store.dispatch(setSession({ ...info, title: info.title || "Untitled" }))` — 这会污染数据

**规则 4：首次消息流程**

```
1. 用户新建会话（POST /session）
2. 前端收到 session.created 事件 → 列表中出现新会话（title 为空）
3. 用户发送第一条消息（POST /session/:id/prompt）
4. OpenCode 的 agent 根据首条消息内容自动生成标题
5. 后端发出 session.updated 事件（含新 title）
6. 前端收到后更新会话标题
```

**规则 5：会话列表由后端/事件驱动**

- 列表数据源**始终**是 `GET /api/session`（直查 PG）或 SSE 事件
- 不自行维护 localStorage/editTime 等客户端侧缓存作为权威数据源
- 列表排序以 `time.created` / `time.updated` 为准，不引入客户端时间戳

**规则 6：保留 parentID / 子会话关系**

- `Session.parentID` 表示 fork 的子会话，前端**不得**丢失或忽略
- 渲染子会话时保留层级结构（如缩进、嵌套或在详情页展示关联关系）
- 删除父会话时，OpenCode 会递归删除所有子会话，前端应从列表移除对应的所有 `session.deleted` 事件

#### 5.7.3 Untitled 陷阱与排查清单

以下是从实际项目中总结的常见错误模式：

| # | 问题 | 症状 | 修复 |
|---|------|------|------|
| 1 | Store 层自动补 `"Untitled"` 取代空标题 | 后端更新标题后无法区分"用户取名 Untitled"和"空标题 fallback" | Store 层保持原始空串，UI 层用 `|| "未命名"` |
| 2 | `session.created` 被忽略，只处理 `session.updated` | 后端创建的会话不进入前端列表 | `session.created` 和 `session.updated` 共用 upsert handler |
| 3 | 前端乐观插入假 session 对象 | 列表出现重复条目或 ghost session | 移除所有 optimistic insert；等待 SSE 事件 |
| 4 | 未归一化 `properties.info` / `data.info` | 特定场景下 session 的 info 为 `undefined` | 实现 normalizePayload 统一提取 |
| 5 | 排序用客户端时间戳 | 排序与后端不一致 | 始终用 `time.created` / `time.updated` |
| 6 | `parentID` 被丢弃 | fork 后子会话显示为根会话 | 保留并传递 `parentID` |

## 6. proxyMiddleware 路由匹配

已实现（`src/server/middleware.ts`）。逻辑：

```typescript
export async function proxyMiddleware(c: Context, next: Next) {
  // /api/platform/* 跳过（由 workDirRoutes / projectRoutes 处理）
  if (pathname.startsWith("/api/platform/")) return next()

  // 匹配路由表
  const route = ROUTE_PATTERNS.find(r => r.method === method && r.pattern.test(pathname))
  if (!route) return c.json({ error: { code: "NOT_FOUND" } }, 404)

  // 需要 directory → 查 session 表
  if (route.needsDirectory) {
    const sessionId = pathname.match(route.pattern)![1]!
    const result = await resolveDirectory(sessionId, userId)
    if ("status" in result) return c.json({ error: { code: result.code } }, result.status)
    c.set("directory", result.directory)
  }

  await next()
}
```

**当前路由表** (`ROUTE_PATTERNS`)：

| 方法 | 路径 | directory | 说明 |
|------|------|:---------:|------|
| `POST` | `/api/session/:id/prompt` | 是 | prompt |
| `POST` | `/api/session/:id/abort` | 是 | 取消 |
| `POST` | `/api/session/:id/fork` | 是 | 分支 |
| `POST` | `/api/session/:id/compact` | 是 | 压缩 |
| `GET` | `/api/session/:id/context` | 是 | 上下文 |
| `GET` | `/api/session` | 否 | 列表（F 类 handler） |
| `GET` | `/api/session/:id` | 否 | 详情（F 类 handler） |
| `GET` | `/api/session/:id/message` | 否 | 消息（F 类 handler） |
| `PATCH` | `/api/session/:id` | 否 | 重命名 |
| `DELETE` | `/api/session/:id` | 否 | 删除 |
| `POST` | `/api/session/:id/wait` | 否 | 等待 |
| `GET` | `/api/event` | 否 | SSE |

## 7. 认证传递

```
前端 → openimago: Authorization: Bearer <JWT>
  JWT payload: { sub: userId, role: "user"|"admin", exp }

openimago → OpenCode: Authorization: Basic <base64(user:pass)>
  配置: OPENCODE_AUTH_USERNAME=opencode
        OPENCODE_AUTH_PASSWORD=<set-by-admin>
```

## 8. 环境变量

```
# 必需
DATABASE_URL=postgres://user:pass@postgres:5432/opencode
JWT_SECRET=<random-256-bit>
OPENCODE_URL=http://opencode:3000
OPENCODE_AUTH_PASSWORD=<set-me>

# 可选
OPENCODE_AUTH_USERNAME=opencode
COS_BASE_PATH=/mnt/cos
PORT=5467
```

## 9. 错误响应格式（所有端点统一）

```json
{ "error": { "code": "ERROR_CODE", "message": "Human-readable" } }
```

| HTTP | code | 场景 |
|------|------|------|
| 400 | `INVALID_CURSOR` | cursor 格式错误 |
| 401 | `UNAUTHORIZED` | JWT 缺失或无效 |
| 403 | `FORBIDDEN` | 越权操作 |
| 404 | `NOT_FOUND` | session/project 不存在 |
| 409 | `CONFLICT` | 用户名/邮箱重复 |
| 502 | `OPENCODE_UNREACHABLE` | OpenCode 容器不可达 |
| 404 | `NOT_FOUND` | 路由不匹配（proxyMiddleware）|

## 10. 已实现 vs 需修改

| 文件 | 状态 | 问题 |
|------|------|------|
| `src/db/session-schema.ts` | ✅ 正确 | — |
| `src/db/schema.ts` | ✅ 正确 | — |
| `src/db/message-schema.ts` | ❌ 缺失 | 需新建（F 类需要） |
| `src/db/part-schema.ts` | ❌ 缺失 | 可选，暂不急需 |
| `src/workdir/service.ts` | ✅ 正确 | — |
| `src/workdir/routes.ts` | ✅ 正确 | — |
| `src/server/middleware.ts` | ✅ 正确 | proxyMiddleware + authMiddleware |
| `src/proxy/service.ts` | ⚠️ 需改 | 目前 workDirRoutes 调用的 `forward()` 用不了，因为 POST /platform/sessions handler 用的 body 格式需要确认；删除 AbortSignal 参数 |
| `src/proxy/routes.ts` | ⚠️ 需改 | F 类路由（session list/detail/message）目前走 proxyRequest → OpenCode，应改为直接查 PG |
| `src/server/app.ts` | ⚠️ 需改 | F 类路由注册位置 |
