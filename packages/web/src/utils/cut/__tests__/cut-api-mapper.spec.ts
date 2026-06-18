import { describe, it, expect } from 'vitest'
import { rawCutToEpisodeCut } from '../cut-api-mapper'
import type { OpenimagoEpisodeCut } from '../../../api/client'

describe('rawCutToEpisodeCut', () => {
  it('returns null for null', () => {
    expect(rawCutToEpisodeCut(null)).toBeNull()
  })

  it('narrows the wire type into a strict EpisodeCut', () => {
    const raw: OpenimagoEpisodeCut = {
      schemaVersion: 1,
      episodeId: 'ep_001',
      clips: [{ id: 'c1', sourceShotId: 'shot_1', inPoint: 0, outPoint: 3, order: 0 }],
      transitions: [{ afterClipId: 'c1', kind: 'dissolve', durationSeconds: 0.5 }],
      bgm: { artifactId: 'art1', gainDb: -3 },
      updatedAt: '2026-06-18T00:00:00Z',
    }
    expect(rawCutToEpisodeCut(raw)).toEqual({
      schemaVersion: 1,
      episodeId: 'ep_001',
      clips: [{ id: 'c1', sourceShotId: 'shot_1', inPoint: 0, outPoint: 3, order: 0 }],
      transitions: [{ afterClipId: 'c1', kind: 'dissolve', durationSeconds: 0.5 }],
      bgm: { artifactId: 'art1', gainDb: -3 },
      updatedAt: '2026-06-18T00:00:00Z',
    })
  })

  it('drops transitions with an unsupported kind', () => {
    const raw: OpenimagoEpisodeCut = {
      schemaVersion: 1,
      episodeId: 'ep_001',
      clips: [],
      transitions: [
        { afterClipId: 'c1', kind: 'dissolve', durationSeconds: 0.5 },
        { afterClipId: 'c2', kind: 'wipe', durationSeconds: 0.5 },
      ],
      updatedAt: '2026-06-18T00:00:00Z',
    }
    const cut = rawCutToEpisodeCut(raw)
    expect(cut?.transitions.map((t) => t.kind)).toEqual(['dissolve'])
  })

  it('omits bgm when absent', () => {
    const raw: OpenimagoEpisodeCut = {
      schemaVersion: 1,
      episodeId: 'ep_001',
      clips: [],
      transitions: [],
      updatedAt: '2026-06-18T00:00:00Z',
    }
    expect(rawCutToEpisodeCut(raw)?.bgm).toBeUndefined()
  })
})
