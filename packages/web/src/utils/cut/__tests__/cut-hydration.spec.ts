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
    sourceDurationSeconds: 30,
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
      { id: 'c-a', url: 'https://cdn/shot_1.mp4', name: 'shot_1.mp4', inPointSeconds: 0, outPointSeconds: 2.5, filmstripUrl: 'shot_1.filmstrip.webp', filmstripFrameCount: 24, filmstripFrameW: 28, filmstripFrameH: 50, filmstripSourceDurationSeconds: 30 },
      { id: 'c-b', url: 'https://cdn/shot_2.mp4', name: 'shot_2.mp4', inPointSeconds: 1, outPointSeconds: 4, filmstripUrl: 'shot_2.filmstrip.webp', filmstripFrameCount: 24, filmstripFrameW: 28, filmstripFrameH: 50, filmstripSourceDurationSeconds: 30 },
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

  it('omits bgm when the cut has none', () => {
    const { bgm } = buildHydrationPayload(cut, (id) => source(id))
    expect(bgm).toBeUndefined()
  })

  it('resolves cut.bgm into a HydrateBgm via the bgm resolver', () => {
    const withBgm: EpisodeCut = {
      ...cut,
      bgm: { artifactId: 'ast_bed', gainDb: -6 },
    }
    const { bgm } = buildHydrationPayload(
      withBgm,
      (id) => source(id),
      (artifactId) =>
        artifactId === 'ast_bed'
          ? { url: 'https://cdn/bed.mp3', name: 'bed.mp3' }
          : null,
    )
    expect(bgm).toEqual({ id: 'ast_bed', url: 'https://cdn/bed.mp3', name: 'bed.mp3' })
  })

  it('omits bgm when the resolver cannot resolve the artifact', () => {
    const withBgm: EpisodeCut = { ...cut, bgm: { artifactId: 'ast_gone' } }
    const { bgm } = buildHydrationPayload(withBgm, (id) => source(id), () => null)
    expect(bgm).toBeUndefined()
  })

  it('omits bgm when set but no resolver is supplied', () => {
    const withBgm: EpisodeCut = { ...cut, bgm: { artifactId: 'ast_bed' } }
    const { bgm } = buildHydrationPayload(withBgm, (id) => source(id))
    expect(bgm).toBeUndefined()
  })

  it('threads the BGM auth headers through to the HydrateBgm (openimago-tc8t)', () => {
    const withBgm: EpisodeCut = { ...cut, bgm: { artifactId: 'ast_bed' } }
    const { bgm } = buildHydrationPayload(
      withBgm,
      (id) => source(id),
      () => ({
        url: '/api/platform/assets/ast_bed/download',
        name: 'bed.mp3',
        headers: { Authorization: 'Bearer tok_123' },
      }),
    )
    expect(bgm).toEqual({
      id: 'ast_bed',
      url: '/api/platform/assets/ast_bed/download',
      name: 'bed.mp3',
      headers: { Authorization: 'Bearer tok_123' },
    })
  })

  it('omits the headers key entirely when the resolver supplies none', () => {
    const withBgm: EpisodeCut = { ...cut, bgm: { artifactId: 'ast_bed' } }
    const { bgm } = buildHydrationPayload(
      withBgm,
      (id) => source(id),
      () => ({ url: 'https://cdn/bed.mp3', name: 'bed.mp3' }),
    )
    expect(bgm).not.toHaveProperty('headers')
  })
})
