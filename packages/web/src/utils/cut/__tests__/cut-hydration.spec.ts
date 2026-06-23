import { describe, it, expect } from 'vitest'
import { buildHydrationPayload } from '../cut-hydration'
import type { EpisodeCut } from '../cut-types'
import type { ShotMediaSource } from '../shot-media-resolver'

function source(shotId: string): ShotMediaSource {
  return {
    sourceShotId: shotId,
    url: `https://cdn/${shotId}.mp4`,
    thumbnailUrl: `${shotId}.png`,
    filmstripUrl: `${shotId}.filmstrip.webp`,
    filmstripFrameCount: 24,
    filmstripFrameW: 28,
    filmstripFrameH: 50,
    name: `${shotId}.mp4`,
  }
}

const cut: EpisodeCut = {
  schemaVersion: 1,
  episodeId: 'ep_001',
  clips: [
    { id: 'c-b', sourceShotId: 'shot_2', inPoint: 1, outPoint: 4, order: 1 },
    { id: 'c-a', sourceShotId: 'shot_1', inPoint: 0, outPoint: 2.5, order: 0 },
  ],
  transitions: [
    { afterClipId: 'c-a', kind: 'dissolve', durationSeconds: 0.5 },
    { afterClipId: 'c-gone', kind: 'fade', durationSeconds: 1 },
  ],
  updatedAt: '2026-06-18T00:00:00Z',
}

describe('buildHydrationPayload', () => {
  it('maps clips in order with seconds preserved + resolver urls', () => {
    const { clips, orphans } = buildHydrationPayload(cut, (id) => source(id))
    expect(orphans).toEqual([])
    expect(clips).toEqual([
      { id: 'c-a', url: 'https://cdn/shot_1.mp4', name: 'shot_1.mp4', inPointSeconds: 0, outPointSeconds: 2.5, filmstripUrl: 'shot_1.filmstrip.webp', filmstripFrameCount: 24, filmstripFrameW: 28, filmstripFrameH: 50 },
      { id: 'c-b', url: 'https://cdn/shot_2.mp4', name: 'shot_2.mp4', inPointSeconds: 1, outPointSeconds: 4, filmstripUrl: 'shot_2.filmstrip.webp', filmstripFrameCount: 24, filmstripFrameW: 28, filmstripFrameH: 50 },
    ])
  })

  it('converts transitions to omniclip ms keyed by clip id, only for live clips', () => {
    const { transitions } = buildHydrationPayload(cut, (id) => source(id))
    // c-a transition kept; c-gone transition dropped (no such clip)
    expect(transitions).toEqual([{ afterEffectId: 'c-a', kind: 'dissolve', durationMs: 500 }])
  })

  it('splits out orphan clips (no media) and drops their transitions', () => {
    const { clips, orphans, transitions } = buildHydrationPayload(cut, (id) =>
      id === 'shot_1' ? source(id) : null,
    )
    expect(clips.map((c) => c.id)).toEqual(['c-a']) // shot_2 orphaned
    expect(orphans.map((c) => c.id)).toEqual(['c-b'])
    // c-a still live so its transition survives
    expect(transitions).toEqual([{ afterEffectId: 'c-a', kind: 'dissolve', durationMs: 500 }])
  })
})
