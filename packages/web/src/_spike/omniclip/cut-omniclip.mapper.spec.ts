// THROWAWAY SPIKE — openimago-2re7 (ADR 0007, spike point 3).
// Delete with the `_spike/omniclip/` dir.
//
// Proves the EpisodeCut <-> omniclip-state round-trip is lossless for the
// fields our canonical schema owns, and that orphan clips (deleted Shot) are
// tolerated rather than dropped (ADR 0006).

import { describe, it, expect } from 'vitest'
import { cutToOmniclipState, omniclipStateToCut } from './cut-omniclip.mapper'
import type { EpisodeCut, ResolvedShotMedia } from './episode-cut.types'

function media(sourceShotId: string, durationSeconds: number): ResolvedShotMedia {
  return {
    sourceShotId,
    url: `https://cdn.example/${sourceShotId}.mp4`,
    fileHash: `hash-${sourceShotId}`,
    rawDurationSeconds: durationSeconds,
    frames: Math.round(durationSeconds * 25),
    thumbnail: `data:image/png;base64,thumb-${sourceShotId}`,
    name: `${sourceShotId}.mp4`,
  }
}

const baseCut: EpisodeCut = {
  schemaVersion: 1,
  episodeId: 'ep_001',
  clips: [
    { id: 'clip-b', sourceShotId: 'shot_2', inPoint: 1, outPoint: 4, order: 1 },
    { id: 'clip-a', sourceShotId: 'shot_1', inPoint: 0, outPoint: 2.5, order: 0 },
  ],
  transitions: [{ afterClipId: 'clip-a', kind: 'dissolve', durationSeconds: 0.5 }],
  updatedAt: '2026-06-18T00:00:00.000Z',
}

const mediaTable: Record<string, ResolvedShotMedia> = {
  shot_1: media('shot_1', 10),
  shot_2: media('shot_2', 10),
}
const resolveMedia = (id: string) => mediaTable[id]
const resolveShotId = (hash: string) =>
  Object.values(mediaTable).find((m) => m.fileHash === hash)?.sourceShotId

describe('cut <-> omniclip mapper', () => {
  it('hydrates clips onto track 0 in order, end-to-end, with ms conversion', () => {
    const { state, orphans } = cutToOmniclipState(baseCut, resolveMedia)
    expect(orphans).toEqual([])
    expect(state.effects.map((e) => e.id)).toEqual(['clip-a', 'clip-b'])

    const [a, b] = state.effects
    // clip-a: in 0s..2.5s -> 0..2500ms, laid at position 0
    expect(a).toMatchObject({ start: 0, end: 2500, duration: 2500, start_at_position: 0 })
    // clip-b laid right after clip-a (2500ms), trim 1s..4s -> 1000..4000ms
    expect(b).toMatchObject({ start: 1000, end: 4000, duration: 3000, start_at_position: 2500 })
  })

  it('round-trips back to EpisodeCut without losing schema-owned fields', () => {
    const { state } = cutToOmniclipState(baseCut, resolveMedia)
    const back = omniclipStateToCut(
      state,
      { schemaVersion: 1, episodeId: 'ep_001', transitions: baseCut.transitions },
      resolveShotId,
      '2026-06-18T01:00:00.000Z',
    )

    expect(back.clips).toEqual([
      { id: 'clip-a', sourceShotId: 'shot_1', inPoint: 0, outPoint: 2.5, order: 0 },
      { id: 'clip-b', sourceShotId: 'shot_2', inPoint: 1, outPoint: 4, order: 1 },
    ])
    // transitions preserved from canonical file (omniclip 1.0.7 can't store them)
    expect(back.transitions).toEqual(baseCut.transitions)
  })

  it('tolerates orphan clips (deleted source Shot) instead of dropping them', () => {
    const { state, orphans } = cutToOmniclipState(baseCut, (id) =>
      id === 'shot_2' ? undefined : resolveMedia(id),
    )
    // clip-b is orphaned -> not an effect, but surfaced for a greyed placeholder
    expect(state.effects.map((e) => e.id)).toEqual(['clip-a'])
    expect(orphans.map((c) => c.id)).toEqual(['clip-b'])
  })

  it('maps a single audio effect to the bgm bed', () => {
    const stateWithAudio = {
      tracks: [{ id: 'track-0' }],
      effects: [
        {
          kind: 'audio' as const,
          id: 'aud-1',
          start_at_position: 0,
          duration: 5000,
          start: 0,
          end: 5000,
          track: 1,
          raw_duration: 5000,
          file_hash: 'hash-shot_1',
          name: 'bgm.mp3',
        },
      ],
    }
    const back = omniclipStateToCut(
      stateWithAudio,
      { schemaVersion: 1, episodeId: 'ep_001', transitions: [] },
      resolveShotId,
      '2026-06-18T02:00:00.000Z',
    )
    expect(back.bgm).toEqual({ artifactId: 'shot_1' })
  })
})
