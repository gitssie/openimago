# ADR 0006: Episode Cut as a Separate Story File (Edit Layer)

**Status:** Accepted
**Date:** 2026-06-18
**Amends:** ADR 0004 (Story State as Schema JSON Files), ADR 0005 (UI Story Writes via Optimistic Concurrency)

## Context

The project workspace gains a non-linear **edit layer**: the 时间线 (timeline) tab
becomes an NLE-style **Cut** editor that assembles an Episode's generated media
into a playable rough cut (粗剪). This replaces the previous 时间线 content (a
read-only generation-workflow DAG + run history, which moves to 概览 / is retired).

A Cut owns edit-layer state distinct from the script:

- an ordered list of **Clips** — each `{ id, sourceShotId, inPoint, outPoint, order }`;
  a Shot maps to **0..N** Clips (cut out / once / split), so the clip list is **not**
  a projection of the Episode's shots — it is independent, trimmed, reorderable state;
- a **transition** between consecutive clips;
- a single **BGM** audio bed reference.

(Voiceover is *not* Cut state — it is derived: one audio Run per Shot `dialog`.)

This raises a domain boundary we name explicitly — **generation layer vs edit layer**:

- **Generation layer (AI):** Shots, Runs, Artifacts — authored via 故事板 + 对话.
  The agent frequently rewrites `episode.json` (script, shot breakdown).
- **Edit layer (non-AI):** Clips, trims, transitions, BGM — authored on the 时间线.
  The user frequently mutates the Cut (drag, trim, split, set BGM).

The question: where does Cut state live — embedded in `episode.json`, or a separate file?

## Decision

**A Cut is stored in its own file, `story/cuts/ep_NNN.cut.json`, sibling to
`workflow/` and `runs/`** — not embedded in `episode.json`.

```typescript
interface EpisodeCut {
  schemaVersion: 1
  episodeId: string            // "ep_001"
  clips: CutClip[]
  transitions: CutTransition[]
  bgm?: CutAudioRef
  updatedAt: string            // ISO 8601 — optimistic concurrency (ADR 0005)
}

interface CutClip {
  id: string                   // stable slug, survives reorder
  sourceShotId: string         // refs EpisodeShot.id (generation layer)
  inPoint: number              // trim start within the source media, seconds
  outPoint: number             // trim end, seconds
  order: number                // 0-based position on the video track
}

interface CutTransition {
  afterClipId: string          // transition plays after this clip
  kind: string                 // e.g. 'cut' | 'dissolve' | 'fade' (set TBD)
  durationSeconds: number
}

interface CutAudioRef {
  artifactId: string           // workspace file / project file id
  gainDb?: number
  inPoint?: number
  outPoint?: number
}
```

Reads add a `StoryService` method; writes are targeted endpoints carrying
`expectedUpdatedAt` (ADR 0005), e.g. reorder/trim/split/delete clip, set transition,
set BGM. The file is created lazily on first Cut write.

### The decisive reason: independent optimistic-concurrency clocks

ADR 0005 guards every story write with the file's `updatedAt`. If Cut state lived
in `episode.json`, the generation layer (agent editing the script) and the edit
layer (user editing the timeline) would **share one `updatedAt`**: a timeline drag
would 409 against a concurrent agent script edit, and vice versa — two operations
that are conceptually independent would block and force each other to refetch.

A separate file gives each layer its own `updatedAt`, so edit-layer writes never
collide with generation-layer writes. This realises ADR 0004's original
"file-per-concern" intent for the new edit/generation boundary.

## Consequences

### Positive
- Edit-layer and generation-layer writes are physically isolated — no cross-layer 409s.
- Symmetric with existing per-episode auxiliary files (`workflow/`, `runs/`).
- Lazily created — episodes never cut carry no empty Cut state.
- Script (agent) and Cut (user) evolve independently; clean layer separation.

### Negative
- One more file to read when loading an episode's full state.
- New `StoryService` read method + a family of targeted write endpoints (accepted —
  consistent with ADR 0005's per-operation endpoint approach).

### Neutral
- A deleted/reordered Shot can leave a Clip's `sourceShotId` dangling. **Policy:** the Cut
  reader **tolerates** orphans — it never silently drops or auto-deletes them. An orphaned
  Clip renders as a "missing source" placeholder (greyed, ⚠) on the timeline so the user
  decides whether to delete it or re-point it. Deleting a Shot must not mutate `cut.json`
  (layer separation); the orphan surfaces on the next Cut open/refresh.

## Alternatives Considered

### Embed `cut` in `episode.json`
- **Rejected** — couples edit-layer and generation-layer writes onto one `updatedAt`,
  producing spurious 409s between the agent and the timeline user (see decisive reason).

### Database table for Cut state
- **Rejected** — diverges from ADR 0004 (filesystem is the source of truth; agents
  need direct file access). No benefit at current scale.

### Frontend-only / ephemeral Cut (no persistence)
- **Rejected** — the rough cut is an agent- and user-authored artifact that must
  survive refresh and be re-openable; it is project state, not view state.

## References
- `docs/adr/0004-story-state-json-schema.md` — canonical story JSON model (amended here)
- `docs/adr/0005-ui-story-writes-optimistic-concurrency.md` — optimistic-concurrency write path reused here
- `CONTEXT.md` — Cut / Clip / Track / "Generation layer vs Edit layer" terms
- `packages/web/src/components/session-workspace/StoryTimelinePanel.vue` — 时间线 panel being repurposed into the Cut editor
