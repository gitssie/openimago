import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import MainLayout from '../../layouts/MainLayout.vue'
import { useAuthStore } from '../../stores/auth'
import routes from '../../router/routes'

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

  it('drawer has default nav items', () => {
    const wrapper = mount(MainLayout)
    const items = wrapper.findAll('.nav-item')
    const labels = items.map(
      (i) => i.findAll('.q-item__section').at(1)?.text() ?? '',
    )
    expect(labels).toEqual(['项目', 'Prompt', '工作台', '资产', '用户', '统计', '设置'])
  })

  it('links the workspace navigation item to sessions entry', async () => {
    const router = createRouter({ history: createWebHistory(), routes })
    await router.push('/projects')
    await router.isReady()
    const wrapper = mount(MainLayout, { global: { plugins: [router], stubs: { RouterView: true } } })
    const workspaceItem = wrapper.findAll('.nav-item').find((item) => item.text().includes('工作台'))

    expect(workspaceItem?.attributes('href')).toBe('/sessions')
  })

  it('keeps user navigation visible when user is admin', () => {
    const auth = useAuthStore()
    auth.setAuth('token', { id: '1', username: 'admin', email: 'admin@test.com', role: 'admin' })
    const wrapper = mount(MainLayout)
    const items = wrapper.findAll('.nav-item')
    const labels = items.map(
      (i) => i.findAll('.q-item__section').at(1)?.text() ?? '',
    )
    expect(labels).toContain('用户')
  })

  it('header toolbar title shows current page title', () => {
    const wrapper = mount(MainLayout)
    const title = wrapper.find('.q-toolbar__title')
    expect(title.exists()).toBe(true)
    expect(title.text()).toBe('项目')
  })
})
