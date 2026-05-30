import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import { h, defineComponent, type Component } from 'vue'
import { QLayout, QPageContainer } from 'quasar'
import routes from '../../router/routes'
import PromptsPage from '../../pages/PromptsPage.vue'

vi.mock('../../api/client', () => ({
  api: {
    listPrompts: vi.fn().mockResolvedValue([]),
    createPrompt: vi.fn(),
    deletePrompt: vi.fn(),
  },
}))

const StubOiIcon = defineComponent({
  props: { name: String, size: [String, Number] },
  template: '<span class="oi-icon-stub">{{ name }}</span>',
})

function mountPage(component: Component, opts?: Parameters<typeof mount>[1]) {
  const Wrapper = defineComponent({
    components: { QLayout, QPageContainer },
    setup() {
      return () => h(QLayout, { view: 'hHh Lpr fFf' }, () =>
        h(QPageContainer, () => h(component)),
      )
    },
  })
  return mount(Wrapper, {
    global: {
      stubs: { OiIcon: StubOiIcon, RouterView: { template: '<div />' } },
      ...opts?.global,
    },
  })
}

describe('PromptsPage — 技能与风格', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders page title "技能与风格"', async () => {
    const wrapper = mountPage(PromptsPage, {
      global: { plugins: [createRouter({ history: createWebHashHistory(), routes })] },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('技能与风格')
    expect(wrapper.text()).toContain('创意技能')
  })

  it('renders create dialog with updated title', async () => {
    const wrapper = mountPage(PromptsPage, {
      global: { plugins: [createRouter({ history: createWebHashHistory(), routes })] },
    })
    await flushPromises()

    // Open create dialog
    await wrapper.find('.create-btn').trigger('click')
    await wrapper.vm.$nextTick()

    // QDialog teleports, check document
    const dialog = document.querySelector('.prompt-dialog')
    expect(dialog?.textContent).toContain('新建技能与风格')
  })
})
