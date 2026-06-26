import { describe, it, expect } from 'vitest'
import { buildHydrationPayload } from '../cut-hydration'
import type { EpisodeCut } from '../cut-types'
import type { ShotMediaSource } from '../shot-media-resolver'

function source(shotId: string): ShotMediaSource {
  return {
    sourceShotId: shotId,
    url: `https://cdn/${shotId}.mp4`,
    thumbnailUrl: `${shotId}.png`,
    // domain filmstrip VO: ms source duration (30s → 30000ms).
    filmstrip: {
      spriteUrl: `${shotId}.filmstrip.webp`,
      frameCount: 24,
      frameW: 28,
      frameH: 50,
      sourceDurationMs: 30000,
    },
    sourceDurationMs: 30000,
    name: `${shotId}.mp4`,
  }
}

const cut: EpisodeCut = {
  schemaVersion: 2,
  episodeId: 'ep_001',
  clips: [
    { id: 'c-b', sourceShotId: 'shot_2', inPointMs: 1000, outPointMs: 4000, order: 1 },
    { id: 'c-a', sourceShotId: 'shot_1', inPointMs: 0, outPointMs: 2500, order: 0 },
  ],
  transitions: [
    { afterClipId: 'c-a', kind: 'dissolve', durationSeconds: 0.5 },
    { afterClipId: 'c-gone', kind: 'fade', durationSeconds: 1 },
  ],
  updatedAt: '2026-06-18T00:00:00Z',
}

describe('buildHydrationPayload', () => {
  it('maps clips in order converting ms trim points to seconds at the fork boundary + resolver urls', () => {
    const { clips, orphans } = buildHydrationPayload(cut, (id) => source(id))
    expect(orphans).toEqual([])
    expect(clips).toEqual([
      { id: 'c-a', url: 'https://cdn/shot_1.mp4', name: 'shot_1.mp4', inPointSeconds: 0, outPointSeconds: 2.5, filmstrip: { spriteUrl: 'shot_1.filmstrip.webp', frameCount: 24, frameW: 28, frameH: 50, sourceDurationSeconds: 30 } },
      { id: 'c-b', url: 'https://cdn/shot_2.mp4', name: 'shot_2.mp4', inPointSeconds: 1, outPointSeconds: 4, filmstrip: { spriteUrl: 'shot_2.filmstrip.webp', frameCount: 24, frameW: 28, frameH: 50, sourceDurationSeconds: 30 } },
    ])
  })

  it('clamps a clip whose trim exceeds its source-duration snapshot (openimago-lknv)', () => {
    const overlong: EpisodeCut = {
      ...cut,
      clips: [
        // out 9s > source 2.5s → out clamped to 2.5s; in floored at 0.
        { id: 'c-a', sourceShotId: 'shot_1', inPointMs: -500, outPointMs: 9000, order: 0, sourceDurationMs: 2500 },
      ],
    }
    const { clips } = buildHydrationPayload(overlong, (id) => source(id))
    expect(clips[0]).toMatchObject({ inPointSeconds: 0, outPointSeconds: 2.5 })
  })

  it('passes a null filmstrip through as null (whole-or-null preserved)', () => {
    const { clips } = buildHydrationPayload(cut, (id) => ({
      ...source(id),
      filmstrip: null,
    }))
    expect(clips.every((c) => c.filmstrip === null)).toBe(true)
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
