<template>
  <q-page :style-fn="pageHeightFn" class="session-workspace" style="padding: 0; overflow: hidden;">
    <!-- Full-viewport top toolbar (above 3-column body) -->
    <WorkspaceTopBar
      class="session-workspace__topbar"
      :brand-variant="'wordmark'"
      :brand-label="'工作台'"
      :tabs="SESSION_WORKSPACE_TABS"
      :active-tab="activeWorkspaceTab"
      :panel-base-id="'session-workspace'"
      @tab-change="onWorkspaceTabChange"
    >
      <template #right>
        <TopbarActionButton
          :leading-icon="'people'"
          :label="'OpenImago 交流群'"
          :has-popup="true"
          :aria-label="'打开 OpenImago 交流群'"
          @click="handleOpenCommunity"
        />
        <TopbarActionButton
          :variant="'pro'"
          :leading-icon="'crown'"
          :label="'升级到 Pro'"
          :aria-label="'升级到 Pro'"
          @click="handleOpenProUpgrade"
        />
        <TopbarActionButton
          :variant="'bell'"
          :icon-only="true"
          :badge="hasUnreadNotifications"
          :aria-label="'通知'"
          @click="handleOpenNotifications"
        />
      </template>
    </WorkspaceTopBar>

    <UILayout class="session-layout relative full-height" view="lhr lpr lfr" container>
      <UILayoutDrawer
        :model-value="!sidebarCollapsed"
        side="left"
        :width="280"
        :breakpoint="1024"
        bordered
        show-if-above
        @update:model-value="sidebarCollapsed = !$event"
      >
        <SessionWorkspaceSidebar
          :sessions="sidebarSessions"
          :session-count="sidebarSessions.length"
          :collapsed="sidebarCollapsed"
          :creating="isSessionSwitching"
          @create="createNewSession"
          @select="handleSwitchSession"
          @delete="deleteSession"
          @toggle-collapse="sidebarCollapsed = !sidebarCollapsed"
        />
      </UILayoutDrawer>

      <UILayoutPageContainer>
        <UILayoutPage class="chat-page">
          <main class="chat-area">
            <!--
              The chat surface and composer now live in a single centered
              column. The composer is a sibling of the chat (not a footer),
              so it scrolls with the chat inside the same scrollable area
              when the message stream is long.
            -->
            <div class="chat-body">
              <header v-if="currentSessionItem || currentSessionLabel" class="chat-meta">
                <div class="chat-meta__title-row">
                  <h2 class="chat-meta__title">
                    {{ currentSessionLabel }}
                  </h2>
                  <span v-if="currentSessionItem" class="chat-meta__clock">
                    {{ formatSessionTime(currentSessionItem.time) }}
                  </span>
                  <span v-if="isConnected" class="chat-meta__status" aria-label="在线">
                    <span class="chat-meta__status-dot" />
                    <span>在线</span>
                  </span>
                </div>
              </header>

              <div class="chat-body__messages">
                <SessionChatView
                  ref="chatViewRef"
                  :session-id="sessionId"
                  :display-messages="displayMessages"
                  :part-text="partText"
                  :is-loading="isLoading"
                  :session-status="sessionStatus"
                  :history-exhausted="historyExhausted"
                  :history-loading="historyLoading"
                  :current-session-item="currentSessionItem"
                  :active-attention-call-id="activeAttentionCallId"
                  @load-history="onLoadHistory"
                  @switch-session="handleSwitchSession"
                  @revert-turn="(msgId) => void revertMessage(msgId)"
                  @use-suggestion="useSuggestion"
                />
              </div>

              <!--
                Extra dock / popup region (todos, followups, revert preview,
                agent question / permission). Rendered in a column above the
                composer so it scrolls with the chat, matching the original
                UILayoutFooter behaviour while the composer is now in the
                center column.
              -->
              <div v-if="hasExtras" class="chat-body__extras">
                <AgentQuestion
                  v-if="pendingQuestion"
                  :request="pendingQuestion"
                  :on-reply="replyToQuestion"
                  :on-reject="rejectQuestion"
                />

                <div v-if="sessionTodos.length > 0" class="todo-dock imago-dock q-mb-sm">
                  <div class="row items-center justify-between q-mb-xs">
                    <div class="text-caption text-weight-medium text-grey-5">
                      {{ t('agent.todoProgress', { done: completedTodoCount, total: sessionTodos.length }) }}
                    </div>
                    <div v-if="activeTodoLabel" class="text-caption text-grey-5 ellipsis todo-dock__preview">
                      {{ activeTodoLabel }}
                    </div>
                  </div>
                  <div class="todo-dock__list">
                    <div
                      v-for="todo in sessionTodos"
                      :key="todo.content"
                      class="todo-dock__item row no-wrap items-start q-gutter-sm"
                    >
                      <q-icon
                        :name="todo.status === 'completed' ? 'check_circle' : todo.status === 'in_progress' ? 'more_horiz' : todo.status === 'cancelled' ? 'cancel' : 'radio_button_unchecked'"
                        :color="todo.status === 'completed' ? 'positive' : todo.status === 'in_progress' ? 'grey-5' : todo.status === 'cancelled' ? 'grey-5' : 'grey-4'"
                        size="16px"
                        class="q-mt-xs"
                      />
                      <div
                        class="col text-body2"
                        :class="{ 'text-grey-5': todo.status === 'completed' || todo.status === 'cancelled' }"
                      >
                        {{ todo.content }}
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  v-if="revertMessagePreview"
                  class="revert-dock imago-dock imago-dock--warning q-mb-sm row items-center justify-between q-gutter-sm"
                >
                  <div class="col min-width-0">
                    <div class="text-caption text-grey-5">{{ t('agent.revertActive') }}</div>
                    <div class="text-body2 text-weight-medium ellipsis">{{ revertMessagePreview }}</div>
                  </div>
                  <div class="row items-center q-gutter-sm">
                    <q-btn
                      flat
                      dense
                      no-caps
                      size="sm"
                      color="warning"
                      :label="t('agent.restore')"
                      @click="restoreRevert"
                    />
                    <q-icon name="history" size="18px" color="warning" />
                  </div>
                </div>

                <div v-if="currentQueuedFollowups.length > 0" class="followup-dock imago-dock q-mb-sm">
                  <button
                    type="button"
                    class="followup-dock__header row items-center justify-between q-gutter-sm"
                    @click="followupCollapsed = !followupCollapsed"
                  >
                    <div class="text-caption text-weight-medium text-grey-5">
                      {{ currentQueuedFollowups.length === 1 ? t('agent.followupOne') : t('agent.followupMany', { count: currentQueuedFollowups.length }) }}
                    </div>
                    <q-btn
                      flat
                      dense
                      round
                      size="sm"
                      icon="expand_more"
                      color="grey-5"
                      class="followup-dock__toggle"
                      :class="{ 'followup-dock__toggle--collapsed': followupCollapsed }"
                      @click.stop="followupCollapsed = !followupCollapsed"
                    />
                  </button>
                  <div v-if="!followupCollapsed" class="followup-dock__list">
                    <div
                      v-for="item in currentQueuedFollowups"
                      :key="item.id"
                      class="followup-dock__item row items-center q-gutter-sm"
                    >
                      <div class="col min-width-0">
                        <div class="text-body2 ellipsis">{{ getFollowupPreview(item) }}</div>
                        <div
                          v-if="failedFollowupId[sessionId || ''] === item.id"
                          class="text-caption text-negative q-mt-xs"
                        >
                          {{ t('agent.followupFailed') }}
                        </div>
                      </div>
                      <q-btn
                        dense
                        no-caps
                        size="sm"
                        color="grey-6"
                        :loading="sendingFollowupId === item.id"
                        :label="t('agent.sendNow')"
                        @click="sendQueuedFollowup(item.id, true)"
                      />
                      <q-btn
                        flat
                        dense
                        no-caps
                        size="sm"
                        color="grey-6"
                        :disable="sendingFollowupId === item.id"
                        :label="'编辑'"
                        @click="editQueuedFollowup(item.id)"
                      />
                    </div>
                  </div>
                </div>

                <AgentPermission
                  v-if="pendingPermission"
                  :request="pendingPermission"
                  :on-respond="replyToPermission"
                />
              </div>

              <ChatInputDock
                v-if="!currentParentSession"
                :loading="isLoading"
                :connected="isConnected"
                :disabled="isSessionSwitching"
                :attachments="pendingAttachments"
                @submit="submitDraftMessage"
                @abort="abortSession"
                @remove-attachment="(id) => removeAttachment(id)"
                @attach-files="onFilesSelected"
              />
              <div v-else class="child-session-input-disabled imago-dock text-body2 text-grey-7">
                <span>{{ t('agent.childInputDisabled') }}</span>
                <q-btn
                  flat
                  dense
                  no-caps
                  color="grey-5"
                  class="q-ml-sm"
                  :label="t('agent.backToParent')"
                  @click="handleSwitchSession(currentParentSession.id)"
                />
              </div>
            </div>
          </main>
        </UILayoutPage>
      </UILayoutPageContainer>

      <UILayoutDrawer v-model="rightPanelVisible" side="right" :width="360" behavior="desktop" bordered>
        <AIOutputsPanel
          :title="'AI 产出'"
          :subtitle="'当前会话的生成结果'"
          :items="aiOutputItems"
          :selected-id="selectedResultId"
          :layout="'grid'"
          :show-view-all="aiOutputItems.length > 6"
          :view-all-label="'查看全部'"
          :aria-label="'会话 AI 产出面板'"
          @item-select="handleSelectResult"
          @item-menu="handleItemMenu"
          @layout-change="(l) => { layoutMode = l }"
          @filter="handleFilterOutputs"
          @view-all="handleViewAll"
        />
      </UILayoutDrawer>
    </UILayout>
  </q-page>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import type { TextPart } from '@opencode-ai/sdk/v2'
import AgentQuestion from 'src/components/AgentQuestion.vue'
import AgentPermission from 'src/components/AgentPermission.vue'
import SessionChatView from 'src/components/session-workspace/SessionChatView.vue'
import SessionWorkspaceSidebar from 'src/components/session-workspace/SessionWorkspaceSidebar.vue'
import AIOutputsPanel from 'src/components/workspace/AIOutputsPanel.vue'
import ChatInputDock from 'src/components/workspace/ChatInputDock.vue'
import TopbarActionButton from 'src/components/workspace/TopbarActionButton.vue'
import WorkspaceTopBar from 'src/components/workspace/WorkspaceTopBar.vue'
import { UILayout, UILayoutDrawer, UILayoutPage, UILayoutPageContainer } from 'src/components/ui/layout'
import { useAgentSession, type DisplayMessage } from 'src/composables/useAgentSession'
import type { SessionItem } from 'src/services/agents'
import type { AIOutputItem } from 'src/components/session-workspace/types'

// ── Local types ─────────────────────────────────────────────────────────────

type SidebarSessionItem = {
  id: string
  title: string
  preview: string
  timeLabel: string
  clockLabel: string
  meta: string
  active: boolean
}

// ── Workspace tabs (shared 4-tab pill switcher) ─────────────────────────────

const SESSION_WORKSPACE_TABS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'storyboard', label: '故事板' },
  { id: 'timeline', label: '时间线' },
  { id: 'overview', label: '概览' },
  { id: 'conversation', label: '对话' },
]

// ── UI refs ─────────────────────────────────────────────────────────────────

const $q = useQuasar()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const chatViewRef = ref<InstanceType<typeof SessionChatView> | null>(null)
const followupCollapsed = ref(false)
const isSessionSwitching = ref(false)
const draftInputMessage = ref('')
const selectedResultId = ref<string | null>(null)
const sidebarCollapsed = ref(false)
const rightPanelVisible = ref(true)
const activeWorkspaceTab = ref<string>('conversation')
const layoutMode = ref<'grid' | 'rows'>('grid')
const hasUnreadNotifications = ref(true)

function pageHeightFn(offset: number) {
  return { minHeight: `${window.innerHeight - offset}px`, height: `${window.innerHeight - offset}px` }
}

function scrollToBottomNow() {
  chatViewRef.value?.scrollToBottomNow()
}

function scrollIfAtBottom() {
  chatViewRef.value?.doScrollToBottom()
}

// ── Composable ──────────────────────────────────────────────────────────────

const {
  displayMessages,
  historyExhausted,
  historyLoading,
  inputMessage,
  isLoading,
  isConnected,
  sessionId,
  sessionStatus,
  sessionList,
  childSessions,
  sessionMessages,
  pendingAttachments,
  currentQueuedFollowups,
  failedFollowupId,
  followupsPaused,
  sendingFollowupId,
  partText,
  pendingQuestion,
  pendingPermission,
  sessionTodos,
  loadAgents,
  loadCommands,
  loadSessionList,
  loadOlderMessages,
  switchSession,
  createNewSession,
  deleteSession,
  addAttachment,
  removeAttachment,
  retryAttachment,
  sendMessage,
  sendQueuedFollowup,
  editQueuedFollowup,
  getFollowupPreview,
  abortSession,
  replyToQuestion,
  rejectQuestion,
  replyToPermission,
  restoreRevert,
  revertMessage,
  startEventSubscription,
  stopEventSubscription,
} = useAgentSession(
  scrollToBottomNow,
  scrollIfAtBottom,
  (msg) => $q.notify({ color: 'negative', message: msg, icon: 'error' }),
  (msg, opts) => $q.notify({ color: 'info', message: msg, icon: opts?.icon ?? 'info', ...(opts?.timeout !== undefined ? { timeout: opts.timeout } : {}) }),
  (msg) => $q.notify({ color: 'positive', message: msg, icon: 'check' }),
  () => { /* focus moved into the chat input dock */ },
)

// ── Computed ────────────────────────────────────────────────────────────────

const currentParentSession = computed<SessionItem | null>(() => {
  if (!sessionId.value) return null
  const sessions = getAllSessions()
  const session = sessions.find((item) => item.id === sessionId.value)
  return session?.parentID
    ? sessions.find((item) => item.id === session.parentID) ?? null
    : null
})

const currentSessionLabel = computed(() => {
  if (!sessionId.value) return '工作台'
  const activeSession = getAllSessions().find((session) => session.id === sessionId.value)
  return activeSession ? getSessionLabel(activeSession) : '工作台'
})

const currentSessionItem = computed<SessionItem | null>(() => {
  if (!sessionId.value) return null
  return getAllSessions().find((session) => session.id === sessionId.value) ?? null
})

const activeAttentionCallId = computed(() => {
  return pendingPermission.value?.tool?.callID ?? pendingQuestion.value?.tool?.callID ?? null
})

const completedTodoCount = computed(() => sessionTodos.value.filter((todo) => todo.status === 'completed').length)

const activeTodoLabel = computed(() => {
  return sessionTodos.value.find((todo) => todo.status === 'in_progress')?.content
    ?? sessionTodos.value.find((todo) => todo.status === 'pending')?.content
    ?? sessionTodos.value.at(-1)?.content
    ?? ''
})

const revertMessagePreview = computed(() => {
  const revertMessageId = currentSessionItem.value?.revert?.messageID
  if (!revertMessageId) return ''
  const revertedMessage = displayMessages.value.find((message) => message.id === revertMessageId && message.role === 'user')
  if (!revertedMessage) return revertMessageId
  const text = getUserMessageText(revertedMessage).trim()
  return text || revertMessageId
})

const hasExtras = computed(() => {
  return Boolean(
    pendingQuestion.value
    || sessionTodos.value.length > 0
    || revertMessagePreview.value
    || currentQueuedFollowups.value.length > 0
    || pendingPermission.value,
  )
})

const sidebarSessions = computed<SidebarSessionItem[]>(() => sessionList.value
  .slice()
  .sort((left, right) => right.time.getTime() - left.time.getTime())
  .map((session) => ({
    id: session.id,
    title: getSessionLabel(session),
    preview: getSessionPreview(session),
    timeLabel: formatSessionTime(session.time),
    clockLabel: formatClock(session.time),
    meta: getSessionMeta(session),
    active: isSessionActive(session),
  })))

const generatedResults = computed<AIOutputItem[]>(() => {
  const items: AIOutputItem[] = []
  const displayTurns = computeDisplayTurns()
  for (const turn of displayTurns) {
    if (!turn.assistant) continue
    const prompt = getUserMessageText(turn.user).trim()
    for (const part of turn.assistant.parts) {
      if (part.type !== 'file') continue
      const mime = part.mime?.toLowerCase() ?? ''
      const filename = part.filename || (part as { url?: string }).url?.split('/').at(-1) || '生成结果'
      const kind = resolveMediaFileKind(mime, filename)
      if (!kind) continue
      items.push({
        id: (part as { id?: string }).id ?? `file-${items.length}`,
        url: (part as { url?: string }).url ?? '',
        filename,
        kind,
        timeLabel: formatResultTime(turn.assistant.time),
        prompt,
      })
    }
  }
  return items
    .sort((left, right) => right.timeLabel.localeCompare(left.timeLabel))
})

const aiOutputItems = computed<AIOutputItem[]>(() => generatedResults.value)

// ── Session helpers ────────────────────────────────────────────────────────

function getAllSessions(): SessionItem[] {
  const nested = Object.values(childSessions.value).flatMap((items) => items)
  return [...sessionList.value, ...nested]
}

function getChildTaskDescription(session: SessionItem): string {
  const parentId = session.parentID
  if (!parentId) return ''
  const parentEntries = sessionMessages.value[parentId] ?? []
  for (let entryIndex = parentEntries.length - 1; entryIndex >= 0; entryIndex -= 1) {
    const parts = parentEntries[entryIndex]?.parts ?? []
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = parentEntries[entryIndex]?.parts[partIndex]
      if (part?.type !== 'tool' || part.tool !== 'task') continue
      const state = part.state as { metadata?: Record<string, unknown>; input?: Record<string, unknown> }
      const metadataSessionId = typeof state.metadata?.sessionId === 'string' ? state.metadata.sessionId : undefined
      if (metadataSessionId !== session.id) continue
      const description = state.input?.description
      if (typeof description === 'string' && description.trim()) {
        return description.trim()
      }
    }
  }
  return ''
}

function getSessionLabel(session: SessionItem): string {
  const childDescription = getChildTaskDescription(session)
  if (childDescription) return childDescription
  const title = session.title?.trim()
  if (!title) return t('agent.untitled')
  return title.replace(/\s+\(@[^)]+ subagent\)$/, '')
}

function isSessionActive(session: SessionItem): boolean {
  if (!sessionId.value) return false
  if (session.id === sessionId.value) return true
  return currentParentSession.value?.id === session.id
}

function computeDisplayTurns(): { user: DisplayMessage; assistant: DisplayMessage | null }[] {
  const turns: { user: DisplayMessage; assistant: DisplayMessage | null }[] = []
  const revertMessageId = currentSessionItem.value?.revert?.messageID
  for (const message of displayMessages.value) {
    if (message.role === 'user') {
      if (revertMessageId && message.id >= revertMessageId) continue
      turns.push({ user: message, assistant: null })
      continue
    }
    const userId = message.id.replace(/^asst:/, '')
    const existing = turns.find((turn) => turn.user.id === userId)
    if (existing) existing.assistant = message
  }
  return turns
}

function getUserMessageText(msg: DisplayMessage): string {
  return msg.parts
    .filter((p): p is TextPart => p.type === 'text' && !p.synthetic)
    .map((p) => p.text)
    .join('')
}

function resolveMediaFileKind(mime: string, filename: string): AIOutputItem['kind'] | null {
  if (mime.includes('image') || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(filename)) return 'image'
  if (mime.includes('video') || /\.(mp4|webm|mov|avi)$/i.test(filename)) return 'video'
  if (mime.includes('audio') || /\.(mp3|wav|ogg|flac|aac|m4a)$/i.test(filename)) return 'audio'
  return null
}

function formatSessionTime(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 60_000) return t('agent.justNow')
  if (diff < 3_600_000) return t('agent.minutesAgo', { count: Math.floor(diff / 60_000) })
  if (diff < 86_400_000) return t('agent.hoursAgo', { count: Math.floor(diff / 3_600_000) })
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function getSessionPreview(session: SessionItem): string {
  const entries = sessionMessages.value[session.id] ?? []
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (!entry || entry.info.role !== 'user') continue
    const preview = entry.parts
      .filter((part): part is TextPart => part.type === 'text' && !part.synthetic)
      .map((part) => part.text.trim())
      .find(Boolean)
    if (preview) return clipText(preview, 42)
  }
  return ''
}

function getSessionMeta(session: SessionItem): string {
  const messages = sessionMessages.value[session.id] ?? []
  const imageCount = messages.reduce((count, entry) => count + entry.parts.filter((part) => {
    if (part.type !== 'file') return false
    const mime = (part as { mime?: string }).mime?.toLowerCase() ?? ''
    const filename = (part as { filename?: string }).filename || ''
    return mime.includes('image') || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(filename)
  }).length, 0)
  return imageCount > 0 ? `${imageCount} 张结果` : '对话工作流'
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function formatResultTime(date: Date): string {
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

function clipText(value: string, max = 48): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, Math.max(0, max - 1))}…`
}

// ── Event handlers ──────────────────────────────────────────────────────────

function handleSelectResult(id: string) {
  selectedResultId.value = id
}

function handleItemMenu(id: string, _event: MouseEvent) {
  // TODO: open context menu / re-run / download / etc.
  $q.notify({ color: 'info', message: `对 ${id} 打开菜单（待接入）`, icon: 'info', timeout: 1200 })
}

function handleFilterOutputs() {
  // TODO: open filter popup
  $q.notify({ color: 'info', message: '筛选面板即将上线', icon: 'filter_list', timeout: 1200 })
}

function handleViewAll() {
  // TODO: navigate to full results page
  $q.notify({ color: 'info', message: '全部结果视图即将上线', icon: 'list', timeout: 1200 })
}

function onWorkspaceTabChange(id: string) {
  activeWorkspaceTab.value = id
  // The redesigned session workspace renders its chat surface in the center
  // column regardless of the active tab label. We accept the tab id here so
  // the segmented control can reflect the user's selection; non-对话 tabs are
  // reserved for future affordances.
}

function handleOpenCommunity() {
  // TODO: navigate to /community when the route lands
  $q.notify({ color: 'info', message: 'OpenImago 交流群即将上线', icon: 'people', timeout: 1200 })
}

function handleOpenProUpgrade() {
  // TODO: open Pro upgrade dialog
  $q.notify({ color: 'info', message: 'Pro 升级流程即将上线', icon: 'crown', timeout: 1200 })
}

function handleOpenNotifications() {
  // TODO: open notifications panel
  $q.notify({ color: 'info', message: '通知中心即将上线', icon: 'bell', timeout: 1200 })
  hasUnreadNotifications.value = false
}

// ── Infinite scroll ─────────────────────────────────────────────────────────

function onLoadHistory(_index: number, done: (stop?: boolean) => void) {
  void loadOlderMessages()
    .then((hasMore) => done(!hasMore))
    .catch(() => done(true))
}

// ── Input helpers ───────────────────────────────────────────────────────────

function useSuggestion(s: string) {
  draftInputMessage.value = s
  void submitDraftMessage(s)
}

async function submitDraftMessage(value: string) {
  const next = value
  if (!next.trim() && pendingAttachments.value.length === 0) return
  inputMessage.value = next
  draftInputMessage.value = ''
  await sendMessage()
}

async function handleSwitchSession(sid: string) {
  if (!sid || sid === sessionId.value) return
  isSessionSwitching.value = true
  try {
    await switchSession(sid)
    void router.push({ name: 'session', params: { id: sid } })
  } finally {
    isSessionSwitching.value = false
  }
}

function onFilesSelected(files: File[]) {
  if (files.length === 0) return
  void Promise.all(files.map((file) => addAttachment(file))).catch(() => {
    $q.notify({ color: 'negative', message: '附件上传失败', icon: 'error' })
  })
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

onMounted(() => {
  void loadAgents()
  void loadCommands()
  void loadSessionList().then(() => {
    const paramId = route.params.id
    if (paramId && typeof paramId === 'string' && paramId !== sessionId.value) {
      void switchSession(paramId)
    }
  })
  startEventSubscription()
  void nextTick(() => { /* focus handled inside ChatInputDock */ })
})

watch(
  () => route.params.id,
  (id) => {
    const sid = typeof id === 'string' ? id : undefined
    if (sid && sid !== sessionId.value) void switchSession(sid)
    else if (!sid && sessionId.value) void switchSession('')
  },
)

onUnmounted(() => {
  stopEventSubscription()
})
</script>

<style scoped>
:global(body) {
  background: var(--imago-bg-void);
}

/* ── Base layout ─────────────────────────────────────────────────────────── */

.session-workspace {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  color: var(--imago-text-primary);
  background: var(--imago-bg-void);
}

/* Top toolbar (full viewport width, above the 3-column body) */
.session-workspace__topbar {
  flex-shrink: 0;
  position: relative;
  z-index: 5;
  width: 100%;
}

.session-layout {
  z-index: 1;
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;
}

/* Override UILayoutDrawer default white bg with our dark creative theme */
.session-layout :deep(.ui-layout__drawer) {
  background: var(--imago-bg-panel) !important;
  color: var(--imago-text-primary);
  border-color: var(--imago-border-dim);
}

.session-layout :deep(.ui-layout__drawer--left) {
  border-right: 1px solid var(--imago-border-dim);
}

.session-layout :deep(.ui-layout__drawer--right) {
  border-left: 1px solid var(--imago-border-dim);
}

.chat-page {
  min-width: 0;
}

/* ── Chat area ───────────────────────────────────────────────────────────── */

.chat-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--imago-bg-void);
}

.chat-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}

.chat-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 24px 4px;
  flex-shrink: 0;
}

.chat-meta__title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1 1 auto;
}

.chat-meta__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--imago-text-primary);
  letter-spacing: 0.005em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.chat-meta__clock {
  font-size: 11.5px;
  color: var(--imago-text-faint);
  font-variant-numeric: tabular-nums;
}

.chat-meta__status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  color: var(--imago-text-muted);
}

.chat-meta__status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--imago-neon-cyan);
  box-shadow: 0 0 6px var(--imago-neon-cyan);
}

.chat-body__messages {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.child-session-input-disabled {
  width: 100%;
  padding: 14px 16px;
  margin: 8px 20px 16px;
  border-radius: var(--imago-radius-lg);
}

.imago-dock {
  background: var(--imago-bg-surface);
  border: 1px solid var(--imago-border-soft);
  border-radius: var(--imago-radius-lg);
}

.chat-body__extras {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
  padding: 0 20px 8px;
}

.todo-dock,
.revert-dock,
.followup-dock {
  padding: 10px 12px;
}

.todo-dock__preview,
.followup-dock__preview {
  max-width: 55%;
}

.todo-dock__list,
.followup-dock__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 180px;
  overflow-y: auto;
}

.todo-dock__item,
.followup-dock__item {
  align-items: flex-start;
}

.followup-dock__header {
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.followup-dock__toggle {
  transition: transform 0.15s ease;
}

.followup-dock__toggle--collapsed {
  transform: rotate(180deg);
}

.imago-dock--warning {
  border-color: var(--imago-warning-border, rgba(245, 158, 11, 0.18));
  background: var(--imago-warning-bg, rgba(245, 158, 11, 0.06));
}

.text-grey-7 { color: rgba(255, 255, 255, 0.42); }
.text-grey-5 { color: var(--imago-text-muted, #a1a1aa); }
.text-caption { font-size: 12px; line-height: 1.4; }
.text-body2 { font-size: 14px; line-height: 1.4; }
.text-weight-medium { font-weight: 500; }
.ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
