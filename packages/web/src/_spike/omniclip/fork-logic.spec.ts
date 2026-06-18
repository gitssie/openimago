import { describe, it, expect } from 'vitest'
import {
  fileNameFromUrl,
  omniMediaKindFromType,
  isCutTransitionKind,
  clampTransitionDurationMs,
  upsertTransition,
  removeTransition,
  type ForkTransition,
} from './fork-logic'

describe('fileNameFromUrl', () => {
  it('uses the URL basename', () => {
    expect(fileNameFromUrl('https://cdn.example/runs/abc/shot_3.mp4')).toBe('shot_3.mp4')
  })
  it('honours an explicit override', () => {
    expect(fileNameFromUrl('https://cdn/x.mp4', 'pretty.mp4')).toBe('pretty.mp4')
  })
  it('decodes percent-encoding', () => {
    expect(fileNameFromUrl('https://cdn/a%20b.mp4')).toBe('a b.mp4')
  })
  it('falls back to "clip" when no basename', () => {
    expect(fileNameFromUrl('https://cdn/')).toBe('clip')
    expect(fileNameFromUrl('not a url')).toBe('not a url'.trim() === '' ? 'clip' : 'not a url')
  })
})

describe('omniMediaKindFromType', () => {
  it('prefers content-type', () => {
    expect(omniMediaKindFromType('video/mp4', 'x.bin')).toBe('video')
    expect(omniMediaKindFromType('image/png', 'x')).toBe('image')
    expect(omniMediaKindFromType('audio/mpeg', 'x')).toBe('audio')
  })
  it('falls back to extension when content-type is generic/missing', () => {
    expect(omniMediaKindFromType('application/octet-stream', 'clip.mp4')).toBe('video')
    expect(omniMediaKindFromType(null, 'thumb.webp')).toBe('image')
    expect(omniMediaKindFromType(undefined, 'bed.mp3')).toBe('audio')
  })
  it('returns null when nothing usable', () => {
    expect(omniMediaKindFromType(null, 'mystery')).toBeNull()
  })
})

describe('isCutTransitionKind', () => {
  it('accepts the shipped kinds only', () => {
    expect(isCutTransitionKind('dissolve')).toBe(true)
    expect(isCutTransitionKind('fade')).toBe(true)
    expect(isCutTransitionKind('cut')).toBe(true)
    expect(isCutTransitionKind('wipe')).toBe(false)
  })
})

describe('clampTransitionDurationMs', () => {
  it('cut is always instantaneous (0)', () => {
    expect(clampTransitionDurationMs('cut', 999, 5000, 5000)).toBe(0)
  })
  it('clamps to the shorter neighbouring clip', () => {
    expect(clampTransitionDurationMs('dissolve', 4000, 5000, 2000)).toBe(2000)
    expect(clampTransitionDurationMs('fade', 1000, 5000, 2000)).toBe(1000)
  })
  it('treats non-positive / non-finite requests as 0', () => {
    expect(clampTransitionDurationMs('dissolve', -5, 5000, 5000)).toBe(0)
    expect(clampTransitionDurationMs('dissolve', NaN, 5000, 5000)).toBe(0)
  })
  it('never returns a negative even with zero-length neighbour', () => {
    expect(clampTransitionDurationMs('dissolve', 500, 0, 5000)).toBe(0)
  })
})

describe('transition state reducers', () => {
  const t = (afterEffectId: string, kind: ForkTransition['kind'] = 'dissolve'): ForkTransition => ({
    afterEffectId,
    kind,
    durationMs: 500,
  })

  it('upsert adds a new transition', () => {
    expect(upsertTransition([], t('c1')).map((x) => x.afterEffectId)).toEqual(['c1'])
  })
  it('upsert replaces the existing transition on the same boundary', () => {
    const next = upsertTransition([t('c1', 'dissolve')], t('c1', 'fade'))
    expect(next).toHaveLength(1)
    expect(next[0]!.kind).toBe('fade')
  })
  it('upsert keeps transitions on other boundaries', () => {
    const next = upsertTransition([t('c1'), t('c2')], t('c1', 'fade'))
    expect(next.map((x) => x.afterEffectId).sort()).toEqual(['c1', 'c2'])
  })
  it('remove drops only the matching boundary', () => {
    expect(removeTransition([t('c1'), t('c2')], 'c1').map((x) => x.afterEffectId)).toEqual(['c2'])
  })
  it('remove is a no-op when absent', () => {
    expect(removeTransition([t('c1')], 'cX')).toHaveLength(1)
  })
})
