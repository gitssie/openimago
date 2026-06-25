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

const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 3600
const pad2 = (n: number): string => String(n).padStart(2, '0')

/**
 * Format a millisecond timecode for the combined control bar's "current / total"
 * readout. Matches docs/images/cut_panel.png: zero-padded MM:SS (e.g. 0 → "00:00",
 * 4s → "00:04", 64s → "01:04"). Sub-second remainders floor to whole seconds (no
 * frames/ms). At/above one hour it rolls up to H:MM:SS so minutes never overflow
 * to three digits. Negative / non-finite input is treated as 0 ("00:00").
 */
export function formatTimecodeMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00'
  const totalSeconds = Math.floor(ms / MS_PER_SECOND)
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR)
  const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
  const seconds = totalSeconds % SECONDS_PER_MINUTE
  if (hours > 0) {
    return `${hours}:${pad2(minutes)}:${pad2(seconds)}`
  }
  return `${pad2(minutes)}:${pad2(seconds)}`
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
