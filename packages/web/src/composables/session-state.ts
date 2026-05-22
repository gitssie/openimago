/**
 * Pure session state machine — no Vue reactivity, no UI callbacks.
 *
 * This module holds the session state as plain JavaScript objects.
 * `useAgentSession` wraps it in Vue refs and forwards UI callbacks.
 * Having a plain class makes the event-handling logic unit-testable
 * without mounting components.
 */
import type {
  Event,
  UserMessage,
  AssistantMessage,
  Todo,
  QuestionRequest,
  PermissionRequest,
  Part,
} from '@opencode-ai/sdk/v2'
import type { DisplayPart, SessionItem } from 'src/services/agents'

export interface SessionMessageCache {
  id: string
  info: UserMessage | AssistantMessage
  parts: DisplayPart[]
}

export class SessionState {
  // ── Connection ────────────────────────────────────────────────────────────
  isConnected = false

  // ── Active session ────────────────────────────────────────────────────────
  sessionId: string | null = null
  sessionStatus: 'idle' | 'busy' | 'retry' = 'idle'
  isLoading = false

  // ── Session list ──────────────────────────────────────────────────────────
  sessionList: SessionItem[] = []
  childSessions: Record<string, SessionItem[]> = {}

  // ── Message cache (all sessions) ─────────────────────────────────────────
  sessionMessages: Record<string, SessionMessageCache[]> = {}

  // ── Pending UI flows ──────────────────────────────────────────────────────
  pendingQuestion: QuestionRequest | null = null
  pendingPermission: PermissionRequest | null = null
  sessionTodos: Todo[] = []

  // ── Part delta accumulator ────────────────────────────────────────────────
  partText: Map<string, string> = new Map()

  // ── Handle a single typed SSE event ──────────────────────────────────────

  handleEvent(event: Event): void {
    switch (event.type) {
      case 'server.connected': {
        this.isConnected = true
        break
      }

      case 'session.status': {
        const props = event.properties
        if (props.sessionID !== this.sessionId) break
        this.sessionStatus = props.status.type as 'idle' | 'busy' | 'retry'
        this.isLoading = props.status.type === 'busy' || props.status.type === 'retry'
        break
      }

      case 'session.updated': {
        const info = event.properties.info
        const item: SessionItem = {
          id: info.id,
          title: info.title ?? 'Untitled',
          time: new Date(info.time?.created ?? Date.now()),
          ...(info.parentID ? { parentID: info.parentID } : {}),
          ...(info.revert ? { revert: info.revert } : {}),
        }
        if (info.parentID) {
          this._upsertChildSession(info.parentID, item)
        } else {
          this._upsertSession(item)
        }
        break
      }

      case 'message.updated': {
        const info = event.properties.info
        this._upsertCachedMessage(info.sessionID, info)
        break
      }

      case 'message.removed': {
        const { sessionID, messageID } = event.properties
        this._removeCachedMessage(sessionID, messageID)
        break
      }

      case 'message.part.delta': {
        const { partID, field, delta } = event.properties
        if (field === 'text') {
          this.partText.set(partID, (this.partText.get(partID) ?? '') + delta)
        }
        break
      }

      case 'todo.updated': {
        if (event.properties.sessionID !== this.sessionId) break
        this.sessionTodos = event.properties.todos as Todo[]
        break
      }

      case 'permission.asked': {
        const p = (event.properties as any).request as PermissionRequest
        if (p.sessionID !== this.sessionId) break
        this.pendingPermission = p
        break
      }

      case 'permission.replied': {
        if (this.pendingPermission?.id === (event.properties as any).requestID) {
          this.pendingPermission = null
        }
        break
      }

      default:
        break
    }
  }

  // ── Internal cache helpers ────────────────────────────────────────────────

  _upsertCachedMessage(sessionID: string, info: UserMessage | AssistantMessage): void {
    if (!this.sessionMessages[sessionID]) {
      this.sessionMessages[sessionID] = []
    }
    const cache = this.sessionMessages[sessionID]!
    const idx = cache.findIndex((m) => m.id === info.id)
    if (idx === -1) {
      cache.push({ id: info.id, info, parts: [] })
    } else {
      cache[idx] = { id: info.id, info, parts: cache[idx]!.parts }
    }
  }

  _removeCachedMessage(sessionID: string, messageID: string): void {
    const cache = this.sessionMessages[sessionID]
    if (!cache) return
    this.sessionMessages[sessionID] = cache.filter((m) => m.id !== messageID)
  }

  _upsertSession(item: SessionItem): void {
    const idx = this.sessionList.findIndex((s) => s.id === item.id)
    if (idx === -1) {
      this.sessionList.unshift(item)
    } else {
      this.sessionList[idx] = item
    }
  }

  _upsertChildSession(parentId: string, item: SessionItem): void {
    if (!this.childSessions[parentId]) {
      this.childSessions[parentId] = []
    }
    const children = this.childSessions[parentId]!
    const idx = children.findIndex((s) => s.id === item.id)
    if (idx === -1) {
      children.unshift(item)
    } else {
      children[idx] = item
    }
  }

  reset(): void {
    this.isConnected = false
    this.sessionId = null
    this.sessionStatus = 'idle'
    this.isLoading = false
    this.sessionList = []
    this.childSessions = {}
    this.sessionMessages = {}
    this.pendingQuestion = null
    this.pendingPermission = null
    this.sessionTodos = []
    this.partText = new Map()
  }
}
