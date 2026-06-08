import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { h, defineComponent, type Plugin } from 'vue'
import { QPage, QBtn, QIcon, QSpinnerDots, QTooltip, QItem, QItemSection, QItemLabel, QList } from 'quasar'
import ProjectWorkspaceGrid, {
  type ShotOutputItem,
  type StoryElement,
  type SessionCardItem,
} from '../../../components/session-workspace/ProjectWorkspaceGrid.vue'

// ── Quasar plugin stub ──────────────────────────────────────────────────────────

const QUASAR_COMPONENTS = { QPage, QBtn, QIcon, QSpinnerDots, QTooltip, QItem, QItemSection, QItemLabel, QList }

const mockQuasarPlugin: Plugin = {
  install(app) {
    for (const [name, component] of Object.entries(QUASAR_COMPONENTS)) {
      app.component(name, component)
    }
  },
}

// ── Test data ───────────────────────────────────────────────────────────────────

function makeSessionCard(overrides: Partial<SessionCardItem> = {}): SessionCardItem {
  return {
    id: overrides.id ?? 'session-1',
    title: overrides.title ?? '测试会话',
    preview: overrides.preview ?? '最后一条消息预览...',
    timeLabel: overrides.timeLabel ?? '3 分钟前',
    clockLabel: overrides.clockLabel ?? '14:30',
    meta: overrides.meta ?? '对话工作流',
    active: overrides.active ?? false,
  }
}

function makeOutput(overrides: Partial<ShotOutputItem> = {}): ShotOutputItem {
  return {
    id: overrides.id ?? 'output-1',
    url: overrides.url ?? 'https://example.com/img.png',
    filename: overrides.filename ?? 'output.png',
    kind: overrides.kind ?? 'image',
    timeLabel: overrides.timeLabel ?? '刚刚',
    promptText: overrides.promptText ?? 'A test prompt',
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ProjectWorkspaceGrid — left panel sessions', () => {
  it('renders session list when sessions prop is provided', () => {
    const sessions: SessionCardItem[] = [
      makeSessionCard({ id: 's1', title: '会话一', preview: '预览一', active: false }),
      makeSessionCard({ id: 's2', title: '会话二', preview: '预览二', active: true }),
    ]

    const wrapper = mount(ProjectWorkspaceGrid, {
      global: { plugins: [mockQuasarPlugin] },
      props: {
        projectName: '测试项目',
        projectStatus: 'active',
        sessions,
        activeSessionId: 's2',
      },
    })

    // The left panel should show the session section title
    const leftPanel = wrapper.find('.grid-column--left')
    expect(leftPanel.exists()).toBe(true)

    // Should show session group header with "会话" title
    expect(leftPanel.find('.session-group__title').text()).toContain('会话')

    // Should render session cards
    const sessionCards = leftPanel.findAll('.session-card')
    expect(sessionCards.length).toBe(2)

    // First card shows session title
    expect(sessionCards[0]!.find('.session-card__title').text()).toBe('会话一')
    // Second card shows session title
    expect(sessionCards[1]!.find('.session-card__title').text()).toBe('会话二')
  })

  it('highlights active session card', () => {
    const sessions: SessionCardItem[] = [
      makeSessionCard({ id: 's1', title: '会话一', active: false }),
      makeSessionCard({ id: 's2', title: '会话二', active: true }),
    ]

    const wrapper = mount(ProjectWorkspaceGrid, {
      global: { plugins: [mockQuasarPlugin] },
      props: {
        projectName: '测试项目',
        projectStatus: 'active',
        sessions,
        activeSessionId: 's2',
      },
    })

    const sessionCards = wrapper.findAll('.session-card')
    expect(sessionCards[1]!.classes()).toContain('session-card--active')
    expect(sessionCards[0]!.classes()).not.toContain('session-card--active')
  })

  it('emits session-select when a session card is clicked', async () => {
    const sessions: SessionCardItem[] = [
      makeSessionCard({ id: 's1', title: '会话一' }),
    ]

    const wrapper = mount(ProjectWorkspaceGrid, {
      global: { plugins: [mockQuasarPlugin] },
      props: {
        projectName: '测试项目',
        projectStatus: 'active',
        sessions,
        activeSessionId: null,
      },
    })

    await wrapper.find('.session-card').trigger('click')
    expect(wrapper.emitted('session-select')).toBeTruthy()
    expect(wrapper.emitted('session-select')![0]).toEqual(['s1'])
  })

  it('emits session-create when "新建会话" button is clicked', async () => {
    const wrapper = mount(ProjectWorkspaceGrid, {
      global: { plugins: [mockQuasarPlugin] },
      props: {
        projectName: '测试项目',
        projectStatus: 'active',
        sessions: [],
        activeSessionId: null,
      },
    })

    const createBtn = wrapper.find('.session-create-btn')
    expect(createBtn.exists()).toBe(true)

    await createBtn.trigger('click')
    expect(wrapper.emitted('session-create')).toBeTruthy()
  })

  it('shows empty state when no sessions exist', () => {
    const wrapper = mount(ProjectWorkspaceGrid, {
      global: { plugins: [mockQuasarPlugin] },
      props: {
        projectName: '测试项目',
        projectStatus: 'active',
        sessions: [],
        activeSessionId: null,
      },
    })

    expect(wrapper.find('.session-list-empty').exists()).toBe(true)
    expect(wrapper.find('.session-list-empty').text()).toContain('暂无会话')
  })

  it('still renders story elements as secondary section below sessions', async () => {
    const storyElements: StoryElement[] = [
      { id: 'el-1', title: '场景一', preview: '', thumbnailUrl: null, kind: 'scene', syncState: 'synced' },
    ]

    const wrapper = mount(ProjectWorkspaceGrid, {
      global: { plugins: [mockQuasarPlugin] },
      props: {
        projectName: '测试项目',
        projectStatus: 'active',
        sessions: [makeSessionCard()],
        activeSessionId: null,
        storyElements,
      },
    })

    // Story elements section should exist as secondary content (toggle header always visible)
    expect(wrapper.find('.elements-section').exists()).toBe(true)

    // Expand the story elements section
    await wrapper.find('.elements-section__toggle').trigger('click')

    // Element groups now render after expand
    expect(wrapper.find('.element-group').exists()).toBe(true)
  })
})
