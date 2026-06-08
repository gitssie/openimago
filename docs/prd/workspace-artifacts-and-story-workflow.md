# Workspace Artifacts & Story Workflow PRD

## 1. 目标 (Goals)

- **统一制品面板**：Session 工作台和 Project 工作台共享同一套 `WorkspaceArtifactsPanel` 组件，仅 scope 不同（session-scoped / project-scoped）。消除 `SessionWorkspaceResultsPanel` 与 `ProjectWorkspaceGrid` 产出面板之间的重复。
- **制品优先的重生成体验**：用户点击某个已生成制品 → 编辑 prompt / 参数 → 重新生成。重生成创建**新的 run + 新的 artifact**，不修改历史输出。所有生成参数均可追溯。
- **参数编辑器 MVP**：prompt-first 表单，含可选的常用字段（negativePrompt / model / aspectRatio / duration / seed / referenceArtifacts），以及高级 JSON 兜底。工具特定 schema 后续迭代。
- **故事工作流**：项目支持结构化故事流程（角色 / 场景 / 道具 / 分镜），以 schema JSON 作为状态权威来源，支持分镜级生成 DAG 和运行历史。

## 2. 非目标 (Non-goals)

- 不引入 bd 式的 creative issue tracker。故事状态管理用 schema JSON + 稳定 ID / status / deps / artifact refs。
- 不在此 issue 实现宽泛的 UI / backend 变更。本 PRD 定义架构方向，实现由子 issue 驱动。
- 不在此阶段实现完整的 tool-specific schema 表单。MVP 仅覆盖通用字段和 JSON fallback。
- 不改变现有 OpenCode session 的生命周期管理。

## 3. 架构概览

```
┌──────────────────────────────────────────────────┐
│                   Frontend (Vue 3)                │
│                                                  │
│  SessionWorkspacePage          ProjectWorkspacePage
│       │                              │
│       └──────────┬───────────────────┘
│                  │
│        WorkspaceArtifactsPanel (shared)
│         ├─ Artifact list (grid + detail)
│         ├─ Parameter editor (prompt-first)
│         └─ Rerun action → new run + new artifact
│                  │
└──────────────────┼──────────────────────────────┘
                   │
┌──────────────────┼──────────────────────────────┐
│               Backend (openimago)                │
│                                                  │
│  workspace-generated-files API                   │
│  project-outputs API                             │
│  story state → JSON files in project directory   │
│                                                  │
│  Project directory:                              │
│  /mnt/cos/{projectId}/                           │
│    AGENTS.md                                     │
│    openimago.json                                │
│    story/                                        │
│      bible.json                                  │
│      series.json                                 │
│      episodes/ep_001.json                        │
│      workflow/ep_001.workflow.json               │
│      runs/ep_001.runs.json                       │
│    outputs/           (generated artifacts)       │
│    assets/            (uploaded references)       │
└──────────────────────────────────────────────────┘
```

## 4. 制品面板统一策略

### 4.1 现状

| 组件 | 位置 | 职责 | 缺陷 |
|------|------|------|------|
| `SessionWorkspaceResultsPanel` | SessionWorkspacePage 右侧 | 展示当前 session 生成结果（仅图片） | 仅 image；无法复用于 project |
| `ProjectWorkspaceGrid` | ProjectWorkspacePage 主体 | 展示项目 outputs + storyElements 占位 | 与 session panel 重复；无统一 artifact 模型 |

### 4.2 目标

- **一个 `WorkspaceArtifactsPanel` 组件**，支持 image / video / audio 三种 media kind。
- `SessionWorkspacePage` → scope=session，数据源为 session workspace files API。
- `ProjectWorkspacePage` → scope=project，数据源为 project outputs API（扫描项目目录 outputs/）。
- Panel 内支持：列表视图、单件详情预览、参数编辑入口、重生成触发。
- 保留现有 Quasar / Vue 约定（quasar-skilld），与 `SessionWorkspaceResultsPanel` 视觉风格对齐后逐步切换。

### 4.3 数据流

```
Session scope:
  Media ToolCall → WorkspaceFilesService.registerFile
    → workspaceGeneratedFiles 表
    → sessionWorkspaceFiles API
    → WorkspaceArtifactsPanel (scope=session)

Project scope:
  生成工具 → 写入 project/outputs/ 目录 + 注册 project file
    → projectOutputs / projectFiles API
    → WorkspaceArtifactsPanel (scope=project)
```

## 5. 制品优先重生成 UX

### 5.1 交互流程

```
用户点击某个 artifact
  → 右侧/Modal 展示 artifact 详情 + 生成参数
  → 用户编辑 prompt / 参数
  → 点击 "重新生成"
  → 创建新的 generation run
  → 生成完成后创建新的 artifact（不覆盖旧 artifact）
  → 新 artifact 追加到面板，旧 artifact 保留
```

### 5.2 参数来源

- **首次生成**：参数来自用户在聊天中的 prompt + tool call 参数。
- **重生成**：参数来自上一个 artifact 的元数据（prompt / provider / model / metadata），用户可编辑后提交。

### 5.3 参数编辑器 MVP

表单字段（优先级递减）：

| 字段 | 类型 | 说明 |
|------|------|------|
| prompt | text (必填) | 主 prompt 文本 |
| negativePrompt | text (可选) | 负面提示词 |
| model | select (可选) | 模型选择，从可用模型列表 |
| aspectRatio | select (可选) | 宽高比，如 1:1 / 16:9 / 9:16 |
| duration | number (可选) | 时长（秒），video / audio 用 |
| seed | number (可选) | 随机种子 |
| referenceArtifacts | multi-select (可选) | 参考已有 artifact 作为 img2img / style ref |
| advancedParams | JSON editor (可选) | 高级参数 JSON 兜底，任意 tool-specific 参数 |

**设计原则**：
- Prompt-first：主 prompt 是最突出、最先聚焦的字段。
- 常用字段以结构化表单呈现，降低用户心智负担。
- JSON editor 作为 escape hatch，不阻塞高级用户。
- Tool-specific schema（如 image_generate vs video_generate 的专属字段）后续迭代加入。

## 6. 故事工作流

### 6.1 核心概念

| 概念 | 存储 | 说明 |
|------|------|------|
| Bible | `story/bible.json` | 全局设定：世界观、角色库、场景库、风格种子 |
| Series | `story/series.json` | 剧集索引：episode 列表、总体状态 |
| Episode | `story/episodes/ep_NNN.json` | 单集脚本 + 分镜描述 |
| Workflow | `story/workflow/ep_NNN.workflow.json` | 分镜级生成 DAG：节点依赖、参数模板 |
| Runs | `story/runs/ep_NNN.runs.json` | 运行历史：每次生成的参数、结果、状态 |

### 6.2 数据权威来源

- **唯一权威来源是 schema JSON 文件**（存储在项目目录中）。
- 数据库中不重复存储故事内容。数据库仅存 `projects` 元数据和 `workspaceGeneratedFiles` 制品记录。
- JSON 文件由 AI agent 直接读写（通过 OpenCode tool calls），或由 openimago backend API 管理。
- 前端通过 API 读取 JSON 文件内容并渲染，写入通过 API 或 agent tool call。

### 6.3 生成依赖与运行历史

- **Workflow JSON** 定义分镜级生成 DAG：每个 node 的依赖关系（如 "先确定角色设计，再生成场景"）、参数模板、工具类型。
- **Runs JSON** 记录每次实际生成的：输入参数、输出 artifact refs、状态（running / completed / failed）、时间戳。
- 重生成时：workflow 指定**依赖关系**，runs 记录**历史**。前端展示运行历史和依赖状态。

### 6.4 AGENTS.md

项目目录中的 `AGENTS.md` 是 **AI 导航 / 操作指南**，不是完整剧本存储。内容示例：

```markdown
# Project: My Story

## Canonical files
- Bible: story/bible.json
- Series: story/series.json
- Active episode: story/episodes/ep_001.json
- Workflow: story/workflow/ep_001.workflow.json
- Runs: story/runs/ep_001.runs.json

## Current focus
- Episode 1: 赛博朋克街头 - 角色设计阶段
- Next: 场景概念设计

## Rules
- 所有故事修改通过 schema JSON 进行
- 角色命名使用英文 slug，中文名称在 displayName 字段
- 生成操作记录到 runs JSON
```

## 7. 实施路径

本 PRD 由以下 issue 驱动实现：

1. **openimago-s55** — 实现共享 WorkspaceArtifactsPanel MVP
2. **openimago-z51** — 项目创建时 scaffold AGENTS.md 和 story JSON 文件
3. 后续 issue — 参数编辑器、重生成流程、故事工作流 DAG 执行

## 8. 参考

- `docs/adr/0003-hybrid-artifact-panel-rerun-ux.md` — 制品面板与重生成 ADR
- `docs/adr/0004-story-state-json-schema.md` — 故事状态 JSON schema ADR
- `docs/adr/0002-media-toolcall-workspace-files.md` — 现有 Media ToolCall 协议
- `packages/web/src/pages/SessionWorkspacePage.vue` — 现有 session 工作台
- `packages/web/src/pages/ProjectWorkspacePage.vue` — 现有 project 工作台
