// Fork→host edit channel (ADR 0008 #1/#1a, openimago-ssro).
//
// omniclip 1.0.7's AppCore actions are sealed at construction (see
// transitions.ts header), so we CANNOT intercept a discrete "user split/trim/
// reorder" action. Instead we SUBSCRIBE to the slate reactive state and DIFF the
// `effects` snapshot, turning each committed gesture into one semantic CutEdit
// via the pure, unit-tested classifier (src/utils/cut/cut-effect-diff).
//
// COMMIT, not per-frame (decision 3): a single trim/reorder drag mutates state
// on every pointermove → watch dispatches per frame. We coalesce those with a
// trailing debounce and diff the SETTLED snapshot against the snapshot from
// BEFORE the gesture began (the last committed baseline), so one gesture yields
// exactly one CutEdit — never a storm of atomic file writes.
//
// Transition/BGM are host-driven (decision 1b) and never flow through here.
//
// BROWSER-ONLY: reads omniclip's live effects; excluded from repo typecheck.
//
// WATCH INSTANCE (openimago-4j3h): `watch` MUST be the SAME @benev/slate
// WatchTower singleton omniclip's AppCore dispatches on. A bare `@benev/slate`
// specifier resolves to the WEB package's 0.3.10 copy, but omniclip@1.0.7 bundles
// 0.1.2 — two distinct WatchTower instances with separate listener Sets, so a
// track() on the wrong one never fires and gestures silently never persist. The
// `@omniclip-runtime/slate-state` sentinel is resolved by the omniclip subpath
// resolver in quasar.config.ts to omniclip's OWN nested nexus/state.js (the exact
// /@fs/ URL omniclip imports), guaranteeing the same instance. Do NOT change this
// back to '@benev/slate'.

// NOTE: '@omniclip-runtime/slate-state' is a build-time sentinel resolved by the
// omniclip subpath resolver in quasar.config.ts (this dir is excluded from
// vue-tsc, so the unresolved-by-tsc specifier is never type-checked).
import { watch } from '@omniclip-runtime/slate-state'
import { omnislate } from 'omniclip/x/context/context.js'
import { classifyEffectDiff, type DiffEffect } from 'src/utils/cut/cut-effect-diff'
import type { CutEdit } from 'src/utils/cut/cut-edit-dispatcher'

/** Trailing window to treat a burst of state mutations as one settled gesture. */
const COMMIT_DEBOUNCE_MS = 150

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
 * Returns an unsubscribe fn. Multiple subscribers are supported; each gets the
 * same classified edit.
 */
export function onEdit(cb: (edit: CutEdit) => void): () => void {
  // Baseline = last committed snapshot. Seed it with the current effects so the
  // first gesture diffs against the present timeline, not an empty one.
  let baseline: DiffEffect[] = snapshotVideoEffects()
  let timer: ReturnType<typeof setTimeout> | null = null

  const commit = (): void => {
    timer = null
    const next = snapshotVideoEffects()
    const edit = classifyEffectDiff(baseline, next)
    // Advance the baseline regardless of whether this produced an edit, so the
    // next gesture diffs against the settled state (a no-op gesture still moves
    // the baseline to the latest snapshot — keeps diffs single-gesture-scoped).
    baseline = next
    if (edit) cb(edit)
  }

  // watch.track fires its responder on every state change (deep-compared); we
  // debounce to the gesture's trailing edge before classifying.
  const untrack = watch.track(
    () => omnislate.context.state.effects,
    () => {
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(commit, COMMIT_DEBOUNCE_MS)
    },
  )

  return () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    untrack()
  }
}
