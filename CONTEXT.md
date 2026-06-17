# openimago — Glossary & Design Principles

## Terms

### openimago
The management platform. Handles user auth, project management, directory lifecycle, and proxying to OpenCode. Deployed as a standalone container.

### OpenCode
The AI agent engine (`opencode serve`). Runs as a shared backend container service. openimago shares the same PostgreSQL database with OpenCode, giving direct read/write access to OpenCode's `workspace` and `session` tables.

### User
Each user has a unique `userId`. Users can have multiple OpenCode workspaces linked via `workspace_refs`. Users authenticate to openimago via JWT; openimago authenticates to OpenCode via shared Basic Auth.

### Session-level Workspace
A transient workspace created per standalone session (`POST /api/session` without projectId). Linked to the user via `workspace_refs` with `projectId = null`. Lives in opencode's `workspace` table with `type = "local"`.

### Project-level Workspace
A persistent workspace tied to a project. Multiple sessions within the same project share one workspace. Linked to the user via `workspace_refs` with `projectId` set. Created at project creation time.

### Project
A user-created named workspace. Has a persistent directory at `/mnt/cos/{projectId}`. Multiple sessions can share the same project directory. Soft-deleted (archived, never physically removed).

### Session (OpenCode)
An AI conversation record in OpenCode's `session` table. openimago queries this table directly for session listing (F class). The `session.directory` field is set by OpenCode based on `workspace.directory` at creation time — openimago ensures `workspace.directory` is correct before forwarding session creation requests.

### Asset
User-uploaded media file (image, video, audio). Stored in COS under the user's assets root directory, metadata tracked in `assets` table. NOT agent-generated — agent outputs stay in the workdir and the user downloads them directly.

### Workspace (OpenCode table)
OpenCode's `workspace` table (`workspace`). Fields: `id` (PK = workspaceId), `type` ("local"), `directory` (absolute filesystem path), `project_id` ("global"), `name`, `time_used`.

openimago writes directly to this table during `POST /api/session` to set `workspace.directory` to the correct path **before** OpenCode creates the session. This is critical because OpenCode's workspace routing middleware uses `workspace.directory` (not `?directory=` query param or `x-opencode-directory` header) for local workspace routes.

### workspace_refs (openimago table)
Links OpenCode workspaces to openimago users/projects:

| Column | Type | Purpose |
|--------|------|---------|
| `workspace_id` | text PK | OpenCode workspace ID (distinct from userId) |
| `user_id` | text NOT NULL | openimago user who owns this workspace |
| `project_id` | text nullable | linked project (null = session-level workspace) |

The directory itself lives in OpenCode's `workspace.directory` — openimago does not maintain a duplicate directory registry.

### directory (filesystem path)
A filesystem working path like `/work/{workspaceId}` or `/mnt/cos/{projectId}`. Managed as follows:

1. **Standalone session** (`POST /api/session` without projectId): directory = `/work/{workspaceId}`. Created on disk via `mkdir`, then written to `workspace.directory`.
2. **Project session** (`POST /api/session` with projectId): directory = `projects.directory` (the project's path). Project directories are created at project creation time.
3. **resolveDirectory** (middleware for C-class routes): reads `session.directory` from OpenCode's `session` table. Since `workspace.directory` was set correctly before session creation, `session.directory` is automatically correct.

### workspaceId
OpenCode's multi-tenant isolation field. Each workspace is a separate OpenCode instance/directory. A single user can have multiple workspaceIds (session-level + project-level). openimago maps workspaceId → userId via `workspace_refs` for event routing.

### GlobalEventManager
An Effect-powered service in openimago that maintains a persistent SSE connection to OpenCode's `/global/event` endpoint. Receives ALL bus events from OpenCode (with workspace/directory/project metadata), resolves each event's workspaceId to a userId via `workspace_refs`, and fans out to the correct user's SSE connection. Supports automatic reconnection with exponential backoff.

### Frontend
Vue 3 SPA。代码位于 `packages/web/`。通过 Vite 代理 `/api` 到后端 dev server（dev）；生产构建为静态文件由 Hono serve。

### packages/web
前端 Vue 3 SPA。使用 Vue 3 + Vite + Quasar CLI。UI 组件遵循 Quasar 规范（`quasar-skilld` skill）。

### packages/openimago
后端代码所在目录（原根目录代码迁移至此）。使用 Bun + Hono + Effect + Drizzle。

### project_id ("global")
All sessions in this deployment have `project_id = "global"` because directories are not git repos. Data isolation uses `workspace_id` + `directory`, not `project_id`.

---

## Story Domain

The structured creative state of a Project, authored by the AI agent and stored as schema JSON files in the project directory (ADR 0004). The filesystem is the source of truth; the frontend reads these via the `projectStory*` APIs.

### Bible
Global, episode-independent canon for a Project: world settings, **Characters**, **Scenes**, and **Style Seeds**. Stored in `story/bible.json`. Characters/Scenes/StyleSeeds are reusable definitions referenced by Shots.

### Series
The index of Episodes for a Project plus overall status. Stored in `story/series.json`.

### Episode
One unit of the Series — a script with a logline, synopsis, and an ordered list of **Shots**. Stored in `story/episodes/ep_NNN.json`. A Project may have many Episodes; the workspace shows one **current Episode** at a time.

### Scene
A reusable *setting* defined in the Bible (e.g. "neon-alley"): location, mood, lighting. A Scene is **not** a storyboard card. Shots reference a Scene via `sceneId`. (Historical note: earlier UI copy called storyboard cards "场景" — that was wrong; the cards are Shots.)

### Shot (镜头)
A single storyboard frame within an Episode (`EpisodeShot`): `shotNumber`, the `sceneId` it takes place in, a `description` (director's notes), camera/lighting notes, dialog, referenced Characters, and a `status` (`pending → in_progress → generated → review → approved`). A Shot has **no title field** — it is identified by its `shotNumber` and `description`. The storyboard panel's cards are Shots of the current Episode.

### Run (生成运行)
One execution of a generation tool, recorded in `story/runs/ep_NNN.runs.json` (`GenerationRun`). Carries the resolved params and, on success, a `result` with `artifactId`, `kind`, and `access.thumbnail`/`access.preview` URLs. A Run links to a Shot via `shotId` — but Runs that generate Bible-level concept art (Character/Scene design) have `shotId: null` and link only to a Workflow node. A Shot's generated media is the set of completed Runs whose `shotId` matches it.

### Artifact / Output
Agent-generated media (image/video/audio) produced by a Run, scanned from the project `outputs/` directory and exposed via the `projectOutputs` API. The right-hand "AI 产出" panel lists these. Distinct from an **Asset** (user-uploaded reference, see above).

---

## Visual Direction

暗黑创意工坊 (Dark + Neon)。深色背景 + 高对比度 + 霓虹点缀。暗底让用户生成的图片/视频成为视觉焦点。字体倾向几何感无衬线体。动效精简而有冲击力：页面入场交错动画、hover 发光效果、消息流平滑滚动。

## Design Principles

### 0. 前后端分离

后端（`packages/openimago/`）只提供 JSON API + SSE 透传。前端（`packages/web/`）是独立 SPA，通过 Vite 代理（dev）/ 静态文件（prod）与后端通信。根目录仅存放项目级文档和 workspace 配置。

### 1. API 对齐 OpenCode SDK

所有接口参数命名、行为语义与 OpenCode 的 `@opencode-ai/sdk` 保持一致，不自创命名。

```
✅ 正确: workspace / directory / roots / order / cursor
❌ 错误: workspaceID / dir / onlyRoot / sort / pagination
```

前端可以直接用 `@opencode-ai/sdk` 的类型和客户端，openimago 只做透传和鉴权。

### 2. 路由三分类 (F / C / E)

| 类别 | 含义 | 实现方式 |
|------|------|---------|
| **F (Fetch)** | 纯读查询 | openimago 直接查共享 PG，不经过 OpenCode HTTP |
| **C (Command)** | 需要 OpenCode 运行时 | 转发到 OpenCode HTTP，注入 `?workspace=&directory=` |
| **E (Event)** | 实时事件流 | openimago 连接 OpenCode `/global/event`，按 workspaceId → userId 分发到各用户 SSE |

### 3. 取消走 API，不走 AbortSignal

前端取消生成调用 `POST /api/session/:id/abort` → openimago 转发到 OpenCode。不通过浏览器 fetch 的 AbortSignal 传播来中断，避免页面刷新/断连导致 AI 生成意外终止。

### 4. 目录由 openimago 统一管理

前端不传递 `directory`。openimago 在 `POST /api/session` 时自行解析目录路径（project session → `projects.directory`，standalone → `/{COS_BASE_PATH}/{workspaceId}`），创建 `mkdir` 后将路径写入 OpenCode 的 `workspace.directory` 字段。OpenCode 的 workspace routing middleware 使用 `workspace.directory` 作为 `target.directory`，因此后续所有 C-class 请求的 `session.directory` 自动正确。

openimago 不维护独立的目录注册表。`workspace_refs` 表仅记录 `workspaceId → userId / projectId` 的关联关系。

### 5. 软删除，不物理清理

目录和项目记录设 `status = 'archived'`，不 `rm -rf`。
