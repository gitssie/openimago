import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import App from '../../App.vue'
import type { RouteRecordRaw } from 'vue-router'

// Minimal routes for testing
const testRoutes: RouteRecordRaw[] = [
  { path: '/auth', name: 'auth', component: { template: '<div class="auth-page-stub" />' } },
  { path: '/', name: 'home', component: { template: '<div class="home-stub" />' }, meta: { requiresAuth: true } },
  { path: '/projects', name: 'projects', component: { template: '<div class="projects-stub" />' }, meta: { requiresAuth: true } },
]

let router: ReturnType<typeof createRouter>

function mountApp() {
  return mount(App, {
    global: {
      plugins: [router],
      stubs: {
        'router-view': { template: '<div class="router-view-stub"><slot /></div>' },
      },
    },
  })
}

describe('App.vue — global reauth dialog', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    router = createRouter({
      history: createWebHistory(),
      routes: testRoutes,
    })
  })

  it('renders AuthDialog when showReauthDialog is true and not on /auth', async () => {
    await router.push('/projects')
    await router.isReady()

    const auth = useAuthStore()
    auth.requestReauth()

    const wrapper = mountApp()
    await wrapper.vm.$nextTick()

    expect(wrapper.findComponent({ name: 'AuthDialog' }).exists()).toBe(true)
  })

  it('does NOT render AuthDialog when on /auth route', async () => {
    await router.push('/auth')
    await router.isReady()

    const auth = useAuthStore()
    auth.requestReauth()

    const wrapper = mountApp()
    await wrapper.vm.$nextTick()

    expect(wrapper.findComponent({ name: 'AuthDialog' }).exists()).toBe(false)
  })
})
