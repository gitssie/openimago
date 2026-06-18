import { describe, it, expect } from 'vitest'
import { cutToOmniclipState, omniclipStateToCut } from '../cut-omniclip-mapper'
import type { EpisodeCut, ResolvedShotMedia } from '../cut-types'

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

describe('cut <-> omniclip mapper (production)', () => {
  it('hydrates clips onto track 0 in order with ms conversion', () => {
    const { state, orphans } = cutToOmniclipState(baseCut, resolveMedia)
    expect(orphans).toEqual([])
    expect(state.effects.map((e) => e.id)).toEqual(['clip-a', 'clip-b'])
    expect(state.effects[0]).toMatchObject({ start: 0, end: 2500, duration: 2500, start_at_position: 0 })
    expect(state.effects[1]).toMatchObject({ start: 1000, end: 4000, duration: 3000, start_at_position: 2500 })
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
    expect(back.transitions).toEqual(baseCut.transitions)
  })

  it('tolerates orphan clips (deleted source Shot) instead of dropping them', () => {
    const { state, orphans } = cutToOmniclipState(baseCut, (id) =>
      id === 'shot_2' ? undefined : resolveMedia(id),
    )
    expect(state.effects.map((e) => e.id)).toEqual(['clip-a'])
    expect(orphans.map((c) => c.id)).toEqual(['clip-b'])
  })
})
