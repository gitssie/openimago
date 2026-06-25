// Pure timecode math for the combined Cut control bar (openimago-4qwj).
//
// These helpers back the playback transport in the omniclip fork's combined
// toolbar view (src/vendor/omniclip-fork/patches/toolbar.patch.ts). The view
// itself is browser-only lit/shadow-DOM (no reachable test seam), so the
// DECISION logic — total project length and the prev/next clip-boundary seek
// targets — lives HERE, next to the other tested pure cut logic, as the single
// source of truth. The patch imports these and stays a thin view.
//
// "Effect" is omniclip's timeline placement: `start_at_position` and `duration`
// are both in milliseconds. We type only the fields we read.

/** The timeline-placement fields these helpers depend on (omniclip effect, ms). */
export interface TimelinePlacement {
  readonly start_at_position: number
  readonly duration: number
}

/**
 * Total project length in ms = the furthest `start_at_position + duration` over
 * all effects. Empty timeline → 0. Negative/NaN-safe is the caller's concern;
 * omniclip placements are always finite non-negative.
 */
export function totalDurationMs(effects: ReadonlyArray<TimelinePlacement>): number {
  let max = 0
  for (const e of effects) {
    const end = e.start_at_position + e.duration
    if (end > max) max = end
  }
  return max
}

/**
 * The clip-boundary timecodes (ms) that are valid seek targets: the start AND end
 * of every effect, plus 0 (timeline origin), sorted ascending and de-duplicated.
 * These are the stops the prev/next transport buttons move between.
 */
export function boundaryTimecodes(effects: ReadonlyArray<TimelinePlacement>): number[] {
  const set = new Set<number>([0])
  for (const e of effects) {
    set.add(e.start_at_position)
    set.add(e.start_at_position + e.duration)
  }
  return [...set].sort((a, b) => a - b)
}

/**
 * The seek target for one press of the prev (-1) / next (1) transport button:
 * the nearest boundary strictly before / after the current timecode. A small
 * EPSILON guard keeps a click that lands *on* a boundary from getting stuck on
 * that same boundary (sub-ms float drift from the playhead). Returns `null` when
 * there is no boundary in that direction (already at the first/last stop).
 */
const SEEK_EPSILON_MS = 1

export function nextBoundaryTimecode(
  effects: ReadonlyArray<TimelinePlacement>,
  currentMs: number,
  direction: -1 | 1,
): number | null {
  const boundaries = boundaryTimecodes(effects)
  if (direction < 0) {
    for (let i = boundaries.length - 1; i >= 0; i--) {
      if (boundaries[i]! < currentMs - SEEK_EPSILON_MS) return boundaries[i]!
    }
    return null
  }
  for (const b of boundaries) {
    if (b > currentMs + SEEK_EPSILON_MS) return b
  }
  return null
}
