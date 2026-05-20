## Problem Statement

用户注册后无法修改自己的个人信息。需要提供账户设置端点，允许用户更新 displayName、email、password。这是任何多用户平台的基础功能。

## Solution

新增 `PATCH /auth/me` 端点，接受可选的 `displayName`、`email`、`currentPassword`、`newPassword` 字段。更新部分字段即可，不需要全量提交。

## User Stories

1. 作为平台用户，我想修改我的显示名称，这样我的个人信息保持最新
2. 作为平台用户，我想修改我的登录邮箱，这样换工作后仍可使用同一账号
3. 作为平台用户，我想修改密码，这样我可以定期更新密码保证安全
4. 作为平台用户，修改密码时需验证当前密码，防止他人盗用
5. 作为平台用户，邮箱修改不应影响我已有的登录会话（JWT 不变）
6. 作为平台用户，邮箱不能与其他用户重复

## Implementation Decisions

### 1. API Contract

#### `PATCH /auth/me`

```
Headers: Authorization: Bearer <jwt>
Request Body (全部可选):
  {
    displayName?: string,       // 1-64 chars
    email?: string,             // valid email
    currentPassword?: string,   // 改密码时必填
    newPassword?: string        // 改密码时必填，min 8 chars
  }

Response 200:
  Body: { user: { id, username, email, displayName, workspaceId, role, createdAt, updatedAt } }

Errors:
  400 — { code: "VALIDATION_ERROR" }    // 字段校验失败
  401 — { code: "UNAUTHORIZED" }         // JWT 缺失或无效
  401 — { code: "WRONG_PASSWORD" }       // currentPassword 错误
  409 — { code: "CONFLICT" }             // email 已被其他用户使用
```

### 2. 修改密码逻辑

```
1. 收到 { currentPassword, newPassword }
2. 查 user_auths WHERE user_id = userId AND provider = 'password'
3. 验证 currentPassword 与 passwordHash
4. 不匹配 → 401 WRONG_PASSWORD
5. 匹配 → hash(newPassword) → UPDATE user_auths.password_hash
```

如果用户是 OAuth 注册的（没有 password provider），修改密码会创建新的 `user_auths` 记录（provider='password'），让 OAuth 用户也可以设置密码。

### 3. 修改邮箱逻辑

```
1. 收到 { email }
2. email.toLowerCase()
3. SELECT users WHERE email = newEmail AND id != userId
4. 存在其他用户 → 409 CONFLICT
5. 不存在 → UPDATE users.email = newEmail
```

### 4. 新增模块

| 文件 | 职责 |
|------|------|
| `src/auth/service.ts`（修改） | 新增 `updateProfile(userId, input)` 方法 |
| `src/auth/routes.ts`（修改） | 新增 `PATCH /auth/me` handler |
| `src/auth/jwt.ts`（无修改） | 复用现有 JWT sign/verify |

不涉及 schema 变更。

## Testing Decisions

| # | 测试 | 验证点 |
|---|------|--------|
| 1 | 修改 displayName 成功 | 200, displayName 已更新 |
| 2 | 修改 email 成功 | 200, email 已更新 |
| 3 | email 冲突 → 409 | error.code = "CONFLICT" |
| 4 | 修改密码成功（提供 currentPassword + newPassword） | 200, 旧密码无法登录，新密码可登录 |
| 5 | currentPassword 错误 → 401 | error.code = "WRONG_PASSWORD" |
| 6 | newPassword < 8 chars → 400 | error.code = "VALIDATION_ERROR" |
| 7 | 无 token → 401 | UNAUTHORIZED |
| 8 | 修改后 GET /auth/me 返回最新信息 | displayName/email 已变更 |
| 9 | OAuth 用户首次设置密码 | 200, user_auths 新增 password provider 记录 |

## Further Notes

- `username` 不可修改（用户名是固定标识）
- `role` 不可自己修改（需要 admin 端点）
- `updatedAt` 自动更新为当前时间
