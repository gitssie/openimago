import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AuthPage from '../../pages/AuthPage.vue'

describe('AuthPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function mountAuth() {
    return mount(AuthPage, {
      global: {
        stubs: {
          'q-page': {
            template: '<div class="q-page-stub"><slot /></div>',
          },
          'router-link': true,
        },
      },
    })
  }

  it('renders login form with email and password inputs', () => {
    const wrapper = mountAuth()
    expect(wrapper.text()).toContain('Email address')
    expect(wrapper.text()).toContain('Password')
  })

  it('renders OAuth section', () => {
    const wrapper = mountAuth()
    expect(wrapper.text()).toContain('第三方登录')
  })

  it('shows title openimago', () => {
    const wrapper = mountAuth()
    expect(wrapper.text()).toContain('openimago')
  })

  it('switches to register tab and shows username field', async () => {
    const wrapper = mountAuth()
    // Find the register tab button and click it
    const tabs = wrapper.findAll('.q-tab')
    expect(tabs.length).toBe(2)
    if (tabs[1]) await tabs[1].trigger('click')
    expect(wrapper.text()).toContain('Username')
  })
})
