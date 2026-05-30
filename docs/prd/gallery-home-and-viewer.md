# 官方 Gallery 首页与作品展 PRD

## 1. 目标 (Goals)

- **最快开始创作**：首页是用户从零到一的最短路径 — 直接输入 prompt 开始生成，无需先创建项目。
- **官方灵感起点**：Gallery 首页展示官方 curator 的最优作品，激发用户灵感，降低提示词编写门槛。
- **沉浸式作品浏览**：Gallery 详情页提供沉浸单作品 viewer，可键盘/触控连续浏览。
- **一键基于作品创作**：从详情页 "基于此创作" 可 Fork 作品的 prompt 并附带参考，直接进入会话。

## 2. 非目标 (Non-goals)

- **用户社区**：Gallery 是官方内容，不是用户发布/社区广场。用户不能发布作品到 Gallery。
- **社交功能**：无评论、无点赞、无分享、无关注。
- **搜索 / 高级筛选**：首版仅分类 tag 单选，不做自由文本搜索或复杂筛选。
- **作品嵌入聊天上下文**：`referenceWorkSlug` 仅给后端生成链路使用，聊天 UI 不显示引用卡片/标签。
- **移动端完整原生体验**：首版基础适配，不做 PWA 或原生应用。

## 3. 用户流 (User Flows)

### 3.1 首次进入首页

```
用户登录 → 首页 (/home)
  └─ 顶部固定 composer（AgentPromptInput + 分类 chips）
  └─ 一次性 Hero 文案（scroll 后消失）
  └─ 官方 Gallery 瀑布流（默认 "全部"）
```

### 3.2 浏览分类

```
首页 → 点击分类 chip（poster / product / character / scene / brand / storyboard）
  └─ 瀑布流重置，按 category 重新分页加载
  └─ URL 更新 query 参数 ?category=xxx
```

### 3.3 瀑布流滚动

```
首页 → 滚动到底
  └─ 自动请求下一页（cursor 分页）
  └─ 追加渲染到瀑布流底部
  └─ 直到 hasMore = false
```

### 3.4 点击作品卡片

```
首页 → 点击作品卡片
  └─ 跳转 /gallery/:slug
  └─ 沉浸 Viewer：大图、作品信息、上/下切换
  └─ URL 随切换更新
```

### 3.5 查看 prompt

```
Gallery 详情 → 点击 prompt 小 icon
  └─ 桌面：popover 弹出
  └─ 移动：bottom sheet 升起
  └─ 默认折叠；展开查看完整 prompt
```

### 3.6 基于作品创作

```
Gallery 详情 → 点击右下 FAB
  └─ 弹出 composer 卡片
  └─ 必须输入文字（不能空）
  └─ 可点击快捷 chips 填入文字
  └─ 可选附加图片附件
  └─ 提交：
      1. create session（/api/session）
      2. upload 附件（如果有）
      3. send message（source: "gallery", referenceWorkSlug: "<slug>"）
      4. 跳转 /sessions/:id
```

### 3.7 首页直接创作（无参考作品）

```
首页 → 在固定 composer 输入文字
  └─ 可选附加图片附件
  └─ 提交：
      1. create session
      2. upload 附件（如果有）
      3. send message（source: "home"）
      4. 跳转 /sessions/:id
```

### 3.8 键盘 / 触控导航

```
Gallery 详情
  └─ ← / A → 上一张
  └─ → / D → 下一张
  └─ ESC → 返回首页
  └─ 移动 swipe left/right → 切换
```

## 4. 信息架构 (Information Architecture)

### 4.1 路由

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | 重定向 | 改为 redirect → `/home`（原 redirect `/projects`） |
| `/home` | HomePage | Gallery 首页，需认证 |
| `/gallery/:slug` | GalleryDetailPage | 作品详情 viewer，需认证 |
| `/projects` | 不变 | 项目列表 |
| `/sessions` | 不变 | 独立会话 |
| `/sessions/:id` | 不变 | 进入已有会话 |

新增路由在 `MainLayout` children 内，需认证。

### 4.2 导航栏调整

`MainLayout` 左侧 rail 新增一个 "首页" 导航项，icon 用 `home` 或 `gallery`，排在 "会话" 之前。

### 4.3 组件层级

```
MainLayout
├─ UILayout
│   ├─ UILayoutHeader (固定)
│   │   └─ HomeComposer
│   │       ├─ AgentPromptInput (扩展)
│   │       └─ CategoryChips (single-select)
│   ├─ UILayoutPage (可滚动)
│   │   ├─ HeroSection (一次性文案)
│   │   └─ MasonryGrid
│   │       └─ GalleryCard × N
│   └─ (无 Footer)
```

Gallery 详情页：

```
MainLayout
├─ UILayout
│   └─ UILayoutPage (全屏)
│       └─ GalleryViewer
│           ├─ WorkImage (沉浸大图)
│           ├─ WorkMeta (标题 + 标签)
│           ├─ NavArrows (上一张/下一张)
│           ├─ PromptPopover / PromptBottomSheet
│           └─ ComposerFAB
│               └─ ComposerCard (弹出)
```

## 5. 前端页面

### 5.1 HomePage (`/home`)

**文件**：`packages/web/src/pages/HomePage.vue`

**布局**：使用 `UILayout`，`UILayoutHeader` 固定，`UILayoutPage` 内容滚动。

**UILayoutHeader 内容**：

- `AgentPromptInput`（复用并轻量扩展，见 §5.4）
- 分类 chips 行（单选，枚举见数据模型 §7）

**UILayoutPage 内容**：

- Hero 文案（一次性，随滚动消失）：
  - 标题：「从灵感开始创作」
  - 副标题：「浏览官方精选作品，一键开始你的 AI 创作之旅」
- 瀑布流：
  - 等宽列数（desktop 3-4 列，tablet 2-3 列，mobile 1-2 列）
  - 卡片高度随作品实际比例自适应
  - 滚动到底触发 cursor 分页加载
  - 切换分类时重置列表

**状态**：

| 状态 | 展示 |
|------|------|
| loading (初载) | 骨架屏（skeleton cards） |
| empty (无数据) | 空状态插画 + "暂无作品" |
| error | Error 提示 + 重试按钮 |
| 加载更多 | 底部 spinner |
| hasMore = false | "已展示全部作品" 提示 |

### 5.2 GalleryCard

**显示内容**：

- 最终成果图（使用 thumbnail URL，懒加载）
- 作品标题
- 1-2 个分类标签
- **不显示 prompt**

**交互**：

- 点击 → `router.push(`/gallery/${slug}`)`
- hover 效果：图片轻微放大 + 阴影

### 5.3 GalleryDetailPage (`/gallery/:slug`)

**文件**：`packages/web/src/pages/GalleryDetailPage.vue`

**布局**：全屏沉浸式 viewer。

**核心元素**：

1. **大图区域**：作品最终图，居中，适配视口
2. **作品信息**：标题 + 标签（底部或侧边）
3. **导航箭头**：左右箭头按钮
4. **Prompt icon**：桌面 popover / 移动 bottom sheet
5. **Composer FAB**：右下角悬浮按钮

**导航规则**：

- 按全局官方排序 `sortOrder ASC, publishedAt DESC` 确定 prev/next
- 切换时更新 URL（`router.replace`）
- Detail API 返回 `prevSlug` / `nextSlug`，前端按此导航
- 到达边界时箭头置灰（非循环）

**移动端手势**：

- swipe left → next
- swipe right → prev
- 使用 Quasar touch-swipe 指令或手动 touch 事件

### 5.4 AgentPromptInput 扩展

`AgentPromptInput` 当前 props：

```typescript
props: {
  draft: string;
  loading: boolean;
  connected: boolean;
  disabled: boolean;
  attachments: PendingAttachment[];
}
```

**新增可选 props**：

```typescript
// 新增
placeholder?: string;     // 覆盖默认 placeholder 文字
hint?: string;            // 输入框下方提示文字
compact?: boolean;        // 紧凑模式（减少 padding/圆角）
customClass?: string;     // 额外 CSS class
```

**Attachments 类型**：当前 `PendingAttachment` 有 `id, name, mime, url`。首页附件上传后仅需 `id, name` 用于展示和提交，不依赖 `mime, url`。保持类型不变，但首页使用时只关注 `id, name` 字段。

### 5.5 HomePage 提交流程

**约束**：

- 必须有文字内容（trim 后非空）
- 附件可选（支持图片上传）
- 只选图无文字 → 不允许提交（按钮 disabled）

**流程**（前端）：

```
1. 用户点击提交
2. 调用 createSession() → 拿到 sessionId
3. 如果有附件：
   a. 逐个调用 upload API → 拿到 asset IDs
   b. 构造 message attachments 引用
4. 调用 sendMessage(sessionId, text, attachments, metadata)
   metadata: {
     source: 'home',
   }
5. router.push(`/sessions/${sessionId}`)
```

### 5.6 Gallery 详情 "基于此创作" 提交流程

**ComposerFAB 交互**：

- 点击 FAB → 弹出 composer 卡片（自下往上弹出，带 backdrop）
- Composer 卡片内容：
  - 文本输入区（多行）
  - 快捷 chips（如「用这个风格」「生成类似构图」「尝试这个色调」）
  - 图片附件上传按钮（可选）
  - 提交按钮
- 约束：必须有文字才能提交

**流程**：

```
1. 用户点击 FAB
2. 弹出 composer card
3. 用户输入文字 + 可选快捷 chip + 可选附件
4. 点击提交：
   a. createSession()
   b. upload 附件（如果有）
   c. sendMessage(sessionId, text, attachments, {
        source: 'gallery',
        referenceWorkSlug: currentSlug,
      })
   d. router.push(`/sessions/${sessionId}`)
```

## 6. 后端 API

### 6.1 GalleryWork 数据模型

**表名**：`gallery_works`

```sql
gallery_works
  id              text PRIMARY KEY        -- UUID
  slug            text NOT NULL UNIQUE    -- URL 友好标识，唯一且稳定
  title           text NOT NULL
  category        text NOT NULL           -- 'poster' | 'product' | 'character' | 'scene' | 'brand' | 'storyboard'
  prompt          text NOT NULL           -- 完整提示词
  image_key       text NOT NULL           -- S3/COS 对象 key，最终成果图
  thumbnail_key   text                   -- 缩略图 key
  image_url       text                   -- 公开访问 URL（CDN / COS 直链）
  thumbnail_url   text                   -- 缩略图公开 URL
  sort_order      integer NOT NULL DEFAULT 0
  published_at    timestamptz
  created_at      timestamptz NOT NULL DEFAULT now()
  updated_at      timestamptz NOT NULL DEFAULT now()
```

**索引**：

```sql
CREATE INDEX idx_gallery_category ON gallery_works(category);
CREATE INDEX idx_gallery_sort ON gallery_works(sort_order ASC, published_at DESC);
CREATE UNIQUE INDEX idx_gallery_slug ON gallery_works(slug);
```

**Category 枚举**：

| 值 | 中文 | 说明 |
|----|------|------|
| `all` | 全部 | 仅前端使用，后端不存 |
| `poster` | 海报 | 电影/活动海报风格 |
| `product` | 产品 | 产品渲染/电商图 |
| `character` | 角色 | 角色设计/原画 |
| `scene` | 场景 | 环境/场景概念图 |
| `brand` | 品牌 | 品牌视觉/VI 设计 |
| `storyboard` | 分镜 | 故事板/分镜头 |

### 6.2 List API — `GET /api/gallery`

**Query 参数**：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `category` | string | — | 不传 = 全部；传具体 category 过滤 |
| `cursor` | string | — | 分页游标，首次不传 |
| `limit` | integer | 20 | 每页数量，最大 50 |

**Response**：

```typescript
{
  items: Array<{
    slug: string;
    title: string;
    category: string;
    thumbnailUrl: string;   // 卡片缩略图 URL
  }>;
  nextCursor: string | null;  // null 表示没有更多
  hasMore: boolean;
}
```

**实现**：

- cursor 基于 `sort_order ASC, published_at DESC, slug`
- 列表 API 只返回卡片需要的字段（不包含 prompt 和完整图）

### 6.3 Detail API — `GET /api/gallery/:slug`

**Response**：

```typescript
{
  slug: string;
  title: string;
  category: string;
  prompt: string;            // 完整提示词
  imageUrl: string;          // 大图 URL
  prevSlug: string | null;   // 上一张 slug
  nextSlug: string | null;   // 下一张 slug
}
```

**prevSlug / nextSlug 计算**：

- 按 `sort_order ASC, published_at DESC` 全局排序
- 查找当前 slug 的位置，取前一条和后一条的 slug
- 支持 LAG/LEAD 窗口函数或应用层计算

### 6.4 Import API — `POST /api/gallery/import`

**说明**：仅供管理员或脚本使用，从 manifest JSON + 本地图片目录批量导入。

**Request body**：

```typescript
{
  manifestPath: string;  // manifest JSON 文件路径（服务端可访问）
  imageDir: string;      // 图片目录路径（服务端可访问）
}
```

**Manifest JSON 格式**：

```json
{
  "works": [
    {
      "slug": "cinematic-poster-01",
      "title": "霓虹都市",
      "category": "poster",
      "prompt": "A cinematic movie poster...",
      "imageFile": "poster_01.png"
    }
  ]
}
```

**导入流程**：

```
1. 读取 manifest JSON
2. 验证每条记录的必填字段（slug, title, category, prompt, imageFile）
3. 对每条 work：
   a. 检查 slug 是否已存在 → 已存在则 update（upsert 语义）
   b. 从 imageDir 读取 imageFile
   c. 上传图片到 S3/COS（参考 AssetsService.upload 模式）
      - 存储路径：gallery/{slug}/{filename}
      - 生成缩略图并上传
   d. 获取公开 URL（CDN / COS 直链）
   e. INSERT ... ON CONFLICT (slug) DO UPDATE
4. 返回导入结果统计
```

**Upsert 语义**：

- slug 唯一：相同 slug 的再次导入会更新 title/category/prompt/image
- 不删除已有图片：如果导入失败，已有数据不受影响

### 6.5 S3/COS 存储设计

参考现有 `AssetsService.upload` 的 COS_BASE_PATH 模式：

```
COS_BASE_PATH/gallery/{slug}/original.{ext}     -- 原图
COS_BASE_PATH/gallery/{slug}/thumbnail.webp      -- 缩略图
```

图片上传后获取公开访问 URL 存入 `image_url` / `thumbnail_url` 字段。

## 7. 导入流程（完整）

### 7.1 准备阶段

```
管理员准备：
1. 创建 manifest.json（定义所有作品元数据）
2. 准备 images/ 目录（包含所有图片文件）
3. 将 manifest 和 images 放到服务端可访问的路径
```

### 7.2 执行导入

```bash
# 方式 1：通过 API
POST /api/gallery/import
{
  "manifestPath": "/data/imports/gallery-v1/manifest.json",
  "imageDir": "/data/imports/gallery-v1/images"
}

# 方式 2：通过 CLI 脚本
bun run packages/openimago/src/scripts/import-gallery.ts \
  --manifest /data/imports/gallery-v1/manifest.json \
  --images /data/imports/gallery-v1/images
```

### 7.3 导入步骤

```
1. 验证 manifest 格式
2. 检查图片文件存在性
3. 开始事务
4. 对每条记录：
   a. 上传图片到 S3/COS
   b. 生成缩略图
   c. Upsert 数据库记录（ON CONFLICT slug DO UPDATE）
5. 提交事务
6. 返回结果：{ total: N, created: X, updated: Y, failed: Z, errors: [...] }
```

### 7.4 图片去重策略

- 同一 slug 再次导入：替换图片（保留旧图直到新图上传成功）
- 基于 slug 的文件路径天然去重

## 8. 提交到 Session 流程

### 8.1 首页提交

```
前端：
1. 验证：text.trim() !== '' || 报错
2. createSession(): POST /api/session
   ← { id: 'ses_xxx' }
3. 如果附件非空：
   for each file:
     upload(file) → { assetId, ... }
4. sendMessage(sessionId, {
     text,
     attachments: [{ assetId, name }],
     metadata: { source: 'home' }
   })
5. router.push(`/sessions/${sessionId}`)
```

### 8.2 Gallery 详情提交

```
前端：
1. 用户在 ComposerFAB 输入文字
2. 验证：text.trim() !== '' || 按钮 disabled
3. createSession()
4. upload 附件（如果有）
5. sendMessage(sessionId, {
     text,
     attachments,
     metadata: {
       source: 'gallery',
       referenceWorkSlug: currentSlug
     }
   })
6. router.push(`/sessions/${sessionId}`)
```

### 8.3 Send Message Metadata

```typescript
interface MessageMetadata {
  source: 'home' | 'gallery';     // 来源页面
  referenceWorkSlug?: string;      // 参考作品 slug（仅 gallery）
}
```

- metadata 通过 send message 时传入（放在 message 的 metadata 字段）
- 聊天 UI **不显示** source 或 reference chip/card
- 后端可根据 metadata 做生成链路优化（如参考作品的 prompt 作为系统上下文注入）

## 9. 移动端适配

### 9.1 首页

- 瀑布流列数自适应（320px-768px = 2列，<320px = 1列）
- Header 高度紧凑
- Hero 文案字体缩小
- 分类 chips 横向滚动（overflow-x: auto）

### 9.2 Gallery 详情

- 图片占全宽，上方留安全区（避免刘海屏遮挡）
- 导航箭头缩小，放在图片下方
- Prompt 使用 Quasar BottomSheet 组件
- ComposerFAB 位置适配底部安全区
- Swipe 手势（touchstart/touchend deltaX 判断）

### 9.3 通用

- 使用 Quasar 响应式断点（`$q.screen.lt.md` 等）
- CSS 使用 `var(--imago-*)` 设计令牌保持一致

## 10. 测试验收

### 10.1 后端测试

**文件位置**：`packages/openimago/tests/gallery.test.ts`

| 测试用例 | 验收标准 |
|----------|----------|
| `GET /api/gallery` 无参数返回所有作品 | 返回 items 按 sort_order 排序，hasMore 正确 |
| `GET /api/gallery?category=poster` 过滤 | 只返回 poster 类作品 |
| `GET /api/gallery?cursor=xxx&limit=10` 分页 | nextCursor 不为 null 时可继续翻页 |
| `GET /api/gallery` 翻到最后 | hasMore = false, nextCursor = null |
| `GET /api/gallery/:slug` 返回详情 | 包含 prompt、imageUrl、prevSlug、nextSlug |
| `GET /api/gallery/:slug` 不存在的 slug | 返回 404 |
| `GET /api/gallery/:slug` 第一张 | prevSlug = null |
| `GET /api/gallery/:slug` 最后一张 | nextSlug = null |
| `POST /api/gallery/import` 首次导入 | created = N, updated = 0 |
| `POST /api/gallery/import` 幂等导入 | created = 0, updated = N |
| `POST /api/gallery/import` 无效 manifest | 返回错误，已有数据不受影响 |

### 10.2 前端测试

**文件位置**：`packages/web/src/__tests__/pages/HomePage.test.ts` `packages/web/src/__tests__/pages/GalleryDetailPage.test.ts`

**兼容性注意**：
- Page 测试需要 `QLayout` / `QPageContainer` 包裹（参考现有 `SessionWorkspacePage.test.ts`）
- `UILayout` 需要在测试中提供完整层级（`UILayout` > `UILayoutPageContainer` > `UILayoutPage`）

**HomePage 测试**：

| 测试用例 | 验收标准 |
|----------|----------|
| 初次加载显示 skeleton | 骨架屏可见 |
| 加载完成后显示卡片 | 卡片数量 = items.length |
| 切换分类 chip | API 调用带新 category，列表重置 |
| 滚动到底触发加载更多 | nextCursor 传递，追加渲染 |
| 无更多数据时显示完成提示 | "已展示全部作品" 可见 |
| 空状态 | 无数据时显示空状态插画 |
| 错误状态 | 显示错误 + 重试按钮 |
| 提交按钮无文字时 disabled | 按钮不可点击 |
| 提交后跳转到 session | router.push 调用正确 |

**GalleryDetailPage 测试**：

| 测试用例 | 验收标准 |
|----------|----------|
| 加载作品详情 | 显示标题、标签、大图 |
| 点击下一张 | URL 更新为 nextSlug |
| 点击上一张（到边界） | prevSlug = null 时箭头 disabled |
| 点击下一张（到边界） | nextSlug = null 时箭头 disabled |
| 点击 prompt icon（桌面） | popover 弹出，显示 prompt 文字 |
| 点击 prompt icon（移动） | bottom sheet 弹出 |
| 点击 FAB 展开 composer | composer card 弹出 |
| composer 空文字提交 disabled | 提交按钮 disabled |
| composer 有文字提交 | 调用 createSession + upload + sendMessage |
| 提交 metadata 正确 | sendMessage 携带 `source: 'gallery'` 和 `referenceWorkSlug` |

### 10.3 集成 / E2E 建议

- 启动完整后端 + 前端 dev server
- 使用 fixture 数据（预导入 20+ gallery works，覆盖所有 category）
- 验证首页到详情到创建 session 的完整链路

## 11. 开放问题

1. **Hero 移除时机**：Hero 文案在滚动多远后消失？建议首屏 70% 可视区域。
2. **首页手动刷新**：是否做下拉刷新？建议首版不做（有切换分类已足够重置）。
3. **Gallery 作品数量**：首版导入多少官方作品？建议 30-50 个覆盖所有分类。
4. **图片 CDN**：当前 COS 直链 vs CDN 加速 URL？先走 COS 直链，后续可切 CDN。
5. **参考作品对生成的影响**：`referenceWorkSlug` 如何影响后端生成链路？是注入 prompt 前缀还是透传模型？需后续 PRD 细化。
6. **附件类型限制**：首页附件是否只接受图片？首版是，后续可扩展。
7. **历史记录**：从 Gallery 创建 session 后，session 列表显示什么标题？建议用作品标题 + " 的创作"。
8. **加载失败重试策略**：cursor 分页失败后是否需要自动重试？建议首版显示 "加载失败，点击重试" 手动触发。
9. **多语言**：Gallery 标题、Hero 文案是否需要多语言？建议先中文，后续 i18n。
10. **Sort Order 管理**：`sort_order` 值如何分配？建议简单递增（10, 20, 30...），留间隔便于插入。

## 12. 实现阶段

### Phase 1：数据层 + 后端 API

- 创建 `gallery_works` 表
- 实现 `GET /api/gallery` 列表 API（cursor 分页）
- 实现 `GET /api/gallery/:slug` 详情 API（prev/next）
- 实现 `POST /api/gallery/import` 导入 API
- 实现 CLI 导入脚本
- 准备首批 seed 数据（30-50 作品）

### Phase 2：前端页面

- 创建 `HomePage.vue`
- 创建 `GalleryDetailPage.vue`
- 创建 `GalleryCard.vue` 组件
- 扩展 `AgentPromptInput`（placeholder / hint / compact slots）
- 调整路由（`/` → `/home`，新增 `/gallery/:slug`）
- 调整 MainLayout 导航栏

### Phase 3：交互完善 + 测试

- 键盘导航、触控 swipe
- Prompt popover / bottom sheet
- ComposerFAB + composer card
- 首页/Gallery 提交到 session 流程
- 后端测试 + 前端测试
- 移动端样式适配

### Phase 4：打磨

- 加载/空/错误状态
- 动画过渡（页面切换、图片懒加载 fade-in）
- 性能优化（虚拟滚动？首版先不用）
- i18n 文案整理
