import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '../../stores/auth'

describe('Auth Store — reauth dialog state', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('requestReauth() sets showReauthDialog to true', () => {
    const auth = useAuthStore()
    expect(auth.showReauthDialog).toBe(false)
    auth.requestReauth()
    expect(auth.showReauthDialog).toBe(true)
  })

  it('dismissReauth() sets showReauthDialog to false', () => {
    const auth = useAuthStore()
    auth.requestReauth()
    expect(auth.showReauthDialog).toBe(true)
    auth.dismissReauth()
    expect(auth.showReauthDialog).toBe(false)
  })

  it('clearAuth() sets wasPreviouslyAuthenticated when token existed', () => {
    const auth = useAuthStore()
    auth.setAuth('test-token', { id: '1', username: 'test', email: 'test@test.com', role: 'user' })
    expect(auth.wasPreviouslyAuthenticated).toBe(false)

    auth.clearAuth()
    expect(auth.wasPreviouslyAuthenticated).toBe(true)
  })

  it('clearAuth() does not set wasPreviouslyAuthenticated when no token existed', () => {
    const auth = useAuthStore()
    expect(auth.wasPreviouslyAuthenticated).toBe(false)
    auth.clearAuth()
    expect(auth.wasPreviouslyAuthenticated).toBe(false)
  })

  it('setAuth() resets wasPreviouslyAuthenticated and showReauthDialog', () => {
    const auth = useAuthStore()
    auth.setAuth('old-token', { id: '1', username: 'test', email: 'test@test.com', role: 'user' })
    auth.clearAuth() // wasPreviouslyAuthenticated = true
    auth.requestReauth() // showReauthDialog = true

    expect(auth.wasPreviouslyAuthenticated).toBe(true)
    expect(auth.showReauthDialog).toBe(true)

    auth.setAuth('new-token', { id: '2', username: 'new', email: 'new@test.com', role: 'user' })

    expect(auth.wasPreviouslyAuthenticated).toBe(false)
    expect(auth.showReauthDialog).toBe(false)
  })

  it('requestReauth() is idempotent — calling it multiple times keeps dialog open', () => {
    const auth = useAuthStore()
    auth.requestReauth()
    auth.requestReauth()
    auth.requestReauth()
    expect(auth.showReauthDialog).toBe(true)
  })
})
