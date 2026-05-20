import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { api } from '../../api/client'
import { useAuthStore } from '../../stores/auth'
import { useProjectsStore } from '../../stores/projects'
import { useSessionsStore } from '../../stores/sessions'
import { useChatStore } from '../../stores/chat'
import { useAssetsStore } from '../../stores/assets'
import { usePromptsStore } from '../../stores/prompts'

describe('API Client', () => {
  it('has all expected endpoint methods', () => {
    const methods = [
      'register', 'login', 'me', 'updateMe',
      'listProjects', 'createProject', 'updateProject',
      'listSessions', 'createSession',
      'listAssets', 'deleteAsset',
      'listPrompts', 'createPrompt', 'updatePrompt', 'deletePrompt',
      'listUsers', 'updateUserRole',
    ]
    for (const m of methods) {
      expect(typeof (api as Record<string, unknown>)[m]).toBe('function')
    }
  })
})

describe('Pinia Stores', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('auth store: token lifecycle', () => {
    const auth = useAuthStore()
    expect(auth.isAuthenticated).toBe(false)
    auth.setAuth('token', { id: '1', username: 't', email: 't@t.com', role: 'user' })
    expect(auth.isAuthenticated).toBe(true)
    auth.clearAuth()
    expect(auth.isAuthenticated).toBe(false)
  })

  it('auth store: admin detection', () => {
    const auth = useAuthStore()
    auth.setAuth('token', { id: '1', username: 'a', email: 'a@a.com', role: 'admin' })
    expect(auth.isAdmin).toBe(true)
  })

  it('projects store: initial state', () => {
    const store = useProjectsStore()
    expect(store.projects).toEqual([])
    expect(store.loading).toBe(false)
  })

  it('sessions store: initial state', () => {
    const store = useSessionsStore()
    expect(store.sessions).toEqual([])
    expect(store.loading).toBe(false)
  })

  it('chat store: initial state', () => {
    const store = useChatStore()
    expect(store.messages).toEqual([])
    expect(store.streaming).toBe(false)
    expect(store.sessionId).toBeNull()
  })

  it('assets store: initial state', () => {
    const store = useAssetsStore()
    expect(store.assets).toEqual([])
  })

  it('prompts store: initial state', () => {
    const store = usePromptsStore()
    expect(store.templates).toEqual([])
  })
})
