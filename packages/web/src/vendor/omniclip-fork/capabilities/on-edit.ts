// Fork→host edit channel (ADR 0008 #1/#1a, openimago-ssro).
//
// omniclip 1.0.7's AppCore actions are sealed at construction (see
// transitions.ts header), so we CANNOT intercept a discrete "user split/trim/
// reorder" action. Instead we OBSERVE the live `effects` snapshot and DIFF it,
// turning each committed gesture into one semantic CutEdit via the pure,
// unit-tested classifier (src/utils/cut/cut-effect-diff).
//
// EDIT DETECTION = POLLING, not watch.track (openimago-rcuw). We previously
// subscribed via @benev/slate's `watch.track`, but Vite serves omniclip's
// bundled 0.1.2 `nexus/state.js` at TWO URLs — the vendor chain gets a
// fingerprinted `?v=<hash>` URL (the WatchTower AppCore dispatches on) while a
// project-source import gets the un-fingerprinted URL (a SEPARATE WatchTower) —
// so our subscriber's listener Set was never the one AppCore notified
// (`sameWatch === false`). Two rounds of Vite-resolution tricks couldn't make the
// instances match reliably. So we drop the shared-singleton dependency entirely
// and POLL `omnislate.context.state.effects` on a rAF loop — the SAME
// `omnislate.context` read transitions.ts/hydrate-from-cut.ts use, which crosses
// the optimizer boundary correctly (hydration + transitions work). This decouples
// the edit channel from Vite's dep-optimizer fingerprinting for good.
//
// COMMIT, not per-frame (decision 3): a single trim/reorder drag mutates state
// on every pointermove. We debounce to the gesture's trailing edge and diff the
// SETTLED snapshot against the snapshot from BEFORE the gesture began (the last
// committed baseline), so one gesture yields exactly one CutEdit — never a storm
// of atomic file writes.
//
// Transition/BGM are host-driven (decision 1b) and never flow through here.
//
// BROWSER-ONLY: reads omniclip's live effects via rAF; excluded from repo
// typecheck.

import { omnislate } from '../upstream/context/context'
import {
  classifyEffectDiff,
  advanceBaselineAfterSplit,
  rippleStartPositions,
  effectsSnapshotEqual,
  type DiffEffect,
} from 'src/utils/cut/cut-effect-diff'
import type { CutEdit } from 'src/utils/cut/cut-edit-dispatcher'
import { nudgeFirstFrame } from './hydrate-from-cut'

/** Trailing window to treat a burst of state mutations as one settled gesture. */
const COMMIT_DEBOUNCE_MS = 150

/** Upper bound on edits drained from one settled snapshot (openimago-vx2t) — far
 *  above any realistic number of splits a user lands inside one 150ms window; a
 *  safety stop so the drain loop can never spin. */
const MAX_DRAIN_EDITS = 32

/** Project omniclip's live effects to the minimal shape the classifier reads. */
function snapshotVideoEffects(): DiffEffect[] {
  const effects = omnislate.context.state.effects as Array<
    DiffEffect & { kind: string }
  >
  return effects
    .filter((e) => e.kind === 'video')
    .map((e) => ({
      id: e.id,
      start: e.start,
      end: e.end,
      start_at_position: e.start_at_position,
      file_hash: e.file_hash,
    }))
}

/**
 * Snap the LIVE omniclip video track to a no-gap ripple in real time
 * (openimago-1ky8). omniclip is non-rippling: shortening a clip's right edge
 * (outPoint) leaves the following clips where they were → a black gap that only
 * closed on the next hydrate/refresh. We recompute the flush positions
 * (rippleStartPositions — the same cursorMs layout hydrate uses, the same no-gap
 * invariant the canonical readback enforces, bd-4rdj) and write each changed
 * effect's `start_at_position` back through omniclip's reactive action, so the gap
 * closes immediately. Returns true if any position changed.
 *
 * This mutates ONLY on-track positions (never start/end/trim), and the positions it
 * writes are exactly what the canonical cut already derives — so a follow-up diff
 * sees no order change (orderedIds is unchanged) and never re-persists a spurious
 * reorder. The caller re-syncs its baseline to the post-ripple snapshot so the poll
 * does not treat this programmatic reposition as a new user gesture.
 */
function rippleLiveTrack(): boolean {
  const liveEffects = omnislate.context.state.effects as Array<
    DiffEffect & { kind: string }
  >
  const videos = liveEffects.filter((e) => e.kind === 'video')
  const targets = rippleStartPositions(videos)
  const byId = new Map(videos.map((e) => [e.id, e]))

  let changed = false
  for (const { id, start_at_position } of targets) {
    const effect = byId.get(id)
    if (!effect || effect.start_at_position === start_at_position) continue
    omnislate.context.actions.set_effect_start_position(effect, start_at_position)
    changed = true
  }
  return changed
}

/**
 * Subscribe to committed editor gestures and emit one CutEdit per gesture.
 * Returns an unsubscribe fn. Multiple subscribers are supported; each gets its
 * own poll loop + debounce (user-paced gestures, so the cost is trivial).
 */
export function onEdit(cb: (edit: CutEdit) => void): () => void {
  // baseline  = snapshot at the last committed gesture (what the next diff is
  //             measured against).
  // lastSeen  = snapshot at the previous poll tick (change detection only).
  let baseline: DiffEffect[] = snapshotVideoEffects()
  let lastSeen: DiffEffect[] = baseline
  let timer: ReturnType<typeof setTimeout> | null = null
  let rafId: number | null = null
  let stopped = false

  const commit = (): void => {
    timer = null
    const next = snapshotVideoEffects()

    // DRAIN multiple edits out of one settled snapshot (openimago-vx2t). Two splits
    // landing inside one COMMIT_DEBOUNCE window collapse into a single diff with two
    // added effects; classifyEffectDiff emits the FIRST split, and we fold it into a
    // working baseline (advanceBaselineAfterSplit) and re-diff to emit the rest. This
    // is the fix for the ghost-effect bug: previously we advanced the baseline
    // straight to `next` after one (or zero) edits, so a second un-persisted split
    // half was swallowed into the baseline → a clip in omniclip state that was never
    // written → later reorder sent its phantom id → server 400 → silent desync.
    // Only SPLITS chain (each adds one effect); any other edit is one-per-gesture, so
    // we stop after it. The guard bounds the loop against any unforeseen non-progress.
    let working: DiffEffect[] = baseline
    let sawSplit = false
    let sawLayoutChange = false
    for (let guard = 0; guard < MAX_DRAIN_EDITS; guard++) {
      const edit = classifyEffectDiff(working, next)
      if (!edit) break
      cb(edit)
      if (edit.kind === 'split') {
        sawSplit = true
        working = advanceBaselineAfterSplit(working, next, edit)
        continue
      }
      // trim / reorder / delete all leave a non-rippling omniclip with a gap (or a
      // stale position order) → they need a live no-gap ripple (openimago-uvm4).
      // A SPLIT does not: its two halves already abut by construction.
      if (edit.kind === 'trim' || edit.kind === 'reorder' || edit.kind === 'delete') {
        sawLayoutChange = true
      }
      break
    }

    // Advance the baseline to the settled snapshot for the NEXT gesture. After a
    // full split-drain `working` already equals `next`; for any other (or no) edit
    // the un-emitted remainder is intentionally absorbed here — the baseline is
    // always the last committed state, keeping each future diff single-gesture-scoped.
    baseline = next

    // After a TRIM / REORDER / DELETE, snap the live track to a no-gap ripple in
    // real time (openimago-1ky8, extended openimago-uvm4). omniclip is non-rippling,
    // so trimming a clip's right edge, moving a clip, or deleting one left the
    // following clips in place → a black gap that only closed on the next hydrate.
    // rippleLiveTrack rewrites the changed positions through omniclip's reactive
    // action (set_effect_start_position) so the gap closes immediately. We then
    // re-sync baseline + lastSeen to the post-ripple snapshot so this programmatic
    // reposition is NOT picked up by the poll as a new gesture (it would otherwise
    // re-arm a commit; the positions are exactly the canonical no-gap layout the
    // server already derives, so a re-diff is a no-op — re-syncing avoids the wasted
    // tick and any spurious reorder mis-fire). The edit itself is already persisted
    // via cb above; the ripple is LOCAL-ONLY (no extra write).
    if (sawLayoutChange) {
      const changed = rippleLiveTrack()
      if (changed) {
        const settled = snapshotVideoEffects()
        baseline = settled
        lastSeen = settled
      }
    }

    // After a SPLIT, repaint the preview's first frame for the freshly-created clip
    // (openimago-6imt). omniclip's split builds the new effect's <video> via
    // recreate/add_video_effect but the media-player only re-composes on
    // playhead/playing changes — so the new segment's first frame stayed BLACK until
    // play/seek. nudgeFirstFrame force-composes the visible clip AND arms media-ready
    // listeners that survive a slow decode, so the split half paints whenever its
    // <video> becomes drawable. Deferred two rAFs so the new element exists first
    // (recreate is async), mirroring composePlacedClips' deferral.
    if (sawSplit) {
      requestAnimationFrame(() => requestAnimationFrame(() => nudgeFirstFrame()))
    }
  }

  // Poll the live effects each animation frame. A frame that differs from the
  // previous one (re)arms the commit debounce; the gesture's trailing edge fires
  // commit() once. rAF pauses while the tab is hidden (no editing then anyway)
  // and is far cheaper than a tight interval.
  const tick = (): void => {
    if (stopped) return
    const current = snapshotVideoEffects()
    if (!effectsSnapshotEqual(lastSeen, current)) {
      lastSeen = current
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(commit, COMMIT_DEBOUNCE_MS)
    }
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)

  return () => {
    stopped = true
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }
}
