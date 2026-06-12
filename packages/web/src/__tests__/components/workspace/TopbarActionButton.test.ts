import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { type Plugin } from 'vue'
import { QPage, QBtn, QIcon } from 'quasar'
import TopbarActionButton from '../../../components/workspace/TopbarActionButton.vue'

const QUASAR_COMPONENTS = { QPage, QBtn, QIcon }

const mockQuasarPlugin: Plugin = {
  install(app) {
    for (const [name, component] of Object.entries(QUASAR_COMPONENTS)) {
      app.component(name, component)
    }
  },
}

describe('TopbarActionButton', () => {
  it('mounts with default variant', () => {
    const wrapper = mount(TopbarActionButton, {
      global: { plugins: [mockQuasarPlugin] },
      props: { label: 'Test' },
    })
    expect(wrapper.exists()).toBe(true)
  })

  it('uses the label as accessible name when not icon-only', () => {
    const wrapper = mount(TopbarActionButton, {
      global: { plugins: [mockQuasarPlugin] },
      props: { label: 'Open Community' },
    })
    expect(wrapper.attributes('aria-label')).toBe('Open Community')
  })

  it('renders the pro variant with purple gradient', () => {
    const wrapper = mount(TopbarActionButton, {
      global: { plugins: [mockQuasarPlugin] },
      props: { variant: 'pro', label: '升级到 Pro' },
      slots: { default: '升级到 Pro' },
    })
    expect(wrapper.classes()).toContain('topbar-action-pro')
    expect(wrapper.text()).toContain('升级到 Pro')
  })

  it('renders the bell variant as icon-only with badge', () => {
    const wrapper = mount(TopbarActionButton, {
      global: { plugins: [mockQuasarPlugin] },
      props: { variant: 'bell', label: '通知', iconOnly: true, badge: true },
    })
    expect(wrapper.classes()).toContain('topbar-action-bell')
    // The badge is rendered as a child span inside the button — it appears
    // even when the slot is empty, but the class check needs the wrapper's
    // own template to render the badge span (which it does unconditionally
    // when the badge prop is true).
    const badge = wrapper.find('.topbar-action__badge')
    expect(badge.exists()).toBe(true)
  })

  it('emits click event when activated', async () => {
    const wrapper = mount(TopbarActionButton, {
      global: { plugins: [mockQuasarPlugin] },
      props: { label: 'Test' },
    })
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toBeTruthy()
  })
})
