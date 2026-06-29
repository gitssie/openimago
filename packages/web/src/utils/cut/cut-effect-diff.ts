// Pure omniclip-effect → CutEdit classifier (ADR 0008 #1a).
//
// omniclip's AppCore actions are sealed at construction, so the fork cannot
// intercept a discrete "user split/trim/reorder" action. Instead it subscribes
// to context.state and diffs the `effects` snapshot before/after a committed
// gesture; THIS function turns that (prevEffects, nextEffects) pair into ONE
// semantic CutEdit in our domain vocabulary, or null when nothing meaningful
// changed.
//
// PURE: no Vue/DOM/omniclip imports — unit-tested in isolation. The fork feeds
// it live effect snapshots (already filtered to video effects); it reads only
// id / start / end / start_at_position / file_hash.
//
// PRECEDENCE (one gesture cascades position shifts across many effects, so the
// order matters — a content change always beats the consequential reorder):
//   1. split  — a new effect appeared, sharing file_hash with a sibling that now
//               abuts it (count +1). Adopts omniclip's freshly-minted effect id
//               AS newClipId (legal under ADR 0008 #2 — the client owns ids).
//   2. delete — an effect disappeared (count -1).
//   3. trim   — same id set, one effect's start/end changed (its neighbours'
//               position shifts are consequential, ignored).
//   4. reorder— same id set, no start/end change, but the start_at_position
//               ordering differs.
// Anything else → null.

import type { OmniVideoEffect } from './omniclip-state.types'
import type { CutEdit } from './cut-edit-dispatcher'

/** Effects this classifier reads — the video-effect subset of omniclip state. */
export type DiffEffect = Pick<
  OmniVideoEffect,
  'id' | 'start' | 'end' | 'start_at_position' | 'file_hash'
>

// omniclip effect fields are integer ms; CutEdit trim/split are integer ms too
// (cut schema v2, openimago-23cr), so the classifier reads start/end straight
// through with no ×1000/÷1000.
/**
 * The structural-gesture subset of CutEdit a diff can produce — derived DIRECTLY
 * from the authoritative CutEdit union (cut-edit-dispatcher) so the two can never
 * drift (openimago-ii7p). A committed omniclip gesture maps to exactly one of
 * reorder / trim / split / delete; the host-driven edits (set/clear transition,
 * set/clear bgm) never arrive through the effects diff. `import type` keeps this a
 * compile-time-only dependency, so cut-effect-diff stays pure (no runtime import).
 */
export type DiffCutEdit = Extract<CutEdit, { kind: 'reorder' | 'trim' | 'split' | 'delete' }>

/**
 * Shallow positional equality of two video-effect snapshots (openimago-rcuw).
 *
 * The poll-based edit channel (on-edit.ts) reads `context.state.effects` on a
 * loop and uses this to decide whether anything changed since the last tick
 * before paying for the full classifier + debounce. Positional compare is
 * sufficient and cheap: the poll always reads the engine's live array, so a
 * gesture that reorders, trims, adds, or removes an effect changes the array
 * positionally (a pure id reshuffle still differs at some index). Equal here =>
 * no actionable change this tick.
 */
export function effectsSnapshotEqual(
  prev: readonly DiffEffect[],
  next: readonly DiffEffect[],
): boolean {
  if (prev.length !== next.length) return false
  for (let i = 0; i < prev.length; i++) {
    const a = prev[i]!
    const b = next[i]!
    if (
      a.id !== b.id ||
      a.start !== b.start ||
      a.end !== b.end ||
      a.start_at_position !== b.start_at_position ||
      a.file_hash !== b.file_hash
    ) {
      return false
    }
  }
  return true
}

function byId(effects: readonly DiffEffect[]): Map<string, DiffEffect> {
  const map = new Map<string, DiffEffect>()
  for (const e of effects) map.set(e.id, e)
  return map
}

function orderedIds(effects: readonly DiffEffect[]): string[] {
  return [...effects]
    .sort((a, b) => a.start_at_position - b.start_at_position)
    .map((e) => e.id)
}

/**
 * Classify the structural change between two effect snapshots into one CutEdit,
 * or null when nothing actionable changed. See file header for precedence.
 */
export function classifyEffectDiff(
  prevEffects: readonly DiffEffect[],
  nextEffects: readonly DiffEffect[],
): DiffCutEdit | null {
  const prev = byId(prevEffects)
  const next = byId(nextEffects)

  const added = [...next.values()].filter((e) => !prev.has(e.id))
  const removed = [...prev.values()].filter((e) => !next.has(e.id))

  // 1. split — one OR MORE new effects, none removed, where EVERY added effect is
  //    a clean split-half: it shares a file_hash with a sibling that now ends
  //    exactly where it starts (the first half kept its id; the added effect is the
  //    freshly-minted second half). The common case is a single split (added.length
  //    === 1). Two splits committed inside one debounce window collapse into ONE
  //    diff with TWO added effects (openimago-vx2t) — both still clean split-halves
  //    — so we emit the EARLIEST-on-track split here and let on-edit drain the rest
  //    by re-diffing against the post-split baseline. The "every added is a clean
  //    split-half" guard preserves the 3xbg safety: a burst that ALSO contains a
  //    non-abutting late import is NOT a pure multi-split → falls through to null.
  if (added.length >= 1 && removed.length === 0 && nextEffects.length === prevEffects.length + added.length) {
    /** The sibling whose end abuts this added effect's start (its first half). */
    const firstHalfOf = (newEffect: DiffEffect): DiffEffect | undefined =>
      [...next.values()].find(
        (e) =>
          e.id !== newEffect.id &&
          e.file_hash === newEffect.file_hash &&
          e.end === newEffect.start,
      )

    const splitPairs = added
      .map((newEffect) => ({ newEffect, firstHalf: firstHalfOf(newEffect) }))
      .filter((p): p is { newEffect: DiffEffect; firstHalf: DiffEffect } => p.firstHalf !== undefined)

    // Emit a split ONLY when every added effect is a clean split-half (pure
    // multi-split). Pick the earliest by on-track position so sequential splits
    // are persisted in timeline order.
    if (splitPairs.length === added.length) {
      const earliest = splitPairs.reduce((a, b) =>
        a.newEffect.start_at_position <= b.newEffect.start_at_position ? a : b,
      )
      return {
        kind: 'split',
        clipId: earliest.firstHalf.id,
        atMs: earliest.newEffect.start,
        newClipId: earliest.newEffect.id,
      }
    }
  }

  // 2. delete — at least one effect gone, none added.
  if (removed.length >= 1 && added.length === 0) {
    return { kind: 'delete', clipId: removed[0]!.id }
  }

  // Same id set from here on (no adds, no removes).
  if (added.length > 0 || removed.length > 0) return null

  // 3. trim — one effect's start/end changed (beats the consequential reorder).
  for (const cur of next.values()) {
    const before = prev.get(cur.id)!
    if (before.start !== cur.start || before.end !== cur.end) {
      return {
        kind: 'trim',
        clipId: cur.id,
        inPointMs: cur.start,
        outPointMs: cur.end,
      }
    }
  }

  // 4. reorder — no content change, but the order-by-position differs.
  const prevOrder = orderedIds(prevEffects)
  const nextOrder = orderedIds(nextEffects)
  if (prevOrder.join('\n') !== nextOrder.join('\n')) {
    return { kind: 'reorder', orderedClipIds: nextOrder }
  }

  return null
}

/**
 * Advance a diff baseline by ONE already-emitted split, so the next diff sees the
 * remaining change (openimago-vx2t). When two splits collapse into one debounce
 * window, classifyEffectDiff emits the first; on-edit calls this to fold that split
 * into its working baseline, then re-diffs against the same `next` snapshot to emit
 * the second — never advancing the baseline straight to `next` (which would swallow
 * the un-persisted second-half effect into a ghost id).
 *
 * The folded baseline = `baseline` with the split's first half trimmed to end at
 * `atMs`, plus the freshly-minted second-half effect (read verbatim from `next`,
 * which already holds its real start/end/position). Both are taken from `next` so
 * the working baseline converges to `next` once every split is drained. If the new
 * effect isn't in `next` (shouldn't happen), the baseline is returned unchanged so
 * the loop terminates safely.
 */
export function advanceBaselineAfterSplit(
  baseline: readonly DiffEffect[],
  next: readonly DiffEffect[],
  split: { clipId: string; newClipId: string },
): DiffEffect[] {
  const newEffect = next.find((e) => e.id === split.newClipId)
  if (!newEffect) return [...baseline]
  const trimmedFirstHalf = next.find((e) => e.id === split.clipId)

  const folded: DiffEffect[] = baseline.map((e) =>
    e.id === split.clipId && trimmedFirstHalf ? { ...trimmedFirstHalf } : e,
  )
  // Insert the new second half if the working baseline doesn't have it yet.
  if (!folded.some((e) => e.id === newEffect.id)) folded.push({ ...newEffect })
  return folded
}

/** An effect id paired with its target on-track position (ms). */
export interface RippledPosition {
  id: string
  start_at_position: number
}

/**
 * Compute the NO-GAP ripple layout for a set of video effects (openimago-1ky8):
 * each effect's `start_at_position` becomes the running sum of the spans
 * (`end - start`) of the effects before it, in current on-track order. This is the
 * same flush placement hydrate uses (cursorMs) and the same no-gap invariant the
 * canonical readback enforces (bd-4rdj: positions are DERIVED from order + spans,
 * never persisted) — so applying it to the LIVE omniclip state after a right-edge
 * trim snaps the following clips flush in real time, instead of leaving a black gap
 * until the next hydrate.
 *
 * Pure: order is taken from the input effects' current `start_at_position` (ties
 * keep input order via a stable sort); the result is returned in that track order,
 * so the caller can set each effect's position and the relative ordering is
 * preserved. Trim/placement of the SOURCE range (start/end) is untouched.
 */
export function rippleStartPositions(effects: readonly DiffEffect[]): RippledPosition[] {
  const ordered = [...effects].sort((a, b) => a.start_at_position - b.start_at_position)
  let cursorMs = 0
  const out: RippledPosition[] = []
  for (const e of ordered) {
    out.push({ id: e.id, start_at_position: cursorMs })
    cursorMs += e.end - e.start
  }
  return out
}
