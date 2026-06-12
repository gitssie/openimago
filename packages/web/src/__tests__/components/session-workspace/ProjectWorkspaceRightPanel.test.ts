import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { type Plugin } from 'vue'
import { QPage, QBtn, QIcon } from 'quasar'
import ProjectWorkspaceRightPanel from '../../../components/session-workspace/ProjectWorkspaceRightPanel.vue'
import type { AIOutputItem } from '../../../components/session-workspace/types'

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

function makeOutput(overrides: Partial<AIOutputItem> = {}): AIOutputItem {
  return {
    id: overrides.id ?? 'output-1',
    url: overrides.url ?? 'https://example.com/img.png',
    filename: overrides.filename ?? 'output.png',
    kind: overrides.kind ?? 'image',
    timeLabel: overrides.timeLabel ?? '刚刚',
    ...(overrides.prompt !== undefined ? { prompt: overrides.prompt } : {}),
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ProjectWorkspaceRightPanel — AI outputs', () => {
  it('shows empty state when no items are provided', () => {
    const wrapper = mount(ProjectWorkspaceRightPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: { items: [] },
    })

    expect(wrapper.find('.ai-outputs__empty').exists()).toBe(true)
    expect(wrapper.find('.ai-outputs__empty').text()).toContain('AI 生成的结果将出现在这里')
  })

  it('renders an image card for image items', () => {
    const items: AIOutputItem[] = [
      makeOutput({ id: 'o1', kind: 'image', url: 'https://example.com/img.png', filename: 'shot.png' }),
    ]

    const wrapper = mount(ProjectWorkspaceRightPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: { items },
    })

    const img = wrapper.find('.ai-outputs__image')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('https://example.com/img.png')
  })

  it('emits item-select when an image card is clicked', async () => {
    const items: AIOutputItem[] = [
      makeOutput({ id: 'o1', kind: 'image' }),
    ]

    const wrapper = mount(ProjectWorkspaceRightPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: { items },
    })

    await wrapper.find('.ai-outputs__card').trigger('click')
    expect(wrapper.emitted('item-select')).toBeTruthy()
    expect(wrapper.emitted('item-select')![0]).toEqual(['o1'])
  })

  it('marks the active card when selectedId matches', () => {
    const items: AIOutputItem[] = [
      makeOutput({ id: 'o1' }),
      makeOutput({ id: 'o2' }),
    ]

    const wrapper = mount(ProjectWorkspaceRightPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: { items, selectedId: 'o2' },
    })

    const cards = wrapper.findAll('.ai-outputs__card')
    expect(cards[1]!.classes()).toContain('ai-outputs__card-on')
    expect(cards[0]!.classes()).not.toContain('ai-outputs__card-on')
  })

  it('renders the "AI 产出" title by default', () => {
    const wrapper = mount(ProjectWorkspaceRightPanel, {
      global: { plugins: [mockQuasarPlugin] },
      props: { items: [] },
    })

    expect(wrapper.find('.ai-outputs__title').text()).toBe('AI 产出')
  })
})
