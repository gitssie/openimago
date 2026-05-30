# Media Tool Integration Contract

**Status:** Active
**Date:** 2026-05-29
**Audience:** OpenCode tool implementers

## Overview

This document defines the exact integration contract for media generation tools
(image, video, audio) that run inside OpenCode and produce output consumable
by the openimago UI layer.

Media tools follow ADR 0002 (`docs/adr/0002-media-toolcall-workspace-files.md`).
The openimago backend provides a workspace-files registration API; the openimago
frontend parses `MediaToolOutputV1` from `ToolPart.state.output` and renders
inline media cards.

**This contract is the bridge between the OpenCode tool layer and the openimago UI layer.**

## Required External Repo

Media tools must be implemented in the **OpenCode engine** (or its plugin/tool system),
**not** in the openimago repository.

- **OpenCode repo:** the engine that executes tools and manages ToolParts
- **openimago repo:** UI wrapper that proxies requests to OpenCode and renders
  tool outputs

## Tool Naming Convention

Media tools use type prefixes that the openimago frontend detects:

| Prefix | Kind | Example tool names |
|--------|------|-------------------|
| `image_*` | `image` | `image_generate`, `image_edit`, `image_upscale`, `image_variation` |
| `video_*` | `video` | `video_generate`, `video_image_to_video`, `video_extend` |
| `audio_*` | `audio` | `audio_generate`, `audio_tts`, `audio_music`, `audio_sfx` |

The frontend detects a media ToolCall when `part.tool` starts with one of these prefixes.

## Tool Lifecycle

### 1. Running State

While generating, the tool sets:

```typescript
part.state.status = 'running'
// state.output is not yet populated or may contain progress info
```

The openimago frontend renders a ToolCall card with a spinner during this state.

### 2. Successful Completion

On success, the tool MUST complete these steps **in order**:

```
1. Generate the media file (invoke AI provider)
2. Write the media file to storage (local filesystem or S3)
3. Register the file via openimago workspace-files API to obtain workspaceFileId
4. Return MediaToolOutputV1 JSON as state.output
```

#### Step 3: Register workspace file

```http
POST /api/platform/workspace-files
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "sessionId": "<current session id>",
  "kind": "image",
  "mime": "image/png",
  "filename": "cyberpunk-street.png",
  "width": 1024,
  "height": 1024,
  "accessPreviewHref": "https://cdn.example.com/generated/abc123.png",
  "accessDownloadHref": "https://cdn.example.com/generated/abc123.png",
  "accessThumbnailHref": "https://cdn.example.com/generated/abc123.thumb.webp",
  "prompt": "a cyberpunk street at night",
  "provider": "some-provider",
  "model": "image-v1"
}
```

**Response (201):**

```json
{
  "workspaceFileId": "wf_abc123def456",
  "result": {
    "workspaceFileId": "wf_abc123def456",
    "kind": "image",
    "mime": "image/png",
    "filename": "cyberpunk-street.png",
    "width": 1024,
    "height": 1024,
    "access": {
      "preview": { "href": "https://cdn.example.com/generated/abc123.png" },
      "download": { "href": "https://cdn.example.com/generated/abc123.png" },
      "thumbnail": { "href": "https://cdn.example.com/generated/abc123.thumb.webp" }
    },
    "prompt": "a cyberpunk street at night",
    "provider": "some-provider",
    "model": "image-v1",
    "createdAt": "2026-05-29T12:00:00.000Z"
  }
}
```

**Required fields:**
- `sessionId` — the current OpenCode session ID (available from OpenCode session context)
- `kind` — `"image"`, `"video"`, or `"audio"`
- `mime` — MIME type (e.g., `"image/png"`, `"video/mp4"`, `"audio/mpeg"`)
- `accessPreviewHref` — browser-loadable URL for inline preview (required)

**Optional fields:** `filename`, `width`, `height`, `duration`, `accessDownloadHref`, `accessThumbnailHref`, `accessPosterHref`, `prompt`, `provider`, `model`, `metadata`

**Auth:** The tool receives the user's JWT via OpenCode's session context.
Forward the standard `Authorization: Bearer <jwt>` header to the registration endpoint.
The openimago backend base URL is available as the same origin that serves the UI.

#### Step 4: Return MediaToolOutputV1

Set `ToolPart.state.output` to the following JSON string:

```json
{
  "version": 1,
  "kind": "image",
  "status": "completed",
  "result": {
    "workspaceFileId": "wf_abc123def456",
    "mime": "image/png",
    "filename": "cyberpunk-street.png",
    "width": 1024,
    "height": 1024,
    "access": {
      "preview": { "href": "https://cdn.example.com/generated/abc123.png" },
      "download": { "href": "https://cdn.example.com/generated/abc123.png" },
      "thumbnail": { "href": "https://cdn.example.com/generated/abc123.thumb.webp" }
    }
  },
  "prompt": "a cyberpunk street at night",
  "provider": "some-provider",
  "model": "image-v1"
}
```

### 3. Failure

On failure, set:

```typescript
part.state.status = 'error'
part.state.error = 'Descriptive error message'
// Do NOT populate state.output with MediaToolOutputV1
```

The openimago frontend renders an error state with no media card.

## Protocol Validation Rules

The openimago frontend enforces these rules when parsing `state.output`:

| Rule | Behavior on violation |
|------|----------------------|
| `output.version` MUST be `1` | No media card rendered |
| `output.status` MUST be `'completed'` | No media card rendered |
| `output.kind` MUST be `'image'`, `'video'`, or `'audio'` | No media card rendered |
| `output.kind` MUST match the tool name prefix (`image_*` → `image`) | No media card rendered |
| `result.workspaceFileId` MUST be a non-empty string | No media card rendered |
| `result.mime` MUST be a non-empty string | No media card rendered |
| `result.access.preview.href` MUST be a non-empty string | No media card rendered |
| A single ToolCall returns exactly one result | `result` is a single object, not an array |

## Access Locator Rules

| Field | Semantics | Implementation |
|-------|-----------|---------------|
| `workspaceFileId` | Durable identity | Stable, never changes |
| `access.preview.href` | Browser-loadable preview URL | Environment-specific; may be a CDN URL, local dev endpoint, or `data:` URI |
| `access.download.href` | Browser-loadable download URL | Optional |
| `access.thumbnail.href` | Small preview URL | Optional |
| `access.poster.href` | Video poster frame URL | Optional (`video_*` only) |

In production, access locators point to S3/CDN URLs. In local development,
they may be same-origin relative paths or filesystem `file://` URIs.

The frontend treats access locators as opaque strings — it does not parse,
construct, or persist them as identity. On page refresh, the right-side panel
fetches fresh access locators from the workspace-files API rather than trusting
stale locators from message history.

## End-to-End Flow

```
User sends prompt
  → OpenCode dispatches to image_generate tool agent
    → Tool generates image via AI provider API
    → Tool writes image to storage (S3 or local)
    → Tool POSTs registration to openimago /api/platform/workspace-files
    → Tool receives workspaceFileId + access locators in response
    → Tool sets ToolPart.state.output = MediaToolOutputV1 JSON
    → Tool sets ToolPart.state.status = 'completed'
  → OpenCode emits SSE event with completed ToolPart
  → openimago frontend receives ToolPart via SSE
  → Frontend parses state.output as MediaToolOutputV1
  → Frontend renders inline media preview card in chatbot
  → Right-side panel lists registered workspace files via GET /api/platform/sessions/:id/workspace-files
```

## Storage Considerations

The tool is responsible for writing media to persistent storage before registering.
Storage strategy depends on deployment environment:

| Environment | Storage | Access locator example |
|-------------|---------|----------------------|
| Production | S3 bucket (shared by openimago) | `https://cdn.example.com/generated/abc123.png` |
| Local dev | Local filesystem or dev server | `http://localhost:5173/api/dev-media/generated/abc123.png` |
| Test | Data URIs | `data:image/png;base64,iVBOR...` |

The workspace-files registration API does **not** handle file upload — it only
creates the database record. The tool must write the file to storage first,
then register with the resulting access locator.

## Implementation Checklist for OpenCode

- [ ] Define `image_generate` tool agent (or plugin) in OpenCode
- [ ] Tool receives AI provider credentials and prompt from OpenCode context
- [ ] Tool calls AI provider API to generate image
- [ ] Tool writes generated image to storage
- [ ] Tool obtains current user JWT and session ID from OpenCode session context
- [ ] Tool POSTs to openimago `/api/platform/workspace-files` with file metadata + access locators
- [ ] Tool constructs `MediaToolOutputV1` JSON using the returned `workspaceFileId`
- [ ] Tool sets `ToolPart.state.output` and `state.status = 'completed'`
- [ ] On error, tool sets `state.status = 'error'` with descriptive message

## References

- `docs/adr/0002-media-toolcall-workspace-files.md` — Full design rationale and protocol specification
- `packages/openimago/src/workspace-files/service.ts` — Backend registration and listing API
- `packages/web/src/services/media.ts` — Frontend MediaToolOutputV1 parser and types
- OpenCode docs — Tool/Agent architecture and ToolPart lifecycle
