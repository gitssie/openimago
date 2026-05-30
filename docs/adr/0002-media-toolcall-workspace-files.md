# ADR 0002: Media ToolCall Output and Workspace Generated Files

**Status:** Accepted
**Date:** 2026-05-29

## Context

openimago supports media generation tools (image, video, audio) that produce files for the active OpenCode session workspace. The platform needs to:

1. Display an inline media preview card in the chatbot message stream immediately when a generation tool completes.
2. Show all tool-generated workspace files in the right-side panel for the current session workspace.
3. Support subagents that generate media in the same working directory/session workspace.
4. Handle local development, production S3 storage, and test environments without changing frontend rendering logic.
5. Recover the right-side panel on page refresh from backend workspace-file records, not from the message stream.

Key constraints:

- OpenCode's `ToolPart` carries `state.output` as a JSON string, `state.status` (`running` | `completed` | `error`), and `state.attachments`.
- Root agents and subagents follow the same working directory context for a session workflow.
- Generated media files are **not** user asset-library entries. They are tool-generated workspace files.
- Physical storage may be the same S3 bucket used by other file flows, but the domain record is a workspace generated file, not an asset.
- The right-side panel must show registered tool-generated files, not every file in the working directory.

## Decision

### 1. Media tool naming convention

Media generation tools are named with type prefixes that the frontend uses to detect media ToolCalls:

```text
image_generate    image_edit    image_upscale    image_variation
video_generate    video_image_to_video    video_extend
audio_generate    audio_tts    audio_music    audio_sfx
```

The frontend detects a media ToolCall when `part.tool` starts with `image_`, `video_`, or `audio_`. Non-media tools are not affected.

### 2. MediaToolOutputV1 contract

When a media generation tool completes successfully (`state.status === 'completed'`), `state.output` MUST be a JSON string conforming to this protocol. The output references a registered workspace file and includes browser access locators for immediate chat preview.

```typescript
type MediaToolOutputV1 = {
  version: 1
  kind: 'image' | 'video' | 'audio'
  status: 'completed'
  result: MediaToolResultV1
  prompt?: string
  provider?: string
  model?: string
  metadata?: Record<string, unknown>
}

type MediaToolResultV1 = {
  /** Stable domain identity. This is the only durable identifier. */
  workspaceFileId: string

  /** Browser-loadable access locators. These are not identity. */
  access: {
    preview: MediaAccessLocator
    download?: MediaAccessLocator
    thumbnail?: MediaAccessLocator
    poster?: MediaAccessLocator
  }

  mime: string
  filename?: string
  width?: number
  height?: number
  duration?: number
  seed?: number
  createdAt?: string
  metadata?: Record<string, unknown>
}

type MediaAccessLocator = {
  /** Opaque browser-loadable string. Frontend must not parse or construct it. */
  href: string
  /** Optional hint only; identity and authorization must not depend on this. */
  expiresAt?: string
}
```

Protocol rules:

| Rule | Enforcement |
|------|-------------|
| `output.version` MUST be `1` | Frontend rejects non-`1` versions; no media card rendered |
| `output.status` MUST be `'completed'` | Only completed outputs enter the protocol |
| `output.kind` MUST match the tool prefix (`image_*` → `image`) | Mismatch is a protocol error; frontend does not render |
| A single ToolCall returns exactly one media result | `output.result` is a single object, not an array |
| Failed generation uses `state.status === 'error'` | `state.error` carries the error; no media protocol output is rendered |

### 3. Access locator design: identity vs browser access

The protocol intentionally avoids a top-level `url` field. A `url` field makes access look like durable identity, but media access is an environment-specific capability.

| Field | Semantics | Stability |
|-------|-----------|-----------|
| `workspaceFileId` | Durable identity of the workspace generated-file record | Stable across environments and refreshes |
| `access.preview.href` | Browser-loadable locator for inline display | Environment-specific; may change on refresh |
| `access.download.href` | Browser-loadable locator for download | Environment-specific; may change on refresh |
| `access.thumbnail.href` | Small preview locator | Environment-specific |
| `access.poster.href` | Video poster frame locator | Environment-specific |

Rules:

- `workspaceFileId` is the canonical identity. Frontend should key selections and cross-panel linking by this value.
- Access locators are opaque strings that the browser can load. The frontend must not parse, construct, or persist them as identity.
- In production, an access locator may point at S3 or a CDN in front of S3.
- In local development, an access locator may be a same-origin relative endpoint such as `/api/dev-media/generated/abc123.png`.
- In tests, an access locator may be a `data:image/*`, `data:video/*`, or `data:audio/*` URL.
- On page refresh, the right-side panel fetches fresh access locators from the workspace-files API rather than trusting ToolCall locators from message history.
- The chatbot may reconstruct inline previews from message history using `access.preview.href`; if that locator no longer loads, the card should degrade gracefully and can use `workspaceFileId` to refetch details in a later implementation.

### 4. Generation tool responsibilities

Media generation tools MUST complete these steps before returning success:

1. Generate the media file.
2. Write the media file to configured workspace file storage. Production may use S3; local development may use a local/dev storage adapter.
3. Register the file as a tool-generated workspace file to obtain `workspaceFileId`.
4. Return `MediaToolOutputV1` JSON as `state.output` with `workspaceFileId` and environment-appropriate access locators.

On failure:

- Set `state.status = 'error'` with a descriptive `state.error` string.
- Do not populate `state.output` with `MediaToolOutputV1`.

### 5. Chatbot vs right-side panel

These are two independent consumers of the same underlying workspace generated-file domain:

```text
Tool generates media
  → writes to workspace storage (S3 in production, dev adapter locally)
  → registers tool-generated workspace file
  → returns MediaToolOutputV1 in ToolPart.state.output

Chatbot inline card:
  ToolPart.state.output → parse protocol → immediate media preview

Right-side panel:
  current session → resolve workspace → fetch workspace-files API → file list
```

- **Chatbot inline card** renders from `ToolPart.state.output` when the tool prefix matches `image_*`, `video_*`, or `audio_*`. It provides immediate visual feedback in the message stream and can reconstruct from OpenCode message history.
- **Right-side panel** fetches file records from the backend workspace-files API. It does not walk message parts and does not parse ToolCall output. It shows registered tool-generated files for the current session workspace.
- **Subagents** follow the same session working directory. Their generated files are visible through the same workspace-file list; no special parent/child aggregation is required in the frontend.

### 6. Frontend rendering rules

| Condition | What renders |
|-----------|--------------|
| `state.status === 'running'` | ToolCall card with spinner, no media content |
| `state.status === 'completed'` and tool prefix is `image_*` / `video_*` / `audio_*` | Parse `state.output` as `MediaToolOutputV1`; render inline media card |
| `state.status === 'completed'` and tool is not a media prefix | Render standard ToolCall card |
| `state.status === 'error'` | Render error state, no media card |
| `output.version !== 1` | Protocol violation; render standard ToolCall card, no media |
| `output.status !== 'completed'` | Protocol violation; no media card |
| `output.kind` does not match tool prefix | Protocol violation; no media card |

### 7. Right-side panel data source

The right-side panel fetches its file list from a dedicated backend endpoint that queries registered tool-generated workspace files. It must not derive the panel by traversing OpenCode message parts.

```http
GET /api/platform/sessions/:id/workspace-files?source=tool
```

The backend resolves the session's workspace/working directory and returns `WorkspaceFile[]` with fresh access locators.

This ensures:

- Only files registered by generation tools appear in the result panel.
- User-uploaded context files, arbitrary workdir files, caches, and thumbnails do not appear unless explicitly registered as tool-generated workspace files.
- Access locators are current on each panel fetch.
- Subagent files are included because they share the same session workspace.
- Storage implementation details are opaque to the frontend.

### 8. Examples

#### Image

```json
{
  "version": 1,
  "kind": "image",
  "status": "completed",
  "result": {
    "workspaceFileId": "wf_01h_image",
    "mime": "image/png",
    "filename": "cyberpunk-street.png",
    "width": 1024,
    "height": 1024,
    "access": {
      "preview": { "href": "https://cdn.example.com/generated/cyberpunk-street.png" },
      "download": { "href": "https://cdn.example.com/generated/cyberpunk-street.png" },
      "thumbnail": { "href": "https://cdn.example.com/generated/cyberpunk-street.thumb.webp" }
    }
  },
  "provider": "example-image-provider",
  "model": "image-v1"
}
```

#### Video

```json
{
  "version": 1,
  "kind": "video",
  "status": "completed",
  "result": {
    "workspaceFileId": "wf_01h_video",
    "mime": "video/mp4",
    "filename": "ocean-loop.mp4",
    "duration": 6,
    "access": {
      "preview": { "href": "/api/dev-media/generated/ocean-loop.mp4" },
      "poster": { "href": "/api/dev-media/generated/ocean-loop.poster.webp" }
    }
  }
}
```

#### Audio

```json
{
  "version": 1,
  "kind": "audio",
  "status": "completed",
  "result": {
    "workspaceFileId": "wf_01h_audio",
    "mime": "audio/mpeg",
    "filename": "voiceover.mp3",
    "duration": 18.4,
    "access": {
      "preview": { "href": "data:audio/mpeg;base64,..." }
    }
  }
}
```

## Consequences

### Positive

- Clean separation of concerns: physical storage, workspace file record, ToolCall output, chatbot preview, right-side panel.
- `workspaceFileId` provides stable identity independent of storage backend.
- Access locator pattern supports S3/CDN, local relative endpoints, and test data URLs without frontend changes.
- Subagent-generated files are naturally included via shared workspace scope.
- Page refresh recovery is correct: chatbot can reconstruct from message history; panel fetches fresh file records and access locators.
- Protocol version field enables future evolution without breaking existing media cards.

### Negative

- Requires backend workspace-files API and a workspace generated-file record/catalog.
- Tools must explicitly register files before returning success, adding latency to generation completion.
- Two data paths must stay consistent: ToolCall output in messages and workspace generated-file records.

### Neutral

- Right-side panel no longer uses message traversal or naive filesystem scanning; it must migrate from the PRD-outputs.md prototype to registered tool-generated files.
- Media card component is a new UI surface not present in upstream OpenCode.

## Alternatives Considered

### Using `state.attachments` for generated media

- **Rejected** because attachments are not the output channel for these tools in openimago.
- Attachments do not provide the domain identity (`workspaceFileId`) required to connect chatbot cards with workspace file records.

### Parsing arbitrary text URLs from `state.output`

- **Rejected** because arbitrary text output is not a stable API.
- It cannot reliably distinguish a generated media result from an incidental URL in text.
- It lacks type metadata and workspace file identity.

### Deriving the right-side panel from the message stream

- **Rejected** because the panel represents workspace generated files, not message parts.
- Traversing message history is expensive and fragile.
- It couples panel behavior to chat rendering and makes refresh semantics unclear.

### Using `url` as the primary field

- **Rejected** because URLs are environment-specific access locators, not durable identity.
- A local dev locator (`/api/dev-media/xxx.png`) and a production S3/CDN locator represent access capabilities, not the file record.
- The durable identity is `workspaceFileId`.

### Flat fields like `previewUrl`, `downloadUrl`, `thumbnailUrl`

- **Rejected** because flat URL fields still read like intrinsic file properties.
- Nesting under `access.*.href` makes their role explicit: browser access capabilities supplied by the tool/backend for the current environment.
- The nested shape leaves room for future access metadata such as `expiresAt` without changing the top-level result shape.

### Using a user asset-library `assetId`

- **Rejected** because generated files are workspace-scoped artifacts tied to a session workflow lifecycle.
- Asset-library semantics imply user-uploaded, persistent, cross-session resources.

## References

- `docs/adr/0001-global-event-manager.md` — ADR format reference
- `docs/OPENCODE-INTEGRATION.md` — Session directory/workspace concepts; session table schema
- `docs/PRD-outputs.md` — Prior output listing prototype; superseded for media ToolCall workspace-file protocol
- `packages/web/src/pages/SessionWorkspacePage.vue` — Current chatbot and right-side panel host
- `packages/web/src/components/AgentToolCall.vue` — Current ToolCall card component
