import { describe, it, expect } from 'vitest'
import { transitionBoundaries, resolveBgmLabel, zoomSteps } from '../cut-controls'
import type { CutClip, CutTransition, CutAudioRef } from '../cut-types'

function clip(id: string, order: number): CutClip {
  return { id, sourceShotId: `shot_${id}`, inPoint: 0, outPoint: 1, order }
}

describe('transitionBoundaries', () => {
  it('derives N-1 boundaries from N ordered clips, keyed by the preceding clip', () => {
    const clips = [clip('a', 0), clip('b', 1), clip('c', 2)]
    const boundaries = transitionBoundaries(clips, [])
    expect(boundaries.map((b) => b.afterClipId)).toEqual(['a', 'b'])
  })

  it('returns no boundaries for a single clip', () => {
    expect(transitionBoundaries([clip('a', 0)], [])).toEqual([])
  })

  it('returns no boundaries for an empty cut', () => {
    expect(transitionBoundaries([], [])).toEqual([])
  })

  it('orders by clip.order, not array order', () => {
    const clips = [clip('c', 2), clip('a', 0), clip('b', 1)]
    const boundaries = transitionBoundaries(clips, [])
    expect(boundaries.map((b) => [b.afterClipId, b.beforeClipId])).toEqual([
      ['a', 'b'],
      ['b', 'c'],
    ])
    expect(boundaries.map((b) => b.position)).toEqual([1, 2])
  })

  it('annotates a boundary with its existing transition (keyed by afterClipId)', () => {
    const clips = [clip('a', 0), clip('b', 1), clip('c', 2)]
    const transitions: CutTransition[] = [
      { afterClipId: 'b', kind: 'dissolve', durationSeconds: 0.5 },
    ]
    const boundaries = transitionBoundaries(clips, transitions)
    expect(boundaries[0]!.transition).toBeNull() // a→b has none
    expect(boundaries[1]!.transition).toEqual({
      afterClipId: 'b',
      kind: 'dissolve',
      durationSeconds: 0.5,
    })
  })
})

describe('resolveBgmLabel', () => {
  it('returns null when no BGM is set', () => {
    expect(resolveBgmLabel(undefined, [])).toBeNull()
  })

  it('resolves the asset name when the artifact is found', () => {
    const bgm: CutAudioRef = { artifactId: 'art_1' }
    expect(resolveBgmLabel(bgm, [{ id: 'art_1', name: 'Sunrise Theme' }])).toBe('Sunrise Theme')
  })

  it('falls back to filename then to the bare artifactId', () => {
    const bgm: CutAudioRef = { artifactId: 'art_2' }
    expect(resolveBgmLabel(bgm, [{ id: 'art_2', filename: 'bed.mp3' }])).toBe('bed.mp3')
    expect(resolveBgmLabel(bgm, [])).toBe('art_2')
  })
})

describe('zoomSteps', () => {
  it('steps OUT (negative) when the target is below the current zoom', () => {
    // current -3, target -3.5, step 0.1 → 5 zoom_out calls
    expect(zoomSteps(-3, -3.5, 0.1)).toEqual({ direction: 'out', count: 5 })
  })

  it('steps IN (positive) when the target is above the current zoom', () => {
    // current -3, target -2.7, step 0.1 → 3 zoom_in calls
    expect(zoomSteps(-3, -2.7, 0.1)).toEqual({ direction: 'in', count: 3 })
  })

  it('returns no steps when target equals current', () => {
    expect(zoomSteps(-3, -3, 0.1)).toEqual({ direction: 'none', count: 0 })
  })

  it('rounds to the nearest whole step (no fractional action calls)', () => {
    // a 0.04 delta is below half a step → snaps to 0 steps
    expect(zoomSteps(-3, -2.96, 0.1)).toEqual({ direction: 'none', count: 0 })
    // a 0.06 delta rounds up to 1 step
    expect(zoomSteps(-3, -2.94, 0.1)).toEqual({ direction: 'in', count: 1 })
  })

  it('is robust to float drift in the current zoom (e.g. -2.9999999)', () => {
    // accumulated +0.1 drift should still read as "at -3", 5 steps to -3.5
    expect(zoomSteps(-2.9999999, -3.5, 0.1)).toEqual({ direction: 'out', count: 5 })
  })

  it('spans the full slider range in whole steps', () => {
    // -13 → 2 over step 0.1 is 150 steps in
    expect(zoomSteps(-13, 2, 0.1)).toEqual({ direction: 'in', count: 150 })
  })
})
