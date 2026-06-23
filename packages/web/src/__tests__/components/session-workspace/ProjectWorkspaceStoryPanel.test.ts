import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { type Plugin } from 'vue'
import { QIcon, QSpinnerDots } from 'quasar'
import ProjectWorkspaceStoryPanel from '../../../components/session-workspace/ProjectWorkspaceStoryPanel.vue'
import type {
  StoryBibleSummary,
  StoryCharacterSummary,
  StoryEpisodeSummary,
  StoryRunSummary,
  StorySceneSummary,
  StoryShotSummary,
  StoryStyleSeedSummary,
  StoryWorkflowNodeSummary,
} from '../../../components/session-workspace/types'

// ── Quasar plugin stub ──────────────────────────────────────────────────────

const QUASAR_COMPONENTS = { QIcon, QSpinnerDots }

const mockQuasarPlugin: Plugin = {
  install(app) {
    for (const [name, component] of Object.entries(QUASAR_COMPONENTS)) {
      app.component(name, component)
    }
  },
}

// ── Test data factories ─────────────────────────────────────────────────────

function makeCharacter(over: Partial<StoryCharacterSummary> = {}): StoryCharacterSummary {
  return {
    id: over.id ?? 'kai',
    displayName: over.displayName ?? 'Kai',
    role: over.role ?? 'protagonist',
    description: over.description ?? '主角',
    visualNotes: over.visualNotes ?? '',
    thumbnailUrl: over.thumbnailUrl ?? null,
    referenceArtifactIds: over.referenceArtifactIds ?? [],
    tags: over.tags ?? [],
  }
}

function makeScene(over: Partial<StorySceneSummary> = {}): StorySceneSummary {
  return {
    id: over.id ?? 'neon-alley',
    displayName: over.displayName ?? 'Neon Alley',
    type: over.type ?? 'exterior',
    description: over.description ?? '',
    mood: over.mood ?? '',
    lighting: over.lighting ?? '',
    thumbnailUrl: over.thumbnailUrl ?? null,
    referenceArtifactIds: over.referenceArtifactIds ?? [],
    tags: over.tags ?? [],
  }
}

function makeStyleSeed(over: Partial<StoryStyleSeedSummary> = {}): StoryStyleSeedSummary {
  return {
    id: over.id ?? 'cyberpunk-noir',
    displayName: over.displayName ?? 'Cyberpunk Noir',
    description: over.description ?? '',
    visualStyle: over.visualStyle ?? 'cyberpunk-noir',
    colorPalette: over.colorPalette ?? [],
    thumbnailUrl: over.thumbnailUrl ?? null,
    referenceArtifactIds: over.referenceArtifactIds ?? [],
  }
}

function makeBible(over: Partial<StoryBibleSummary> = {}): StoryBibleSummary {
  return {
    schemaVersion: 1,
    worldName: over.worldName ?? 'Neo Kowloon',
    worldDescription: over.worldDescription ?? 'A dense, neon-drenched city.',
    era: over.era ?? '2087',
    moodKeywords: over.moodKeywords ?? ['moody', 'high-contrast', 'neon'],
    visualStyleNotes: over.visualStyleNotes ?? '',
    characters: over.characters ?? [makeCharacter()],
    scenes: over.scenes ?? [makeScene()],
    styleSeeds: over.styleSeeds ?? [makeStyleSeed()],
    audioElements: over.audioElements ?? [],
    updatedAt: over.updatedAt ?? '2026-06-08T00:00:00.000Z',
  }
}

function makeEpisode(over: Partial<StoryEpisodeSummary> = {}): StoryEpisodeSummary {
  return {
    id: over.id ?? 'ep_001',
    episodeNumber: over.episodeNumber ?? 1,
    title: over.title ?? 'Opening Run',
    status: over.status ?? 'storyboard',
    shotCount: over.shotCount ?? 0,
    durationEstimate: over.durationEstimate ?? 60,
    logline: over.logline ?? 'Kai flees through a neon alley.',
    synopsis: over.synopsis ?? '',
    updatedAt: over.updatedAt ?? null,
  }
}

function makeShot(over: Partial<StoryShotSummary> = {}): StoryShotSummary {
  return {
    id: over.id ?? 's01-opening',
    shotNumber: over.shotNumber ?? 1,
    sceneId: over.sceneId ?? 'neon-alley',
    description: over.description ?? 'Wide shot of the alley',
    visualPrompt: over.visualPrompt ?? 'A wide shot of a neon alley, cinematic',
    cameraNotes: over.cameraNotes ?? '35mm, low angle',
    lightingNotes: over.lightingNotes ?? 'Practical neon',
    dialog: over.dialog ?? [],
    characterIds: over.characterIds ?? ['kai'],
    referenceArtifactIds: over.referenceArtifactIds ?? ['art-1'],
    status: over.status ?? 'pending',
    durationEstimate: over.durationEstimate ?? 3,
    latestRunId: over.latestRunId ?? null,
  }
}

function makeWorkflowNode(over: Partial<StoryWorkflowNodeSummary> = {}): StoryWorkflowNodeSummary {
  return {
    id: over.id ?? 'node-1',
    shotId: over.shotId ?? 's01-opening',
    toolKind: over.toolKind ?? 'image_generate',
    label: over.label ?? 'Generate opening',
    promptTemplate: over.promptTemplate ?? 'Wide shot of {{scene.description}}',
    model: over.model ?? null,
    aspectRatio: over.aspectRatio ?? null,
    dependsOn: over.dependsOn ?? [],
    latestRunId: over.latestRunId ?? null,
  }
}

function makeRun(over: Partial<StoryRunSummary> = {}): StoryRunSummary {
  return {
    id: over.id ?? 'run-1',
    nodeId: over.nodeId ?? 'node-1',
    shotId: over.shotId ?? 's01-opening',
    status: over.status ?? 'completed',
    startedAt: over.startedAt ?? '2026-06-08T01:00:00.000Z',
    completedAt: over.completedAt ?? '2026-06-08T01:00:30.000Z',
    model: over.model ?? 'nano-banana',
    prompt: over.prompt ?? 'Wide shot...',
    resultArtifactId: over.resultArtifactId ?? 'artifact-1',
    kind: over.kind ?? null,
    mime: over.mime ?? null,
    thumbnailUrl: over.thumbnailUrl ?? null,
    previewUrl: over.previewUrl ?? null,
    error: over.error ?? null,
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ProjectWorkspaceStoryPanel — render', () => {
  it('renders the panel region with the correct aria-label', () => {
    const wrapper = mount(ProjectWorkspaceStoryPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: {
        seriesTitle: 'Neon Drift',
        seriesDescription: 'A short film about a runner in 2087.',
        episodes: [makeEpisode()],
        currentEpisodeId: 'ep_001',
      },
    })

    const region = wrapper.find('[role="region"]')
    expect(region.exists()).toBe(true)
    expect(region.attributes('aria-label')).toContain('Neon Drift')
  })

  it('renders the series title in the hero', () => {
    const wrapper = mount(ProjectWorkspaceStoryPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: {
        seriesTitle: 'Neon Drift',
        episodes: [makeEpisode()],
        currentEpisodeId: 'ep_001',
      },
    })

    expect(wrapper.find('.story-panel__title').text()).toBe('Neon Drift')
  })

  it('renders the episode picker with options for all episodes', () => {
    const wrapper = mount(ProjectWorkspaceStoryPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: {
        episodes: [makeEpisode({ id: 'ep_001' }), makeEpisode({ id: 'ep_002', episodeNumber: 2 })],
        currentEpisodeId: 'ep_001',
      },
    })

    const select = wrapper.find('select#story-episode-select')
    expect(select.exists()).toBe(true)

    const options = wrapper.findAll('select#story-episode-select option')
    expect(options.length).toBe(2)
    expect(options[0]!.text()).toContain('EP01')
    expect(options[1]!.text()).toContain('EP02')
  })

  it('shows loading overlay when isLoading=true', () => {
    const wrapper = mount(ProjectWorkspaceStoryPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: { isLoading: true, episodes: [makeEpisode()], currentEpisodeId: 'ep_001' },
    })

    const loadingOverlay = wrapper.find('.story-panel__overlay--loading')
    expect(loadingOverlay.exists()).toBe(true)
    expect(loadingOverlay.attributes('role')).toBe('status')
    expect(loadingOverlay.attributes('aria-live')).toBe('polite')
  })

  it('shows error overlay when errorMessage is provided', () => {
    const wrapper = mount(ProjectWorkspaceStoryPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: { errorMessage: '故事文件缺失', episodes: [], currentEpisodeId: null },
    })

    const errorOverlay = wrapper.find('.story-panel__overlay--error')
    expect(errorOverlay.exists()).toBe(true)
    expect(errorOverlay.attributes('role')).toBe('alert')
    expect(errorOverlay.text()).toContain('故事文件缺失')
  })
})

describe('ProjectWorkspaceStoryPanel — bible rail', () => {
  it('renders character, scene, and style-seed cards from the bible', () => {
    const bible = makeBible({
      characters: [makeCharacter({ id: 'kai', displayName: 'Kai' })],
      scenes: [makeScene({ id: 'neon-alley', displayName: 'Neon Alley' })],
      styleSeeds: [makeStyleSeed({ id: 'cyberpunk-noir', displayName: 'Cyberpunk Noir' })],
    })

    const wrapper = mount(ProjectWorkspaceStoryPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: {
        bible,
        episodes: [makeEpisode()],
        currentEpisodeId: 'ep_001',
      },
    })

    // Character card
    expect(wrapper.findAll('.story-panel__card')).toHaveLength(2) // 1 character + 1 scene
    expect(wrapper.text()).toContain('Kai')
    expect(wrapper.text()).toContain('Neon Alley')

    // Style seed
    expect(wrapper.find('.story-panel__seed').exists()).toBe(true)
    expect(wrapper.text()).toContain('Cyberpunk Noir')

    // World card
    expect(wrapper.text()).toContain('Neo Kowloon')
  })

  it('shows empty-state placeholders when bible is missing', () => {
    const wrapper = mount(ProjectWorkspaceStoryPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: { episodes: [makeEpisode()], currentEpisodeId: 'ep_001', bible: null },
    })

    const emptyMessages = wrapper.findAll('.story-panel__rail-empty')
    expect(emptyMessages.length).toBeGreaterThan(0)
  })

  it('emits select with kind=character when a character card is clicked', async () => {
    const bible = makeBible({ characters: [makeCharacter({ id: 'kai' })] })

    const wrapper = mount(ProjectWorkspaceStoryPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: { bible, episodes: [makeEpisode()], currentEpisodeId: 'ep_001' },
    })

    const characterCard = wrapper
      .findAll('.story-panel__card')
      .find((node) => node.text().includes('Kai'))
    expect(characterCard).toBeTruthy()
    await characterCard!.trigger('click')

    const selections = wrapper.emitted('select')
    expect(selections).toBeTruthy()
    expect(selections![0]).toEqual([{ kind: 'character', id: 'kai' }])
  })

  it('emits select with kind=scene when a scene card is clicked', async () => {
    const bible = makeBible({ scenes: [makeScene({ id: 'neon-alley' })] })

    const wrapper = mount(ProjectWorkspaceStoryPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: { bible, episodes: [makeEpisode()], currentEpisodeId: 'ep_001' },
    })

    const sceneCard = wrapper
      .findAll('.story-panel__card')
      .find((node) => node.text().includes('Neon Alley'))
    await sceneCard!.trigger('click')

    expect(wrapper.emitted('select')![0]).toEqual([{ kind: 'scene', id: 'neon-alley' }])
  })

  it('emits select with kind=styleSeed when a style seed is clicked', async () => {
    const bible = makeBible({ styleSeeds: [makeStyleSeed({ id: 'cyberpunk-noir' })] })

    const wrapper = mount(ProjectWorkspaceStoryPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: { bible, episodes: [makeEpisode()], currentEpisodeId: 'ep_001' },
    })

    await wrapper.find('.story-panel__seed').trigger('click')
    expect(wrapper.emitted('select')![0]).toEqual([{ kind: 'styleSeed', id: 'cyberpunk-noir' }])
  })
})

describe('ProjectWorkspaceStoryPanel — shot rail & detail', () => {
  const shots = [
    makeShot({ id: 's01', shotNumber: 1, sceneId: 'neon-alley', description: 'Wide alley' }),
    makeShot({ id: 's02', shotNumber: 2, sceneId: 'neon-alley', description: 'Close-up of Kai', characterIds: ['kai'] }),
  ]
  const bible = makeBible({
    characters: [makeCharacter({ id: 'kai', displayName: 'Kai' })],
    scenes: [makeScene({ id: 'neon-alley' })],
  })

  it('renders the shot rail with one option per shot', () => {
    const wrapper = mount(ProjectWorkspaceStoryPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: { bible, episodes: [makeEpisode()], currentEpisodeId: 'ep_001', shots },
    })

    const shotButtons = wrapper.findAll('[role="option"]')
    expect(shotButtons.length).toBe(2)
  })

  it('emits select with kind=shot when a shot is clicked', async () => {
    const wrapper = mount(ProjectWorkspaceStoryPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: { bible, episodes: [makeEpisode()], currentEpisodeId: 'ep_001', shots },
    })

    const firstShot = wrapper.findAll('[role="option"]')[0]!
    await firstShot.trigger('click')

    expect(wrapper.emitted('select')![0]).toEqual([{ kind: 'shot', id: 's01' }])
  })

  it('shows the shot detail (description + visualPrompt + dialog) when currentShotId is set', () => {
    const wrapper = mount(ProjectWorkspaceStoryPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: {
        bible,
        episodes: [makeEpisode()],
        currentEpisodeId: 'ep_001',
        currentShotId: 's02',
        shots: [
          makeShot({
            id: 's02',
            description: 'Kai looks over her shoulder',
            visualPrompt: 'Close-up, neon rim light',
            dialog: [{ characterId: 'kai', text: '谁在那里？', emotion: 'tense' }],
          }),
        ],
      },
    })

    expect(wrapper.find('.story-panel__detail-title').text()).toContain('SHOT 01')
    expect(wrapper.find('.story-panel__detail-prose').text()).toContain('Kai looks over her shoulder')
    expect(wrapper.find('.story-panel__detail-prompt').text()).toContain('Close-up')
    expect(wrapper.text()).toContain('谁在那里？')
  })

  it('shows the empty-detail state when no shot is selected', () => {
    const wrapper = mount(ProjectWorkspaceStoryPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: { bible, episodes: [makeEpisode()], currentEpisodeId: 'ep_001', shots, currentShotId: null },
    })

    expect(wrapper.find('.story-panel__detail-empty').exists()).toBe(true)
    expect(wrapper.text()).toContain('选择左侧镜头')
  })

  it('filters the shot rail when a scene pill is clicked', async () => {
    const bibleWithTwoScenes = makeBible({
      characters: [makeCharacter({ id: 'kai', displayName: 'Kai' })],
      scenes: [
        makeScene({ id: 'neon-alley', displayName: 'Neon Alley' }),
        makeScene({ id: 'rooftop', displayName: 'Rooftop' }),
      ],
    })

    const wrapper = mount(ProjectWorkspaceStoryPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: {
        bible: bibleWithTwoScenes,
        episodes: [makeEpisode()],
        currentEpisodeId: 'ep_001',
        shots: [
          makeShot({ id: 's01', shotNumber: 1, sceneId: 'neon-alley' }),
          makeShot({ id: 's02', shotNumber: 2, sceneId: 'rooftop' }),
        ],
      },
    })

    // Initially shows all 2 shots
    expect(wrapper.findAll('[role="option"]').length).toBe(2)

    // Click the "Rooftop" scene pill
    const rooftopPill = wrapper
      .findAll('.story-panel__scene-pill')
      .find((pill) => pill.text().includes('Rooftop'))
    expect(rooftopPill).toBeTruthy()
    await rooftopPill!.trigger('click')

    // After filter, only 1 shot visible
    expect(wrapper.findAll('[role="option"]').length).toBe(1)
  })
})

describe('ProjectWorkspaceStoryPanel — episode picker', () => {
  it('emits episode-change when the user picks a new episode', async () => {
    const wrapper = mount(ProjectWorkspaceStoryPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: {
        episodes: [makeEpisode({ id: 'ep_001' }), makeEpisode({ id: 'ep_002', episodeNumber: 2 })],
        currentEpisodeId: 'ep_001',
      },
    })

    const select = wrapper.find<HTMLSelectElement>('select#story-episode-select')
    await select.setValue('ep_002')

    const changes = wrapper.emitted('episode-change')
    expect(changes).toBeTruthy()
    expect(changes![0]).toEqual(['ep_002'])

    // Should also emit select with kind=episode
    const selections = wrapper.emitted('select')
    expect(selections![0]).toEqual([{ kind: 'episode', id: 'ep_002' }])
  })
})

describe('ProjectWorkspaceStoryPanel — intent emits (read-only MVP)', () => {
  it('emits intent with kind=regenerate-shot when 重新生成 is clicked', async () => {
    const wrapper = mount(ProjectWorkspaceStoryPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: {
        bible: makeBible(),
        episodes: [makeEpisode()],
        currentEpisodeId: 'ep_001',
        currentShotId: 's01-opening',
        shots: [makeShot({ id: 's01-opening' })],
      },
    })

    const regenButton = wrapper
      .findAll('button')
      .find((btn) => btn.text().includes('重新生成'))
    expect(regenButton).toBeTruthy()
    await regenButton!.trigger('click')

    const intents = wrapper.emitted('intent')
    expect(intents).toBeTruthy()
    expect(intents![0]).toEqual([{ kind: 'regenerate-shot', episodeId: 'ep_001', shotId: 's01-opening' }])
  })

  it('emits intent with kind=edit-shot when 编辑 is clicked', async () => {
    const wrapper = mount(ProjectWorkspaceStoryPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: {
        bible: makeBible(),
        episodes: [makeEpisode()],
        currentEpisodeId: 'ep_001',
        currentShotId: 's01-opening',
        shots: [makeShot({ id: 's01-opening' })],
      },
    })

    const editButton = wrapper
      .findAll('button')
      .find((btn) => btn.text().includes('编辑'))
    await editButton!.trigger('click')

    expect(wrapper.emitted('intent')![0]).toEqual([
      { kind: 'edit-shot', episodeId: 'ep_001', shotId: 's01-opening' },
    ])
  })
})

describe('ProjectWorkspaceStoryPanel — workflow & runs', () => {
  it('renders workflow nodes filtered to the selected shot', () => {
    const workflowNodes = [
      makeWorkflowNode({ id: 'node-1', shotId: 's01-opening', label: 'Generate opening' }),
      makeWorkflowNode({ id: 'node-2', shotId: 's02', label: 'Generate close-up' }),
    ]

    const wrapper = mount(ProjectWorkspaceStoryPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: {
        bible: makeBible(),
        episodes: [makeEpisode()],
        currentEpisodeId: 'ep_001',
        currentShotId: 's01-opening',
        shots: [makeShot({ id: 's01-opening' })],
        workflowNodes,
      },
    })

    const nodeItems = wrapper.findAll('.story-panel__workflow-node')
    expect(nodeItems.length).toBe(1)
    expect(nodeItems[0]!.text()).toContain('Generate opening')
  })

  it('renders run history filtered to the selected shot', () => {
    const runs = [
      makeRun({ id: 'run-1', shotId: 's01-opening', status: 'completed' }),
      makeRun({ id: 'run-2', shotId: 's02', status: 'failed' }),
    ]

    const wrapper = mount(ProjectWorkspaceStoryPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: {
        bible: makeBible(),
        episodes: [makeEpisode()],
        currentEpisodeId: 'ep_001',
        currentShotId: 's01-opening',
        shots: [makeShot({ id: 's01-opening' })],
        runs,
      },
    })

    const runItems = wrapper.findAll('.story-panel__run')
    expect(runItems.length).toBe(1)
    expect(runItems[0]!.text()).toContain('run-1')
  })
})
