## Problem Statement

用户在项目列表页看不到每个项目的使用情况——不知道这个项目有多少个会话、消耗了多少 token、花了多少成本。需要项目维度聚合统计帮助用户管理 AI 使用。

## Solution

复用 ProjectService.list() 返回的 `sessionCount`（目前为硬编码 0），通过查询 session 表按 directory 聚合，补充 token 和 cost 统计。新增 `GET /api/platform/projects/:id/stats` 端点提供单个项目的详细统计。

## User Stories

1. 作为平台用户，我想在项目列表中看到每个项目的会话数量，这样我知道哪些项目活跃
2. 作为平台用户，我想看到单个项目的总 token 消耗（输入/输出/推理），这样我了解 AI 使用成本
3. 作为平台用户，我想看到项目的总成本（$），这样我能控制预算
4. 作为平台用户，我想看到项目最近的活动时间，这样我知道这个项目是否还在使用

## Implementation Decisions

### 1. API Contracts

#### `GET /api/platform/projects/:id/stats`

```
Headers: Authorization: Bearer <jwt>

Response 200:
  Body: {
    stats: {
      sessionCount: number,
      totalTokensInput: number,
      totalTokensOutput: number,
      totalTokensReasoning: number,
      totalTokensCacheRead: number,
      totalTokensCacheWrite: number,
      totalCost: number,          // USD
      lastActivityAt: string | null  // 最近一次 session 更新时间
    }
  }

Errors:
  403 — { code: "FORBIDDEN" }
  404 — { code: "NOT_FOUND" }
```

### 2. 数据来源

所有数据来自共享 PG 的 `session` 表（OpenCode 写入）：

```sql
SELECT
  COUNT(*) as session_count,
  COALESCE(SUM(tokens_input), 0) as total_tokens_input,
  COALESCE(SUM(tokens_output), 0) as total_tokens_output,
  COALESCE(SUM(tokens_reasoning), 0) as total_tokens_reasoning,
  COALESCE(SUM(tokens_cache_read), 0) as total_tokens_cache_read,
  COALESCE(SUM(tokens_cache_write), 0) as total_tokens_cache_write,
  COALESCE(SUM(cost), 0) as total_cost,
  MAX(time_updated) as last_activity_at
FROM session
WHERE directory = :projectFullPath
  AND time_archived IS NULL
```

- `directory = projectFullPath` — 同一项目的所有 session 共享同一目录
- `time_archived IS NULL` — 排除已归档的 session

### 3. 更新 ProjectService.list()

`ProjectService.list()` 当前的 `sessionCount: 0` 改为：

```sql
SELECT COUNT(*) FROM session
WHERE directory = project.fullPath
  AND time_archived IS NULL
```

同时补充 `totalCost` 和 `lastActivityAt` 字段到列表响应。

### 4. 新增模块

| 文件 | 职责 |
|------|------|
| `src/project/routes.ts`（修改） | 新增 `GET /:id/stats` handler |
| `src/project/service.ts`（修改） | `getStats(projectId, userId)` + `list()` 补充统计 |

不涉及 schema 变更。不新增文件。

## Testing Decisions

| # | 测试 | 验证点 |
|---|------|--------|
| 1 | 获取项目 stats（有 session） | sessionCount ≥ 1，tokens > 0，cost > 0 |
| 2 | 获取项目 stats（无 session） | sessionCount = 0，tokens = 0，cost = 0 |
| 3 | 获取项目 stats 排除已归档 session | archived session 不计入 |
| 4 | 项目不属于当前用户 → 403 | FORBIDDEN |
| 5 | 项目不存在 → 404 | NOT_FOUND |
| 6 | 项目列表含 sessionCount、lastActivityAt | 列表返回的每个项目有统计字段 |
| 7 | 项目列表的总 cost 聚合正确 | SUM(cost) 匹配 |

## Further Notes

- 不实现用户级别的总用量统计（Phase 2）
- 不实现时间范围过滤（Phase 2）
- `cost` 以美元计，OpenCode 的 cost 字段已包含
- stats 是实时查询，不做缓存（数据量小，查询简单）
