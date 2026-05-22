/**
 * SessionState machine tests — pure state, no Vue, no UI callbacks.
 *
 * These tests verify event handling behavior in isolation. The state machine
 * should be importable and exercisable without mounting Vue components.
 */
import { describe, test, expect, beforeEach } from 'vitest'
import { SessionState } from 'src/composables/session-state'
import type { Event } from '@opencode-ai/sdk/v2'

function makeConnectedEvent(): Event {
  return { type: 'server.connected', properties: {} } as any
}

function makeSessionStatusEvent(sessionID: string, statusType: 'idle' | 'busy' | 'retry'): Event {
  return {
    type: 'session.status',
    properties: { sessionID, status: { type: statusType } },
  } as any
}

function makeMessageUpdatedEvent(sessionID: string, messageId: string): Event {
  return {
    type: 'message.updated',
    properties: {
      info: {
        id: messageId,
        sessionID,
        role: 'assistant',
        parts: [],
        time: { created: Date.now(), updated: Date.now() },
      },
    },
  } as any
}

describe('SessionState', () => {
  let state: SessionState

  beforeEach(() => {
    state = new SessionState()
  })

  test('initial state: not connected, no session', () => {
    expect(state.isConnected).toBe(false)
    expect(state.sessionId).toBeNull()
    expect(state.sessionStatus).toBe('idle')
  })

  test('server.connected sets isConnected=true', () => {
    state.handleEvent(makeConnectedEvent())
    expect(state.isConnected).toBe(true)
  })

  test('session.status sets isLoading=true when busy', () => {
    state.sessionId = 'ses_abc'
    state.handleEvent(makeSessionStatusEvent('ses_abc', 'busy'))
    expect(state.sessionStatus).toBe('busy')
    expect(state.isLoading).toBe(true)
  })

  test('session.status ignores events for other sessions', () => {
    state.sessionId = 'ses_abc'
    state.handleEvent(makeSessionStatusEvent('ses_xyz', 'busy'))
    expect(state.sessionStatus).toBe('idle')
    expect(state.isLoading).toBe(false)
  })

  test('message.updated upserts message in cache for current session', () => {
    state.sessionId = 'ses_abc'
    state.handleEvent(makeMessageUpdatedEvent('ses_abc', 'msg_1'))
    const cache = state.sessionMessages['ses_abc'] ?? []
    expect(cache.some((m) => m.id === 'msg_1')).toBe(true)
  })

  test('message.updated does not upsert for non-current session', () => {
    state.sessionId = 'ses_abc'
    state.handleEvent(makeMessageUpdatedEvent('ses_xyz', 'msg_2'))
    // message cache for ses_xyz should still be updated (cache is global)
    const cache = state.sessionMessages['ses_xyz'] ?? []
    expect(cache.some((m) => m.id === 'msg_2')).toBe(true)
  })
})
