import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { appEventBus } from '../../utils/app-events'
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

  it('emits auth:reauthenticated event after successful reauth login', async () => {
    const emitSpy = vi.spyOn(appEventBus, 'emit')

    await router.push('/projects')
    await router.isReady()

    const auth = useAuthStore()
    auth.login = vi.fn(() => {
      auth.setAuth('new-token', { id: '1', username: 'test', email: 'test@test.com', role: 'user' })
      return Promise.resolve()
    })

    const wrapper = mountApp()
    await wrapper.vm.$nextTick()

    auth.showReauthDialog = true
    await wrapper.vm.$nextTick()

    const authDialog = wrapper.findComponent({ name: 'AuthDialog' })
    expect(authDialog.exists()).toBe(true)

    await authDialog.vm.$emit('login', { email: 'test@test.com', password: 'pass123', rememberMe: false })
    await wrapper.vm.$nextTick()
    await new Promise((r) => setTimeout(r, 10))

    expect(emitSpy).toHaveBeenCalledWith('auth:reauthenticated')

    emitSpy.mockRestore()
  })
})
