# ADR 0005: UI Story Writes via Backend CRUD with Optimistic Concurrency

**Status:** Accepted
**Date:** 2026-06-17
**Amends:** ADR 0004 (Story State as Schema JSON Files in Project Directory)

## Context

ADR 0004 made the project-directory story JSON files (`story/bible.json`,
`story/series.json`, `story/episodes/ep_NNN.json`, `workflow`, `runs`) the
canonical source of truth, and assumed a **single-writer model — "one active
agent per project at a time"** to sidestep concurrent-write conflicts.

The project workspace UI now needs to mutate story state directly from user
actions (add a shot to an episode, attach a reference image to a shot, mark a
shot reviewed, reorder shots). Routing every such structural edit through the AI
agent is slow, requires an active session, and gives no immediate, deterministic
feedback. So the UI needs its own write path — which breaks ADR 0004's
single-writer assumption.

The question: how does the UI mutate story JSON without reintroducing the
lost-update / conflicting-write problems the single-writer model avoided?

## Decision

**The UI mutates story state through dedicated backend CRUD endpoints that
perform a guarded read-modify-write on the JSON files, protected by optimistic
concurrency.** The agent remains the *primary author* of creative content; the
UI owns *structural / metadata* edits.

### Write classification (who writes what, how)

| Edit | Author | Path |
|------|--------|------|
| Creative content (script, character/scene definitions, shot prose, breaking story into shots) | AI agent | chat → agent tool calls editing JSON |
| Generation (produce a keyframe/video for a shot) | backend command | command → append Run + write outputs (workspace-files) |
| Structural / metadata (add/delete/reorder shot, attach referenceArtifactId, set shot status) | user (UI) | **backend CRUD, this ADR** |

### Optimistic concurrency

- Every story JSON file already carries `updatedAt` (ISO 8601).
- A UI write sends the `updatedAt` it last read (`If-Match` semantics, carried in
  the request body as `expectedUpdatedAt`).
- The backend re-reads the file, compares `updatedAt`. On mismatch it returns
  **409 Conflict** without writing. The client refetches and retries (or surfaces
  the conflict).
- On success the backend bumps `updatedAt` to the write time and persists.

This keeps the filesystem authoritative (per ADR 0004), allows both the agent and
the UI to write, and turns the rare agent-vs-UI race into a detectable 409 rather
than a silent lost update.

### Scope of backend write endpoints

Writes are **targeted operations**, not a generic "PUT whole file". Initial
operations (added incrementally):

- `POST  /api/platform/projects/:id/story/episodes/:epId/shots` — append a shot
- (follow-ups) update/delete/reorder shot, attach/detach referenceArtifactId, set status

Each validates project ownership (`projects.userId === userId`), uses the existing
`StoryService` path-traversal guard, and applies the `expectedUpdatedAt` check.

## Consequences

### Positive
- Deterministic, immediate UI edits without an active agent session.
- Single source of truth unchanged — still the JSON files on disk.
- Agent and UI can coexist; conflicts are explicit (409), never silent.
- Incremental: new targeted endpoints added as UI features need them.

### Negative
- No longer literally single-writer; correctness now depends on the
  `expectedUpdatedAt` guard being applied on every write endpoint.
- Targeted endpoints proliferate as the editable surface grows (accepted — keeps
  each write validated and intentional vs a blanket file PUT).
- Last-writer-wins at the whole-file granularity; a 409 forces a refetch even when
  edits were to disjoint parts. Acceptable at current scale (<100 shots/runs).

### Neutral
- Agent tool calls that edit the same files do not send `expectedUpdatedAt`; the
  guard protects UI writes against stale state, and an agent write simply advances
  `updatedAt`, causing the next UI write to 409 and refetch.

## References
- `docs/adr/0004-story-state-json-schema.md` — canonical story JSON model (amended here)
- `packages/openimago/src/project/story-service.ts` — read-only StoryService gaining write methods
- `docs/prd/workspace-artifacts-and-story-workflow.md` — story workflow PRD
