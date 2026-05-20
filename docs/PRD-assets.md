## Problem Statement

用户在上传图片/视频/音频后，无法浏览自己上传过的文件。当前文件上传直接落到 workdir，没有元数据表，没有缩略图，没有列表接口。用户需要像其他 AI 平台一样拥有一个"我的资产"视图。

## Solution

新增 `assets` 表管理上传文件的元数据（存储路径、类型、尺寸、缩略图），新增 `/api/platform/assets/*` 路由组。上传时同步生成缩略图，列表接口不暴露目录结构。

## User Stories

1. 作为平台用户，我想上传图片/视频/音频到我的资产库，这样我可以在不同 session 中复用
2. 作为平台用户，上传后能立刻看到缩略图，这样我能快速识别文件
3. 作为平台用户，我想按文件类型（图片/视频/音频）过滤资产列表
4. 作为平台用户，我想浏览所有资产（按上传时间倒序），不需要关心它们存储在哪个目录
5. 作为平台用户，我想删除不再需要的资产（软删除）
6. 作为平台用户，创建 session 时可以选择已有资产，openimago 自动 copy 到 session workdir

## Implementation Decisions

### 1. 存储路径

```
/mnt/cos/assets_{userId}/YYYY-MM/ast_xxx_original_filename.ext
/mnt/cos/assets_{userId}/YYYY-MM/ast_xxx_thumb.webp      # 缩略图
```

- `assets_{userId}` 是用户的资产根目录，work_dirs 中 type="assets" 记录
- `YYYY-MM` 按年月分子目录，避免单目录文件过多
- `ast_xxx` 是资产唯一 ID

### 2. Schema

新增 `assets` 表：

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | text PK | `ast_` + nanoid |
| `userId` | text NOT NULL | FK → users.id |
| `filename` | text NOT NULL | 原始文件名 |
| `storedName` | text NOT NULL | 存储名 `ast_xxx.ext` |
| `mimeType` | text NOT NULL | `image/png`, `video/mp4` 等 |
| `size` | integer NOT NULL | 字节数 |
| `width` | integer | 图片/视频宽度 |
| `height` | integer | 图片/视频高度 |
| `duration` | real | 视频/音频时长（秒） |
| `thumbnailPath` | text | 缩略图存储路径 |
| `storagePath` | text NOT NULL | COS 完整路径 |
| `status` | text NOT NULL DEFAULT 'active' | 'active' \| 'archived' |
| `createdAt` | timestamptz NOT NULL | |

### 3. API Contracts

#### `POST /api/platform/assets/upload`

```
Headers: Authorization: Bearer <jwt>
Content-Type: multipart/form-data
Form fields: { file: File }

Response 201:
  Body: {
    asset: {
      id, filename, mimeType, size, width?, height?, duration?,
      thumbnailPath?, createdAt
    }
  }

Errors:
  400 — { code: "VALIDATION_ERROR" }   // 不支持的文件类型
  400 — { code: "FILE_TOO_LARGE" }     // 超过限制
```

Side effects:
1. 验证 mimeType（image/png, image/jpeg, image/webp, video/mp4, audio/mpeg 等）
2. 验证文件大小 ≤ MAX_UPLOAD_SIZE
3. 生成 asset ID
4. 确保 `assets_{userId}/YYYY-MM/` 目录存在
5. 写入原文件到 storagePath
6. 是图片 → 生成 256px 缩略图 → 写入 thumbnailPath
7. INSERT INTO assets
8. 首次上传时创建 work_dirs 记录（type="assets"）

#### `GET /api/platform/assets`

```
Headers: Authorization: Bearer <jwt>
Query:
  type?: "image" | "video" | "audio"    // 默认全部
  cursor?: string                       // base64({ id, createdAt, direction })
  order?: "asc" | "desc"               // 默认 desc
  limit?: number                        // 默认 50，最大 200

Response 200:
  Body: {
    items: Array<{ id, filename, mimeType, size, width?, height?, duration?, thumbnailPath?, createdAt }>,
    cursor: { previous?: string, next?: string }
  }
```

#### `GET /api/platform/assets/:id`

```
Response 200: { asset: { id, filename, mimeType, size, width?, height?, duration?, thumbnailPath?, storagePath, createdAt } }
Errors: 404
```

#### `DELETE /api/platform/assets/:id`

```
Response 200: { asset: { id, status: "archived" } }
Errors: 404, 403
```

不物理删除文件，仅设置 status='archived'。

### 4. 新建 session 时 copy 资产

`POST /api/platform/sessions` 新增可选字段 `assetIds: string[]`。

```
1. 创建 workdir（现有逻辑）
2. if assetIds:
   for each assetId:
     SELECT storagePath FROM assets WHERE id = assetId AND userId = userId
     copyFile(asset.storagePath, workdir.fullPath + "/" + asset.filename)
3. 继续原有 forward 逻辑
```

### 5. 新增模块

| 文件 | 职责 |
|------|------|
| `src/assets/routes.ts` | 4 个 asset 路由 |
| `src/assets/service.ts` | upload, list, get, delete + 缩略图生成 |
| `src/db/schema.ts`（修改） | 新增 `assets` 表定义 |
| `src/db/migrate.ts`（修改） | 新增 assets 表 DDL |
| `src/server/app.ts`（修改） | 注册 assets routes |
| `src/workdir/routes.ts`（修改） | 创建 session 时处理 assetIds copy |

### 6. 缩略图生成

使用 Bun 内置的图片处理（或调用外部工具）：
- 图片 < 256px：保持原尺寸
- 图片 ≥ 256px：缩放至宽度 256px，等比缩放
- 格式统一为 webp（体积小，浏览器广泛支持）
- 视频：提取第一帧作为缩略图
- 音频：不生成缩略图

## Testing Decisions

| # | 测试 | 验证点 |
|---|------|--------|
| 1 | 上传图片成功 → 201 | asset 记录存在，缩略图文件存在 |
| 2 | 上传视频成功 → 201 | mimeType=video/mp4，缩略图存在 |
| 3 | 上传音频成功 → 201 | mimeType=audio/mpeg，无缩略图 |
| 4 | 不支持的类型 → 400 | VALIDATION_ERROR |
| 5 | 文件超过大小限制 → 400 | FILE_TOO_LARGE |
| 6 | 列表按时间倒序 | 最新上传排第一 |
| 7 | 按 type=image 过滤 | 只返回图片 |
| 8 | cursor 分页 | next cursor 指向下一页 |
| 9 | 获取单个资产详情 | 200，字段完整 |
| 10 | 获取不存在的资产 → 404 | NOT_FOUND |
| 11 | 获取其他用户的资产 → 404 | 不暴露其他用户资产 |
| 12 | 删除资产 → 200 | status 变为 "archived" |
| 13 | 创建 session 时 copy 资产 | workdir 里有对应文件，assets 记录未被删除 |
| 14 | assetIds 含不属于用户的资产 → 跳过 | 不 copy，不报错 |

## Further Notes

- 不实现批量上传（Phase 2）
- 不实现文件夹/标签组织（Phase 2）
- 资产不限制用户总容量（Phase 2 加配额）
- 缩略图生成失败不阻塞上传（降级为无缩略图）
