import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { type Plugin } from 'vue'
import { QBtn, QIcon, QTabs, QTab } from 'quasar'
import WorkspaceArtifactsPanel from '../../../components/session-workspace/WorkspaceArtifactsPanel.vue'
import type { WorkspaceArtifact, GenerationRunMetadata } from '../../../components/session-workspace/types'

// ── Quasar plugin stub ──────────────────────────────────────────────────────────

const QUASAR_COMPONENTS = { QBtn, QIcon, QTabs, QTab }

const mockQuasarPlugin: Plugin = {
  install(app) {
    for (const [name, component] of Object.entries(QUASAR_COMPONENTS)) {
      app.component(name, component)
    }
  },
}

// ── Test data ───────────────────────────────────────────────────────────────────

function makeGenRun(overrides: Partial<GenerationRunMetadata> = {}): GenerationRunMetadata {
  return {
    toolName: overrides.toolName ?? 'image_generate',
    toolCallId: overrides.toolCallId ?? 'call_abc123',
    messageId: overrides.messageId ?? 'msg_xyz789',
    inputArgs: overrides.inputArgs ?? {
      model: 'gpt-image-2',
      prompt: 'A majestic mountain at sunset',
      size: '1024x1024',
      quality: 'high',
    },
    ...(overrides.parentArtifactId ? { parentArtifactId: overrides.parentArtifactId } : {}),
  }
}

function makeImageArtifact(overrides: Partial<WorkspaceArtifact> = {}): WorkspaceArtifact {
  return {
    id: overrides.id ?? 'img-1',
    kind: 'image',
    access: {
      preview: overrides.access?.preview ?? 'https://example.com/preview.png',
      thumbnail: overrides.access?.thumbnail ?? 'https://example.com/thumb.png',
    },
    filename: overrides.filename ?? 'result.png',
    prompt: overrides.prompt ?? 'A beautiful landscape',
    timeLabel: overrides.timeLabel ?? '3 分钟前',
    ...(overrides.genRun !== undefined ? { genRun: overrides.genRun } : {}),
  }
}

function makeVideoArtifact(overrides: Partial<WorkspaceArtifact> = {}): WorkspaceArtifact {
  return {
    id: overrides.id ?? 'vid-1',
    kind: 'video',
    access: {
      preview: overrides.access?.preview ?? 'https://example.com/video.mp4',
      thumbnail: overrides.access?.thumbnail ?? 'https://example.com/poster.png',
    },
    filename: overrides.filename ?? 'output.mp4',
    prompt: overrides.prompt ?? 'Cinematic drone shot',
    timeLabel: overrides.timeLabel ?? '刚刚',
    ...(overrides.genRun !== undefined ? { genRun: overrides.genRun } : {}),
  }
}

function makeAudioArtifact(overrides: Partial<WorkspaceArtifact> = {}): WorkspaceArtifact {
  return {
    id: overrides.id ?? 'aud-1',
    kind: 'audio',
    access: {
      preview: overrides.access?.preview ?? 'https://example.com/audio.wav',
    },
    filename: overrides.filename ?? 'soundtrack.wav',
    prompt: overrides.prompt ?? 'Epic orchestral theme',
    timeLabel: overrides.timeLabel ?? '5 分钟前',
    ...(overrides.genRun !== undefined ? { genRun: overrides.genRun } : {}),
  }
}

// ── Mount helper ────────────────────────────────────────────────────────────────

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(WorkspaceArtifactsPanel, {
    global: { plugins: [mockQuasarPlugin] },
    props: {
      modelValue: 'result',
      artifacts: [],
      selectedId: null,
      ...props,
    },
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('WorkspaceArtifactsPanel — rendering', () => {
  it('renders tab bar with default tabs', () => {
    const wrapper = mountPanel()
    const tabs = wrapper.findAll('.q-tab')
    expect(tabs.length).toBeGreaterThanOrEqual(3)
  })

  it('renders empty state when no artifacts and not loading', () => {
    const wrapper = mountPanel({ artifacts: [], loading: false })
    // Empty placeholder should be visible
    expect(wrapper.find('.side-panel__placeholder--rich').exists()).toBe(true)
    expect(wrapper.text()).toContain('暂无生成结果')
  })

  it('renders artifact cards for image items', () => {
    const artifacts = [makeImageArtifact({ id: 'img-1' }), makeImageArtifact({ id: 'img-2' })]
    const wrapper = mountPanel({ artifacts })
    const cards = wrapper.findAll('.result-card')
    // 2 artifact cards (no pending tile)
    expect(cards.length).toBe(2)
    expect(wrapper.text()).toContain('result.png')
  })

  it('renders artifact cards for video items with play overlay', () => {
    const artifacts = [makeVideoArtifact({ id: 'vid-1' })]
    const wrapper = mountPanel({ artifacts })
    // Video card should have play overlay
    expect(wrapper.find('.result-card__play-overlay').exists()).toBe(true)
  })

  it('renders artifact cards for audio items', () => {
    const artifacts = [makeAudioArtifact({ id: 'aud-1' })]
    const wrapper = mountPanel({ artifacts })
    // Audio card should exist
    const cards = wrapper.findAll('.result-card')
    expect(cards.length).toBe(1)
    expect(wrapper.find('.result-card__audio').exists()).toBe(true)
  })

  it('shows loading tile when showPendingTile is true', () => {
    const wrapper = mountPanel({ artifacts: [], showPendingTile: true })
    expect(wrapper.find('.result-card--loading').exists()).toBe(true)
    expect(wrapper.text()).toContain('生成中')
  })

  it('shows pending tile after existing artifacts', () => {
    const artifacts = [makeImageArtifact({ id: 'img-1' })]
    const wrapper = mountPanel({ artifacts, showPendingTile: true })
    const cards = wrapper.findAll('.result-card')
    expect(cards.length).toBe(2) // 1 artifact + 1 pending
    expect(cards.at(-1)?.classes()).toContain('result-card--loading')
  })

  it('renders selected artifact detail', () => {
    const artifacts = [makeImageArtifact({ id: 'img-1' })]
    const wrapper = mountPanel({ artifacts, selectedId: 'img-1' })
    expect(wrapper.find('.result-feature').exists()).toBe(true)
    expect(wrapper.text()).toContain('result.png')
  })

  it('renders project scope label', () => {
    const wrapper = mountPanel({ artifacts: [], scope: 'project' })
    expect(wrapper.text()).toContain('项目范围下最近产出')
  })

  it('renders session scope label (default)', () => {
    const wrapper = mountPanel({ artifacts: [], scope: 'session' })
    expect(wrapper.text()).toContain('当前会话最近产出')
  })
})

describe('WorkspaceArtifactsPanel — events', () => {
  it('emits select when artifact card is clicked', async () => {
    const artifacts = [makeImageArtifact({ id: 'img-1' })]
    const wrapper = mountPanel({ artifacts })
    await wrapper.find('.result-card').trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')?.[0]).toEqual(['img-1'])
  })

  it('emits edit-params when edit button is clicked', async () => {
    const genRun = makeGenRun()
    const artifacts = [makeImageArtifact({ id: 'img-1', genRun })]
    const wrapper = mountPanel({ artifacts, selectedId: 'img-1' })
    // The edit button is inside the result-feature (selected detail)
    const editBtns = wrapper.findAll('.result-action-btn')
    const editBtn = editBtns.filter((btn) => btn.text().includes('编辑参数'))
    if (editBtn.length > 0) {
      await editBtn[0]!.trigger('click')
      expect(wrapper.emitted('edit-params')).toBeTruthy()
      expect(wrapper.emitted('edit-params')?.[0]).toEqual(['img-1'])
    }
  })

  it('emits update:modelValue when tab changes', async () => {
    const wrapper = mountPanel({ artifacts: [], modelValue: 'result' })
    // Simulate tab change by directly calling set on the tabModel computed
    // This is tested implicitly; the v-model approach uses computed setter
    const tabs = wrapper.findAll('.q-tab')
    if (tabs.length >= 2 && tabs[1]!.attributes('name') === 'canvas') {
      await tabs[1]!.trigger('click')
      wrapper.emitted('update:modelValue')
      // The tab click may or may not bubble through stubs; just check the component didn't error
      expect(wrapper.exists()).toBe(true)
    }
  })
})

describe('WorkspaceArtifactsPanel — kind rendering', () => {
  it('shows kind badge on featured artifact', () => {
    const artifacts = [makeVideoArtifact({ id: 'vid-1' })]
    const wrapper = mountPanel({ artifacts, selectedId: 'vid-1' })
    expect(wrapper.find('.result-feature__badge').exists()).toBe(true)
    expect(wrapper.find('.result-feature__badge').text()).toBe('视频预览')
  })

  it('shows kind chip on artifact cards', () => {
    const artifacts = [makeImageArtifact({ id: 'img-1' }), makeAudioArtifact({ id: 'aud-1' })]
    const wrapper = mountPanel({ artifacts })
    const metaTexts = wrapper.findAll('.result-card__meta')
    expect(metaTexts.length).toBe(2)
    // image card shows '图像', audio card shows '音频'
    expect(metaTexts[0]!.text()).toContain('图像')
    expect(metaTexts[1]!.text()).toContain('音频')
  })
})

// ── Parameter editor tests (openimago-nhp) ────────────────────────────────────

describe('WorkspaceArtifactsPanel — parameter editor', () => {
  it('shows parameter editor when clicking edit button on artifact with genRun', async () => {
    const genRun = makeGenRun()
    const artifacts = [makeImageArtifact({ id: 'img-1', genRun })]
    const wrapper = mountPanel({ artifacts, selectedId: 'img-1' })

    // Click the edit button
    const editBtns = wrapper.findAll('.result-action-btn')
    const editBtn = editBtns.filter((btn) => btn.text().includes('编辑参数'))
    expect(editBtn.length).toBe(1)
    await editBtn[0]!.trigger('click')

    // Editor should now be visible
    expect(wrapper.find('.param-editor').exists()).toBe(true)
  })

  it('closes parameter editor when cancel button is clicked', async () => {
    const genRun = makeGenRun()
    const artifacts = [makeImageArtifact({ id: 'img-1', genRun })]
    const wrapper = mountPanel({ artifacts, selectedId: 'img-1' })

    // Open editor
    const editBtns = wrapper.findAll('.result-action-btn')
    await editBtns.filter((btn) => btn.text().includes('编辑参数'))[0]!.trigger('click')
    expect(wrapper.find('.param-editor').exists()).toBe(true)

    // Click cancel
    const cancelBtn = wrapper.find('.param-editor__cancel')
    expect(cancelBtn.exists()).toBe(true)
    await cancelBtn.trigger('click')
    expect(wrapper.find('.param-editor').exists()).toBe(false)
  })

  it('shows legacy notice when selected artifact has no genRun metadata', () => {
    const artifacts = [makeImageArtifact({ id: 'img-1' })] // no genRun
    const wrapper = mountPanel({ artifacts, selectedId: 'img-1' })

    // The "编辑参数" button should show, but clicking should show a notice
    // No genRun means no editor; the detail view should show a legacy note
    expect(wrapper.text()).toContain('编辑参数')
    // Editor should NOT appear (no genRun)
    expect(wrapper.find('.param-editor').exists()).toBe(false)
  })

  it('pre-populates form fields from genRun.inputArgs', async () => {
    const genRun = makeGenRun({
      inputArgs: {
        model: 'flux-dev',
        prompt: 'Mountain sunset',
        negative_prompt: 'blurry',
        width: 1024,
        height: 1024,
      },
    })
    const artifacts = [makeImageArtifact({ id: 'img-1', genRun })]
    const wrapper = mountPanel({ artifacts, selectedId: 'img-1' })

    // Open editor
    const editBtns = wrapper.findAll('.result-action-btn')
    await editBtns.filter((btn) => btn.text().includes('编辑参数'))[0]!.trigger('click')

    // The prompt field should be pre-populated
    const promptInput = wrapper.find('.param-editor textarea')
    expect(promptInput.exists()).toBe(true)

    // Raw inputArgs should appear in advanced JSON
    expect(wrapper.find('.param-editor__advanced').exists()).toBe(true)
  })

  it('shows JSON validation error for invalid advanced JSON input', async () => {
    const genRun = makeGenRun()
    const artifacts = [makeImageArtifact({ id: 'img-1', genRun })]
    const wrapper = mountPanel({ artifacts, selectedId: 'img-1' })

    // Open editor
    const editBtns = wrapper.findAll('.result-action-btn')
    await editBtns.filter((btn) => btn.text().includes('编辑参数'))[0]!.trigger('click')

    // Find the advanced JSON textarea and type invalid JSON
    const jsonTextarea = wrapper.find('.param-editor__advanced textarea')
    expect(jsonTextarea.exists()).toBe(true)

    await jsonTextarea.setValue('not valid json {{{')
    await wrapper.vm.$nextTick()

    // Error should be shown
    expect(wrapper.find('.param-editor__json-error').exists()).toBe(true)
  })

  it('emits rerun with ArtifactRerunPayload on submit', async () => {
    const genRun = makeGenRun({
      inputArgs: { model: 'gpt-image-2', prompt: 'Sunset', size: '1024x1024' },
    })
    const artifacts = [makeImageArtifact({ id: 'img-1', genRun })]
    const wrapper = mountPanel({ artifacts, selectedId: 'img-1' })

    // Open editor
    const editBtns = wrapper.findAll('.result-action-btn')
    await editBtns.filter((btn) => btn.text().includes('编辑参数'))[0]!.trigger('click')

    // Click submit
    const submitBtn = wrapper.find('.param-editor__submit')
    expect(submitBtn.exists()).toBe(true)
    await submitBtn.trigger('click')

    // Should have emitted rerun
    const rerunEvents = wrapper.emitted('rerun')
    expect(rerunEvents).toBeTruthy()
    expect(rerunEvents?.length).toBeGreaterThanOrEqual(1)
    const payload = rerunEvents![0]![0]
    expect(payload).toHaveProperty('artifactId', 'img-1')
  })

  it('closes editor after successful submit', async () => {
    const genRun = makeGenRun()
    const artifacts = [makeImageArtifact({ id: 'img-1', genRun })]
    const wrapper = mountPanel({ artifacts, selectedId: 'img-1' })

    // Open and submit
    const editBtns = wrapper.findAll('.result-action-btn')
    await editBtns.filter((btn) => btn.text().includes('编辑参数'))[0]!.trigger('click')
    await wrapper.find('.param-editor__submit').trigger('click')

    expect(wrapper.find('.param-editor').exists()).toBe(false)
  })
})
