# openimago — Glossary & Design Principles

## Terms

### openimago
The management platform. Handles user auth, project management, directory lifecycle, and proxying to OpenCode. Deployed as a standalone container.

### OpenCode
The AI agent engine (`opencode serve`). Runs as a shared backend container service. openimago shares the same PostgreSQL database with OpenCode, giving direct read/write access to OpenCode's `workspace` and `session` tables.

### User
Each user has a unique `userId`. Users can have multiple OpenCode workspaces linked via `workspace_refs`. Users authenticate to openimago via JWT; openimago authenticates to OpenCode via shared Basic Auth.

### Workspace (the one entity)
A **directory** plus its `workspace` row. There is only one underlying thing — a folder. "Session-level" and "Project-level" are not two kinds of entity; they are the same folder differing only in **whether it is shared and named**. Anything keyed to a workspace (Story, attachments, outputs) is keyed to its **directory**, not to whether a project record exists.
_Avoid_: treating session-folder and project-folder as structurally different.

### Session-level Workspace
A workspace folder used by **exactly one** standalone session (`POST /api/session` without projectId), `workspace_refs.projectId = null`, directory `/work/{workspaceId}`. Transient and unnamed. Structurally identical to a project folder — it just isn't shared or persisted as a named project.

### Project-level Workspace
A workspace folder that is **named, persisted, and shared by many sessions** (`workspace_refs.projectId` set, directory `/mnt/cos/{projectId}`). The only real differences from a session-level workspace: a name, soft-delete lifecycle, and reuse across sessions.

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

The structured creative state of a **Workspace (directory)**, authored by the AI agent and stored as schema JSON files in that directory (ADR 0004). The filesystem is the source of truth. Story is **directory-scoped, not project-scoped** (ADR 0009): a workspace's `projectId` (or a session's `sessionId`) is only a key used to *resolve the directory* + check ownership — so a standalone session folder can hold Story exactly like a project folder. The single folder-driven Workspace page shows the Story tabs (故事板/时间线/概览) whenever the resolved directory has Story files, regardless of whether it is a named project.

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

### Cut (剪辑 / 粗剪)
The assembled, playable arrangement of an Episode's media on a time axis — the "粗剪" (rough cut). One Episode has at most one Cut. The **时间线** tab is the Cut editor — the project's **edit layer** (see below). A Cut owns an ordered list of **Clips** on its video track, an audio track (voiceover + BGM), and a transition track. A Cut is distinct from a **Shot** (a single storyboard frame) and from a **Run** (one generation execution) — it is the *edit* that stitches generated media into a watchable sequence. The Cut carries its own persisted state (clip list with trim points, BGM, transitions) in `story/cuts/ep_NNN.cut.json` — a separate file from `episode.json` so edit-layer writes never collide with generation-layer (agent) script writes (ADR 0006). It is **not** a pure projection of the Episode.
_Avoid_: Sequence, Edit, Timeline (the tab is named 时间线, but the aggregate is a Cut), 粗剪 as a separate concept.

### Clip (片段)
One segment on a Cut's video track, and an **independent edit-layer entity**: `{ id, sourceShotId, inPoint, outPoint, order }`. A Clip references the Shot whose media it shows (`sourceShotId`) but carries its own trim (`inPoint`/`outPoint`) and ordering. A Shot maps to **0..N Clips** — it may appear zero times (cut out), once (default), or be **split** into several Clips. Split produces multiple Clips that share one `sourceShotId` with contiguous, non-overlapping `inPoint`/`outPoint` windows; each split fragment is **independently reorderable** and may interleave with other Shots' Clips on the video track. Clip frames are sampled from the source Shot's completed Run media within the trim window. Editing a Clip (trim / split / drag-reorder / delete) is a non-AI **edit-layer** operation on the Cut; "重新生成 / 手动编辑 / 添加到对话" on a Clip are *bridges back to the generation layer*, not edit-layer operations.
_Avoid_: Segment, Track item.

### Track (轨道)
A horizontal lane in a Cut. MVP has three kinds: **video track** (the Cut's ordered **Clips**), **audio track**, and **transition track** (the transition applied between consecutive Clips — Cut state). The audio track has two parts: **voiceover (配音)** — derived, one audio Run per Shot's `dialog`, following the clip — and **BGM (背景音乐)** — a single Cut-level audio bed that runs the length of the Episode (persisted Cut state). Voiceover is a projection; the clip list, BGM, and transitions are the Cut's own persisted state.
_Avoid_: Lane, Row.

### Generation layer vs Edit layer
Two distinct planes of work on a Project, deliberately decoupled:
- **Generation layer (AI):** producing/regenerating media for Shots — the 故事板 (storyboard) and 对话 (chat). Owns Shots, Runs, Artifacts. AI-driven.
- **Edit layer (non-AI):** refining a Cut into the final edit — the 时间线 (timeline). Owns Clip trims, splits, reordering, transitions, BGM. Pure video editing, no AI.
The **first** version of a Cut is *assembled by the agent* (a generation-layer action that writes `cut.json` — it stitches the Episode's Shots into a rough cut with voiceover + BGM, the "粗剪版本已生成" flow). Thereafter the user *edits* that Cut in the non-AI edit layer. Both the agent and the user write `cut.json`; ADR 0005 optimistic concurrency arbitrates the rare race. A Clip's "重新生成" menu item is the one bridge from the edit layer back to the generation layer; otherwise the two planes do not mix.

---

## Billing

There are **two distinct charge paths**, by design — keep them separate:
1. **LLM token cost → CDC (automatic, out-of-band).** OpenCode accumulates conversation token cost onto `session.cost`; the CDC Worker turns each increase into a Ledger Charge.
2. **Media generation cost → inline tool charge.** Image/video generation tools charge the ledger **inline** (post to `billingService.chargeToolCall`) — media cost does **NOT** flow through `session.cost` or the CDC Worker.

### Billing CDC Worker
A standalone **golang** service (`packages/compute`, module `billing-cdc-worker`) that tails the OpenCode `public.session` table's change stream (CDC). It charges **only the LLM-token path**: automatically, out-of-band, from `session.cost` deltas. It does NOT see media generation cost.
_Avoid_: calling it the "billing service" (that is the TS ledger API); assuming it bills media generation.

### session.cost (LLM-token charge source)
The `cost` column on the OpenCode `session` row — the source of truth **for LLM token charges only**. When OpenCode increases `session.cost`, the CDC Worker turns the **delta** into a Ledger Charge. Media generation cost does NOT live here.

### Media generation charge (inline)
The charge for an image/video generation, posted **inline** by the media tool/service to `billingService.chargeToolCall` after a successful provider result (openimago-xqr). This is the path a media **rerun** also bills through — never CDC.

### Ledger Charge
A negative-micros entry in the billing ledger (`amountMicros < 0`). For the CDC path: `delta = (afterCost − beforeCost) × 1e6`, user resolved via the session's `workspace_id`, written + a CDC-processed marker in **one idempotent DB transaction** (deduped by LSN::txid::table::op::pk). For the inline media path: written directly by `chargeToolCall`.
_Avoid_: positive charge amounts, double-charging on replay.

### billingService (TS)
The TypeScript ledger API in `packages/openimago/src/billing` (`getOrCreateAccount`, `chargeToolCall`, `checkBalance`). Backs the **inline media charge** path and balance gating (proxy routes check balance before a prompt). Distinct from the CDC Worker (which does automatic LLM-token charging).

### Pre-charge lifecycle (media)
The media inline path is **pre-charge → execute → confirm | refund**, with an expiry safety net (ADR 0010):
- **Pre-charge**: debit the ledger *before* calling the provider; stamp `expiresAt = now + TTL` (TTL is config, no hidden default).
- **Confirm**: on provider success, mark the pre-charge CONFIRMED and clear its expiry (the debit stands).
- **Refund**: on provider failure, reverse the debit.
- **Expiry release**: a pre-charge past `expiresAt` still unconfirmed and unrefunded (e.g. the process crashed mid-generation) is auto-refunded by the **Billing CDC Worker's** per-minute expiry ticker (idempotent SQL). Distinguishes a *stuck* pre-charge from a *succeeded* one via the CONFIRMED marker.
_Avoid_: assuming a success signal exists without Confirm; auto-refunding confirmed charges.

### Reservation (full hold→settle, NOT built)
The larger hold-doesn't-debit-until-settle model with an async video reserve→submit→poll→settle flow (openimago-3xp full scope). Deliberately deferred — only the pre-charge expiry safety net (above) is built.
_Avoid_: assuming true hold/settle exists; treating pre-charge as a non-debiting hold.

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
