import { describe, it, expect } from 'vitest'
import { transitionBoundaries, resolveBgmLabel } from '../cut-controls'
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
