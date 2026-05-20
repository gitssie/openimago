## Problem Statement

Agent 在 workdir 中生成了图片/视频文件，用户无法在平台内浏览这些产出。当前只能通过"下载文件"的方式看到，没有预览、没有按 session 的输出列表。用户需要在 session 对话界面中直接看到 agent 生成了哪些文件。

## Solution

新增 `GET /api/platform/sessions/:id/outputs` 端点，扫描 session 关联的 workdir 目录，返回文件列表（含缩略图路径、文件类型、大小、修改时间）。openimago 不索引这些文件，只做按需目录扫描和缩略图按需生成。

## User Stories

1. 作为平台用户，我想查看某个 session 下 agent 生成的所有文件，这样我能快速浏览产出
2. 作为平台用户，我想按文件类型（图片/视频/其他）过滤产出
3. 作为平台用户，列表中每个文件应该有缩略图预览，这样我能快速找到想要的
4. 作为平台用户，点击文件可以下载/在新标签页打开查看

## Implementation Decisions

### 1. API Contract

#### `GET /api/platform/sessions/:id/outputs`

```
Headers: Authorization: Bearer <jwt>
Query:
  type?: "image" | "video" | "other"    // 默认 all
  order?: "asc" | "desc"               // 按 mtime 排序，默认 desc

Response 200:
  Body: {
    outputs: Array<{
      name: string,           // 文件名
      path: string,           // 相对路径 (相对于 workdir)
      size: number,           // 字节
      mimeType: string,       // 推断的 MIME type
      thumbnailPath?: string, // 缩略图 URL（图片/视频），首次访问时生成
      modifiedAt: string      // ISO 8601
    }>
  }

Errors:
  401 — { code: "UNAUTHORIZED" }
  404 — { code: "NOT_FOUND" }    // session 不存在或不属于用户
```

### 2. 权限校验

```
1. 从 session 表查 workspace_id + directory
2. 验证 session.workspace_id === user.workspaceId
3. 验证 directory 存在且可读
```

### 3. 文件扫描与过滤

```
1. readdir(session.directory) — 仅一级深度，不递归
2. 按 type 过滤：
   - image: .png, .jpg, .jpeg, .gif, .webp, .svg, .bmp
   - video: .mp4, .mov, .avi, .webm, .mkv
   - other: 其余所有
3. 推断 mimeType 基于扩展名
4. 按 mtime 排序
```

### 4. 缩略图（按需生成）

首次请求时为图片/视频生成缩略图，存入 `{workdir}/.thumbnails/` 目录：

- 图片：缩放至 256px 宽，webp 格式
- 视频：提取第一帧，缩放至 256px 宽，webp 格式
- 已生成的缩略图不再重复生成（检查 `.thumbnails/{filename}.thumb.webp` 是否存在）

缩略图不使用数据库记录 — 纯文件系统缓存。

### 5. 新增模块

| 文件 | 职责 |
|------|------|
| `src/outputs/routes.ts` | `GET /api/platform/sessions/:id/outputs` |
| `src/outputs/service.ts` | 权限校验、目录扫描、缩略图生成 |
| `src/server/app.ts`（修改） | 注册 outputs routes |

不涉及 schema 变更。

## Testing Decisions

| # | 测试 | 验证点 |
|---|------|--------|
| 1 | 列出 session 产出（含图片） | 200，outputs 数组含图片文件 |
| 2 | 列出 session 产出（含视频） | 200，outputs 数组含视频文件 |
| 3 | 按 type=image 过滤 | 只返回图片 |
| 4 | 空 workdir → 空数组 | 200，outputs: [] |
| 5 | session 不存在 → 404 | NOT_FOUND |
| 6 | session 不属于当前用户 → 404 | 不暴露其他用户的 session |
| 7 | 缩略图首次生成 | 文件存在 `.thumbnails/` 下 |
| 8 | 缩略图缓存复用 | 第二次请求不重新生成 |
| 9 | 无 token → 401 | UNAUTHORIZED |

## Further Notes

- 不递归扫描子目录（Phase 2）
- 缩略图不持久化到数据库（纯文件缓存，workdir 删除时自然清理）
- Agent 可能生成大量文件，列表不做数量限制（Phase 2 加分页 cursor）
- `.thumbnails/` 目录在列表时自动过滤掉（不显示给用户）
- 不区分"用户上传"和"agent 生成"（都是 workdir 里的文件）
