import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createRouter, createWebHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '../../stores/auth'
import routes from '../../router/routes'

/** Reusable guard matching src/router/index.ts behavior. */
function createGuard() {
  return async (to: { meta?: Record<string, unknown>; path?: string }) => {
    const auth = useAuthStore()
    if (!to.meta?.requiresAuth) return
    if (auth.isAuthenticated && !auth.verified) {
      await auth.fetchMe()
    }
    if (!auth.isAuthenticated) {
      if (auth.wasPreviouslyAuthenticated && to.path !== '/auth') {
        auth.requestReauth()
        return true
      }
      return '/auth'
    }
  }
}

describe('Auth Guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('redirects to /auth when unauthenticated user visits protected route', async () => {
    const router = createRouter({
      history: createWebHistory(),
      routes,
    })
    router.beforeEach(createGuard())

    await router.push('/projects')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/auth')
  })

  it('allows authenticated user to access protected route', async () => {
    const router = createRouter({
      history: createWebHistory(),
      routes,
    })
    router.beforeEach(createGuard())

    const auth = useAuthStore()
    auth.setAuth('test-token', { id: '1', username: 'test', email: 'test@test.com', role: 'user' })

    await router.push('/projects')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/projects')
  })

  it('shows reauth dialog instead of redirecting when token is expired', async () => {
    const router = createRouter({
      history: createWebHistory(),
      routes,
    })
    router.beforeEach(createGuard())

    const auth = useAuthStore()
    // Simulate state after page reload with expired token in localStorage:
    // token exists but we haven't verified it with the backend yet
    auth.token = 'expired-token'
    // Override fetchMe to simulate backend rejecting the token
    auth.fetchMe = vi.fn(async () => {
      await Promise.resolve()
      auth.clearAuth()
    })

    expect(auth.isAuthenticated).toBe(true)
    expect(auth.verified).toBe(false)

    await router.push('/projects')
    await router.isReady()

    // Should stay on the protected page with the dialog showing
    expect(router.currentRoute.value.path).toBe('/projects')
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.wasPreviouslyAuthenticated).toBe(true)
    expect(auth.showReauthDialog).toBe(true)
  })

  it('allows navigation when token is verified (fetchMe succeeds)', async () => {
    const router = createRouter({
      history: createWebHistory(),
      routes,
    })
    router.beforeEach(createGuard())

    const auth = useAuthStore()
    auth.token = 'valid-token'
    // Override fetchMe to simulate successful verification
    auth.fetchMe = vi.fn(async () => {
      await Promise.resolve()
      auth.user = { id: '1', username: 'test', email: 'test@test.com', role: 'user' }
      auth.verified = true
    })

    expect(auth.isAuthenticated).toBe(true)
    expect(auth.verified).toBe(false)

    await router.push('/projects')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/projects')
    expect(auth.verified).toBe(true)
  })
})
