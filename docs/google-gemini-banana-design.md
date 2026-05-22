# Google Gemini Banana — openimago 前端 UI 设计图

> **用途**: 作为后续前端 UI 调整的设计基准。所有页面结构、组件拆分、状态流转、交互细节均在此定义。
> **版本**: v1.0 | **日期**: 2026-05-20
> **技术栈**: Vue 3 + Quasar 2 + Pinia + TypeScript + vue-router

---

## 目录

1. [系统总览](#1-系统总览)
2. [设计系统 (Design System)](#2-设计系统-design-system)
3. [页面架构与路由](#3-页面架构与路由)
4. [全局布局 (App Shell)](#4-全局布局-app-shell)
5. [页面设计规范](#5-页面设计规范)
6. [组件树 (Component Tree)](#6-组件树-component-tree)
7. [数据流与状态管理](#7-数据流与状态管理)
8. [API 接口映射](#8-api-接口映射)
9. [数据模型](#9-数据模型)
10. [交互细节清单](#10-交互细节清单)
11. [后续优化方向](#11-后续优化方向)

---

## 1. 系统总览

### 1.1 项目定位

openimago 是一个 **AI 图片/视频创作平台**，同时也是 **OpenCode AI 前置路由管理系统**：

- 为用户提供 AI 图片/视频创作界面 (SPA)
- 作为 OpenCode 的反向代理，提供多用户接入、认证鉴权、项目隔离
- 核心交互是「会话工作台」——用户在其中与 AI 对话、查看生成的图片/视频

### 1.2 三层架构

```
浏览器 SPA (Vue 3 + Quasar 2)
    ↓ HTTP / SSE
openimago 后端 (Bun + Hono + Effect + Drizzle)
    ┌──────┐ ┌────────┐ ┌─────────┐ ┌───────────────┐
    │ Auth │ │Project │ │  Proxy  │ │ Assets/Prompts │
    └──────┘ └────────┘ └─────────┘ └───────────────┘
    ↓ proxy + inject workspace/directory
OpenCode AI Engine (共享 PostgreSQL + /mnt/cos volume)
```

### 1.3 核心功能矩阵

| 功能模块 | 描述 | 用户故事 |
|---------|------|---------|
| 认证 | 注册、登录、OAuth (GitHub/Google) | 用户接入平台 |
| 项目 | 创建、浏览、归档项目 | 按创作主题组织会话 |
| 会话工作台 | AI 对话、流式响应、图片/视频生成 | 核心创作体验 |
| 资产库 | 上传、浏览、删除媒体素材 | 管理创作素材 |
| Prompt 模板 | CRUD prompt 模板 | 复用常用创作指令 |
| 设置 | 修改昵称/邮箱 | 个人信息管理 |
| 管理后台 | 用户列表、角色修改 | 管理员权限控制 |

---

## 2. 设计系统 (Design System)

### 2.1 色彩体系

#### 品牌色 (Brand Colors)

| Token | Hex | 用途 |
|-------|-----|------|
| `$neon-cyan` | `#00f0ff` | 主色、交互态、链接、焦点光晕、`$primary` |
| `$neon-purple` | `#a855f7` | 辅色、AI 消息、次要按钮、装饰、`$secondary` |
| `$neon-pink` | `#ff2d95` | 强调色、错误、危险操作、`$accent` + `$negative` |

#### 语义色 (Semantic)

| Token | Hex | 用途 |
|-------|-----|------|
| `$positive` | `#39ff14` | 成功、活跃状态标签 |
| `$warning` | `#f59e0b` | 警告 |
| `$info` | `#00f0ff` | 信息提示 |

#### 背景层级 (Background Stack)

| 层级 | 用途 | 色值 |
|------|------|------|
| `body` | 最底层背景 | `#08080f` |
| `$dark-page` | 页面背景 | `#0a0a0f` |
| `$dark` | 卡片/组件背景 | `#0a0a0f` |
| 卡片表面 | 玻璃拟态卡片 | `rgba(18,18,32,0.60)` + backdrop-filter |
| 输入框 | 输入区域 | `rgba(16,16,28,0.95)` |
| Drawer/Header | 导航栏 | `rgba(8,8,15,0.85-0.90)` |

#### 背景环境光晕

```scss
body::before {
  content: '';
  position: fixed; inset: 0; z-index: 0;
  background:
    radial-gradient(ellipse 80% 60% at 30% 20%, rgba(0,240,255,0.04) 0%, transparent 60%),
    radial-gradient(ellipse 60% 80% at 70% 80%, rgba(168,85,247,0.04) 0%, transparent 60%),
    radial-gradient(ellipse 40% 40% at 50% 50%, rgba(255,45,149,0.02) 0%, transparent 70%);
  pointer-events: none;
}
```

### 2.2 字体与排版

| 层级 | 字号 | 字重 | 颜色 | 用途 |
|------|------|------|------|------|
| h3 | 28px | Bold | `neon-text-cyan` | Auth 页 Logo |
| h4 | 24px | Bold | `neon-text-cyan` | 页面标题 |
| h5 | 20px | Bold | `#e8e8ec` | 区块标题 |
| h6 | 16px | Medium | `#e8e8ec` | 卡片标题 |
| body1 | 15px | Regular | `#e8e8ec` | 正文/消息 |
| body2 | 14px | Regular | `text-grey-4` | 卡片内容 |
| caption | 12px | Regular | `text-grey-5` | 辅助文字/时间戳 |

### 2.3 圆角规范

| 元素 | 圆角值 |
|------|--------|
| 普通卡片 `.neon-card / .grid-card` | 14px |
| 玻璃卡片 `.glass-card` | 20px |
| 用户消息气泡 | 18px 18px 4px 18px (右上小圆角) |
| AI 消息气泡 | 18px 18px 18px 4px (左上小圆角) |
| 聚光输入框 | 16px |
| 普通按钮 | Quasar 默认圆角 |
| 商标按钮 | rounded (pill 形状) |

### 2.4 阴影系统

| 层 | 阴影 |
|----|------|
| 霓虹文字 | `0 0 10px rgba(0,240,255,0.35), 0 0 30px rgba(0,240,255,0.1)` |
| 紫光文字 | `0 0 10px rgba(168,85,247,0.35), 0 0 30px rgba(168,85,247,0.1)` |
| 聚光输入框 (focused) | `0 0 32px rgba(0,240,255,0.10), 0 0 64px rgba(168,85,247,0.05), inset 0 0 32px rgba(0,240,255,0.02)` |
| 卡片悬浮 | `0 4px 24px rgba(0,240,255,0.06)` |
| 玻璃卡片 | `0 0 60px rgba(0,240,255,0.04), 0 8px 40px rgba(0,0,0,0.5)` |
| 输入框焦点边框 | `0 0 0 1px rgba(0,240,255,0.2), 0 0 12px rgba(0,240,255,0.06)` |

### 2.5 动效规范

| 场景 | 时长 | 效果 |
|------|------|------|
| 卡片 hover | 0.3s ease | translateY(-2px) + border-color glow |
| 输入框 focus | 0.3s ease | border-color transition + box-shadow |
| 页面切换 | 0.2s ease | fade-up (opacity 0→1, Y 6px→0) |
| Drawer mini 展开 | 0.2s | 宽度过渡 |

### 2.6 滚动条

```scss
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(168,85,247,0.12); border-radius: 10px; }
::-webkit-scrollbar-thumb:hover { background: rgba(168,85,247,0.25); }
```

---

## 3. 页面架构与路由

### 3.1 路由表

| 路径 | 组件 | 权限 | 描述 |
|------|------|------|------|
| `/auth` | `AuthPage.vue` | 公开 | 登录/注册/OAuth |
| `/` | `MainLayout.vue` | 需认证 | 全局布局外壳 |
| `/projects` | `ProjectsPage.vue` | 需认证 | 项目卡片列表 |
| `/projects/:id` | `ProjectDetailPage.vue` | 需认证 | 项目详情+会话列表 |
| `/sessions/:id` | `SessionWorkspacePage.vue` | 需认证 | 会话工作台 (核心) |
| `/assets` | `AssetsPage.vue` | 需认证 | 资产库网格 |
| `/prompts` | `PromptsPage.vue` | 需认证 | Prompt 模板列表 |
| `/settings` | `SettingsPage.vue` | 需认证 | 个人设置 |
| `/admin/users` | `AdminUsersPage.vue` | 需认证+admin | 用户管理 |
| `/:catchAll(.*)*` | `ErrorNotFound.vue` | 公开 | 404 页面 |

### 3.2 导航守卫

```typescript
Router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isAuthenticated) return '/auth'
  // requiresAdmin check is currently missing — should redirect to 403 or /projects
})
```

---

## 4. 全局布局 (App Shell)

### 4.1 布局结构

```
┌─────────────────────────────────────────────────────────┐
│ QHeader (blur玻璃顶栏)                                    │
│ [☰]  openimago                              [👤 下拉菜单]  │
├──────────┬──────────────────────────────────────────────┤
│ QDrawer   │  QPageContainer                              │
│ (mini)    │                                              │
│           │   <router-view />                            │
│ 📁 项目   │   当前页面内容                                │
│ 🖼️ 资产   │                                              │
│ ✨ Prompt │                                              │
│ ───────── │                                              │
│ ⚙️ 设置   │                                              │
│ 🛡️ 管理   │  (admin only)                                │
├──────────┴──────────────────────────────────────────────┤
│ 无底部栏                                                  │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Header

- 左侧: 汉堡菜单按钮 (toggle drawer, dense round icon)
- 中间: toolbar-title "openimago"
- 右侧: 用户头像按钮 (account_circle icon) → q-menu:
  - [设置] → `/settings`
  - [退出登录] → `auth.clearAuth()` + `window.location.href = '/auth'`
- 视觉: `rgba(8,8,15,0.85)` + backdrop-filter blur(16px) + bottom border 1px

### 4.3 Drawer 导航

- 模式: mini-mode (默认收起, hover 展开, mini-to-overlay)
- 激活态: left 2px `#00f0ff` border + `rgba(0,240,255,0.04)` bg
- 视觉: `rgba(8,8,15,0.90)` + backdrop-filter blur(12px)

| 图标 | 标签 | 路由 | 条件 |
|------|------|------|------|
| folder | 项目 | `/projects` | 全部用户 |
| image | 资产 | `/assets` | 全部用户 |
| auto_awesome | Prompt | `/prompts` | 全部用户 |
| settings | 设置 | `/settings` | 全部用户 |
| admin_panel_settings | 管理 | `/admin/users` | `auth.isAdmin` |

---

## 5. 页面设计规范

### 5.1 认证页 AuthPage

**路由**: `/auth` | **组件**: `pages/AuthPage.vue`

#### 布局

```
                ┌──────────────────────┐
                │     openimago        │  ← neon-text-cyan, h3
                │  AI 图片/视频创作平台  │  ← 副标题 text-grey-5
                ├──────────────────────┤
                │  [登录]   [注册]      │  ← QTabs, no-caps
                ├──────────────────────┤
                │  [📧] 邮箱           │  ← QInput outlined dark
                │  [🔒] 密码           │
                │  [──── 登录按钮 ────] │  ← full-width, primary, rounded
                │                      │
                │  ─── 第三方登录 ────  │  ← separator + label
                │  [GitHub] [Google]   │  ← outline rounded buttons
                └──────────────────────┘
                ← .glass-card (420px)
      背景: radial-gradient 环境光晕
```

#### 状态

| 状态 | 触发 | 显示 |
|------|------|------|
| `default` | 首次加载 | 空表单 + placeholder |
| `loading` | 提交 | 按钮 loading + 禁用输入 |
| `error` | API 错误 | q-banner bg-negative |
| `oauth_redirect` | 点击 OAuth | 跳转到 provider |

#### 交互规则

1. Tab 切换 login/register, 表单独立
2. Login: `api.login({email, password})` → success → `router.push('/projects')`
3. Register: `api.register({username, email, password})` → success → `router.push('/projects')`
4. OAuth: `window.location.href = '/auth/oauth/${provider}'`
5. Error: catch → `error.value = e.message`

#### 当前待优化

- 密码校验应改为 8 位 (PRD 要求)
- 缺少密码确认字段
- OAuth 回调无 loading 状态
- 无"忘记密码"功能
- Error 显示可用内联提示替代 q-banner

---

### 5.2 项目列表 ProjectsPage

**路由**: `/projects` | **组件**: `pages/ProjectsPage.vue`

#### 布局

```
┌───────────────────────────────────────────────┐
│ 项目 (neon-cyan h4)           [+ 新建项目]     │
├───────────────────────────────────────────────┤
│                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ 项目名称  │  │ 项目名称  │  │ 项目名称  │    │
│  │ 项目描述  │  │ 项目描述  │  │ 项目描述  │    │
│  │ [active] │  │ [active] │  │ [active] │    │
│  └──────────┘  └──────────┘  └──────────┘    │
│                                               │
│  响应式: col-12 col-sm-6 col-md-4            │
│                                               │
└───────────────────────────────────────────────┘
```

#### 卡片定义

- class: `neon-card`, cursor: pointer
- background: `rgba(20,20,36,0.50)`, border: `1px solid rgba(255,255,255,0.04)`
- border-radius: 14px
- hover: border `rgba(0,240,255,0.15)` + shadow + translateY(-2px)
- 点击 → `/projects/${p.id}`

#### 状态

| 状态 | 显示 |
|------|------|
| `loading` | 居中 q-spinner |
| `empty` | folder_open icon + "还没有项目，创建第一个吧" |
| `data` | 卡片网格 |
| `creating` | Dialog 打开, 创建按钮 loading |

#### 创建 Dialog

```
┌───────────────────────┐
│ 新建项目               │
│                       │
│ 项目名称 * [_______]  │  ← autofocus, 必填
│ 描述     [_______]    │  ← textarea, 可选
│                       │
│      [取消] [创建]     │
└───────────────────────┘
```

创建成功: dialog 关闭 → `router.push('/projects/${p.id}')`

#### 当前待优化

- 缺少项目编辑 (rename/archive) 入口
- 卡片上缺少 sessionCount 统计
- 缺少搜索/过滤/排序
- 空状态设计可更有创意

---

### 5.3 项目详情 ProjectDetailPage

**路由**: `/projects/:id` | **组件**: `pages/ProjectDetailPage.vue`

#### 布局

```
┌───────────────────────────────────────────────┐
│ [← 返回]                                       │
│                                               │
│ 项目名称 (neon-cyan h4)                        │
│ ID: proj_xxx (text-grey-5 caption)             │
│ ─────────────────────────────────────────────  │
│ 会话 (h5)                     [+ 新建会话]     │
│                                               │
│ ┌────────────────────────────────────────────┐│
│ │ 💬 会话标题或ID              2026-05-20    ││
│ │ 💬 另一个会话                2026-05-19    ││
│ │ 💬 第三个会话                2026-05-18    ││
│ └────────────────────────────────────────────┘│
└───────────────────────────────────────────────┘
```

#### 状态

| 状态 | 显示 |
|------|------|
| `loading` | 居中 spinner |
| `empty_session` | chat icon + "还没有会话" |
| `data` | 项目信息 + 会话列表 |

#### 交互规则

1. 返回 → `/projects`
2. 新建会话 → `api.createSession({ projectId })` → `window.location.href = '/sessions/${s.id}'`
3. 点击会话 → `$router.push('/sessions/${s.id}')`

#### 当前待优化

- 缺少编辑项目名称/描述
- 缺少归档操作
- 缺少 sessionCount / usage stats
- 整体偏简单, 缺少项目丰富的详情展示

---

### 5.4 会话工作台 SessionWorkspacePage

**路由**: `/sessions/:id` | **组件**: `pages/SessionWorkspacePage.vue`
**核心页面 — 最重要的交互**

#### 三面板布局

```
┌──────────────────────────────────────────────────────────────┐
│ ┌──────────────┐ ┌──────────────────────────────────────────┐│
│ │  会话侧栏     │ │             聊天区 (flex:1)               ││
│ │              │ │                                          ││
│ │ [+ 新建会话]  │ │  ┌─── 用户消息 (右对齐) ──────────────┐  ││
│ │──────────────│ │  │ 帮我生成一张猫咪图片                │  ││
│ │ 💬 会话A     │ │  └────────────────────────────────────┘  ││
│ │ 💬 会话B *   │ │                                          ││
│ │ 💬 会话C     │ │  ┌─── AI 消息 (左对齐) ───────────────┐  ││
│ │ 💬 会话D     │ │  │ 好的, 我来生成...                   │  ││
│ │              │ │  │ [生成图片/视频展示]                  │  ││
│ │              │ │  │ [预览] [下载] [重新生成]             │  ││
│ │              │ │  └────────────────────────────────────┘  ││
│ │              │ │                                          ││
│ │              │ │  ┌─── 聚光输入框 ──────────────────────┐  ││
│ │  width:      │ │  │ 描述你想创作的图片或视频...    [➤] │  ││
│ │  220px       │ │  └────────────────────────────────────┘  ││
│ └──────────────┘ └──────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

#### 会话侧栏

- 位置: 左侧固定 220px
- bg: `rgba(8,8,15,0.8)` + backdrop-filter blur(12px)
- border-right: `1px solid rgba(255,255,255,0.03)`
- [+ 新建会话] 按钮 → `full-width`, primary
- 会话列表: clickable q-item, 选中态 `bg-primary-opacity` + left 2px cyan border
- 每项: chat icon + 标题/ID + 时间 caption

#### 消息区域

- flex:1, overflow-y: auto, padding: 16px
- 自动滚动到底部 (`nextTick scrollTop = scrollHeight`)

消息气泡类型:

| 类型 | 对齐 | 样式 | 圆角 |
|------|------|------|------|
| `user` | 右对齐 | `rgba(0,240,255,0.06)` bg + cyan border | 18px 18px 4px 18px |
| `assistant` | 左对齐 | `rgba(168,85,247,0.04)` bg + purple border | 18px 18px 18px 4px |
| `error` | 居中 | q-banner bg-negative | rounded |

AI 消息操作: [重新生成] 按钮 → `chat.regenerate(lastUserMsg)`

#### 聚光输入框 (Spotlight Input) — 标志性元素

- 位置: 聊天区底部固定, 背景 `rgba(8,8,15,0.95)`, border-top
- 容器: `max-width: 720px; margin: 0 auto`
- 视觉:
  - bg: `rgba(16,16,28,0.95)`
  - border: `1px solid rgba(255,255,255,0.06)`, border-radius: 16px
  - focused: border-color `rgba(0,240,255,0.4)`
  - box-shadow: 多层 cyan + purple 光晕
  - caret-color: `#00f0ff`
- 操作:
  - 空闲: 右侧 send icon (primary)
  - 流式: 右侧 stop icon (negative)
  - Enter 发送 (`.prevent`)

#### 状态

| 状态 | 显示 |
|------|------|
| `loading` | 侧栏+消息区同时加载 spinner |
| `empty` | 居中 auto_awesome icon + "输入 prompt 开始创作" |
| `idle` | 消息历史 + 输入框就绪 |
| `streaming` | AI 区 q-spinner-dots + "AI 正在创作..." + 停止按钮 |
| `error` | 红色 q-banner 居中 |

#### 当前待优化 (重点)

| 优先级 | 问题 | 建议方案 |
|--------|------|---------|
| P0 | 无 SSE 流式响应 | 改用 EventSource / fetch ReadableStream 实现打字机效果 |
| P0 | 无生成图片/视频展示 | 渲染 AI 消息中的 media (img/video) |
| P0 | 无图片/视频预览 | 添加 lightbox / 模态预览 |
| P1 | 无下载生成结果 | 添加 download 按钮 |
| P1 | 会话列表无项目分组 | 按 project 分组显示 |
| P1 | 无会话标题自动生成 | 用第一条 prompt 截断作为标题 |
| P2 | 缺少快捷 Prompt 选择/插入 | 从 prompts store 加载可选模板 |
| P2 | 文件上传附件功能 | 输入框增加附件按钮 |
| P2 | 会话删除/归档 | 侧栏增加右键/长按菜单 |

---

### 5.5 资产库 AssetsPage

**路由**: `/assets` | **组件**: `pages/AssetsPage.vue`

#### 布局

```
┌───────────────────────────────────────────────┐
│ 资产库                         [上传文件组件]   │  ← q-uploader
├───────────────────────────────────────────────┤
│                                               │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐         │
│ │ 图片  │ │ 图片  │ │ 图片  │ │ 图片  │         │
│ │ [X]  │ │ [X]  │ │ [X]  │ │ [X]  │         │  ← delete btn
│ │ 名称  │ │ 名称  │ │ 名称  │ │ 名称  │         │
│ └──────┘ └──────┘ └──────┘ └──────┘         │
│                                               │
│ 响应式: col-6 col-sm-4 col-md-3              │
│                                               │
└───────────────────────────────────────────────┘
```

#### 卡片

- q-img (ratio 1:1) + `media-glow`
- 右下角绝对定位删除按钮 (delete icon, negative)
- 底部文件名 (ellipsis)

#### 状态

| 状态 | 显示 |
|------|------|
| `loading` | 居中 spinner |
| `empty` | image icon + "还没有上传资产" |
| `data` | 图片网格 |
| `uploading` | q-uploader 进度条 |

#### 当前待优化

- 缺少资产详情查看 (点击放大)
- 缺少按类型过滤 (图片/视频)
- 缺少搜索
- 上传成功后应自动刷新更精确

---

### 5.6 Prompt 模板 PromptsPage

**路由**: `/prompts` | **组件**: `pages/PromptsPage.vue`

#### 布局

```
┌───────────────────────────────────────────────┐
│ Prompt 模板                    [+ 新建模板]    │
├───────────────────────────────────────────────┤
│                                               │
│ ┌─────────────────┐ ┌─────────────────┐       │
│ │ 模板标题         │ │ 模板标题         │       │
│ │ 模板内容预览...   │ │ 模板内容预览...   │       │
│ │ [tag1] [tag2]   │ │ [tag3]          │       │
│ │           [🗑️]  │ │           [🗑️]  │       │  ← delete
│ └─────────────────┘ └─────────────────┘       │
│                                               │
│ 响应式: col-12 col-sm-6 col-md-4             │
│                                               │
└───────────────────────────────────────────────┘
```

#### 创建 Dialog

```
┌──────────────────────────────┐
│ 新建模板                      │
│                              │
│ 标题 * [________________]   │
│ Prompt 内容 * [__________]  │  ← textarea rows=5
│ 标签 [tag1, tag2...]        │  ← 逗号分隔
│                              │
│         [取消] [创建]        │
└──────────────────────────────┘
```

#### 当前待优化

- 缺少编辑功能 (目前只有删除)
- 缺少搜索/过滤
- 卡片上可使用模板内容插入会话工作台
- 缺少模板分类

---

### 5.7 设置 SettingsPage

**路由**: `/settings` | **组件**: `pages/SettingsPage.vue`

#### 布局

```
┌────────────────────────────────┐
│ 设置                            │
│                                │
│ ┌────────────────────────────┐ │
│ │ 个人设置                     │ │
│ │                            │ │
│ │ 昵称 [________________]    │ │
│ │ 邮箱 [________________]    │ │
│ │                            │ │
│ │ Workspace ID: user_xxx     │ │  ← text-grey-5 caption
│ │                            │ │
│ │           [保存]           │ │
│ └────────────────────────────┘ │
│         max-width: 600px       │
└────────────────────────────────┘
```

#### 当前待优化

- 保存后应使用 q-notify 替代 alert
- 缺少密码修改功能
- 缺少头像上传
- 没有 OAuth 绑定/解绑

---

### 5.8 管理后台 AdminUsersPage

**路由**: `/admin/users` | **组件**: `pages/AdminUsersPage.vue`

#### 布局

```
┌─────────────────────────────────────────────────┐
│ 用户管理 (neon-cyan h4)                          │
│                                                 │
│ ┌──────┬──────────┬────────┬──────────┐         │
│ │ 用户名│ 邮箱     │ 角色   │ 注册时间  │         │
│ ├──────┼──────────┼────────┼──────────┤         │
│ │ alice │ a@x.com │ [user▼]│ 2026...  │         │  ← q-select
│ │ bob   │ b@x.com │ [admin▼]│ 2026... │         │
│ └──────┴──────────┴────────┴──────────┘         │
│   q-table, dark flat bordered                    │
│   rowsPerPage: 20                                │
└─────────────────────────────────────────────────┘
```

#### 当前待优化

- 缺少搜索过滤
- 缺少分页 (当前只显示一页)
- 角色修改无确认对话框
- 缺少用户禁用/删除功能
- 无法将自己降级 (已有, 但需用户提醒)

---

### 5.9 404 页面 ErrorNotFound

**路由**: `/:catchAll(.*)*`

页面显示 404 提示, 提供返回首页链接。

---

## 6. 组件树 (Component Tree)

```
App.vue
├── AuthPage.vue                        → /auth
│   ├── QTabs (login / register)
│   ├── QForm (login)
│   │   ├── QInput (email)
│   │   └── QInput (password)
│   ├── QForm (register)
│   │   ├── QInput (username)
│   │   ├── QInput (email)
│   │   └── QInput (password)
│   ├── QBanner (error)
│   └── OAuth buttons (GitHub / Google)
│
├── MainLayout.vue                      → /
│   ├── QHeader
│   │   ├── QBtn (menu toggle)
│   │   ├── QToolbarTitle
│   │   └── QBtn (user menu)
│   │       └── QMenu
│   │           ├── [设置] → /settings
│   │           └── [退出登录]
│   ├── QDrawer (mini-mode)
│   │   └── QList
│   │       ├── QItem (项目 → /projects)
│   │       ├── QItem (资产 → /assets)
│   │       ├── QItem (Prompt → /prompts)
│   │       ├── QSeparator
│   │       ├── QItem (设置 → /settings)
│   │       └── QItem (管理 → /admin/users) [admin only]
│   │
│   └── QPageContainer → <router-view>
│       │
│       ├── ProjectsPage.vue            → /projects
│       │   ├── QCard (.neon-card) × N
│       │   └── QDialog (create project)
│       │       ├── QInput (name)
│       │       └── QInput (description)
│       │
│       ├── ProjectDetailPage.vue       → /projects/:id
│       │   ├── QList (sessions)
│       │   │   └── QItem × N
│       │   └── QBtn (new session)
│       │
│       ├── SessionWorkspacePage.vue    → /sessions/:id ⭐
│       │   ├── SessionSidebar
│       │   │   ├── QBtn (+ 新建会话)
│       │   │   └── QList (sessions)
│       │   │       └── QItem × N
│       │   ├── MessagesContainer
│       │   │   ├── ChatBubbleUser × N
│       │   │   │   └── text
│       │   │   ├── ChatBubbleAI × N
│       │   │   │   ├── text
│       │   │   │   ├── MediaDisplay (图片/视频)
│       │   │   │   └── ActionBtns (预览/下载/重新生成)
│       │   │   └── StreamingIndicator
│       │   │       └── QSpinnerDots
│       │   └── SpotlightInput
│       │       ├── QInput
│       │       └── QBtn (send/stop)
│       │
│       ├── AssetsPage.vue              → /assets
│       │   ├── QUploader
│       │   └── QCard (.neon-card) × N
│       │       ├── QImg
│       │       └── QBtn (delete)
│       │
│       ├── PromptsPage.vue             → /prompts
│       │   ├── QCard × N
│       │   ├── QBadge (tags) × N
│       │   └── QDialog (create prompt)
│       │       ├── QInput (title)
│       │       ├── QInput (content)
│       │       └── QInput (tags)
│       │
│       ├── SettingsPage.vue            → /settings
│       │   ├── QCard
│       │   │   ├── QInput (displayName)
│       │   │   ├── QInput (email)
│       │   │   └── QBtn (save)
│       │
│       ├── AdminUsersPage.vue          → /admin/users
│       │   └── QTable
│       │       └── QSelect (role) × N
│       │
│       └── ErrorNotFound.vue           → /:catchAll(.*)*
```

---

## 7. 数据流与状态管理

### 7.1 Pinia Store 架构

```
stores/
├── auth.ts       → user, token, isAuthenticated, isAdmin
│                    login(), register(), fetchMe(), clearAuth()
│
├── projects.ts   → projects[], loading
│                    fetchAll(), create(), update()
│
├── sessions.ts   → sessions[], loading
│                    fetchAll(), create()
│
├── chat.ts       → messages[], streaming, sessionId
│                    loadMessages(), sendPrompt(), abort(), regenerate()
│
├── assets.ts     → assets[], loading
│                    fetchAll(), remove()
│
└── prompts.ts    → templates[], loading
                    fetchAll(), create(), update(), remove()
```

### 7.2 数据流图

#### 认证流

```
AuthPage
  login() → api.login() → { user, token }
    → auth.setAuth(token, user)
    → localStorage.setItem('token', token)
    → router.push('/projects')

register() → api.register() → { user, token }
    → same as login
```

#### 项目流

```
ProjectsPage (mounted)
  → store.fetchAll()
  → api.listProjects() → projects[]
  → store.projects = projects[]

创建:
  → store.create({ name, desc })
  → api.createProject() → project
  → store.projects.unshift(project)
  → router.push(`/projects/${project.id}`)
```

#### 会话工作台流 (核心)

```
SessionWorkspacePage (mounted)
  → sessionsStore.fetchAll()          // 侧栏列表
  → chat.loadMessages(sessionId)      // 当前消息历史

发送prompt:
  handleSend()
    → chat.sendPrompt(text)
    → messages.push({ role: 'user', text })
    → streaming = true
    → api.sendPrompt(sessionId, text)
      → messages.push({ role: 'assistant', text: res.content })
    → streaming = false

后续应改为 SSE 流式:
    → EventSource /api/event?sessionId=xxx
      → 逐 chunk 更新最后一条 assistant message
```

#### 资产/模板流

```
AssetsPage (mounted)
  → store.fetchAll()
  → api.listAssets() → items[]
  → store.assets = items[]

删除:
  → store.remove(id)
  → api.deleteAsset(id)
  → store.assets = store.assets.filter(...)
```

### 7.3 Token 持久化

- `localStorage.setItem('token', token)` — 登录/注册时
- `localStorage.getItem('token')` — store 初始化时
- 所有 API 请求通过 client.ts 的 request() 统一注入 `Authorization: Bearer` header
- 401 时 `auth.clearAuth()` + 重定向 `/auth`

### 7.4 路由守卫

```typescript
Router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return '/auth'
  }
  // TODO: requiresAdmin check missing
})
```

---

## 8. API 接口映射

### 8.1 完整映射表

| 前端页面 | 调用的后端 API | 方法 |
|---------|---------------|------|
| AuthPage (登录) | `/auth/login` | POST |
| AuthPage (注册) | `/auth/register` | POST |
| AuthPage (OAuth) | `/auth/oauth/:provider` | GET (redirect) |
| AuthPage (OAuth 回调) | `/auth/oauth/:provider/callback` | GET |
| SettingsPage (加载) | `/auth/me` | GET |
| SettingsPage (保存) | `/auth/me` | PATCH |
| ProjectsPage | `/api/platform/projects` | GET |
| ProjectsPage (创建) | `/api/platform/projects` | POST |
| ProjectsPage (编辑) | `/api/platform/projects/:id` | PATCH |
| ProjectDetailPage (会话列表) | `/api/platform/sessions` | GET |
| ProjectDetailPage (新建会话) | `/api/platform/sessions` | POST |
| SessionWorkspacePage (消息历史) | `/api/session/:id/message` | GET |
| SessionWorkspacePage (发消息) | `/api/session/:id/prompt` | POST |
| SessionWorkspacePage (中止) | `/api/session/:id/abort` | POST |
| SessionWorkspacePage (SSE 事件) | `/api/event` | GET (SSE) |
| AssetsPage | `/api/platform/assets` | GET |
| AssetsPage (上传) | `/api/platform/assets/upload` | POST |
| AssetsPage (删除) | `/api/platform/assets/:id` | DELETE |
| PromptsPage | `/api/platform/prompts` | GET |
| PromptsPage (创建) | `/api/platform/prompts` | POST |
| PromptsPage (编辑) | `/api/platform/prompts/:id` | PATCH |
| PromptsPage (删除) | `/api/platform/prompts/:id` | DELETE |
| AdminUsersPage | `/api/admin/users` | GET |
| AdminUsersPage (改角色) | `/api/admin/users/:id/role` | PATCH |

### 8.2 API Client 封装

所有 API 调用集中在 `src/api/client.ts`，提供类型化的方法。关键模式：

```typescript
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const auth = useAuthStore()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth.token) headers['Authorization'] = `Bearer ${auth.token}`
  const res = await fetch(path, { ...options, headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || err.error?.message || `HTTP ${res.status}`)
  }
  return res.json()
}
```

---

## 9. 数据模型

### 9.1 前端 TypeScript 类型

```typescript
// 用户
interface OpenimagoUser {
  id: string
  username: string
  email: string
  role: string          // 'user' | 'admin'
  displayName?: string
  workspaceId?: string
  createdAt?: string
  updatedAt?: string
}

// 项目
interface OpenimagoProject {
  id: string            // 'proj_' + nanoid
  name: string
  description?: string
  fullPath: string      // '/mnt/cos/' + id
  status: 'active' | 'archived'
  createdAt: string
  updatedAt: string
}

// 会话
interface SessionInfo {
  id: string            // 'ses_' + id
  title?: string
  projectID?: string
  projectId?: string
  time?: { created?: number }
}

// 聊天消息
interface DisplayMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  createdAt: number
  error?: string
}

// 资产
interface OpenimagoAsset {
  id: string
  name?: string
  filename?: string
  url?: string
  thumbnailUrl?: string
  type: string
  createdAt: string
}

// Prompt 模板
interface PromptTemplate {
  id: string
  title: string
  content: string
  tags?: string[]
  createdAt: string
  updatedAt: string
}
```

### 9.2 后端数据库表 (参考)

#### Platform 自管表

| 表 | 说明 |
|----|------|
| `users` | 用户账号 (id, username, email, role, workspace_id) |
| `user_auths` | 多 provider 登录 (password/github/google) |
| `projects` | 项目 (id, user_id, name, full_path, status) |
| `work_dirs` | 目录注册表 (id, user_id, project_id, type, full_path) |
| `prompt_templates` | Prompt 模板 (id, user_id, title, content, tags) |
| `assets` | 媒体资产 (id, user_id, filename, mime_type, storage_path) |

#### 共享 OpenCode 表 (只读)

| 表 | 说明 |
|----|------|
| `session` | 会话记录 (id, workspace_id, directory, title, time) |
| `message` | 消息记录 |
| `part` | 消息部分 (text, tool, file) |
| `workspace` | 工作空间 |

---

## 10. 交互细节清单

### 10.1 全局交互

| # | 交互 | 行为 |
|---|------|------|
| 1 | 未登录访问需认证页面 | 重定向 `/auth` |
| 2 | token 过期 (API 401) | auth.clearAuth() → 重定向 `/auth` |
| 3 | Drawer mini-mode | 默认图标模式, hover 展开文字 |
| 4 | 页面切换 | fade-up 动画 0.2s |
| 5 | 深色滚动条 | 自定义紫色半透明细滚动条 |
| 6 | 用户头像菜单 | 点击打开, 设置/退出登录 |

### 10.2 认证交互

| # | 交互 | 行为 |
|---|------|------|
| 1 | Tab 切换 | login ↔ register, 表单内容独立 |
| 2 | Enter 提交 | form @submit.prevent |
| 3 | 登录成功 | router.push('/projects') |
| 4 | 注册成功 | router.push('/projects') |
| 5 | 失败 | 显示错误信息 (q-banner) |
| 6 | OAuth 点击 | window.location.href 跳转 |

### 10.3 项目交互

| # | 交互 | 行为 |
|---|------|------|
| 1 | 点击项目卡片 | router.push('/projects/:id') |
| 2 | 新建项目 | Dialog → 输入 → 创建 → 跳转详情 |
| 3 | 空状态 | 鼓励性文案 + 图标 |
| 4 | 卡片 hover | 浮起 + 边框光晕 |

### 10.4 会话工作台交互

| # | 交互 | 行为 |
|---|------|------|
| 1 | 新建会话 | api.createSession() → 跳转新会话 |
| 2 | 切换会话 | router.push('/sessions/:id') |
| 3 | 发送 prompt | Enter 触发, 非流式: 等待完整响应 |
| 4 | 流式中止 | 点击停止按钮 → api.abort() |
| 5 | 自动滚动 | 新消息到达自动滚到底部 |
| 6 | 重新生成 | 获取上一条用户消息 → sendPrompt |
| 7 | 空状态 | 提示"输入 prompt 开始创作" |

### 10.5 资产交互

| # | 交互 | 行为 |
|---|------|------|
| 1 | 上传 | q-uploader POST /api/platform/assets/upload |
| 2 | 删除 | 点击删除 → api.deleteAsset() → 移除卡片 |
| 3 | 上传完成 | 自动刷新列表 |

### 10.6 Prompt 交互

| # | 交互 | 行为 |
|---|------|------|
| 1 | 新建 | Dialog → title + content + tags → 创建 |
| 2 | 删除 | 点击删除 → api.deletePrompt() → 移除卡片 |
| 3 | 标签 | q-badge 显示, 逗号分隔输入 |

### 10.7 设置交互

| # | 交互 | 行为 |
|---|------|------|
| 1 | 加载 | 从 auth.user 预填表单 |
| 2 | 保存 | api.updateMe() → auth.fetchMe() 刷新 |
| 3 | 保存成功 | alert('保存成功') (应改为 q-notify) |

### 10.8 管理后台交互

| # | 交互 | 行为 |
|---|------|------|
| 1 | 角色切换 | q-select → 即时 PATCH /api/admin/users/:id/role |
| 2 | 数据加载 | onMounted → api.listUsers() |

---

## 11. 后续优化方向

### 11.1 P0 — 必须修复 (影响核心体验)

| # | 优化项 | 涉及页面 |
|---|--------|---------|
| 1 | **实现 SSE 流式响应** — EventSource 打字机效果 | SessionWorkspacePage |
| 2 | **生成图片/视频展示** — AI 消息中渲染 media | SessionWorkspacePage |
| 3 | **图片/视频预览** — 点击放大 lightbox | SessionWorkspacePage, AssetsPage |
| 4 | **下载生成结果** — download 按钮 | SessionWorkspacePage |

### 11.2 P1 — 重要 (提升完整度)

| # | 优化项 | 涉及页面 |
|---|--------|---------|
| 5 | 会话标题自动生成 | SessionWorkspacePage |
| 6 | 项目编辑/归档入口 | ProjectsPage, ProjectDetailPage |
| 7 | 会话列表按项目分组 | SessionWorkspacePage |
| 8 | 会话删除/归档 | SessionWorkspacePage |
| 9 | 文件上传附件 (会话中) | SessionWorkspacePage |
| 10 | 保存后用 q-notify 替代 alert | SettingsPage |
| 11 | 搜索/过滤功能 | ProjectsPage, AssetsPage, PromptsPage |

### 11.3 P2 — 锦上添花

| # | 优化项 | 涉及页面 |
|---|--------|---------|
| 12 | 快捷 Prompt 选择/插入 | SessionWorkspacePage |
| 13 | 密码修改功能 | SettingsPage |
| 14 | 头像上传 | SettingsPage |
| 15 | 密码确认字段 | AuthPage |
| 16 | OAuth 绑定/解绑 | SettingsPage |
| 17 | Prompt 模板编辑功能 | PromptsPage |
| 18 | Admin 表格分页/搜索 | AdminUsersPage |
| 19 | 角色修改确认对话框 | AdminUsersPage |
| 20 | 项目统计信息展示 | ProjectDetailPage |
| 21 | 移动端适配 | 全局 |

### 11.4 技术债

| # | 项 | 说明 |
|---|----|------|
| 1 | Admin 路由守卫 | `router/index.ts` 缺少 `requiresAdmin` 检查 |
| 2 | 类型统一 | `SessionInfo` 同时有 `projectID` 和 `projectId` 字段 |
| 3 | 错误处理 | 统一 error code 映射到中文提示 |
| 4 | Loading 状态 | 部分页面缺少 loading 状态 (ProjectDetail) |
| 5 | 空状态设计 | 所有空状态可增加插画/动效 |

---

> **文档维护**: 本设计图应与代码同步更新。每次 UI 调整前请参考此文档确定变更范围。
> **版本记录**: v1.0 — 2026-05-20 — 初始版本, 基于现有代码逆向整理
