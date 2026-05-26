# ADR 0001: GlobalEventManager — Centralized Event Hub Proxy

**Status:** Accepted
**Date:** 2026-05-22

## Context

openimago needs to deliver real-time OpenCode events (session.status, message.updated, todo.updated, etc.) to the Vue frontend over SSE. Two possible endpoints in OpenCode:

- `/event?workspace=xxx` — Instance-scoped SSE, only events for one workspace, **no workspace metadata** in the event payload
- `/global/event` — Process-wide SSE, **all** bus events annotated with `{workspace, directory, project, payload}`

Key constraints:
- Users can have multiple workspaces (session-level + project-level)
- `userId != workspaceId` — workspace → user mapping lives in `workspace_refs` table
- Workspaces may not exist when the user's UI loads (created lazily on first session)
- The frontend should have a single persistent SSE connection from page load

## Decision

Adopt **`/global/event`** as the upstream event source, with a three-layer Effect service architecture in the openimago proxy:

1. **GlobalEventUpstream** — Persistent SSE connection to OpenCode `/global/event`
2. **WorkspaceResolver** — Cached `workspaceId → userId` lookup via `workspace_refs`
3. **UserEventBus** — PubSub-based fan-out: events arrive → resolve owner → push to user's PubSub

## Consequences

### Positive

- Single upstream connection regardless of user count
- Events available before workspace creation (no dependency on workspace table)
- Clean separation: upstream / cache / fan-out as independent Effect services
- Follows opencode's established Effect patterns (`Context.Service`, `Stream.callback`, `ScopedCache`, `PubSub`)
- Scope-based lifecycle management (auto-cleanup on disconnect)

### Negative

- Proxy must parse SSE stream (complexity over transparent pass-through)
- Need to maintain `workspace_refs` cache (stale data possible if mappings change)
- All users share one upstream connection (SPOF if `/global/event` goes down; mitigated by auto-reconnect)

### Neutral

- Requires `Sse.encode()` from `effect/unstable/encoding/Sse` (additional dependency)
- Hono → Effect bridge via TransformStream (one extra translation layer)

## Alternatives Considered

### `/event?workspace=xxx` per-user approach

- **Rejected** because it requires workspace to exist before connecting SSE
- Each user connection requires a separate upstream connection to OpenCode
- Events lack workspace metadata, making routing impossible at proxy level

### Pure Hono EventEmitter pattern (no Effect)

- **Rejected** in favor of Effect's typed stream lifecycle management
- Would require hand-rolled retry, backpressure, and cleanup logic
- Would diverge from opencode's established patterns

## References

- `CONTEXT.md` — Updated glossary (GlobalEventManager, User, workspaceId, workspace_refs)
- `opencode/packages/opencode/src/server/routes/instance/httpapi/event.ts` — SSE output pattern
- `opencode/packages/opencode/src/server/routes/instance/httpapi/handlers/global.ts` — Stream.callback pattern
- `opencode/packages/opencode/src/control-plane/workspace.ts` — SSE parsing pattern
- `opencode/packages/opencode/src/bus/index.ts` — Context.Service + Layer.effect pattern
- `/tmp/handoff-AeCbSM.md` — Detailed implementation handoff
