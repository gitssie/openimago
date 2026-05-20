## Problem Statement

当前 openimago 仅支持邮箱+密码注册/登录。用户需要通过 GitHub 或 Google 账号快速登录，无需记忆额外密码。企业场景下，GitHub OAuth 是最常见的社会化登录方式；Google OAuth 覆盖 Gmail/GSuite 用户群。

## Solution

新增 `GET /auth/oauth/:provider` 和 `GET /auth/oauth/:provider/callback` 两个端点，支持 GitHub 和 Google 两个 OAuth provider。前端 SPA 负责弹出 OAuth 授权窗口，后端负责 code→token 交换、用户信息获取、find-or-create 用户、签发 JWT。全程无需新增数据库表——`user_auths` 表已有 `provider` + `provider_id` 字段。

## User Stories

1. 作为新用户，我想用 GitHub 账号一键注册，这样我不需要填写注册表单
2. 作为新用户，我想用 Google 账号一键注册，这样我的 Gmail 账号就是我的平台身份
3. 作为已有密码登录的用户，我想绑定 GitHub 账号，这样我下次可以用 GitHub 登录（留给 Phase 2）
4. 作为已通过 GitHub 注册的用户，我再次用 GitHub 登录时应该直接登录，不创建重复账号
5. 作为前端开发者，我想调用 `GET /auth/oauth/github` 获取 redirect URL，然后引导用户完成 OAuth 流程
6. 作为前端开发者，OAuth 回调后调用 `GET /auth/oauth/github/callback?code=...&state=...`，拿到 `{ user, token }` 即可完成登录
7. 作为安全审计者，OAuth 流程必须有 state 参数防 CSRF，state 必须短期有效（5 分钟）
8. 作为运维人员，OAuth 配置应通过环境变量管理，不需要改代码

## Implementation Decisions

### 1. OAuth Flow

```
前端                                               openimago
 │                                                    │
 │ GET /auth/oauth/github                             │
 │───────────────────────────────────────────────────>│
 │                                                    │ 生成 state (5min TTL)
 │                                                    │ 返回 { redirectUrl }
 │<───────────────────────────────────────────────────│
 │                                                    │
 │ 浏览器跳转到 GitHub authorize 页面                  │
 │ 用户授权后 GitHub 回调到前端 SPA                     │
 │                                                    │
 │ GET /auth/oauth/github/callback?code=...&state=... │
 │───────────────────────────────────────────────────>│
 │                                                    │ 1. 校验 state
 │                                                    │ 2. POST GitHub /access_token
 │                                                    │ 3. GET GitHub /user + /user/emails
 │                                                    │ 4. SELECT user_auths WHERE provider='github' AND provider_id=...
 │                                                    │ 5. 找到用户 → 签发 JWT
 │                                                    │ 6. 没找到 → 创建用户 + user_auths + workspace → 签发 JWT
 │<───────────────────────────────────────────────────│
 │ { user, token }                                    │
```

### 2. State 管理

- State = base64(random 32 bytes)，5 分钟 TTL
- 存储在内存 `Map<string, { createdAt: number }>`，定期清理过期 state
- 不走 cookie（callback 端点是 SPA fetch 调用，不是浏览器 redirect）

### 3. 用户创建逻辑（find-or-create）

```
// 以 GitHub OAuth 为例
1. 用 GitHub token 调用 GET /user → 取 { id, login, name, email }
2. 如果 email 为 null，调用 GET /user/emails → 取 primary email
3. SELECT * FROM user_auths WHERE provider = 'github' AND provider_id = 'github_user_id'
   - 找到了 → 取 user_id → 查 users → 签发 JWT
   - 没找到 → 进入创建逻辑
4. 创建用户:
   - username = sanitized(github.login)  // 去掉特殊字符，限制 3-32 字符
     - 如果 username 已被占用 → 追加随机数后缀
   - email = github.email
   - workspaceId = generateWorkspaceId()
   - INSERT INTO users
   - INSERT INTO user_auths (provider='github', provider_id='...')
   - INSERT INTO workspace (id=workspaceId, type='worktree', ...)
5. 签发 JWT
```

### 4. API Contracts

#### `GET /auth/oauth/:provider` (provider = "github" | "google")

```
Query: { redirectUri?: string }  // 前端回调地址，默认使用 OAUTH_REDIRECT_BASE
Response 200:
  Body: { redirectUrl: string }  // e.g. https://github.com/login/oauth/authorize?client_id=...&state=...&...
Errors:
  400 — { code: "INVALID_PROVIDER" }  // 不支持的 provider
```

#### `GET /auth/oauth/:provider/callback` (provider = "github" | "google")

```
Query: { code: string, state: string }
Response 200:
  Body: { user: { id, username, email, displayName, workspaceId, role, createdAt, updatedAt }, token: string }
Errors:
  400 — { code: "INVALID_STATE" }       // state 无效或过期
  400 — { code: "INVALID_PROVIDER" }
  400 — { code: "OAUTH_FAILED" }        // GitHub/Google 返回错误
  401 — { code: "OAUTH_FAILED", message: "..." }
```

### 5. 环境变量

```
# GitHub OAuth
OAUTH_GITHUB_CLIENT_ID=<github-oauth-app-client-id>
OAUTH_GITHUB_CLIENT_SECRET=<github-oauth-app-client-secret>

# Google OAuth
OAUTH_GOOGLE_CLIENT_ID=<google-oauth-client-id>
OAUTH_GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>

# 通用
OAUTH_REDIRECT_BASE=http://localhost:5173/auth/callback  # 前端回调基准 URL
```

### 6. 新增模块

| 文件 | 职责 |
|------|------|
| `src/auth/oauth.ts` | OAuthService 类：`getRedirectUrl(provider, redirectUri?)`, `handleCallback(provider, code, state)` |
| `src/auth/routes.ts`（修改） | 新增 `GET /auth/oauth/:provider` 和 `GET /auth/oauth/:provider/callback` |
| `src/auth/service.ts`（修改） | 可能提取 `signTokenForUser(user)` 公共方法供 OAuth 复用 |

不涉及 schema 变更（`user_auths` 已有 `provider` + `provider_id`）。

### 7. username 生成规则

```
function usernameFromOAuth(provider: string, profile: { login?: string, name?: string, email: string }) {
  // GitHub: profile.login (e.g. "john-doe")
  // Google: profile.email 的 @ 前部分 (e.g. "john.doe")
  let base = profile.login || profile.email.split("@")[0]!
  base = base.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32)
  if (base.length < 3) base = base.padEnd(3, "0")
  // 查重，冲突时追加随机 suffix
  const exists = await db.select().from(users).where(eq(users.username, base))
  if (exists.length > 0) base = `${base.slice(0, 28)}_${nanoid(3)}`
  return base
}
```

## Testing Decisions

### What Makes a Good Test

- 用 Hono `app.fetch()` 发送真实 HTTP 请求
- Mock 外部 OAuth provider 的 `fetch` 调用（不真正调 GitHub/Google）
- 只测外部行为：status code、response body 结构、JWT 可验证

### 测试覆盖

| # | 测试 | 验证点 |
|---|------|--------|
| 1 | `GET /auth/oauth/github` 返回 correct redirect URL | URL 含 `github.com/login/oauth/authorize`、`client_id`、`state` |
| 2 | `GET /auth/oauth/google` 返回 correct redirect URL | URL 含 `accounts.google.com/o/oauth2/v2/auth` |
| 3 | `GET /auth/oauth/unknown` 返回 400 | `INVALID_PROVIDER` |
| 4 | callback 缺少 state → 400 | `INVALID_STATE` |
| 5 | callback state 错误 → 400 | `INVALID_STATE` |
| 6 | callback state 过期 → 400 | `INVALID_STATE` |
| 7 | GitHub callback 成功（新用户）→ 201 + user + token + workspace 创建 | `user.username` 基于 GitHub login；`user_auths` 有记录；`workspace` 表有记录 |
| 8 | GitHub callback 成功（已有用户）→ 200 + user + token | 不创建新用户 |
| 9 | Google callback 成功（新用户）→ 201 + user + token | username 基于 email prefix |
| 10 | 同一 GitHub 用户再次 callback → 200 + 同一 user | id 不变 |
| 11 | OAuth token 可验证 | `GET /auth/me` 返回正确的用户信息 |

共 11 个测试用例。Mock `globalThis.fetch` 模拟 GitHub/Google 的 token 交换和 user info API。

## Out of Scope

- 已有用户绑定第二个 OAuth provider（Phase 2）
- OAuth 账户解绑
- 前端 SPA 的 OAuth popup/redirect 逻辑
- Refresh token 机制（当前 JWT 24h 过期后需重新登录）
- 环境变量热加载

## Further Notes

1. **不引入新依赖** — 现有 `jose`(JWT) + 原生 `fetch` + 原生 `crypto.randomBytes`（Bun 支持）足够
2. **GitHub user API** free tier 有 rate limit（60 req/h 无认证 → 5000 req/h 带 token），交换完 token 后用 token 调 `/user` 即可
3. **Google OAuth** 需要 scope: `openid profile email`
4. **user_auths 唯一约束** `UNIQUE(user_id, provider)` 已存在 — 同一用户不会有两个 GitHub auth 记录
5. **workspace 创建**与 `register()` 逻辑一致，OAuth 新用户也调用 `generateWorkspaceId()` + 插入 `workspace` 表
