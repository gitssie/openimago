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

import { omnislate } from 'omniclip/x/context/context.js'
import {
  classifyEffectDiff,
  advanceBaselineAfterSplit,
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
    for (let guard = 0; guard < MAX_DRAIN_EDITS; guard++) {
      const edit = classifyEffectDiff(working, next)
      if (!edit) break
      cb(edit)
      if (edit.kind === 'split') {
        sawSplit = true
        working = advanceBaselineAfterSplit(working, next, edit)
        continue
      }
      break
    }

    // Advance the baseline to the settled snapshot for the NEXT gesture. After a
    // full split-drain `working` already equals `next`; for any other (or no) edit
    // the un-emitted remainder is intentionally absorbed here — the baseline is
    // always the last committed state, keeping each future diff single-gesture-scoped.
    baseline = next

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
