import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '../../stores/auth'

describe('Auth Store — reauth dialog state', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.restoreAllMocks()
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

  it('login() stores unverified account state without granting app access', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      token: 'unverified-token',
      requiresEmailVerification: true,
      user: {
        id: '1',
        username: 'test',
        email: 'test@test.com',
        role: 'user',
        emailVerified: false,
        emailVerifiedAt: null,
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const auth = useAuthStore()
    await auth.login('test@test.com', 'password123')

    expect(auth.token).toBe('unverified-token')
    expect(auth.showUnverifiedEmailDialog).toBe(true)
    expect(auth.unverifiedEmailPhase).toBe('notice')
    expect(auth.canAccessApp).toBe(false)
  })

  it('register() enters code input phase when backend already sent reclaim code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      token: 'reclaim-token',
      requiresEmailVerification: true,
      verificationCodeSent: true,
      user: {
        id: '2',
        username: 'usr_2',
        email: 'reclaim@test.com',
        role: 'user',
        emailVerified: false,
        emailVerifiedAt: null,
      },
    }), { status: 201, headers: { 'content-type': 'application/json' } }))

    const auth = useAuthStore()
    await auth.register('reclaim@test.com', 'password123')

    expect(auth.token).toBe('reclaim-token')
    expect(auth.showUnverifiedEmailDialog).toBe(true)
    expect(auth.unverifiedEmailPhase).toBe('input')
    expect(auth.unverifiedEmailCooldownSeconds).toBe(60)
  })

  it('verifyUnverifiedEmail() marks the account accessible after backend verification', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      user: {
        id: '1',
        username: 'test',
        email: 'test@test.com',
        role: 'user',
        emailVerified: true,
        emailVerifiedAt: '2026-06-10T09:00:00.000Z',
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const auth = useAuthStore()
    auth.setAuth('unverified-token', {
      id: '1',
      username: 'test',
      email: 'test@test.com',
      role: 'user',
      emailVerified: false,
      emailVerifiedAt: null,
    })
    auth.requestEmailVerification()

    await auth.verifyUnverifiedEmail('123456')

    expect(auth.user?.emailVerified).toBe(true)
    expect(auth.unverifiedEmailPhase).toBe('success')
    expect(auth.canAccessApp).toBe(true)
  })
})
