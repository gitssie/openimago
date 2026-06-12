import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { type Plugin } from 'vue'
import { QPage, QBtn, QIcon, QSpinnerDots } from 'quasar'
import ProjectWorkspaceGrid from '../../../components/session-workspace/ProjectWorkspaceGrid.vue'
import type { ShotOutputItem } from '../../../components/session-workspace/types'

// ── Quasar plugin stub ──────────────────────────────────────────────────────────

const QUASAR_COMPONENTS = { QPage, QBtn, QIcon, QSpinnerDots }

const mockQuasarPlugin: Plugin = {
  install(app) {
    for (const [name, component] of Object.entries(QUASAR_COMPONENTS)) {
      app.component(name, component)
    }
  },
}

// ── Test data ───────────────────────────────────────────────────────────────────

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

describe('ProjectWorkspaceGrid — center column', () => {
  it('renders the project name as the default tab region label', () => {
    const wrapper = mount(ProjectWorkspaceGrid, {
      global: { plugins: [mockQuasarPlugin] },
      props: { projectName: '测试项目', projectStatus: 'active' },
    })

    // The grid is now a thin wrapper around the center column. The region's
    // aria-label reflects the active tab label rather than the project name
    // (the project title lives in the shared top bar).
    const region = wrapper.find('[role="region"]')
    expect(region.exists()).toBe(true)
    expect(region.attributes('aria-label')).toBe('故事板工作区')
  })

  it('defaults to the storyboard tab on first render', () => {
    const wrapper = mount(ProjectWorkspaceGrid, {
      global: { plugins: [mockQuasarPlugin] },
      props: { projectName: '测试项目', projectStatus: 'active' },
    })

    // The center column's aria-label reflects the active tab.
    const main = wrapper.find('[role="main"]')
    expect(main.attributes('aria-label')).toBe('故事板工作区')
  })

  it('renders the center-session slot inside the storyboard tab', () => {
    const stub = '<div class="chat-view-mock">Chat View Content</div>'

    const wrapper = mount(ProjectWorkspaceGrid, {
      global: { plugins: [mockQuasarPlugin] },
      props: { projectName: '测试项目', projectStatus: 'active' },
      slots: { 'center-session': stub },
    })

    expect(wrapper.find('.chat-view-mock').exists()).toBe(true)
  })

  it('renders the context-strip slot when provided', () => {
    const stub = '<div class="context-strip-mock">Selected scene</div>'

    const wrapper = mount(ProjectWorkspaceGrid, {
      global: { plugins: [mockQuasarPlugin] },
      props: { projectName: '测试项目', projectStatus: 'active' },
      slots: { 'context-strip': stub, 'center-session': '<div class="x" />' },
    })

    expect(wrapper.find('.context-strip-mock').exists()).toBe(true)
  })

  it('shows the empty-state placeholder when no session slot is provided', () => {
    const wrapper = mount(ProjectWorkspaceGrid, {
      global: { plugins: [mockQuasarPlugin] },
      props: { projectName: '测试项目', projectStatus: 'active' },
    })

    expect(wrapper.find('.center-session-empty').exists()).toBe(true)
    expect(wrapper.find('.center-session-empty').text()).toContain('选择左侧场景')
  })

  it('renders the overview pane metrics when storyElements are provided', async () => {
    const wrapper = mount(ProjectWorkspaceGrid, {
      global: { plugins: [mockQuasarPlugin] },
      props: {
        projectName: '测试项目',
        projectStatus: 'active',
        sessionCount: 3,
        fileCount: 7,
        storyElements: [
          { id: 's1', title: '场景一', preview: '', thumbnailUrl: null, kind: 'scene', syncState: 'synced' },
          { id: 's2', title: '场景二', preview: '', thumbnailUrl: null, kind: 'scene', syncState: 'synced' },
        ],
      },
    })

    // Force-jump to the overview tab via the exposed helper.
    const vm = wrapper.vm as unknown as {
      setActiveWorkspaceTab: (tab: string) => void
      getActiveWorkspaceTab: () => string
    }
    vm.setActiveWorkspaceTab('overview')
    await wrapper.vm.$nextTick()

    expect(vm.getActiveWorkspaceTab()).toBe('overview')
    expect(wrapper.find('.tab-pane--overview').exists()).toBe(true)
    const metrics = wrapper.findAll('.overview-metric')
    expect(metrics.length).toBe(4)
  })

  it('emits workspace-tab-change when the parent calls setActiveWorkspaceTab', async () => {
    const wrapper = mount(ProjectWorkspaceGrid, {
      global: { plugins: [mockQuasarPlugin] },
      props: { projectName: '测试项目', projectStatus: 'active' },
    })

    const vm = wrapper.vm as unknown as {
      setActiveWorkspaceTab: (tab: string) => void
    }
    vm.setActiveWorkspaceTab('timeline')
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('workspace-tab-change')).toBeTruthy()
    expect(wrapper.emitted('workspace-tab-change')![0]).toEqual(['timeline'])
  })

  it('renders the timeline placeholder when active', async () => {
    const wrapper = mount(ProjectWorkspaceGrid, {
      global: { plugins: [mockQuasarPlugin] },
      props: { projectName: '测试项目', projectStatus: 'active' },
    })

    const vm = wrapper.vm as unknown as {
      setActiveWorkspaceTab: (tab: string) => void
    }
    vm.setActiveWorkspaceTab('timeline')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.tab-pane--placeholder').exists()).toBe(true)
    expect(wrapper.find('.tab-pane--placeholder').text()).toContain('时间线')
  })

  it('renders a ShotOutputItem list in outputs without erroring', () => {
    const outputs: ShotOutputItem[] = [makeOutput({ id: 'o1' })]
    const wrapper = mount(ProjectWorkspaceGrid, {
      global: { plugins: [mockQuasarPlugin] },
      props: { projectName: '测试项目', projectStatus: 'active', outputs },
    })

    expect(wrapper.find('.project-workspace-grid').exists()).toBe(true)
  })
})
