# openimago — Glossary & Design Principles

## Terms

### openimago
The management platform. Handles user auth, project management, directory lifecycle, and proxying to OpenCode. Deployed as a standalone container.

### OpenCode
The AI agent engine (`opencode serve`). Runs as a shared backend container service.

### User
Each user has a unique `userId` that doubles as `workspaceId` for OpenCode data isolation. Users authenticate to openimago via JWT; openimago authenticates to OpenCode via shared Basic Auth.

### Project
A user-created named workspace. Has a persistent directory at `/mnt/cos/{projectId}`. Multiple sessions can share the same project directory. Soft-deleted (archived, never physically removed).

### Session (OpenCode)
An AI conversation record in OpenCode's `session` table. openimago queries this table directly for session listing (F class).

### Asset
User-uploaded media file (image, video, audio). Stored in COS under the user's assets root directory, metadata tracked in `assets` table. NOT agent-generated — agent outputs stay in the workdir and the user downloads them directly.

The assets table provides a flat, queryable view across all uploads regardless of storage path. Users browse assets by recency, type, source session — not by directory hierarchy.

### WorkDir
Directory registry table (`work_dirs`). Records: `userId`, `projectId` (nullable), `type` ("project" | "session" | "assets"), `fullPath` (`/mnt/cos/{id}`), `status` ("active" | "archived").

| type | fullPath | Created By | Shared? |
|------|----------|------------|---------|
| `project` | `/mnt/cos/proj_xxx` | ProjectService.create() | Yes — all sessions in this project reuse this dir |
| `session` | `/mnt/cos/dir_xxx` | WorkDirService.createSessionDir() | No — unique dir per independent session |
| `assets` | `/mnt/cos/assets_{userId}` | On first upload | No — per-user assets root |

### workspaceId
OpenCode's multi-tenant isolation field. openimago sets `workspaceId = userId` on every proxied request.

### directory
Filesystem working path at `/mnt/cos/{id}`. Must exist before any OpenCode API call. Set via `?directory=` query param.

### Frontend
Vue 3 SPA。代码位于 `packages/web/`。通过 Vite 代理 `/api` 到后端 dev server（dev）；生产构建为静态文件由 Hono serve。

### packages/web
前端 Vue 3 SPA。使用 Vue 3 + Vite + Quasar CLI。UI 组件遵循 Quasar 规范（`quasar-skilld` skill）。

### packages/openimago
后端代码所在目录（原根目录代码迁移至此）。使用 Bun + Hono + Effect + Drizzle。

### project_id ("global")
All sessions in this deployment have `project_id = "global"` because `/mnt/cos/` directories are not git repos. Data isolation uses `workspace_id` + `directory`, not `project_id`.

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
| **E (Event)** | 实时事件流 | 转发 OpenCode SSE，streaming 透传 |

### 3. 取消走 API，不走 AbortSignal

前端取消生成调用 `POST /api/session/:id/abort` → openimago 转发到 OpenCode。不通过浏览器 fetch 的 AbortSignal 传播来中断，避免页面刷新/断连导致 AI 生成意外终止。

### 4. 目录由 openimago 统一管理

前端不传递 `directory`。openimago 根据 context（projectId / sessionId）自行解析目录路径，创建（`mkdir`）后注册到 `work_dirs` 表。

### 5. 软删除，不物理清理

目录和项目记录设 `status = 'archived'`，不 `rm -rf`。
