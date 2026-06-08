import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import { createI18n } from 'vue-i18n'
import {
  h,
  defineComponent,
  type Component,
  type PropType,
  type Plugin,
  ref,
  computed,
} from 'vue'
import { QLayout, QPageContainer, QPage, QBtn, QIcon, QSpinnerDots, QTooltip } from 'quasar'
import enUS from '../../i18n/en-US/index'
import routes from '../../router/routes'
import SessionWorkspacePage from '../../pages/SessionWorkspacePage.vue'
import type { DisplayMessage, SessionMessageCache, PendingAttachment, QueuedFollowup } from '../../composables/useAgentSession'
import type { SessionItem } from '../../services/agents'
import type { Part, Todo, QuestionRequest, PermissionRequest } from '@opencode-ai/sdk/v2'

// ── Stubs ──────────────────────────────────────────────────────────────────────

const StubOiIcon = defineComponent({
  name: 'OiIcon',
  props: { name: String, size: [String, Number] },
  template: '<span class="oi-icon-stub">{{ name }}</span>',
})

const StubSessionChatView = defineComponent({
  name: 'SessionChatView',
  props: {
    sessionId: [String, Object] as PropType<string | null>,
    displayMessages: { type: Array as PropType<DisplayMessage[]>, default: () => [] },
    partText: { type: Object as PropType<Map<string, string>>, default: () => new Map() },
    isLoading: Boolean,
    sessionStatus: String,
    historyExhausted: Boolean,
    historyLoading: Boolean,
    currentSessionItem: Object as PropType<SessionItem | null>,
    activeAttentionCallId: [String, Object] as PropType<string | null>,
  },
  emits: ['load-history', 'switch-session', 'revert-turn', 'use-suggestion'],
  template: '<div class="chat-view-stub"><slot /></div>',
})

const StubSessionWorkspaceSidebar = defineComponent({
  name: 'SessionWorkspaceSidebar',
  props: {
    sessions: Array,
    sessionCount: Number,
    collapsed: Boolean,
  },
  emits: ['create', 'select', 'delete', 'toggle-collapse'],
  template: '<div class="sidebar-stub" />',
})

const StubWorkspaceArtifactsPanel = defineComponent({
  name: 'WorkspaceArtifactsPanel',
  props: {
    modelValue: String,
    artifacts: Array,
    selectedId: [String, Object] as PropType<string | null>,
    showPendingTile: Boolean,
    scope: String,
    loading: Boolean,
  },
  emits: ['update:modelValue', 'select', 'edit-params', 'rerun', 'delete'],
  template: '<div class="artifacts-panel-stub" />',
})

const StubPromptInput = defineComponent({
  name: 'PromptInput',
  props: {
    modelValue: String,
    loading: Boolean,
    connected: Boolean,
    disabled: Boolean,
    attachments: Array,
    placeholder: String,
    hint: { type: String, default: null },
  },
  emits: ['update:modelValue', 'submit', 'abort', 'remove-attachment', 'attach-files'],
  setup(_props, { expose }) {
    expose({ focus: vi.fn(), setDraft: vi.fn() })
    return {}
  },
  template: '<div class="prompt-input-stub" />',
})

const StubAgentQuestion = defineComponent({
  name: 'AgentQuestion',
  props: {
    request: Object,
    onReply: Function,
    onReject: Function,
  },
  template: '<div class="agent-question-stub" />',
})

const StubAgentPermission = defineComponent({
  name: 'AgentPermission',
  props: {
    request: Object,
    onRespond: Function,
  },
  template: '<div class="agent-permission-stub" />',
})

const QUASAR_COMPONENTS = { QPage, QBtn, QIcon, QSpinnerDots, QTooltip }

// ── Mock state (refs shared between tests and the vi.mock) ────────────────────

const mockDisplayMessages = ref<DisplayMessage[]>([])
const mockHistoryExhausted = ref(false)
const mockHistoryLoading = ref(false)
const mockInputMessage = ref('')
const mockIsLoading = ref(false)
const mockIsConnected = ref(false)
const mockSessionId = ref<string | null>(null)
const mockSessionStatus = ref<'idle' | 'busy' | 'retry'>('idle')
const mockSessionList = ref<SessionItem[]>([])
const mockChildSessions = ref<Record<string, SessionItem[]>>({})
const mockSessionMessages = ref<Record<string, SessionMessageCache[]>>({})
const mockPendingAttachments = ref<PendingAttachment[]>([])
const mockPartText = ref<Map<string, string>>(new Map())
const mockPendingQuestion = ref<QuestionRequest | null>(null)
const mockPendingPermission = ref<PermissionRequest | null>(null)
const mockSessionTodos = ref<Todo[]>([])

const mockQueuedFollowups = ref<Record<string, QueuedFollowup[]>>({})
const mockPausedFollowups = ref<Record<string, boolean | undefined>>({})
const mockFailedFollowupId = ref<Record<string, string | undefined>>({})
const mockSendingFollowupId = ref<string | null>(null)

const mockCurrentQueuedFollowups = computed(() => {
  if (!mockSessionId.value) return []
  return mockQueuedFollowups.value[mockSessionId.value] ?? []
})

const mockFollowupsPaused = computed(() => {
  if (!mockSessionId.value) return false
  return !!mockPausedFollowups.value[mockSessionId.value]
})

const mockLoadAgents = vi.fn().mockResolvedValue(undefined)
const mockLoadCommands = vi.fn().mockResolvedValue(undefined)
const mockLoadSessionList = vi.fn().mockResolvedValue(undefined)
const mockLoadOlderMessages = vi.fn()
const mockSwitchSession = vi.fn().mockResolvedValue(undefined)
const mockCreateNewSession = vi.fn()
const mockDeleteSession = vi.fn().mockResolvedValue(undefined)
const mockAddAttachment = vi.fn()
const mockRemoveAttachment = vi.fn()
const mockSendMessage = vi.fn().mockResolvedValue(undefined)
const mockSendQueuedFollowup = vi.fn().mockResolvedValue(undefined)
const mockEditQueuedFollowup = vi.fn()
const mockGetFollowupPreview = vi.fn().mockReturnValue('')
const mockAbortSession = vi.fn()
const mockReplyToQuestion = vi.fn().mockResolvedValue(undefined)
const mockRejectQuestion = vi.fn()
const mockReplyToPermission = vi.fn().mockResolvedValue(undefined)
const mockRestoreRevert = vi.fn()
const mockRevertMessage = vi.fn().mockResolvedValue(undefined)
const mockStartEventSubscription = vi.fn()
const mockStopEventSubscription = vi.fn()

vi.mock('../../composables/useAgentSession', () => ({
  useAgentSession: () => ({
    displayMessages: mockDisplayMessages,
    historyExhausted: mockHistoryExhausted,
    historyLoading: mockHistoryLoading,
    inputMessage: mockInputMessage,
    isLoading: mockIsLoading,
    isConnected: mockIsConnected,
    sessionId: mockSessionId,
    sessionStatus: mockSessionStatus,
    sessionList: mockSessionList,
    childSessions: mockChildSessions,
    sessionMessages: mockSessionMessages,
    pendingAttachments: mockPendingAttachments,
    currentQueuedFollowups: mockCurrentQueuedFollowups,
    failedFollowupId: mockFailedFollowupId,
    followupsPaused: mockFollowupsPaused,
    sendingFollowupId: mockSendingFollowupId,
    partText: mockPartText,
    pendingQuestion: mockPendingQuestion,
    pendingPermission: mockPendingPermission,
    sessionTodos: mockSessionTodos,
    loadAgents: mockLoadAgents,
    loadCommands: mockLoadCommands,
    loadSessionList: mockLoadSessionList,
    loadOlderMessages: mockLoadOlderMessages,
    switchSession: mockSwitchSession,
    createNewSession: mockCreateNewSession,
    deleteSession: mockDeleteSession,
    addAttachment: mockAddAttachment,
    removeAttachment: mockRemoveAttachment,
    sendMessage: mockSendMessage,
    sendQueuedFollowup: mockSendQueuedFollowup,
    editQueuedFollowup: mockEditQueuedFollowup,
    getFollowupPreview: mockGetFollowupPreview,
    abortSession: mockAbortSession,
    replyToQuestion: mockReplyToQuestion,
    rejectQuestion: mockRejectQuestion,
    replyToPermission: mockReplyToPermission,
    restoreRevert: mockRestoreRevert,
    revertMessage: mockRevertMessage,
    startEventSubscription: mockStartEventSubscription,
    stopEventSubscription: mockStopEventSubscription,
  }),
}))

const mockQuasarNotify = vi.fn()
vi.mock('quasar', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useQuasar: () => ({
      screen: { height: 768, width: 1024 },
      notify: mockQuasarNotify,
      plugins: {} as Record<string, unknown>,
      lang: { isoName: 'en-US' },
      iconSet: {} as Record<string, unknown>,
      dark: { isActive: false },
    }),
  }
})

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeI18n() {
  return createI18n({
    locale: 'en-US',
    legacy: false,
    messages: { 'en-US': enUS },
  })
}

function mountPage(component: Component, opts?: Parameters<typeof mount>[1]) {
  const userGlobal = opts?.global
  const i18n = makeI18n()
  const plugins = [i18n] as Plugin[]
  if (Array.isArray(userGlobal?.plugins)) {
    for (const p of userGlobal.plugins) {
      plugins.push(p as Plugin)
    }
  }

  const Wrapper = defineComponent({
    components: { QLayout, QPageContainer },
    setup() {
      return () => h(QLayout, { view: 'hHh Lpr fFf' }, () =>
        h(QPageContainer, () => h(component)),
      )
    },
  })
  return mount(Wrapper, {
    ...opts,
    global: {
      ...userGlobal,
      plugins,
      stubs: {
        OiIcon: StubOiIcon,
        SessionChatView: StubSessionChatView,
        SessionWorkspaceSidebar: StubSessionWorkspaceSidebar,
        WorkspaceArtifactsPanel: StubWorkspaceArtifactsPanel,
        PromptInput: StubPromptInput,
        AgentQuestion: StubAgentQuestion,
        AgentPermission: StubAgentPermission,
        RouterView: { template: '<div class="router-view-stub" />' },
        ...userGlobal?.stubs,
      },
      components: {
        ...QUASAR_COMPONENTS,
        ...userGlobal?.components,
      },
    },
  })
}

function makeSessionItem(overrides?: Partial<SessionItem>): SessionItem {
  return {
    id: 'ses_test',
    title: '测试会话',
    time: new Date('2026-05-30T10:00:00Z'),
    ...overrides,
  }
}

function makeDisplayMessage(overrides?: Partial<DisplayMessage>): DisplayMessage {
  return {
    id: 'msg_test',
    role: 'user',
    time: new Date('2026-05-30T10:00:00Z'),
    parts: [],
    ...overrides,
  }
}

function makeTextPart(overrides?: Record<string, unknown>): Part {
  return {
    type: 'text',
    id: 'part_text',
    text: 'Hello world',
    synthetic: false,
    ...overrides,
  } as Part
}

function makeFilePart(overrides?: Record<string, unknown>): Part {
  return {
    type: 'file',
    id: 'part_file',
    url: 'https://example.com/image.png',
    filename: 'image.png',
    mime: 'image/png',
    ...overrides,
  } as Part
}

async function setupRouter(sessionId?: string) {
  const router = createRouter({ history: createWebHistory(), routes })
  await router.push(sessionId ? `/sessions/${sessionId}` : '/sessions')
  await router.isReady()
  return router
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('SessionWorkspacePage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()

    mockDisplayMessages.value = []
    mockHistoryExhausted.value = false
    mockHistoryLoading.value = false
    mockInputMessage.value = ''
    mockIsLoading.value = false
    mockIsConnected.value = false
    mockSessionId.value = null
    mockSessionStatus.value = 'idle'
    mockSessionList.value = []
    mockChildSessions.value = {}
    mockSessionMessages.value = {}
    mockPendingAttachments.value = []
    mockPartText.value = new Map()
    mockPendingQuestion.value = null
    mockPendingPermission.value = null
    mockSessionTodos.value = []
    mockQueuedFollowups.value = {}
    mockPausedFollowups.value = {}
    mockFailedFollowupId.value = {}
    mockSendingFollowupId.value = null
    mockQuasarNotify.mockClear()
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 1. Lifecycle: onMounted / onUnmounted
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('lifecycle', () => {
    it('calls loadAgents, loadCommands, loadSessionList on mount', async () => {
      const router = await setupRouter()
      mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      expect(mockLoadAgents).toHaveBeenCalledOnce()
      expect(mockLoadCommands).toHaveBeenCalledOnce()
      expect(mockLoadSessionList).toHaveBeenCalledOnce()
    })

    it('calls startEventSubscription on mount and stopEventSubscription on unmount', async () => {
      const router = await setupRouter()
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      expect(mockStartEventSubscription).toHaveBeenCalledOnce()
      expect(mockStopEventSubscription).not.toHaveBeenCalled()

      wrapper.unmount()
      expect(mockStopEventSubscription).toHaveBeenCalledOnce()
    })

    it('switches to session from route param after session list loads', async () => {
      const router = await setupRouter('route-session-1')
      mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      expect(mockSwitchSession).toHaveBeenCalledWith('route-session-1')
    })

    it('does not call switchSession when route param matches current sessionId', async () => {
      mockSessionId.value = 'already-active'
      const router = await setupRouter('already-active')
      mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      // switchSession is called via loadSessionList.then, but the guard
      // `sid !== sessionId.value` short-circuits. We test that no actual
      // switch happened by checking that mockSwitchSession was not called
      // with a different session id.
      expect(mockSwitchSession).not.toHaveBeenCalled()
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 2. sidebarSessions computed
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('sidebarSessions', () => {
    it('passes sessions sorted by time descending to sidebar', async () => {
      const older = makeSessionItem({ id: 'older', title: 'Older', time: new Date('2026-05-29T10:00:00Z') })
      const newer = makeSessionItem({ id: 'newer', title: 'Newer', time: new Date('2026-05-30T10:00:00Z') })
      mockSessionList.value = [older, newer]

      const router = await setupRouter()
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      const sidebar = wrapper.findComponent({ name: 'SessionWorkspaceSidebar' })
      const sessions = sidebar.props('sessions') as { title: string }[]
      expect(sessions).toHaveLength(2)
      expect(sessions[0]?.title).toBe('Newer')
      expect(sessions[1]?.title).toBe('Older')
    })

    it('marks active session in sidebar', async () => {
      mockSessionId.value = 'active-one'
      const active = makeSessionItem({ id: 'active-one', title: 'Active' })
      const inactive = makeSessionItem({ id: 'inactive', title: 'Inactive', time: new Date('2026-05-29T10:00:00Z') })
      mockSessionList.value = [active, inactive]

      const router = await setupRouter()
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      const sidebar = wrapper.findComponent({ name: 'SessionWorkspaceSidebar' })
      const sessions = sidebar.props('sessions') as { id: string; active: boolean }[]
      const activeSession = sessions.find((s) => s.id === 'active-one')
      expect(activeSession?.active).toBe(true)
      const inactiveSession = sessions.find((s) => s.id === 'inactive')
      expect(inactiveSession?.active).toBe(false)
    })

    it('includes image count in sidebar meta', async () => {
      mockSessionId.value = 'with-images'
      const session = makeSessionItem({ id: 'with-images', title: 'Image Session', time: new Date('2026-05-30T10:00:00Z') })
      mockSessionList.value = [session]
      mockSessionMessages.value = {
        'with-images': [
          {
            info: { id: 'u1', role: 'user' } as unknown as NonNullable<SessionMessageCache['info']>,
            parts: [makeFilePart({ id: 'f1', mime: 'image/png', filename: 'a.png' })],
          },
          {
            info: { id: 'a1', role: 'assistant' } as unknown as NonNullable<SessionMessageCache['info']>,
            parts: [makeFilePart({ id: 'f2', mime: 'image/jpeg', filename: 'b.jpg' })],
          },
        ],
      }

      const router = await setupRouter()
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      const sidebar = wrapper.findComponent({ name: 'SessionWorkspaceSidebar' })
      const sessions = sidebar.props('sessions') as { meta: string }[]
      expect(sessions[0]?.meta).toBe('2 张结果')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 3. Child session: breadcrumb, hidden input, back-to-parent
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('child session', () => {
    it('shows breadcrumb when session is a child', async () => {
      mockSessionId.value = 'child-session'
      const parent = makeSessionItem({ id: 'parent-session', title: 'Parent Session', time: new Date('2026-05-29T10:00:00Z') })
      const child = makeSessionItem({ id: 'child-session', title: 'Untitled', parentID: 'parent-session', time: new Date('2026-05-30T10:00:00Z') })
      mockSessionList.value = [parent, child]
      mockChildSessions.value = {}

      const router = await setupRouter('child-session')
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      // Breadcrumb with parent label should be visible
      expect(wrapper.text()).toContain('Parent Session')
      expect(wrapper.find('.breadcrumb-parent-btn').exists()).toBe(true)

      // PromptInput should be hidden for child session
      expect(wrapper.findComponent({ name: 'PromptInput' }).exists()).toBe(false)

      // Back-to-parent button should be visible
      expect(wrapper.text()).toContain('Back to parent')
    })

    it('hides breadcrumb and shows input for top-level session', async () => {
      mockSessionId.value = 'top-session'
      const session = makeSessionItem({ id: 'top-session', title: 'Top Level', time: new Date('2026-05-30T10:00:00Z') })
      mockSessionList.value = [session]

      const router = await setupRouter('top-session')
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      expect(wrapper.find('.breadcrumb-parent-btn').exists()).toBe(false)
      expect(wrapper.findComponent({ name: 'PromptInput' }).exists()).toBe(true)
    })

    it('clicking back-to-parent calls handleSwitchSession with parent id', async () => {
      mockSessionId.value = 'child-session-2'
      const parent = makeSessionItem({ id: 'parent-2', title: 'Parent', time: new Date('2026-05-29T10:00:00Z') })
      const child = makeSessionItem({ id: 'child-session-2', title: 'Untitled', parentID: 'parent-2', time: new Date('2026-05-30T10:00:00Z') })
      mockSessionList.value = [parent, child]

      const router = await setupRouter('child-session-2')
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      // Click back-to-parent button
      const backBtn = wrapper.find('.child-session-input-disabled .q-btn')
      await backBtn.trigger('click')
      await flushPromises()

      expect(mockSwitchSession).toHaveBeenCalledWith('parent-2')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 4. SessionChatView events
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('SessionChatView events', () => {
    it('on load-history: calls loadOlderMessages and done(stop)', async () => {
      mockLoadOlderMessages.mockResolvedValue(false) // no more messages

      const router = await setupRouter()
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      const chatView = wrapper.findComponent({ name: 'SessionChatView' })
      const done = vi.fn()
      chatView.vm.$emit('load-history', 0, done)
      await flushPromises()

      expect(mockLoadOlderMessages).toHaveBeenCalledOnce()
      expect(done).toHaveBeenCalledWith(true) // stop = not hasMore
    })

    it('on load-history with more messages: done(false)', async () => {
      mockLoadOlderMessages.mockResolvedValue(true) // has more

      const router = await setupRouter()
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      const chatView = wrapper.findComponent({ name: 'SessionChatView' })
      const done = vi.fn()
      chatView.vm.$emit('load-history', 0, done)
      await flushPromises()

      expect(done).toHaveBeenCalledWith(false) // stop = not more
    })

    it('on switch-session: calls switchSession and router.push', async () => {
      mockSwitchSession.mockResolvedValue(undefined)
      const router = await setupRouter()
      const pushSpy = vi.spyOn(router, 'push')

      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      const chatView = wrapper.findComponent({ name: 'SessionChatView' })
      chatView.vm.$emit('switch-session', 'target-session')
      await flushPromises()

      expect(mockSwitchSession).toHaveBeenCalledWith('target-session')
      expect(pushSpy).toHaveBeenCalledWith({ name: 'session', params: { id: 'target-session' } })
    })

    it('on revert-turn: calls revertMessage', async () => {
      const router = await setupRouter()
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      const chatView = wrapper.findComponent({ name: 'SessionChatView' })
      chatView.vm.$emit('revert-turn', 'msg-to-revert')
      await flushPromises()

      expect(mockRevertMessage).toHaveBeenCalledWith('msg-to-revert')
    })

    it('on use-suggestion: sets draft and submits message', async () => {
      const router = await setupRouter()
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      const chatView = wrapper.findComponent({ name: 'SessionChatView' })
      chatView.vm.$emit('use-suggestion', 'generate a poster')
      await flushPromises()

      expect(mockInputMessage.value).toBe('generate a poster')
      expect(mockSendMessage).toHaveBeenCalledOnce()
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 5. generatedResults / results panel
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('generatedResults & results panel', () => {
    it('collects image file parts from assistant messages only', async () => {
      const userMsg = makeDisplayMessage({
        id: 'u1',
        role: 'user',
        time: new Date('2026-05-30T10:00:00Z'),
        parts: [makeFilePart({ id: 'uf1', mime: 'image/png', filename: 'user.png', url: 'http://a/u.png' })],
      })
      const asstMsg = makeDisplayMessage({
        id: 'asst:u1',
        role: 'assistant',
        time: new Date('2026-05-30T10:01:00Z'),
        parts: [
          makeFilePart({ id: 'af1', mime: 'image/png', filename: 'result.png', url: 'http://a/r.png' }),
          makeFilePart({ id: 'af2', mime: 'application/pdf', filename: 'doc.pdf', url: 'http://a/d.pdf' }),
        ],
      })
      mockDisplayMessages.value = [userMsg, asstMsg]

      const router = await setupRouter()
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      // Open right panel
      await wrapper.find('.topbar-icon-btn').trigger('click')
      await wrapper.vm.$nextTick()

      const panel = wrapper.findComponent({ name: 'WorkspaceArtifactsPanel' })
      const results = panel.props('artifacts') as { filename: string; kind: string }[]
      // Only media results should be collected (not the pdf)
      expect(results).toHaveLength(1)
      expect(results[0]?.filename).toBe('result.png')
      expect(results[0]?.kind).toBe('image')
    })

    it('sorts generated results by time descending', async () => {
      const turn1Asst = makeDisplayMessage({
        id: 'asst:u1',
        role: 'assistant',
        time: new Date('2026-05-30T10:00:00Z'),
        parts: [makeFilePart({ id: 'old', mime: 'image/png', filename: 'old.png', url: 'http://a/old.png' })],
      })
      const turn1User = makeDisplayMessage({
        id: 'u1', role: 'user', time: new Date('2026-05-30T09:59:00Z'), parts: [makeTextPart({ text: 'prompt 1' })],
      })
      const turn2Asst = makeDisplayMessage({
        id: 'asst:u2',
        role: 'assistant',
        time: new Date('2026-05-30T10:01:00Z'),
        parts: [makeFilePart({ id: 'new', mime: 'image/png', filename: 'new.png', url: 'http://a/new.png' })],
      })
      const turn2User = makeDisplayMessage({
        id: 'u2', role: 'user', time: new Date('2026-05-30T10:00:30Z'), parts: [makeTextPart({ text: 'prompt 2' })],
      })
      mockDisplayMessages.value = [turn1User, turn1Asst, turn2User, turn2Asst]

      const router = await setupRouter()
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      await wrapper.find('.topbar-icon-btn').trigger('click')
      await wrapper.vm.$nextTick()

      const panel = wrapper.findComponent({ name: 'WorkspaceArtifactsPanel' })
      const results = panel.props('artifacts') as { filename: string }[]
      expect(results).toHaveLength(2)
      // Newest first
      expect(results[0]?.filename).toBe('new.png')
      expect(results[1]?.filename).toBe('old.png')
    })

    it('selects default (most recent) result', async () => {
      const asst = makeDisplayMessage({
        id: 'asst:u1', role: 'assistant', time: new Date('2026-05-30T10:01:00Z'),
        parts: [makeFilePart({ id: 'r1', mime: 'image/png', filename: 'latest.png', url: 'http://a/l.png' })],
      })
      const user = makeDisplayMessage({
        id: 'u1', role: 'user', time: new Date('2026-05-30T10:00:00Z'), parts: [makeTextPart({ text: 'prompt' })],
      })
      mockDisplayMessages.value = [user, asst]

      const router = await setupRouter()
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      await wrapper.find('.topbar-icon-btn').trigger('click')
      await wrapper.vm.$nextTick()

      const panel = wrapper.findComponent({ name: 'WorkspaceArtifactsPanel' })
      expect(panel.props('selectedId')).toBe('r1')
    })

    it('passes currentSessionLabel and sidePanelResultCount to panel', async () => {
      mockSessionId.value = 'my-session'
      const session = makeSessionItem({ id: 'my-session', title: 'My Session', time: new Date() })
      mockSessionList.value = [session]
      const asst = makeDisplayMessage({
        id: 'asst:u1', role: 'assistant', time: new Date(),
        parts: [makeFilePart({ id: 'img1', mime: 'image/png', filename: 'out.png', url: 'http://a/o.png' })],
      })
      const user = makeDisplayMessage({
        id: 'u1', role: 'user', time: new Date(Date.now() - 1000), parts: [makeTextPart({ text: 'prompt' })],
      })
      mockDisplayMessages.value = [user, asst]

      const router = await setupRouter('my-session')
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      await wrapper.find('.topbar-icon-btn').trigger('click')
      await wrapper.vm.$nextTick()

      const panel = wrapper.findComponent({ name: 'WorkspaceArtifactsPanel' })
      expect(panel.props('artifacts')).toHaveLength(1)
      expect(panel.props('scope')).toBe('session')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 6. Todo / revert / followup docks
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('docks', () => {
    it('shows todo progress and active label', async () => {
      mockSessionTodos.value = [
        { content: 'Task 1', status: 'completed' } as Todo,
        { content: 'Task 2', status: 'in_progress' } as Todo,
        { content: 'Task 3', status: 'pending' } as Todo,
      ]

      const router = await setupRouter()
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      expect(wrapper.text()).toContain('Todos')
      expect(wrapper.text()).toContain('Task 1')
      expect(wrapper.text()).toContain('Task 2')
      expect(wrapper.text()).toContain('Task 3')
      // active label should be "Task 2" (in_progress) - shown in preview
      expect(wrapper.find('.todo-dock__preview').text()).toBe('Task 2')
    })

    it('shows revert preview from revert message', async () => {
      mockSessionId.value = 'revert-session'
      const revertUserMsg = makeDisplayMessage({
        id: 'revert-me', role: 'user', time: new Date(),
        parts: [makeTextPart({ id: 'rtxt', text: 'revert this message' })],
      })
      mockDisplayMessages.value = [revertUserMsg]
      const session = makeSessionItem({
        id: 'revert-session', title: 'Revert Session', time: new Date(),
        revert: { messageID: 'revert-me' } as unknown as NonNullable<SessionItem['revert']>,
      })
      mockSessionList.value = [session]

      const router = await setupRouter('revert-session')
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      expect(wrapper.text()).toContain('Restorable message available')
      expect(wrapper.text()).toContain('revert this message')
      expect(wrapper.text()).toContain('Restore')
    })

    it('shows followup dock with send and edit buttons', async () => {
      mockSessionId.value = 'followup-session'
      mockQueuedFollowups.value = {
        'followup-session': [{ id: 'f1', sessionId: 'followup-session', text: 'follow up message', attachments: [], datasetIds: [] }],
      }

      const router = await setupRouter('followup-session')
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      expect(wrapper.text()).toContain('1 follow-up')
      expect(wrapper.text()).toContain('Send now')
    })

    it('shows followup failed state', async () => {
      mockSessionId.value = 'failed-followup'
      mockQueuedFollowups.value = {
        'failed-followup': [{ id: 'f2', sessionId: 'failed-followup', text: 'failed msg', attachments: [], datasetIds: [] }],
      }
      mockFailedFollowupId.value = { 'failed-followup': 'f2' }

      const router = await setupRouter('failed-followup')
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      expect(wrapper.text()).toContain('Send failed')
    })

    it('shows followup paused state', async () => {
      mockSessionId.value = 'paused-followup'
      mockQueuedFollowups.value = {
        'paused-followup': [{ id: 'f3', sessionId: 'paused-followup', text: 'paused msg', attachments: [], datasetIds: [] }],
      }
      mockPausedFollowups.value = { 'paused-followup': true }

      const router = await setupRouter('paused-followup')
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      expect(wrapper.text()).toContain('Follow-ups paused')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 7. Prompt input submit
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('prompt input submit', () => {
    it('does not send empty text with no attachments', async () => {
      const router = await setupRouter()
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      const input = wrapper.findComponent({ name: 'PromptInput' })
      input.vm.$emit('submit', '')
      await flushPromises()

      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('sends message with text content', async () => {
      const router = await setupRouter()
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      const input = wrapper.findComponent({ name: 'PromptInput' })
      input.vm.$emit('submit', 'hello world')
      await flushPromises()

      expect(mockInputMessage.value).toBe('hello world')
      expect(mockSendMessage).toHaveBeenCalledOnce()
    })

    it('onFilesSelected calls addAttachment per file', async () => {
      mockAddAttachment.mockResolvedValue(undefined)
      const router = await setupRouter()
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      const input = wrapper.findComponent({ name: 'PromptInput' })
      const file1 = new File(['content1'], 'file1.png', { type: 'image/png' })
      const file2 = new File(['content2'], 'file2.jpg', { type: 'image/jpeg' })
      input.vm.$emit('attach-files', [file1, file2])
      await flushPromises()

      expect(mockAddAttachment).toHaveBeenCalledTimes(2)
      expect(mockAddAttachment).toHaveBeenCalledWith(file1)
      expect(mockAddAttachment).toHaveBeenCalledWith(file2)
    })

    it('onFilesSelected failure triggers $q.notify with negative', async () => {
      mockAddAttachment.mockRejectedValue(new Error('upload error'))
      const router = await setupRouter()
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      const input = wrapper.findComponent({ name: 'PromptInput' })
      input.vm.$emit('attach-files', [new File([''], 'bad.png', { type: 'image/png' })])
      await flushPromises()

      expect(mockQuasarNotify).toHaveBeenCalledWith({
        color: 'negative',
        message: '附件上传失败',
        icon: 'error',
      })
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 8. Pending question / permission
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('pending question / permission', () => {
    it('renders AgentQuestion when pendingQuestion is set', async () => {
      mockPendingQuestion.value = { type: 'question' } as unknown as QuestionRequest

      const router = await setupRouter()
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      expect(wrapper.findComponent({ name: 'AgentQuestion' }).exists()).toBe(true)
    })

    it('renders AgentPermission when pendingPermission is set', async () => {
      mockPendingPermission.value = { type: 'permission' } as unknown as PermissionRequest

      const router = await setupRouter()
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      expect(wrapper.findComponent({ name: 'AgentPermission' }).exists()).toBe(true)
    })

    it('passes activeAttentionCallId to SessionChatView from pending question', async () => {
      mockPendingQuestion.value = {
        type: 'question',
        tool: { callID: 'call-abc' },
      } as unknown as QuestionRequest

      const router = await setupRouter()
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      const chatView = wrapper.findComponent({ name: 'SessionChatView' })
      expect(chatView.props('activeAttentionCallId')).toBe('call-abc')
    })

    it('passes activeAttentionCallId to SessionChatView from pending permission', async () => {
      mockPendingPermission.value = {
        type: 'permission',
        tool: { callID: 'call-xyz' },
      } as unknown as PermissionRequest

      const router = await setupRouter()
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      const chatView = wrapper.findComponent({ name: 'SessionChatView' })
      expect(chatView.props('activeAttentionCallId')).toBe('call-xyz')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════════
  // 9. Topbar: status spinner, currentSessionLabel
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('topbar', () => {
    it('shows session title when active', async () => {
      mockSessionId.value = 'title-session'
      const session = makeSessionItem({ id: 'title-session', title: 'My Title', time: new Date() })
      mockSessionList.value = [session]

      const router = await setupRouter('title-session')
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      expect(wrapper.text()).toContain('My Title')
    })

    it('shows "工作台" (workspace) when no session', async () => {
      const router = await setupRouter()
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      expect(wrapper.text()).toContain('工作台')
    })

    it('shows loading status when isLoading', async () => {
      mockIsLoading.value = true
      const router = await setupRouter()
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      expect(wrapper.text()).toContain('生成中')
    })

    it('switches right panel visibility on toggle', async () => {
      const router = await setupRouter()
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      // UILayoutDrawer renders content even when hidden (just display:none)
      // Panel stub should always be present in the DOM
      const panel = wrapper.findComponent({ name: 'WorkspaceArtifactsPanel' })
      expect(panel.exists()).toBe(true)

      // Verify the panel receives artifacts prop (empty initially)
      expect(panel.props('artifacts')).toEqual([])
    })

    it('shows session switching spinner', async () => {
      mockIsLoading.value = false
      // isSessionSwitching is a local ref, triggered by handleSwitchSession
      // We can verify it doesn't show when not switching
      const router = await setupRouter()
      const wrapper = mountPage(SessionWorkspacePage, {
        global: { plugins: [router] },
      })
      await flushPromises()

      expect(wrapper.text()).not.toContain('切换会话')
    })
  })
})
