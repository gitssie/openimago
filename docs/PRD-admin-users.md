## Problem Statement

当前平台没有管理员界面。管理员无法查看所有注册用户、无法分配/撤销 admin 角色。需要一套 admin API 端点支撑管理员后台。

## Solution

新增 `/api/admin/*` 路由组，受 `authMiddleware` + `adminMiddleware` 双重保护。提供用户列表和角色管理两个端点。使用现有 `users.role` 字段判断权限。

## User Stories

1. 作为管理员，我想查看所有注册用户列表，这样我能了解平台使用情况
2. 作为管理员，我想按用户名或邮箱搜索用户，这样我能快速找到特定用户
3. 作为管理员，我想将普通用户提升为管理员，这样我能委托管理权限
4. 作为管理员，我想撤销管理员权限（降级为 user），这样我能管理权限变更
5. 作为管理员，我不能撤销自己的 admin 权限，防止误操作锁死
6. 作为普通用户，我无法访问 `/api/admin/*` 端点，返回 403

## Implementation Decisions

### 1. 权限模型

```
users.role: "admin" | "user"    // 默认 "user"
```

- 注册用户默认 role = "user"
- admin 通过手动 INSERT / 第一个注册用户自动 admin（可选优化）
- JWT 内含 role 字段，adminMiddleware 检查 `c.get("role") === "admin"`

### 2. API Contracts

#### `GET /api/admin/users`

```
Headers: Authorization: Bearer <admin_jwt>
Query (全部可选):
  {
    search?: string,       // 模糊匹配 username 或 email
    limit?: number,        // default 50, max 200
    offset?: number        // default 0
  }

Response 200:
  Body: {
    users: Array<{ id, username, email, displayName, role, workspaceId, createdAt, updatedAt }>,
    total: number
  }
```

#### `PATCH /api/admin/users/:id/role`

```
Headers: Authorization: Bearer <admin_jwt>
Request Body:
  {
    role: "admin" | "user"
  }

Response 200:
  Body: { user: { id, username, email, displayName, role, workspaceId, createdAt, updatedAt } }

Errors:
  400 — { code: "VALIDATION_ERROR" }     // 无效 role 值
  400 — { code: "CANNOT_SELF_DEMOTE" }   // 不能撤销自己的 admin
  403 — { code: "FORBIDDEN" }            // 非 admin
  404 — { code: "NOT_FOUND" }            // 用户不存在
```

### 3. adminMiddleware

```typescript
// src/server/middleware.ts 新增
export async function adminMiddleware(c: Context, next: Next) {
  const role = c.get("role") as string | undefined
  if (role !== "admin") {
    return c.json({ error: { code: "FORBIDDEN", message: "Admin access required" } }, 403)
  }
  await next()
}
```

### 4. 新增模块

| 文件 | 职责 |
|------|------|
| `src/admin/routes.ts` | `GET /api/admin/users`、`PATCH /api/admin/users/:id/role` |
| `src/admin/service.ts` | `listUsers(query)`、`updateRole(adminId, userId, role)` |
| `src/server/middleware.ts`（修改） | 新增 `adminMiddleware` |
| `src/server/app.ts`（修改） | 注册 `adminRoutes` |

不涉及 schema 变更。

## Testing Decisions

| # | 测试 | 验证点 |
|---|------|--------|
| 1 | admin 可列出所有用户 | 200, users 数组包含多个用户 |
| 2 | admin 搜索用户（username 模糊） | 200, 只返回匹配的用户 |
| 3 | admin 搜索用户（email 模糊） | 200, 只返回匹配的用户 |
| 4 | admin 按 limit/offset 分页 | 200, 返回正确数量 |
| 5 | admin 提升用户为 admin | 200, role 变为 "admin" |
| 6 | admin 降级 admin 为 user | 200, role 变为 "user" |
| 7 | admin 不能降级自己 | 400, code = "CANNOT_SELF_DEMOTE" |
| 8 | 普通用户访问 admin 端点 → 403 | error.code = "FORBIDDEN" |
| 9 | 修改不存在的用户 → 404 | error.code = "NOT_FOUND" |
| 10 | 无 token → 401 | UNAUTHORIZED |

共 10 个测试用例。测试中需创建 admin 用户（手动 INSERT role='admin' 或绕过注册直接 DB 写入）。

## Further Notes

- Admin 端点不返回 `passwordHash`
- 第一个注册用户如何成为 admin？两种方案：
  - Phase 1: 手动 `UPDATE users SET role = 'admin' WHERE email = '...'`
  - Phase 2: 环境变量 `AUTO_ADMIN_EMAILS=admin@example.com` 注册时自动升级
- `total` 字段返回符合条件的总用户数（用于前端分页组件）
