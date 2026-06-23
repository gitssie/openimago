import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { type Plugin } from 'vue'
import { QPage, QBtn, QIcon } from 'quasar'
import ProjectWorkspaceLeftPanel from '../../../components/session-workspace/ProjectWorkspaceLeftPanel.vue'
import OiIcon from '../../../components/ui/OiIcon.vue'
import type {
  ElementCardVM,
  ShotCardVM,
  AudioCardVM,
} from '../../../components/session-workspace/left-panel/types'

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

function element(over: Partial<ElementCardVM> = {}): ElementCardVM {
  return {
    id: 'el-1',
    kind: 'character',
    title: '凯',
    description: '街头赛车手',
    thumbnails: [],
    ...over,
  }
}

function shot(over: Partial<ShotCardVM> = {}): ShotCardVM {
  return {
    id: 'shot-1',
    title: '镜头 01',
    characters: [],
    description: '开场镜头',
    media: [],
    ...over,
  }
}

function track(over: Partial<AudioCardVM> = {}): AudioCardVM {
  return {
    id: 'audio-1',
    title: '主题 BGM',
    description: '合成器音床',
    thumbnails: [],
    ...over,
  }
}

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(ProjectWorkspaceLeftPanel, {
    global: { plugins: [mockQuasarPlugin] },
    props: { elements: [], shots: [], audio: [], ...props },
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ProjectWorkspaceLeftPanel — 3-section accordion', () => {
  it('renders cards for each of the three sections', () => {
    const wrapper = mountPanel({
      elements: [element({ id: 'e1', title: '凯' })],
      shots: [shot({ id: 's1', title: '镜头 01' })],
      audio: [track({ id: 'a1', title: '主题 BGM' })],
    })
    const titles = wrapper.findAll('.card__title').map((n) => n.text())
    expect(titles).toContain('凯')
    expect(titles).toContain('镜头 01')
    expect(titles).toContain('主题 BGM')
  })

  it('shows the per-section empty states when all sections are empty', () => {
    const wrapper = mountPanel()
    const empties = wrapper.findAll('.accordion__empty').map((n) => n.text())
    expect(empties).toEqual(['暂无关键元素', '暂无分镜', '暂无旁白与音乐'])
  })

  it('highlights the active card by selectedId', () => {
    const wrapper = mountPanel({
      shots: [shot({ id: 's1' }), shot({ id: 's2', title: '镜头 02' })],
      selectedId: 's2',
    })
    const cards = wrapper.findAll('.card')
    const active = cards.filter((c) => c.classes().includes('card--active'))
    expect(active).toHaveLength(1)
    expect(active[0]!.find('.card__title').text()).toBe('镜头 02')
  })

  it('emits item-select when a card title is clicked', async () => {
    const wrapper = mountPanel({ shots: [shot({ id: 's1' })] })
    await wrapper.find('.card__title-btn').trigger('click')
    expect(wrapper.emitted('item-select')).toBeTruthy()
    expect(wrapper.emitted('item-select')![0]).toEqual(['s1'])
  })

  it('emits add when the footer add button is clicked', async () => {
    const wrapper = mountPanel({ editable: true })
    await wrapper.find('.left-panel__add-scene').trigger('click')
    expect(wrapper.emitted('add')).toBeTruthy()
  })

  it('emits section-toggle when a section header is toggled', async () => {
    const wrapper = mountPanel()
    await wrapper.findAll('.accordion__toggle')[0]!.trigger('click')
    expect(wrapper.emitted('section-toggle')).toBeTruthy()
    expect(wrapper.emitted('section-toggle')![0]).toEqual(['elements'])
  })
})

// Re-export OiIcon so test files that transitively import it still work.
export { OiIcon }
