## Problem Statement

用户在使用 AI 生成图片/视频时，高质量的 prompt 需要反复调整。用户需要保存和复用已验证有效的 prompt 模板，而不是每次都从零开始写。

## Solution

新增 `prompt_templates` 表，提供 CRUD 端点。模板包含标题、内容、用途标签。用户可在发送 prompt 时从模板库中选择、编辑后使用。

## User Stories

1. 作为平台用户，我想保存一个效果好的 prompt 为模板，这样下次可以直接复用
2. 作为平台用户，我想给模板添加标签（如"产品摄影"、"视频分镜"），这样我能按用途分类查找
3. 作为平台用户，我想浏览我的所有模板，按标签过滤
4. 作为平台用户，我想编辑已有模板的标题/内容/标签
5. 作为平台用户，我想删除不再需要的模板
6. 作为平台用户，模板内容可以包含占位符（如 `{product_name}`），方便快速替换

## Implementation Decisions

### 1. Schema

新增 `prompt_templates` 表：

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | text PK | `tpl_` + nanoid |
| `userId` | text NOT NULL | FK → users.id |
| `title` | text NOT NULL | 模板名称，1-64 字符 |
| `content` | text NOT NULL | prompt 内容 |
| `tags` | text[] | 标签数组，如 `["产品摄影", "电商"]` |
| `createdAt` | timestamptz NOT NULL | |
| `updatedAt` | timestamptz NOT NULL | |

### 2. API Contracts

#### `POST /api/platform/prompts`

```
Headers: Authorization: Bearer <jwt>
Request Body:
  {
    title: string,          // 1-64 chars
    content: string,        // prompt 内容
    tags?: string[]         // 标签（可选）
  }

Response 201:
  Body: { template: { id, title, content, tags, createdAt, updatedAt } }

Errors:
  400 — { code: "VALIDATION_ERROR" }
```

#### `GET /api/platform/prompts`

```
Headers: Authorization: Bearer <jwt>
Query:
  tag?: string            // 按标签过滤
  search?: string         // 模糊搜索标题和内容
  order?: "asc" | "desc"  // 按 updatedAt，默认 desc
  limit?: number          // 默认 50，最大 200
  offset?: number         // 默认 0

Response 200:
  Body: {
    templates: Array<{ id, title, content, tags, createdAt, updatedAt }>,
    total: number
  }
```

#### `GET /api/platform/prompts/:id`

```
Response 200: { template: { id, title, content, tags, createdAt, updatedAt } }
Errors: 404
```

#### `PATCH /api/platform/prompts/:id`

```
Request Body (全部可选):
  { title?: string, content?: string, tags?: string[] }

Response 200: { template: { ... } }
Errors: 404, 403
```

#### `DELETE /api/platform/prompts/:id`

```
Response 200: { deleted: true }
Errors: 404, 403
```

### 3. 标签过滤

```sql
-- 精确匹配标签
SELECT * FROM prompt_templates
WHERE userId = :userId
  AND :tag = ANY(tags)
ORDER BY updatedAt DESC
```

使用 PostgreSQL 数组的 `ANY` 操作符。

### 4. 新增模块

| 文件 | 职责 |
|------|------|
| `src/prompts/routes.ts` | 5 个 prompt template 路由 |
| `src/prompts/service.ts` | CRUD + 标签过滤 + 搜索 |
| `src/db/schema.ts`（修改） | 新增 `promptTemplates` 表定义 |
| `src/db/migrate.ts`（修改） | 新增 DDL |
| `src/server/app.ts`（修改） | 注册 prompts routes |

## Testing Decisions

| # | 测试 | 验证点 |
|---|------|--------|
| 1 | 创建模板成功 | 201，id、title、content、tags 完整 |
| 2 | title 为空 → 400 | VALIDATION_ERROR |
| 3 | 列出所有模板 | 200，按 updatedAt 倒序 |
| 4 | 按 tag 过滤 | 只返回含该 tag 的模板 |
| 5 | 按 search 搜索标题 | 模糊匹配 |
| 6 | 获取单个模板 | 200 |
| 7 | 获取不存在的模板 → 404 | NOT_FOUND |
| 8 | 获取其他用户的模板 → 404 | 403 或 404 |
| 9 | 更新模板标题 | 200，title 已变更 |
| 10 | 更新模板标签 | 200，tags 已变更 |
| 11 | 删除模板 | 200，再次 GET 返回 404 |
| 12 | 分页 offset/limit | 正确返回数量 |
| 13 | 创建时自动设置 createdAt/updatedAt | 时间戳非空 |

## Further Notes

- 标签不设全局标签库（Phase 2）
- 模板不设"公开/私有"可见性（Phase 2）
- 不做占位符语法解析（前端自行处理 `{variable}` 替换）
- 不限制每用户模板数量
- `content` 字段长度无硬限制，建议前端截断显示
