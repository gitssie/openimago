import { describe, it, expect } from 'vitest'
import {
  mapElementCards,
  mapShotCards,
  mapAudioCards,
} from 'src/components/session-workspace/left-panel/mapper'
import type {
  StoryBibleSummary,
  StoryRunSummary,
  StoryShotSummary,
} from 'src/components/session-workspace/types'

// ── Builders ──────────────────────────────────────────────────────────────────

function bible(over: Partial<StoryBibleSummary> = {}): StoryBibleSummary {
  return {
    schemaVersion: 1,
    worldName: 'Neon Drift',
    worldDescription: '',
    era: '',
    moodKeywords: [],
    visualStyleNotes: '',
    characters: [],
    scenes: [],
    styleSeeds: [],
    audioElements: [],
    updatedAt: null,
    ...over,
  }
}

function run(over: Partial<StoryRunSummary> = {}): StoryRunSummary {
  return {
    id: 'run-x',
    nodeId: '',
    shotId: '',
    status: 'completed',
    startedAt: '',
    completedAt: null,
    model: '',
    prompt: '',
    resultArtifactId: null,
    kind: null,
    mime: null,
    thumbnailUrl: null,
    previewUrl: null,
    error: null,
    ...over,
  }
}

function shot(over: Partial<StoryShotSummary> = {}): StoryShotSummary {
  return {
    id: 's01-opening',
    shotNumber: 1,
    sceneId: 'neon-alley',
    description: 'Wide establishing shot.',
    visualPrompt: '',
    cameraNotes: '',
    lightingNotes: '',
    dialog: [],
    characterIds: [],
    referenceArtifactIds: [],
    status: 'pending',
    durationEstimate: null,
    latestRunId: null,
    ...over,
  }
}

const kai = {
  id: 'kai-the-runner',
  displayName: '凯 (Kai)',
  role: 'protagonist' as const,
  description: 'A young street racer.',
  visualNotes: '',
  thumbnailUrl: null,
  referenceArtifactIds: [],
  tags: [],
}
const neonAlley = {
  id: 'neon-alley',
  displayName: '霓虹小巷',
  type: 'exterior',
  description: 'Narrow back alley.',
  mood: '',
  lighting: '',
  thumbnailUrl: null,
  referenceArtifactIds: [],
  tags: [],
}

// ── 关键元素 ──────────────────────────────────────────────────────────────────

describe('mapElementCards', () => {
  it('maps characters then scenes into element cards', () => {
    const cards = mapElementCards(bible({ characters: [kai], scenes: [neonAlley] }), [])
    expect(cards).toHaveLength(2)
    expect(cards[0]).toMatchObject({ id: 'kai-the-runner', kind: 'character', title: '凯 (Kai)', description: 'A young street racer.' })
    expect(cards[1]).toMatchObject({ id: 'neon-alley', kind: 'scene', title: '霓虹小巷' })
  })

  it('attaches concept-art thumbnails from shotId-null image runs whose nodeId matches the element', () => {
    const runs = [
      run({ id: 'r1', nodeId: 'n01-char-kai-concept', shotId: '', kind: 'image', thumbnailUrl: '/mock/kai.svg' }),
      run({ id: 'r2', nodeId: 'n04-scene-neon-alley', shotId: '', kind: 'image', thumbnailUrl: '/mock/alley.svg' }),
    ]
    const cards = mapElementCards(bible({ characters: [kai], scenes: [neonAlley] }), runs)
    expect(cards[0]!.thumbnails).toEqual(['/mock/kai.svg'])
    expect(cards[1]!.thumbnails).toEqual(['/mock/alley.svg'])
  })

  it('ignores per-shot runs and audio runs when collecting element thumbnails', () => {
    const runs = [
      run({ nodeId: 'n07-shot-s01-opening', shotId: 's01-opening', kind: 'image', thumbnailUrl: '/mock/shot.svg' }),
      run({ nodeId: 'n15-bgm-neon-pulse', shotId: '', kind: 'audio', thumbnailUrl: '/mock/wave.svg' }),
    ]
    const cards = mapElementCards(bible({ characters: [kai], scenes: [neonAlley] }), runs)
    expect(cards[0]!.thumbnails).toEqual([])
    expect(cards[1]!.thumbnails).toEqual([])
  })
})

// ── 分镜 ─────────────────────────────────────────────────────────────────────

describe('mapShotCards', () => {
  it('resolves scene label, duration label and description', () => {
    const cards = mapShotCards(
      [shot({ durationEstimate: 8 })],
      bible({ characters: [kai], scenes: [neonAlley] }),
      [],
    )
    expect(cards[0]).toMatchObject({
      id: 's01-opening',
      sceneLabel: '霓虹小巷',
      durationLabel: '约 8s',
      description: 'Wide establishing shot.',
    })
  })

  it('resolves character chips with avatar from the character concept run', () => {
    const runs = [run({ nodeId: 'n01-char-kai-concept', shotId: '', kind: 'image', thumbnailUrl: '/mock/kai.svg' })]
    const cards = mapShotCards(
      [shot({ characterIds: ['kai-the-runner'] })],
      bible({ characters: [kai], scenes: [neonAlley] }),
      runs,
    )
    expect(cards[0]!.characters).toEqual([{ id: 'kai-the-runner', name: '凯 (Kai)', avatarUrl: '/mock/kai.svg' }])
  })

  it('builds a mixed media row: video thumbs then audio thumbs for the shot', () => {
    const runs = [
      run({ id: 'v', nodeId: 'n07', shotId: 's01-opening', kind: 'video', thumbnailUrl: '/mock/v.svg' }),
      run({ id: 'a', nodeId: 'n16', shotId: 's01-opening', kind: 'audio', thumbnailUrl: '/mock/a.svg' }),
      run({ id: 'other', nodeId: 'n08', shotId: 's02', kind: 'video', thumbnailUrl: '/mock/x.svg' }),
    ]
    const cards = mapShotCards([shot()], bible({ scenes: [neonAlley] }), runs)
    expect(cards[0]!.media).toEqual([
      { url: '/mock/v.svg', kind: 'video' },
      { url: '/mock/a.svg', kind: 'audio' },
    ])
  })

  it('omits duration label when the shot has no estimate', () => {
    const cards = mapShotCards([shot({ durationEstimate: null })], bible(), [])
    expect(cards[0]!.durationLabel).toBeUndefined()
  })
})

// ── 旁白与音乐 ────────────────────────────────────────────────────────────────

describe('mapAudioCards', () => {
  const bgm = {
    id: 'bgm-neon-pulse',
    displayName: 'Neon Pulse',
    kind: 'bgm' as const,
    description: 'Synthwave bed',
    timingNote: 'Loops under the episode',
    referenceArtifactIds: [],
  }

  it('maps audio elements to audio cards with timing note', () => {
    const cards = mapAudioCards(bible({ audioElements: [bgm] }), [])
    expect(cards[0]).toMatchObject({
      id: 'bgm-neon-pulse',
      title: 'Neon Pulse',
      description: 'Synthwave bed',
      timingNote: 'Loops under the episode',
    })
  })

  it('attaches thumbnails from global audio runs (shotId null) whose nodeId matches the element', () => {
    const runs = [
      run({ nodeId: 'n15-bgm-neon-pulse', shotId: '', kind: 'audio', thumbnailUrl: '/mock/wave.svg' }),
      run({ nodeId: 'n16-narration-s01-opening', shotId: 's01-opening', kind: 'audio', thumbnailUrl: '/mock/no.svg' }),
    ]
    const cards = mapAudioCards(bible({ audioElements: [bgm] }), runs)
    expect(cards[0]!.thumbnails).toEqual(['/mock/wave.svg'])
  })
})
