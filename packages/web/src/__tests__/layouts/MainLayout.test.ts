import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MainLayout from '../../layouts/MainLayout.vue'
import { useAuthStore } from '../../stores/auth'

describe('MainLayout', () => {
  it('mounts without error', () => {
    const wrapper = mount(MainLayout)
    expect(wrapper.exists()).toBe(true)
  })

  it('renders QLayout with correct view prop', () => {
    const wrapper = mount(MainLayout)
    const layout = wrapper.findComponent({ name: 'QLayout' })
    expect(layout.exists()).toBe(true)
    expect(layout.props('view')).toBe('lHh Lpr lFf')
  })

  it('renders QHeader', () => {
    const wrapper = mount(MainLayout)
    const header = wrapper.findComponent({ name: 'QHeader' })
    expect(header.exists()).toBe(true)
  })

  it('renders QDrawer', () => {
    const wrapper = mount(MainLayout)
    const drawer = wrapper.findComponent({ name: 'QDrawer' })
    expect(drawer.exists()).toBe(true)
  })

  it('renders QPageContainer with router-view', () => {
    const wrapper = mount(MainLayout)
    const container = wrapper.findComponent({ name: 'QPageContainer' })
    expect(container.exists()).toBe(true)
  })

  it('drawer has 4 default nav items: 项目, 资产, Prompt, 设置', () => {
    const wrapper = mount(MainLayout)
    const items = wrapper.findAll('.nav-item')
    const labels = items.map(
      (i) => i.findAll('.q-item__section').at(1)?.text() ?? '',
    )
    expect(labels).toEqual(['项目', '资产', 'Prompt', '设置'])
  })

  it('drawer shows 管理 item when user is admin', () => {
    const auth = useAuthStore()
    auth.setAuth('token', { id: '1', username: 'admin', email: 'admin@test.com', role: 'admin' })
    const wrapper = mount(MainLayout)
    const items = wrapper.findAll('.nav-item')
    const labels = items.map(
      (i) => i.findAll('.q-item__section').at(1)?.text() ?? '',
    )
    expect(labels).toContain('管理')
  })

  it('header toolbar title shows openimago branding', () => {
    const wrapper = mount(MainLayout)
    const title = wrapper.find('.q-toolbar__title')
    expect(title.exists()).toBe(true)
    expect(title.text()).toBe('openimago')
  })
})
