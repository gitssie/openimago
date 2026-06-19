# ADR 0008: Cut Writeback via Semantic Edit Events, with the Client Owning Clip-id Minting

**Status:** Accepted
**Date:** 2026-06-19
**Extends:** ADR 0007 (adopt omniclip; `cut.json` canonical, omniclip a view), ADR 0006 (EpisodeCut as a separate file, per-op write endpoints), ADR 0005 (optimistic-concurrency writes)

## Context

ADR 0007 settled the *read* direction (`cut.json` → omniclip hydration) and promised
"on edit/save: map omniclip's timeline state back into our `EpisodeCut`," but left the
*writeback* trigger undecided. At the time of this ADR the writeback is **unwired**:

- The backend per-op endpoints exist and are guarded by the cut's own `updatedAt`
  (`reorderClips` / `trimClip` / `splitClip` / `deleteClip` / `setTransition` /
  `clearTransition` / `setBgm` / `clearBgm`).
- The frontend dispatcher exists and is unit-tested (`dispatchCutEdit` → `runCutMutation`,
  the per-edit 409-refetch-retry).
- But `StoryCutPanel.persistEdit` (the bridge that would call the dispatcher) has **zero
  callers**, and the `OmniclipForkApi` contract has **no fork→host edit event**. So the
  only edits that currently reach `cut.json` are *assemble* (button) and *clip-delete*
  (context menu). Every gesture made *inside* the omniclip editor — drag-reorder, trim,
  split, set/clear transition — is lost on refresh.

`cut.json` has effectively one continuous writer (the editing user). The agent also writes
it, but only via coarse, discrete *assemble* actions — the "rare race" CONTEXT.md describes,
not a stream competing with trim-drags.

## Decision

### 1. Writeback is a semantic fork→host edit-event channel, not a whole-state diff

Extend `OmniclipForkApi` with a fork→host callback that emits each committed omniclip
gesture as a `CutEdit` in *our* domain vocabulary (`reorder` / `trim` / `split` / `delete` /
`set-transition` / `clear-transition` / `set-bgm` / `clear-bgm`). Each event feeds the
already-built `persistEdit` → `dispatchCutEdit` → **one** targeted per-op endpoint.

Rejected: serializing omniclip's whole timeline and PUTting a full-document replace. That
would require a new whole-document write endpoint that undoes ADR 0006's per-op
optimistic-concurrency design, coarsen conflict detection, and re-derive id-stability logic
the backend already owns.

#### 1a. The channel is implemented as state-subscription + diff, NOT action interception

omniclip@1.0.7's `AppCore` actions are **sealed at construction** — `context.actions`
spreads the already-actualized historical actions, so a runtime wrapper/interceptor on a
discrete action ("user split") is impossible (it throws). The fork therefore **subscribes to
`context.state` (slate reactive) and diffs the `effects` snapshot** to derive the semantic
`CutEdit`. The diff is a **pure, unit-tested classifier** `(prevEffects, nextEffects) →
CutEdit | null` with **precedence rules**, because one gesture cascades position changes
across many effects:

- an effect's `start`/`end` changed → **trim** (subsequent position shifts are consequential,
  not separate reorders);
- a new effect sharing `file_hash` with a contiguous window → **split** (adopt omniclip's
  freshly-minted effect id as the `newClipId` — legal under decision 2, the client owns ids);
- an effect removed → **delete**;
- positions reshuffled with **no** `start`/`end`/count change → **reorder** (derive
  `orderedClipIds` from effects sorted by `start_at_position`).

#### 1b. Gesture-source model: native gestures + diff for structural edits; host-driven for transition/BGM

Structural edits (**reorder / trim / split / delete**) come from omniclip's **native
gestures**, captured via 1a's diff — preserving the native editing UX that motivated adopting
omniclip (ADR 0007). **Transition and BGM are host-driven** (not omniclip-native): omniclip
1.0.7 has no transition UI, and the fork already keeps transitions in its own per-context
`WeakMap` store, so `set-transition` / `clear-transition` / `set-bgm` / `clear-bgm` edits
originate from host controls calling the fork setters + `persistEdit`, never from the diff.

Rejected: routing *all* structural edits through host controls (like transitions). That
reapproaches the ADR 0007 fallback (a hand-built Vue timeline) and forfeits the native UX
omniclip was adopted for. The risk is instead contained in the single pure diff classifier.

### 2. The client owns clip-id minting; the invariant is `omniclip effect id === CutClip.id`

The design leans on one invariant the code already assumes: an omniclip effect's id equals
its `CutClip.id` (hydration sets it; the clip-menu orphan-gating resolves `effectId` against
`cut.clips`). Server-minted ids break it on **split**: omniclip creates the new effect with
its *own* id while the backend mints `"${id}-b"`, and — because the panel deliberately does
**not** re-hydrate on `cut-changed` — the divergence persists for the whole session.

Therefore the **client is the id authority**: `splitClip` is changed to *accept* a
client-provided `newClipId` (validated unique + in-range) instead of minting one. Every clip
then carries the id its creator chose, so the invariant holds by construction. Assemble still
mints ids server-side, but hydration already pushes those into omniclip as effect ids, so the
rule is uniform: *whoever creates a clip provides its id.* The cost is that server-side
id-uniqueness validation becomes load-bearing on the split write path (incremental — it
already validates the split range).

Rejected alternatives: (A1) round-trip id adoption — fork awaits the backend's `newClipId`
then writes it back onto the effect; stalls the editor on every split. (A2) re-hydrate after
each structural edit; reintroduces the media-reimport flicker hydration was built to avoid.

### 3. Emit on gesture commit; thread `updatedAt` locally; no edit queue

- The fork emits **one** event per gesture on **commit** (pointer-up / settle), not per
  intermediate frame — otherwise a single trim-drag becomes a storm of atomic file writes.
- The panel keeps a local `lastUpdatedAt` ref, seeded from `props.cut.updatedAt` and updated
  from **each write's returned `updatedAt`**, and `await`s edits in sequence. JS's single
  thread + per-edit `await` serialises user-paced gestures without an explicit queue.
- `cut-changed` → page refetch is kept as the **cross-actor reconciliation path** for the
  rare agent *assemble* race — exactly the case `runCutMutation`'s 409-refetch-retry handles.

An earlier draft added a formal serial queue and treated concurrent writes as the common
case; rejected as over-engineering given the single continuous writer.

## Consequences

- `OmniclipForkApi` gains an edit-event channel; the vendored fork must translate omniclip's
  internal state mutations into committed `CutEdit`s — new fork surface to maintain across
  omniclip upgrades (the mapping-layer cost ADR 0007 already accepted).
- `splitClip`'s contract changes (now takes `newClipId`); callers and its tests update.
- `persistEdit` gets wired (its current zero-caller state is the bug this ADR closes).
- Structural-edit id divergence is eliminated by construction rather than patched at runtime.

## References
- `docs/adr/0007-adopt-omniclip-timeline-editor.md` — read direction + "A" ownership model
- `docs/adr/0006-episode-cut-separate-story-file.md` — per-op endpoints + separate `updatedAt`
- `packages/web/src/utils/cut/cut-edit-dispatcher.ts` — `CutEdit` + `dispatchCutEdit`
- `packages/web/src/utils/cut/cut-mutation.ts` — `runCutMutation` 409-refetch-retry
- `packages/web/src/utils/cut/fork-contract.ts` — `OmniclipForkApi` (gains the edit channel)
- `packages/web/src/components/session-workspace/StoryCutPanel.vue` — `persistEdit` (to be wired)
- `packages/openimago/src/project/story-service.ts` — `splitClip` (to take `newClipId`)
