import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useAgentSession } from '../../composables/useAgentSession'
import { AgentService, type MessagePage } from 'src/services/agents'
import type { AssistantMessage, QuestionRequest, ToolPart } from '@opencode-ai/sdk/v2'

vi.mock('src/services/agents', () => ({
  AgentService: {
    loadMessagePage: vi.fn(),
    loadTodos: vi.fn(),
    getSession: vi.fn(),
    listPendingQuestions: vi.fn(),
    listPendingPermissions: vi.fn(),
    listSessions: vi.fn(),
  },
}))

const mockAgentService = vi.mocked(AgentService)

describe('useAgentSession pending questions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAgentService.loadTodos.mockResolvedValue([])
    mockAgentService.getSession.mockRejectedValue(new Error('no session info'))
    mockAgentService.listPendingPermissions.mockResolvedValue([])
  })

  it('restores a pending question whose tool call is running in the active transcript', async () => {
    const question = makeQuestionRequest({ sessionID: 'child-session', callID: 'call-question' })
    const page: MessagePage = {
      entries: [
        {
          info: makeAssistantMessage(),
          parts: [makeRunningQuestionToolPart('call-question')],
        },
      ],
    }
    mockAgentService.loadMessagePage.mockResolvedValue(page)
    mockAgentService.listPendingQuestions.mockResolvedValue([question])

    const session = useAgentSession(vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn())

    await session.switchSession('root-session')
    await nextTick()

    expect(session.pendingQuestion.value).toStrictEqual(question)
  })
})

describe('useAgentSession project scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAgentService.listSessions.mockResolvedValue([])
  })

  it('passes the injected projectId to listSessions', async () => {
    const session = useAgentSession(
      vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(),
      () => 'proj_a',
    )

    await session.loadSessionList()

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockAgentService.listSessions).toHaveBeenCalledWith({ projectId: 'proj_a' })
  })

  it('lists sessions unscoped when no projectId source is provided (standalone)', async () => {
    const session = useAgentSession(vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn())

    await session.loadSessionList()

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockAgentService.listSessions).toHaveBeenCalledWith(undefined)
  })

  it('lists sessions unscoped when the projectId getter returns null', async () => {
    const session = useAgentSession(
      vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(),
      () => null,
    )

    await session.loadSessionList()

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockAgentService.listSessions).toHaveBeenCalledWith(undefined)
  })
})

function makeQuestionRequest(overrides: { sessionID: string; callID: string }): QuestionRequest {
  return {
    id: 'question-request',
    sessionID: overrides.sessionID,
    questions: [
      {
        question: 'Choose an option',
        header: 'Choice',
        options: [
          { label: 'Option A', description: 'First option' },
          { label: 'Option B', description: 'Second option' },
        ],
      },
    ],
    tool: { messageID: 'message-assistant', callID: overrides.callID },
  }
}

function makeAssistantMessage(): AssistantMessage {
  return {
    id: 'message-assistant',
    sessionID: 'root-session',
    role: 'assistant',
    time: { created: Date.now() },
    parentID: 'message-user',
    modelID: 'model',
    providerID: 'provider',
    mode: 'build',
    agent: 'agent',
    path: { cwd: '/workspace', root: '/workspace' },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  }
}

function makeRunningQuestionToolPart(callID: string): ToolPart {
  return {
    id: 'part-question',
    sessionID: 'root-session',
    messageID: 'message-assistant',
    type: 'tool',
    callID,
    tool: 'question',
    state: {
      status: 'running',
      input: {},
      time: { start: Date.now() },
    },
  }
}
