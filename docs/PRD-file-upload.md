## Problem Statement

用户需要将本地文件上传到工作目录（`/mnt/cos/{id}`），使 OpenCode 的 AI agent 能够读取这些文件作为对话上下文。当前 openimago 可以创建目录和管理 session，但没有文件上传接口。

## Solution

新增 `POST /api/platform/files/upload` 端点，接受 `multipart/form-data` 文件上传。写入 `COS_BASE_PATH/{uploadDir}` 目录，并返回文件路径供 OpenCode 使用。

## User Stories

1. 作为平台用户，我想上传单个文件到我的项目目录，这样 AI 可以分析我的代码/文档
2. 作为平台用户，我想上传文件到独立会话目录，与项目无关
3. 作为平台用户，上传的文件不能覆盖已存在的同名文件（安全考虑）
4. 作为平台用户，我不能上传文件到其他用户的目录
5. 作为平台用户，我想限制上传文件的大小，防止占用过多磁盘
6. 作为前端开发者，上传成功后我能拿到文件路径，用于后续 API 调用

## Implementation Decisions

### 1. API Contract

#### `POST /api/platform/files/upload`

```
Headers: Authorization: Bearer <jwt>
Content-Type: multipart/form-data

Form fields:
  file: File              // 上传的文件 (必填)
  projectId?: string      // 目标项目 ID，不传则为独立上传
  directory?: string      // 子目录路径（可选），相对于工作目录

Response 201:
  Body: {
    file: {
      name: string,           // 原始文件名
      size: number,           // 文件大小 (bytes)
      path: string,           // 完整路径 /mnt/cos/{id}/subdir/file.txt
      relativePath: string    // 相对路径 subdir/file.txt
    }
  }

Errors:
  400 — { code: "VALIDATION_ERROR" }   // 无文件、文件超过大小限制
  403 — { code: "FORBIDDEN" }          // 无权访问该目录
  404 — { code: "NOT_FOUND" }          // projectId 对应的项目不存在
  409 — { code: "CONFLICT" }           // 文件已存在
```

### 2. 目标目录解析

```
1. 如果传了 projectId:
   - SELECT * FROM projects WHERE id = projectId AND user_id = userId
   - 不存在 → 404
   - 存在 → targetDir = project.fullPath   // /mnt/cos/proj_xxx

2. 如果没传 projectId:
   - 生成 upload_id = "dir_" + nanoid
   - targetDir = COS_BASE_PATH + "/" + upload_id   // /mnt/cos/dir_xxx
   - mkdir -p targetDir
   - INSERT INTO work_dirs (user_id, type="upload", full_path=targetDir, status="active")

3. 如果传了 directory 子路径:
   - targetDir = targetDir + "/" + directory
   - mkdir -p targetDir
```

### 3. 文件写入逻辑

```
1. 从 multipart 解析 file
2. 校验: size <= MAX_UPLOAD_SIZE (default 100MB)
3. 校验: 文件名不含 "/" "\" ".." (防路径穿越)
4. 目标路径 = targetDir + "/" + filename
5. 如果 fs.exists(目标路径) → 409 CONFLICT
6. Bun.write(目标路径, file.stream())
7. 返回 { name, size, path: 绝对路径, relativePath: 相对路径 }
```

### 4. 安全约束

| 约束 | 实现 |
|------|------|
| 路径穿越防御 | 文件名拒绝 `..`、`/`、`\` |
| 文件大小限制 | `MAX_UPLOAD_SIZE` env var，默认 100MB |
| 文件类型限制（可选） | `ALLOWED_EXTENSIONS` env var，默认不限制 |
| 所有权校验 | 只能写入自己的项目目录 |
| 同名冲突 | 返回 409，不覆盖 |

### 5. 环境变量

```
MAX_UPLOAD_SIZE=104857600      # 100MB，默认
ALLOWED_EXTENSIONS=            # 逗号分隔，如 ".js,.ts,.json,.md"，空=不限制
```

### 6. 新增模块

| 文件 | 职责 |
|------|------|
| `src/files/routes.ts` | `POST /api/platform/files/upload` handler |
| `src/files/service.ts` | `upload(input): Effect<FileMeta>` — 目录解析、校验、写入 |
| `src/server/app.ts`（修改） | 注册 `filesRoutes` |

不涉及 schema 变更。

## Testing Decisions

| # | 测试 | 验证点 |
|---|------|--------|
| 1 | 上传文件到项目目录成功 | 201, 文件存在磁盘，返回正确 path |
| 2 | 上传文件到独立目录成功 | 201, work_dirs 新增记录 |
| 3 | 上传到子目录成功 | 201, 文件路径含子目录 |
| 4 | 无 file → 400 | VALIDATION_ERROR |
| 5 | projectId 不存在 → 404 | NOT_FOUND |
| 6 | projectId 不属于当前用户 → 403 | FORBIDDEN |
| 7 | 文件超过大小限制 → 400 | VALIDATION_ERROR |
| 8 | 文件已存在 → 409 | CONFLICT |
| 9 | 文件名含 ".." → 400 | VALIDATION_ERROR |
| 10 | 无 token → 401 | UNAUTHORIZED |

共 10 个测试用例。测试使用 `FormData` 构造 multipart 请求，验证文件实际写入磁盘的临时目录。

## Further Notes

- 不实现文件列表/删除接口（Phase 2）
- 不实现多文件批量上传（Phase 2）
- 上传的工作目录由 openimago 管理，OpenCode 可通过 `?directory=` 参数访问
- `Bun.write` 支持直接写入 `ReadableStream`，内存友好
- `type="upload"` 在 work_dirs 中标记独立上传目录，与 `project`/`session` 区分
