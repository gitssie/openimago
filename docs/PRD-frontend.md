# PRD: openimago 前端 SPA — AI 图片/视频创作平台界面

## Problem Statement

openimago 是一个 AI 图片/视频创作平台，后端 API 已完备（Bun + Hono + Effect + Drizzle + OpenCode 代理），但 `packages/web/` 目录为空，没有任何前端代码。用户无法通过浏览器使用平台的所有功能：项目创建、AI 会话交互、资产浏览、Prompt 模板管理。

## Solution

构建 Vue 3 + Quasar CLI 前端 SPA，实现完整的 AI 创作平台体验。核心交互是「会话工作台」——用户在其中与 AI 对话、查看生成的图片/视频、管理产出。所有页面采用暗黑创意工坊 (Dark + Neon) 视觉调性，左侧 QDrawer 导航，聚光输入框为标志性记忆点。

## User Stories

### 认证
1. As a 新用户, I want 通过邮箱注册账号, so that 我能登录平台
2. As a 用户, I want 通过邮箱密码登录, so that 我能访问我的项目
3. As a 用户, I want 通过 OAuth 快速登录, so that 我不用记额外密码
4. As a 已登录用户, I want 看到我的头像和用户名, so that 我知道当前身份

### 项目管理
5. As a 用户, I want 创建新项目, so that 我能为不同创作任务组织工作空间
6. As a 用户, I want 浏览项目列表（卡片网格）, so that 我能快速找到目标项目
7. As a 用户, I want 查看项目详情（会话列表、统计）, so that 我了解项目内的工作进展
8. As a 用户, I want 编辑项目名称/描述, so that 项目信息保持准确
9. As a 用户, I want 归档不需要的项目（软删除）, so that 项目列表保持整洁

### 会话工作台（核心）
10. As a 用户, I want 在项目内创建 AI 会话, so that 我开始一次创作对话
11. As a 用户, I want 在聊天框输入 prompt 发送给 AI, so that AI 开始生成图片/视频
12. As a 用户, I want 看到 AI 的流式响应（打字机效果）, so that 我知道 AI 正在工作
13. As a 用户, I want 在消息流中直接看到生成的图片/视频, so that 我即时预览创作结果
14. As a 用户, I want 点击图片放大预览, so that 我仔细检查生成质量
15. As a 用户, I want 下载生成的图片/视频到本地, so that 我在其他地方使用
16. As a 用户, I want 对某条消息重新生成, so that 我获得不同的创作结果
17. As a 用户, I want 查看会话列表（左侧栏）, so that 我在不同会话间快速切换
18. As a 用户, I want 终止正在运行的 AI 生成, so that 我中断不想要的生成
19. As a 用户, I want 滚动回看历史消息, so that 我回顾之前的对话和结果

### 资产库
20. As a 用户, I want 上传图片/视频到资产库, so that 我管理素材文件
21. As a 用户, I want 按时间/类型浏览已上传的资产, so that 我找到需要的素材
22. As a 用户, I want 查看资产详情, so that 我了解文件信息
23. As a 用户, I want 删除不需要的资产（软删除）, so that 资产库保持整洁

### Prompt 模板
24. As a 用户, I want 创建 Prompt 模板, so that 我保存常用 prompt 以便复用
25. As a 用户, I want 浏览、搜索 Prompt 模板, so that 我找到合适的模板
26. As a 用户, I want 编辑和删除模板, so that 模板库保持最新

### 个人设置
27. As a 用户, I want 修改昵称和邮箱, so that 我的账户信息准确
28. As a 用户, I want 查看我的 workspaceId, so that 我了解后端隔离标识

### 管理后台
29. As an 管理员, I want 查看所有用户列表, so that 我了解平台使用情况
30. As an 管理员, I want 修改用户角色, so that 我控制用户权限

## Implementation Decisions

### 模块划分

| 模块 | 职责 | 可独立测试 |
|---|---|---|
| **App Shell** | QLayout + QHeader + QDrawer + QPageContainer 全局布局骨架 | ✅ |
| **Auth** | 登录/注册/OAuth 页面 + Pinia auth store | ✅ |
| **Projects** | 项目列表 + 项目详情页面 + Pinia projects store | ✅ |
| **Session Workspace** | 会话工作台（核心）— 聊天流 + 会话侧栏 + 聚光输入框 + Pinia chat/sessions stores | ❌（依赖 SSE + OpenCode proxy） |
| **Assets** | 资产库列表 + 详情 + 上传 + Pinia assets store | ✅ |
| **Prompts** | Prompt 模板 CRUD + Pinia prompts store | ✅ |
| **Settings** | 个人设置页面 | ✅ |
| **Admin** | 用户管理页面（admin role gate） | ✅ |

### 技术决策

1. **框架**: Vue 3 + Composition API + `<script setup>` — 与 CLAUDE.md 一致。
2. **UI 库**: Quasar CLI — 提供完整组件体系、布局系统、平台能力（notify/cookies/dark）、CLI 构建链。不使用 shadcn-vue。
3. **状态管理**: Pinia — Vue 3 官方推荐，Composition API 风格 store。
4. **路由**: vue-router 4 + auth guard（未登录重定向 /auth）。
5. **HTTP 客户端**: `@opencode-ai/sdk` 类型定义 + 自定义 fetch wrapper 调 openimago API。
6. **SSE**: 会话工作台使用 EventSource 或 fetch + ReadableStream 接收 OpenCode 流式响应。
7. **视觉调性**: 暗黑创意工坊 (Dark + Neon)。深色背景 (#0a0a0f → #12121a)、霓虹主色 (#00f0ff cyan / #a855f7 purple)、几何感无衬线字体。
8. **记忆点**: 聚光输入框 — 暗底上一束霓虹光晕聚焦在唯一输入点，暗示「这里是创作起点」。
9. **导航布局**: 左侧 QDrawer（可折叠 mini 模式）+ 右内容区。Drawer 项：项目 / 资产 / Prompt / 设置 / 管理（admin only）。
10. **会话工作台布局**: 三面板 — 左：会话列表（QList + 新建按钮），中：纯聊天流（消息嵌图/视频），底：聚光输入框。
11. **消息渲染**: 用户消息（气泡 + 文本 + 可选附件），AI 消息（流式文本 + 生成中进度条 + 生成结果图/视频 + 操作按钮 [预览/下载/重新生成]），系统消息（会话事件）。
12. **取消生成**: `POST /api/session/:id/abort`，不使用 AbortSignal。
13. **目录管理**: 前端不传 directory 参数，openimago 后端自行解析。
14. **软删除**: 项目/资产归档为 archived，不物理删除。

### API 路由对应

| 前端页面 | 调用的后端 API |
|---|---|
| 登录 | `POST /auth/register`, `POST /auth/login`, `GET /auth/oauth/:provider` |
| 项目列表 | `GET /api/platform/projects`, `POST /api/platform/projects` |
| 项目详情 | `GET /api/platform/projects/:id/stats`, `PATCH ...` |
| 会话列表 | `GET /api/platform/sessions`, `POST /api/platform/sessions` |
| 会话工作台 | `GET /api/session/:id/message` (F), `POST /api/session/:id/prompt` (C), `GET /api/event` (E), `POST /api/session/:id/abort` |
| 资产库 | `POST /api/platform/assets/upload`, `GET /api/platform/assets`, `GET /api/platform/assets/:id`, `DELETE ...` |
| Prompt 模板 | `POST /api/platform/prompts`, `GET /api/platform/prompts`, `PATCH ...`, `DELETE ...` |
| 设置 | `GET /auth/me`, `PATCH /auth/me` |
| 管理 | `GET /api/admin/users`, `PATCH /api/admin/users/:id/role` |

### Pinia Store 设计

```
stores/
├── auth.ts       → user, token, login(), logout(), register()
├── projects.ts   → projects[], currentProject, create(), update(), archive()
├── sessions.ts   → sessions[], currentSession, create(), fetchMessages()
├── chat.ts       → messages[], sendPrompt(), streaming, abort()
├── assets.ts     → assets[], upload(), delete()
└── prompts.ts    → templates[], CRUD
```

## Testing Decisions

### 测试策略

- **Store 单元测试**: 每个 Pinia store 独立测试，mock API 调用层。验证状态变更逻辑。
- **组件测试**: Vue Test Utils + `@vue/test-utils` 测试关键组件（AppShell, ChatMessage, SpotlightInput）。
- **E2E 测试**: 仅覆盖核心流（登录 → 创建项目 → 创建会话 → 发送 prompt → 查看结果），使用 Playwright。

### 测试文件结构

```
packages/web/src/__tests__/
├── stores/
│   ├── auth.test.ts
│   ├── projects.test.ts
│   └── ...
└── components/
    ├── AppShell.test.ts
    └── ...
```

## Out of Scope

- 实时多人协作编辑
- 视频流式生成预览
- 高级图片编辑画布（裁剪/滤镜/图层）
- 会话分享/导出
- 移动端原生适配（首期仅桌面 Web）
- 国际化 i18n
- 会话内图片对比/版本管理
- 用户头像上传

## Further Notes

- `CONTEXT.md` 已更新前端框架为 Vue 3 + Quasar CLI，移除了 React 冲突描述。
- 视觉方向已记录在 `CONTEXT.md` 的 Visual Direction 章节。
- `docs/agents/` 目录已创建，配置了 beads issue tracker、triage labels 映射、domain docs 结构。
- 前端项目骨架应在 `packages/web/` 下用 `bun create quasar` 或手动搭建。
- Quasar 暗色主题通过 `dark` plugin 全局启用，霓虹色通过 CSS 变量覆写 Quasar 默认变量实现。
