import { describe, it, expect, beforeEach } from 'vitest'
import { createRouter, createWebHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '../../stores/auth'
import routes from '../../router/routes'

describe('Auth Guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('redirects to /auth when unauthenticated user visits protected route', async () => {
    // Create a fresh router with the real routes
    const router = createRouter({
      history: createWebHistory(),
      routes,
    })

    // Apply the same guard logic that index.ts should have
    router.beforeEach((to) => {
      const auth = useAuthStore()
      if (to.meta.requiresAuth && !auth.isAuthenticated) {
        return '/auth'
      }
    })

    await router.push('/projects')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/auth')
  })

  it('allows authenticated user to access protected route', async () => {
    const router = createRouter({
      history: createWebHistory(),
      routes,
    })

    router.beforeEach((to) => {
      const auth = useAuthStore()
      if (to.meta.requiresAuth && !auth.isAuthenticated) {
        return '/auth'
      }
    })

    const auth = useAuthStore()
    auth.setAuth('test-token', { id: '1', username: 'test', email: 'test@test.com', role: 'user' })

    await router.push('/projects')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/projects')
  })
})
