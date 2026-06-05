import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { api } from '../../api/client'
import { useAuthStore } from '../../stores/auth'

describe('API client 401 triggers reauth dialog', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('request() calls requestReauth() and clearAuth() on HTTP 401', async () => {
    const auth = useAuthStore()
    auth.setAuth('expired-token', { id: '1', username: 'test', email: 'test@test.com', role: 'user' })

    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await api.me().catch(() => {
      // expected — 401 throws
    })

    expect(auth.token).toBeNull()
    expect(auth.showReauthDialog).toBe(true)
    expect(auth.wasPreviouslyAuthenticated).toBe(true)
  })

  it('request() does NOT clear auth or show dialog when token changed since request was made', async () => {
    const auth = useAuthStore()
    // Simulate race: request was made with old token, but user already re-authed
    auth.setAuth('old-token', { id: '1', username: 'old', email: 'old@test.com', role: 'user' })

    let resolveFetch: (value: Response) => void
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve
    })
    vi.mocked(fetch).mockReturnValue(fetchPromise)

    // Start the request — it captures currentToken = 'old-token'
    const reqPromise = api.me().catch(() => {
      // expected — 401 throws
    })

    // Simulate re-auth before the response comes back
    auth.setAuth('new-valid-token', { id: '2', username: 'new', email: 'new@test.com', role: 'user' })

    // Old request's 401 response arrives
    resolveFetch!(
      new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    )
    await reqPromise

    // Should NOT clear the new valid token set by re-auth
    expect(auth.token).toBe('new-valid-token')
    expect(auth.showReauthDialog).toBe(false)
  })
})
