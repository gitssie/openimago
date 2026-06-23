import { describe, it, expect } from 'vitest'
import {
  mapElementCards,
  mapShotCards,
  mapAudioCards,
  mapSelectedPreview,
  stepPreviewSelection,
  emptyPreview,
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

// ── selectedPreview (center PreviewPane) ──────────────────────────────────────

const bgmEl = {
  id: 'bgm-neon-pulse',
  displayName: 'Neon Pulse',
  kind: 'bgm' as const,
  description: 'Synthwave bed',
  timingNote: 'Loops',
  referenceArtifactIds: [],
}

describe('emptyPreview', () => {
  it('is a stable empty PreviewVM', () => {
    expect(emptyPreview()).toEqual({
      id: '',
      section: 'element',
      kind: 'empty',
      title: '',
      mediaUrl: null,
      hasPrev: false,
      hasNext: false,
    })
  })
})

describe('mapSelectedPreview', () => {
  const fullBible = bible({ characters: [kai], scenes: [neonAlley], audioElements: [bgmEl] })

  it('returns empty when nothing is selected', () => {
    const lists = { elements: [], shots: [], audio: [] }
    expect(mapSelectedPreview(null, lists, []).kind).toBe('empty')
  })

  it('maps an element selection to an image preview from its concept run', () => {
    const runs = [run({ nodeId: 'n01-char-kai-concept', shotId: '', kind: 'image', previewUrl: '/mock/kai.png', model: 'flux-pro' })]
    const elements = mapElementCards(fullBible, runs)
    const lists = { elements, shots: [], audio: [] }
    const vm = mapSelectedPreview({ section: 'element', id: 'kai-the-runner' }, lists, runs)
    expect(vm).toMatchObject({
      id: 'kai-the-runner',
      section: 'element',
      kind: 'image',
      title: '凯 (Kai)',
      mediaUrl: '/mock/kai.png',
      modelLabel: 'flux-pro',
    })
  })

  it('maps a shot selection to a video preview from its completed video run', () => {
    const runs = [
      run({ shotId: 's01-opening', kind: 'video', previewUrl: '/mock/s01.mp4', model: 'kling-v2' }),
      run({ shotId: 's01-opening', kind: 'audio', previewUrl: '/mock/s01.mp3' }),
    ]
    const shots = mapShotCards([shot()], fullBible, runs)
    const lists = { elements: [], shots, audio: [] }
    const vm = mapSelectedPreview({ section: 'shot', id: 's01-opening' }, lists, runs)
    expect(vm).toMatchObject({ section: 'shot', kind: 'video', mediaUrl: '/mock/s01.mp4', modelLabel: 'kling-v2' })
  })

  it('maps an audio selection to an audio preview from a global audio run', () => {
    const runs = [run({ nodeId: 'n15-bgm-neon-pulse', shotId: '', kind: 'audio', previewUrl: '/mock/bgm.mp3' })]
    const audio = mapAudioCards(fullBible, runs)
    const lists = { elements: [], shots: [], audio }
    const vm = mapSelectedPreview({ section: 'audio', id: 'bgm-neon-pulse' }, lists, runs)
    expect(vm).toMatchObject({ section: 'audio', kind: 'audio', mediaUrl: '/mock/bgm.mp3' })
  })

  it('still resolves title/kind with a null media url when no run matches', () => {
    const elements = mapElementCards(fullBible, [])
    const lists = { elements, shots: [], audio: [] }
    const vm = mapSelectedPreview({ section: 'element', id: 'kai-the-runner' }, lists, [])
    expect(vm).toMatchObject({ kind: 'image', mediaUrl: null, title: '凯 (Kai)' })
  })

  it('computes hasPrev/hasNext within the active section list', () => {
    const elements = mapElementCards(fullBible, []) // [kai, neon-alley]
    const lists = { elements, shots: [], audio: [] }
    const first = mapSelectedPreview({ section: 'element', id: 'kai-the-runner' }, lists, [])
    expect(first.hasPrev).toBe(false)
    expect(first.hasNext).toBe(true)
    const last = mapSelectedPreview({ section: 'element', id: 'neon-alley' }, lists, [])
    expect(last.hasPrev).toBe(true)
    expect(last.hasNext).toBe(false)
  })

  it('returns empty when the selected id is not in its section list', () => {
    const lists = { elements: mapElementCards(fullBible, []), shots: [], audio: [] }
    expect(mapSelectedPreview({ section: 'element', id: 'ghost' }, lists, []).kind).toBe('empty')
  })
})

describe('stepPreviewSelection', () => {
  const fullBible = bible({ characters: [kai], scenes: [neonAlley] })
  const lists = { elements: mapElementCards(fullBible, []), shots: [], audio: [] }

  it('steps to the next item in the same section', () => {
    expect(stepPreviewSelection({ section: 'element', id: 'kai-the-runner' }, 'next', lists)).toEqual({
      section: 'element',
      id: 'neon-alley',
    })
  })

  it('steps to the previous item in the same section', () => {
    expect(stepPreviewSelection({ section: 'element', id: 'neon-alley' }, 'prev', lists)).toEqual({
      section: 'element',
      id: 'kai-the-runner',
    })
  })

  it('clamps at the ends (returns null when stepping past the edge)', () => {
    expect(stepPreviewSelection({ section: 'element', id: 'kai-the-runner' }, 'prev', lists)).toBeNull()
    expect(stepPreviewSelection({ section: 'element', id: 'neon-alley' }, 'next', lists)).toBeNull()
  })
})
