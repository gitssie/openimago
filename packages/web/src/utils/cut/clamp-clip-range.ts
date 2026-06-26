// Range invariant for a CutClip's trim points (openimago-lknv).
//
// Forces [inPointMs, outPointMs] ⊆ [0, sourceDurationMs] with inPointMs <
// outPointMs, SILENTLY correcting any violation (the user chose Clamp: never
// block an edit or refuse to load a cut — repair and carry on). Pure: it returns
// the corrected integer-ms range plus a `clamped` flag; the CALLER logs a warning
// when `clamped` is true (so the function stays side-effect-free and unit-testable,
// and each side uses its own logger). Both the write path (trim/split) and the
// hydrate read path run every clip through this so legacy/corrupt data still loads.
//
// sourceDurationMs is the persisted snapshot of the source media's real length
// (cut schema v2, openimago-lknv). It may be MISSING on legacy v1 data migrated
// without a snapshot (null/undefined) or otherwise unusable (non-finite, <= 0) —
// in that case the UPPER bound is simply not enforced (we cannot know it), while
// the lower bound (>= 0) and in < out invariant are always enforced.

export interface ClampedClipRange {
  inPointMs: number
  outPointMs: number
  /** true when any correction was applied (out-of-range, NaN, or out <= in). */
  clamped: boolean
}

/** Smallest legal clip span — a clip must cover at least 1ms of source. */
const MIN_SPAN_MS = 1

/**
 * Clamp a clip's [inMs, outMs] into [0, sourceDurationMs] with in < out.
 * NaN/non-finite inputs are treated as their nearest sane bound (in→0,
 * out→sourceDurationMs when known). Fractional inputs are rounded to whole ms.
 */
export function clampClipRange(
  inMs: number,
  outMs: number,
  sourceDurationMs: number | null | undefined,
): ClampedClipRange {
  const hasUpperBound =
    typeof sourceDurationMs === 'number' && Number.isFinite(sourceDurationMs) && sourceDurationMs > 0
  const upper = hasUpperBound ? Math.round(sourceDurationMs) : Number.POSITIVE_INFINITY

  // Normalise the in point: NaN/non-finite → 0; otherwise round to whole ms.
  let inPointMs = Number.isFinite(inMs) ? Math.round(inMs) : 0
  // Normalise the out point: NaN/non-finite → the upper bound (full source when
  // known, else leave it to the in<out repair below by seeding it at in).
  let outPointMs = Number.isFinite(outMs)
    ? Math.round(outMs)
    : hasUpperBound
      ? upper
      : Math.round(Number.isFinite(inMs) ? inMs : 0)

  // Lower bound: in >= 0; upper bound: both ends <= sourceDurationMs (when known).
  if (inPointMs < 0) inPointMs = 0
  if (inPointMs > upper) inPointMs = upper
  if (outPointMs > upper) outPointMs = upper

  // in < out invariant (minimal MIN_SPAN_MS span). Prefer pushing `out` up; if
  // that would breach the upper bound (in is at the ceiling), pull `in` down.
  if (outPointMs <= inPointMs) {
    if (inPointMs + MIN_SPAN_MS <= upper) {
      outPointMs = inPointMs + MIN_SPAN_MS
    } else {
      inPointMs = outPointMs - MIN_SPAN_MS
    }
  }

  // `clamped` reflects any departure from the RAW inputs — out-of-range repair,
  // NaN coercion, OR rounding a fractional input — so the caller logs whenever the
  // stored range is not exactly what was requested.
  const clamped = inPointMs !== inMs || outPointMs !== outMs
  return { inPointMs, outPointMs, clamped }
}
