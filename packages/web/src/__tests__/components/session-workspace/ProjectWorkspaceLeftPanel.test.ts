import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { type Plugin } from 'vue'
import { QPage, QBtn, QIcon } from 'quasar'
import ProjectWorkspaceLeftPanel, { type StoryboardScene } from '../../../components/session-workspace/ProjectWorkspaceLeftPanel.vue'
import OiIcon from '../../../components/ui/OiIcon.vue'

// ── Quasar plugin stub ──────────────────────────────────────────────────────────

const QUASAR_COMPONENTS = { QPage, QBtn, QIcon }

const mockQuasarPlugin: Plugin = {
  install(app) {
    for (const [name, component] of Object.entries(QUASAR_COMPONENTS)) {
      app.component(name, component)
    }
  },
}

// ── Test data ───────────────────────────────────────────────────────────────────

function makeScene(overrides: Partial<StoryboardScene> = {}): StoryboardScene {
  return {
    id: overrides.id ?? 'scene-1',
    title: overrides.title ?? '场景 01',
    description: overrides.description ?? '戴黑框眼镜，性格内向',
    thumbnails: overrides.thumbnails ?? [],
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ProjectWorkspaceLeftPanel — storyboard', () => {
  it('renders scene list when scenes prop is provided', () => {
    const scenes: StoryboardScene[] = [
      makeScene({ id: 's1', title: '场景 01', description: '描述一' }),
      makeScene({ id: 's2', title: '场景 02', description: '描述二' }),
    ]

    const wrapper = mount(ProjectWorkspaceLeftPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: { scenes },
    })

    const sceneCards = wrapper.findAll('.scene-card')
    expect(sceneCards.length).toBe(2)
    expect(sceneCards[0]!.find('.scene-card__title').text()).toBe('场景 01')
    expect(sceneCards[1]!.find('.scene-card__title').text()).toBe('场景 02')
  })

  it('highlights active scene card', () => {
    const scenes: StoryboardScene[] = [
      makeScene({ id: 's1', title: '场景 01' }),
      makeScene({ id: 's2', title: '场景 02' }),
    ]

    const wrapper = mount(ProjectWorkspaceLeftPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: { scenes, selectedId: 's2' },
    })

    const sceneCards = wrapper.findAll('.scene-card')
    expect(sceneCards[1]!.classes()).toContain('scene-card--active')
    expect(sceneCards[0]!.classes()).not.toContain('scene-card--active')
  })

  it('emits scene-select when a scene card head is clicked', async () => {
    const scenes: StoryboardScene[] = [
      makeScene({ id: 's1', title: '场景 01' }),
    ]

    const wrapper = mount(ProjectWorkspaceLeftPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: { scenes },
    })

    await wrapper.find('.scene-card__head').trigger('click')
    expect(wrapper.emitted('scene-select')).toBeTruthy()
    expect(wrapper.emitted('scene-select')![0]).toEqual(['s1'])
  })

  it('emits add-scene when the footer add button is clicked', async () => {
    const wrapper = mount(ProjectWorkspaceLeftPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: { scenes: [] },
    })

    await wrapper.find('.left-panel__add-scene').trigger('click')
    expect(wrapper.emitted('add-scene')).toBeTruthy()
  })

  it('shows empty state when no scenes exist', () => {
    const wrapper = mount(ProjectWorkspaceLeftPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: { scenes: [] },
    })

    expect(wrapper.find('.left-panel__empty').exists()).toBe(true)
    expect(wrapper.find('.left-panel__empty').text()).toContain('暂无场景')
  })
})

// Re-export OiIcon so test files that transitively import it still work.
export { OiIcon }
