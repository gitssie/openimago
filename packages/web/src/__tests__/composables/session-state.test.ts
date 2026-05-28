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
  return { type: 'server.connected', properties: {} } as unknown as Event
}

function makeSessionStatusEvent(sessionID: string, statusType: 'idle' | 'busy' | 'retry'): Event {
  return {
    type: 'session.status',
    properties: { sessionID, status: { type: statusType } },
  } as unknown as Event
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
  } as unknown as Event
}

function makeSessionCreatedEvent(info: {
  id: string
  title?: string
  parentID?: string
  time?: { created?: number }
}): Event {
  return {
    type: 'session.created',
    properties: { info },
  } as unknown as Event
}

function makeSessionUpdatedEvent(info: {
  id: string
  title?: string
  parentID?: string
  time?: { created?: number }
}): Event {
  return {
    type: 'session.updated',
    properties: { info },
  } as unknown as Event
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

  test('session.created upserts root session', () => {
    state.handleEvent(makeSessionCreatedEvent({
      id: 'ses_root1',
      title: 'My Chat',
      time: { created: 1700000000000 },
    }))
    expect(state.sessionList).toHaveLength(1)
    expect(state.sessionList[0]!.id).toBe('ses_root1')
    expect(state.sessionList[0]!.title).toBe('My Chat')
  })

  test('session.created does not duplicate existing session', () => {
    state.handleEvent(makeSessionCreatedEvent({
      id: 'ses_dup',
      title: '',
      time: { created: 1700000000000 },
    }))
    state.handleEvent(makeSessionCreatedEvent({
      id: 'ses_dup',
      title: 'Real Title',
      time: { created: 1700000000001 },
    }))
    expect(state.sessionList).toHaveLength(1)
    expect(state.sessionList[0]!.id).toBe('ses_dup')
    expect(state.sessionList[0]!.title).toBe('Real Title')
  })

  test('session.created upserts child session under parent', () => {
    state.handleEvent(makeSessionCreatedEvent({
      id: 'ses_child',
      title: 'Child Chat',
      parentID: 'ses_parent',
      time: { created: 1700000000000 },
    }))
    const children = state.childSessions['ses_parent'] ?? []
    expect(children).toHaveLength(1)
    expect(children[0]!.id).toBe('ses_child')
    expect(children[0]!.title).toBe('Child Chat')
    expect(children[0]!.parentID).toBe('ses_parent')
  })

  test('session.updated removes parentID when absent', () => {
    state.handleEvent(makeSessionCreatedEvent({
      id: 'ses_fork',
      title: 'Fork',
      parentID: 'ses_root',
    }))
    state.handleEvent(makeSessionUpdatedEvent({
      id: 'ses_fork',
      title: 'Unforked',
    }))
    const updated = state.sessionList.find(s => s.id === 'ses_fork')
    expect(updated).toBeDefined()
    expect(updated!.title).toBe('Unforked')
    expect(updated!.parentID).toBeUndefined()
  })

  test('session.created drops hardcoded placeholder title', () => {
    // Simulate first-message flow: createSession returns a session whose title
    // is absent (new session). session.created should NOT force an 'Untitled'
    // placeholder into the session list.
    state.handleEvent(makeSessionCreatedEvent({
      id: 'ses_notitle',
      // title intentionally omitted
    }))
    expect(state.sessionList).toHaveLength(1)
    expect(state.sessionList[0]!.title).toBe('')
  })
})
