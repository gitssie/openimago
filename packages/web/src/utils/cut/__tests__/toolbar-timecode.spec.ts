import { describe, it, expect } from 'vitest'
import {
  totalDurationMs,
  boundaryTimecodes,
  nextBoundaryTimecode,
  type TimelinePlacement,
} from '../toolbar-timecode'

/** Build an effect placement (ms). */
function fx(start_at_position: number, duration: number): TimelinePlacement {
  return { start_at_position, duration }
}

describe('totalDurationMs', () => {
  it('is 0 for an empty timeline', () => {
    expect(totalDurationMs([])).toBe(0)
  })

  it('is start+duration for a single clip', () => {
    expect(totalDurationMs([fx(0, 5000)])).toBe(5000)
    expect(totalDurationMs([fx(2000, 3000)])).toBe(5000)
  })

  it('is the furthest clip end across many clips (not the last in array)', () => {
    // The longest-reaching clip is in the MIDDLE of the array.
    const effects = [fx(0, 1000), fx(1000, 9000), fx(10_000, 500)]
    expect(totalDurationMs(effects)).toBe(10_500)
    const outOfOrder = [fx(20_000, 1000), fx(0, 1000), fx(1000, 500)]
    expect(totalDurationMs(outOfOrder)).toBe(21_000)
  })

  it('handles overlapping clips by taking the max end, not the sum', () => {
    const overlapping = [fx(0, 6000), fx(1000, 2000)]
    expect(totalDurationMs(overlapping)).toBe(6000)
  })
})

describe('boundaryTimecodes', () => {
  it('is just [0] for an empty timeline', () => {
    expect(boundaryTimecodes([])).toEqual([0])
  })

  it('includes 0, the start and the end of a single clip, sorted', () => {
    expect(boundaryTimecodes([fx(2000, 3000)])).toEqual([0, 2000, 5000])
  })

  it('de-duplicates shared boundaries between adjacent clips', () => {
    // clip A ends at 5000 where clip B starts → 5000 appears once.
    const effects = [fx(0, 5000), fx(5000, 5000)]
    expect(boundaryTimecodes(effects)).toEqual([0, 5000, 10_000])
  })

  it('sorts boundaries ascending regardless of clip array order', () => {
    const effects = [fx(8000, 2000), fx(0, 3000), fx(3000, 1000)]
    expect(boundaryTimecodes(effects)).toEqual([0, 3000, 4000, 8000, 10_000])
  })
})

describe('nextBoundaryTimecode', () => {
  const effects = [fx(0, 3000), fx(3000, 2000)] // boundaries: 0, 3000, 5000

  it('returns null when there is no clip in either direction (empty timeline)', () => {
    // empty → only boundary is 0; nothing strictly before/after 0.
    expect(nextBoundaryTimecode([], 0, 1)).toBeNull()
    expect(nextBoundaryTimecode([], 0, -1)).toBeNull()
  })

  it('seeks forward to the next boundary after the current time', () => {
    expect(nextBoundaryTimecode(effects, 0, 1)).toBe(3000)
    expect(nextBoundaryTimecode(effects, 3000, 1)).toBe(5000)
  })

  it('seeks backward to the previous boundary before the current time', () => {
    expect(nextBoundaryTimecode(effects, 5000, -1)).toBe(3000)
    expect(nextBoundaryTimecode(effects, 3000, -1)).toBe(0)
  })

  it('returns null at the last boundary going forward', () => {
    expect(nextBoundaryTimecode(effects, 5000, 1)).toBeNull()
  })

  it('returns null at the first boundary going backward', () => {
    expect(nextBoundaryTimecode(effects, 0, -1)).toBeNull()
  })

  it('does NOT get stuck when the click lands exactly on a boundary', () => {
    // Sitting on 3000: next must advance to 5000, prev must retreat to 0 —
    // never re-select 3000 itself.
    expect(nextBoundaryTimecode(effects, 3000, 1)).toBe(5000)
    expect(nextBoundaryTimecode(effects, 3000, -1)).toBe(0)
  })

  it('tolerates sub-ms float drift around a boundary (EPSILON guard)', () => {
    // Playhead a hair past 3000 should still move forward to 5000, not snap
    // back onto 3000; a hair before should move back to 0.
    expect(nextBoundaryTimecode(effects, 3000.4, 1)).toBe(5000)
    expect(nextBoundaryTimecode(effects, 2999.6, -1)).toBe(0)
  })

  it('seeks from a time in the middle of a clip to its bounding boundaries', () => {
    expect(nextBoundaryTimecode(effects, 1500, 1)).toBe(3000)
    expect(nextBoundaryTimecode(effects, 1500, -1)).toBe(0)
  })
})
