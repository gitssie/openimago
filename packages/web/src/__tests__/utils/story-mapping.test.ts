import { describe, it, expect } from 'vitest'
import {
  storiesFromBible,
  storiesFromEpisodes,
} from 'src/utils/story-mapping'
import type {
  OpenimagoStoryBible,
  OpenimagoStoryEpisode,
} from 'src/api/client'

// ── Test data ─────────────────────────────────────────────────────────────────

function makeBible(overrides: Partial<OpenimagoStoryBible> = {}): OpenimagoStoryBible {
  return {
    schemaVersion: 1,
    projectId: 'proj-1',
    world: {
      name: '测试世界',
      description: '',
      era: '',
      moodKeywords: [],
      visualStyleNotes: '',
    },
    characters: [],
    scenes: [],
    styleSeeds: [],
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeEpisode(overrides: Partial<OpenimagoStoryEpisode> = {}): OpenimagoStoryEpisode {
  return {
    schemaVersion: 1,
    id: 'ep_001',
    episodeNumber: 1,
    title: '',
    logline: '',
    synopsis: '',
    status: 'draft',
    shots: [],
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('storiesFromBible', () => {
  it('returns empty array for empty bible', () => {
    expect(storiesFromBible(makeBible())).toEqual([])
  })

  it('maps characters to character story elements', () => {
    const bible = makeBible({
      characters: [
        { id: 'ch-1', name: '凯', description: '主角战士', slug: 'kai' },
        { id: 'ch-2', name: '琳', description: '同伴法师' },
      ],
    })
    const result = storiesFromBible(bible)
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      id: 'char-ch-1',
      title: '凯',
      preview: '主角战士',
      kind: 'character',
      syncState: 'synced',
    })
    expect(result[1]).toMatchObject({
      id: 'char-ch-2',
      title: '琳',
      preview: '同伴法师',
      kind: 'character',
    })
  })

  it('falls back to slug when id is missing', () => {
    const bible = makeBible({
      characters: [{ slug: 'kai', name: '凯' }],
    })
    const result = storiesFromBible(bible)
    expect(result[0]!.id).toBe('char-kai')
  })

  it('falls back to index-based id when both id and slug are missing', () => {
    const bible = makeBible({
      characters: [{ name: '无名' }, { name: '无名2' }],
    })
    const result = storiesFromBible(bible)
    expect(result[0]!.id).toBe('char-ci-0')
    expect(result[1]!.id).toBe('char-ci-1')
  })

  it('maps scenes to scene story elements', () => {
    const bible = makeBible({
      scenes: [
        { id: 'sc-1', name: '森林', description: '暮色林间空地' },
      ],
    })
    const result = storiesFromBible(bible)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'scene-sc-1',
      title: '森林',
      preview: '暮色林间空地',
      kind: 'scene',
    })
  })

  it('maps style seeds to reference story elements', () => {
    const bible = makeBible({
      styleSeeds: [
        { id: 'ss-1', name: '赛博朋克', description: '霓虹色调，雨夜都市' },
      ],
    })
    const result = storiesFromBible(bible)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'ref-ss-1',
      title: '赛博朋克',
      preview: '霓虹色调，雨夜都市',
      kind: 'reference',
    })
  })

  it('handles missing optional fields gracefully', () => {
    const bible = makeBible({
      characters: [{}],
      scenes: [{}],
      styleSeeds: [{}],
    })
    const result = storiesFromBible(bible)
    expect(result).toHaveLength(3)
    // Should use fallback titles
    expect(result[0]!.title).toBe('未命名角色')
    expect(result[1]!.title).toBe('未命名场景')
    expect(result[2]!.title).toBe('风格参考')
  })

  it('handles all three categories together', () => {
    const bible = makeBible({
      characters: [{ id: 'c1', name: 'A' }],
      scenes: [{ id: 's1', name: 'B' }],
      styleSeeds: [{ id: 'r1', name: 'C' }],
    })
    const result = storiesFromBible(bible)
    expect(result).toHaveLength(3)
    expect(result.filter((r) => r.kind === 'character')).toHaveLength(1)
    expect(result.filter((r) => r.kind === 'scene')).toHaveLength(1)
    expect(result.filter((r) => r.kind === 'reference')).toHaveLength(1)
  })
})

describe('storiesFromEpisodes', () => {
  it('returns empty array for empty episode list', () => {
    expect(storiesFromEpisodes([])).toEqual([])
  })

  it('returns empty array for episode with no shots', () => {
    expect(storiesFromEpisodes([makeEpisode({ shots: [] })])).toEqual([])
  })

  it('maps shots to scene story elements', () => {
    const ep = makeEpisode({
      shots: [
        { id: 'sh-1', title: '开场', description: '主角站在废墟前' },
        { id: 'sh-2', description: '全景展示城市' },
      ],
    })
    const result = storiesFromEpisodes([ep])
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      id: 'shot-sh-1',
      title: '开场',
      preview: '主角站在废墟前',
      kind: 'scene',
    })
    expect(result[1]).toMatchObject({
      id: 'shot-sh-2',
      title: '全景展示城市',
      preview: '全景展示城市',
    })
  })

  it('uses description as title fallback', () => {
    const ep = makeEpisode({
      shots: [{ id: 'sh-3', description: 'A very long description of the shot that exceeds forty characters' }],
    })
    const result = storiesFromEpisodes([ep])
    expect(result[0]!.title).toBe('A very long description of the shot that exceeds forty characters'.slice(0, 40))
    expect(result[0]!.preview).toBe('A very long description of the shot that exceeds forty characters')
  })

  it('sets syncState based on shot status', () => {
    const ep = makeEpisode({
      shots: [
        { id: 'sh-1', status: 'generated' },
        { id: 'sh-2', status: 'draft' },
        { id: 'sh-3' },
      ],
    })
    const result = storiesFromEpisodes([ep])
    expect(result[0]!.syncState).toBe('synced')
    expect(result[1]!.syncState).toBe('pending')
    expect(result[2]!.syncState).toBe('pending')
  })

  it('includes timeLabel when present', () => {
    const ep = makeEpisode({
      shots: [
        { id: 'sh-1', timeLabel: '00:05-00:12' },
        { id: 'sh-2' },
      ],
    })
    const result = storiesFromEpisodes([ep])
    expect(result[0]!.timeLabel).toBe('00:05-00:12')
    expect(result[1]!.timeLabel).toBeUndefined()
  })

  it('uses visualPrompt as preview fallback', () => {
    const ep = makeEpisode({
      shots: [{ id: 'sh-1', visualPrompt: 'cinematic wide angle shot' }],
    })
    const result = storiesFromEpisodes([ep])
    expect(result[0]!.preview).toBe('cinematic wide angle shot')
  })

  it('uses posterUrl as thumbnail fallback', () => {
    const ep = makeEpisode({
      shots: [{ id: 'sh-1', posterUrl: 'https://example.com/poster.png' }],
    })
    const result = storiesFromEpisodes([ep])
    expect(result[0]!.thumbnailUrl).toBe('https://example.com/poster.png')
  })

  it('processes multiple episodes', () => {
    const ep1 = makeEpisode({ id: 'ep_001', shots: [{ id: 'a' }] })
    const ep2 = makeEpisode({ id: 'ep_002', shots: [{ id: 'b' }, { id: 'c' }] })
    const result = storiesFromEpisodes([ep1, ep2])
    expect(result).toHaveLength(3)
  })
})
