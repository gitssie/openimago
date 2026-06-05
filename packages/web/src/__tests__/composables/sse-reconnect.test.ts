import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSseConnection, sseState } from '../../composables/useSseConnection'
import { useAuthStore } from '../../stores/auth'
import { appEventBus } from '../../utils/app-events'
import type { Event } from '@opencode-ai/sdk/v2'

// Mock AgentService to avoid real network calls
vi.mock('../../services/agents', () => ({
  AgentService: {
    subscribeToEvents: vi.fn(),
  },
}))

import { AgentService } from '../../services/agents'

describe('useSseConnection — reconnect after reauth', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
    // Ensure we start clean — no running loops
    sseState.value = 'disconnected'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exposes reconnect() that starts a new SSE loop', () => {
    const { reconnect, state } = useSseConnection()
    expect(typeof reconnect).toBe('function')
    expect(state.value).toBe('disconnected')
  })

  it('reconnect() transitions state from server-closed to connecting', async () => {
    // Pending promise so connect doesn't crash
    const streamPromise = new Promise<AsyncIterable<Event>>(() => {})
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(AgentService.subscribeToEvents).mockReturnValue(streamPromise)

    const { reconnect, state } = useSseConnection()
    reconnect()
    await new Promise((r) => setTimeout(r, 10))

    expect(state.value).toBe('connecting')
  })

  it('listens for auth:reauthenticated event and calls reconnect', async () => {
    const auth = useAuthStore()
    auth.setAuth('old-token', { id: '1', username: 'test', email: 'test@test.com', role: 'user' })

    // Track connection attempts
    let connectCalls = 0
    const mockStream: AsyncIterable<Event> = {
      [Symbol.asyncIterator]: () => ({
        next: () => new Promise(() => {}), // never resolves — hangs
        return: () => Promise.resolve({ done: true, value: undefined }),
        throw: () => Promise.reject(new Error()),
      }),
    }
    // eslint-disable-next-line @typescript-eslint/unbound-method
    vi.mocked(AgentService.subscribeToEvents).mockImplementation(() => {
      connectCalls++
      return Promise.resolve(mockStream)
    })

    // Start initial connection
    const { reconnect, state } = useSseConnection()
    reconnect()
    await new Promise((r) => setTimeout(r, 20))

    expect(connectCalls).toBe(1)
    expect(state.value).toBe('connected')

    // Simulate reauth event
    appEventBus.emit('auth:reauthenticated')
    await new Promise((r) => setTimeout(r, 20))

    // Should have reconnected (new connect call)
    expect(connectCalls).toBe(2)
  })
})
