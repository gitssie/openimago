<template>
  <q-page :style-fn="pageHeightFn" class="session-workspace" style="padding: 0; overflow: hidden;">
    <UILayout class="session-layout relative full-height" view="hhh lpr lfr" container>
      <UILayoutDrawer :model-value="!sidebarCollapsed" side="left" :width="256" :breakpoint="1024" bordered show-if-above @update:model-value="sidebarCollapsed = !$event">
        <SessionWorkspaceSidebar
          :sessions="sidebarSessions"
          :session-count="sidebarSessions.length"
          :collapsed="sidebarCollapsed"
          @create="createNewSession"
          @select="handleSwitchSession"
          @delete="deleteSession"
          @toggle-collapse="sidebarCollapsed = !sidebarCollapsed"
        />
      </UILayoutDrawer>

      <UILayoutPageContainer>
        <UILayoutPage class="chat-page">
          <main class="chat-area">
        <header class="session-topbar">
          <div class="col min-width-0">
            <div v-if="currentParentSession" class="text-caption text-grey-5 row items-center no-wrap breadcrumb-row">
              <q-btn
                flat
                dense
                no-caps
                size="sm"
                class="breadcrumb-parent-btn q-px-none"
                color="grey-5"
                :label="getSessionLabel(currentParentSession)"
                @click="handleSwitchSession(currentParentSession.id)"
              />
              <q-icon name="chevron_right" size="16px" color="grey-5" />
            </div>
            <button class="session-heading" type="button">
              {{ currentSessionLabel }}
              <q-icon name="expand_more" size="18px" />
            </button>
          </div>

          <div class="topbar-actions">
            <div v-if="isSessionSwitching || isLoading" class="topbar-status">
              <q-spinner-dots size="16px" color="grey-5" />
              <span>{{ isLoading ? '生成中' : '切换会话' }}</span>
            </div>
            <button
              type="button"
              class="topbar-icon-btn"
              :class="{ 'topbar-icon-btn--active': rightPanelVisible }"
              :aria-label="'切换右侧面板'"
              @click="rightPanelVisible = !rightPanelVisible"
            >
              <OiIcon name="sliders" :size="18" />
              <q-tooltip anchor="bottom middle" self="top middle">{{ rightPanelVisible ? '关闭右侧面板' : '打开右侧面板' }}</q-tooltip>
            </button>
            <button type="button" class="topbar-icon-btn" aria-label="外观">
              <OiIcon name="palette" :size="18" />
              <q-tooltip anchor="bottom middle" self="top middle">外观</q-tooltip>
            </button>
          </div>
        </header>

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



          </main>
        </UILayoutPage>
      </UILayoutPageContainer>

      <UILayoutFooter bordered>

        <div class="input-area">
          <div class="input-container">
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
                <div v-for="todo in sessionTodos" :key="todo.content" class="todo-dock__item row no-wrap items-start q-gutter-sm">
                  <q-icon
                    :name="todo.status === 'completed' ? 'check_circle' : todo.status === 'in_progress' ? 'more_horiz' : todo.status === 'cancelled' ? 'cancel' : 'radio_button_unchecked'"
                    :color="todo.status === 'completed' ? 'positive' : todo.status === 'in_progress' ? 'grey-5' : todo.status === 'cancelled' ? 'grey-5' : 'grey-4'"
                    size="16px"
                    class="q-mt-xs"
                  />
                  <div class="col text-body2" :class="{ 'text-grey-5': todo.status === 'completed' || todo.status === 'cancelled' }">
                    {{ todo.content }}
                  </div>
                </div>
              </div>
            </div>

            <div v-if="revertMessagePreview" class="revert-dock imago-dock imago-dock--warning q-mb-sm row items-center justify-between q-gutter-sm">
              <div class="col min-width-0">
                <div class="text-caption text-grey-5">{{ t('agent.revertActive') }}</div>
                <div class="text-body2 text-weight-medium ellipsis">{{ revertMessagePreview }}</div>
              </div>
              <div class="row items-center q-gutter-sm">
                <q-btn flat dense no-caps size="sm" color="warning" :label="t('agent.restore')" @click="restoreRevert" />
                <q-icon name="history" size="18px" color="warning" />
              </div>
            </div>

            <div v-if="currentQueuedFollowups.length > 0" class="followup-dock imago-dock q-mb-sm">
              <button type="button" class="followup-dock__header row items-center justify-between q-gutter-sm" @click="followupCollapsed = !followupCollapsed">
                <div class="text-caption text-weight-medium text-grey-5">
                  {{ currentQueuedFollowups.length === 1 ? t('agent.followupOne') : t('agent.followupMany', { count: currentQueuedFollowups.length }) }}
                </div>
                <div v-if="followupCollapsed" class="text-caption text-grey-6 ellipsis followup-dock__preview">
                  {{ currentQueuedFollowups[0] ? getFollowupPreview(currentQueuedFollowups[0]) : '' }}
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
              <div v-if="followupsPaused" class="text-caption text-warning q-mb-sm q-mt-xs">
                {{ t('agent.followupPaused') }}
              </div>
              <div v-if="!followupCollapsed" class="followup-dock__list">
                <div v-for="item in currentQueuedFollowups" :key="item.id" class="followup-dock__item row items-center q-gutter-sm">
                  <div class="col min-width-0">
                    <div class="text-body2 ellipsis">{{ getFollowupPreview(item) }}</div>
                    <div v-if="failedFollowupId[sessionId || ''] === item.id" class="text-caption text-negative q-mt-xs">
                      {{ t('agent.followupFailed') }}
                    </div>
                  </div>
                  <q-btn dense no-caps size="sm" color="grey-6" :loading="sendingFollowupId === item.id" :label="t('agent.sendNow')" @click="sendQueuedFollowup(item.id, true)" />
                  <q-btn flat dense no-caps size="sm" color="grey-6" :disable="sendingFollowupId === item.id" :label="'编辑'" @click="editQueuedFollowup(item.id)" />
                </div>
              </div>
            </div>

            <AgentPermission
              v-if="pendingPermission"
              :request="pendingPermission"
              :on-respond="replyToPermission"
            />

            <PromptInput
              v-if="!currentParentSession"
              ref="inputRef"
              v-model="draftInputMessage"
              :placeholder="t('agent.askAnythingPlaceholder')"
              :loading="isLoading"
              :connected="isConnected"
              :disabled="isSessionSwitching"
              :attachments="pendingAttachments"
              @submit="submitDraftMessage"
              @abort="abortSession"
              @remove-attachment="removeAttachment"
              @attach-files="onFilesSelected"
            >
              <template #leading>
                <button
                  type="button"
                  class="prompt-input__icon-btn"
                  :aria-label="t('gallery.composerAttach')"
                >
                  <OiIcon name="plus" :size="14" />
                  <ImagePickerPopup />
                </button>
                <button type="button" class="prompt-input__select">
                  <OiIcon name="sliders" :size="14" />
                  <span>{{ t('gallery.composerMode') }}</span>
                  <q-icon name="expand_more" size="14px" class="prompt-input__select-caret" />
                </button>
                <button type="button" class="prompt-input__select">
                  <q-icon name="crop_landscape" size="14px" />
                  <span>{{ t('gallery.composerAspect') }}</span>
                </button>
                <button type="button" class="prompt-input__select">
                  <OiIcon name="clock" :size="14" />
                  <span>{{ t('gallery.composerDuration') }}</span>
                </button>
              </template>
            </PromptInput>
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
        </div>
      </UILayoutFooter>

      <UILayoutDrawer v-model="rightPanelVisible" side="right" :width="360" behavior="desktop" bordered>
        <SessionWorkspaceResultsPanel
          v-model="resultTab"
          :current-session-label="currentSessionLabel"
          :latest-prompt-text="latestPromptText"
          :generated-results="resultsPanelItems"
          :selected-result-id="selectedResultId"
          :selected-result="selectedResultPanelItem"
          :show-pending-result-tile="showPendingResultTile"
          :side-panel-result-count="sidePanelResultCount"
          @select-result="handleSelectResult"
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
import OiIcon from 'src/components/ui/OiIcon.vue'
import AgentQuestion from 'src/components/AgentQuestion.vue'
import AgentPermission from 'src/components/AgentPermission.vue'
import PromptInput from 'src/components/PromptInput.vue'
import ImagePickerPopup from 'src/components/ImagePickerPopup.vue'
import SessionChatView from 'src/components/session-workspace/SessionChatView.vue'
import SessionWorkspaceSidebar from 'src/components/session-workspace/SessionWorkspaceSidebar.vue'
import SessionWorkspaceResultsPanel from 'src/components/session-workspace/SessionWorkspaceResultsPanel.vue'
import { UILayout, UILayoutDrawer, UILayoutFooter, UILayoutPage, UILayoutPageContainer } from 'src/components/ui/layout'
import { useAgentSession, type DisplayMessage } from 'src/composables/useAgentSession'
import type { SessionItem } from 'src/services/agents'

type DisplayTurn = {
  user: DisplayMessage
  assistant: DisplayMessage | null
}

type GeneratedResultItem = {
  id: string
  url: string
  filename: string
  time: Date
  prompt: string
}

type SidebarSessionItem = {
  id: string
  title: string
  preview: string
  timeLabel: string
  clockLabel: string
  meta: string
  active: boolean
}

type ResultPanelItem = {
  id: string
  url: string
  filename: string
  prompt: string
  timeLabel: string
}

// ── UI refs ───────────────────────────────────────────────────────────────────

const $q = useQuasar()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const chatViewRef = ref<InstanceType<typeof SessionChatView> | null>(null)
const followupCollapsed = ref(false)
const isSessionSwitching = ref(false)
const inputRef = ref<{ focus: () => void; setDraft: (value: string) => void } | null>(null)
const draftInputMessage = ref('')
const resultTab = ref('result')
const selectedResultId = ref<string | null>(null)
const sidebarCollapsed = ref(false)
const rightPanelVisible = ref(false)

function pageHeightFn(offset: number) {
  return { minHeight: `${window.innerHeight - offset}px`, height: `${window.innerHeight - offset}px` }
}

function scrollToBottomNow() {
  chatViewRef.value?.scrollToBottomNow()
}

function scrollIfAtBottom() {
  chatViewRef.value?.doScrollToBottom()
}

// ── Composable ────────────────────────────────────────────────────────────────

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
  () => void nextTick(() => inputRef.value?.focus()),
)

// ── Computed ──────────────────────────────────────────────────────────────────

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

const displayTurns = computed<DisplayTurn[]>(() => {
  const turns: DisplayTurn[] = []
  const revertMessageId = currentSessionItem.value?.revert?.messageID

  for (const message of displayMessages.value) {
    if (message.role === 'user') {
      if (revertMessageId && message.id >= revertMessageId) {
        continue
      }
      turns.push({ user: message, assistant: null })
      continue
    }
    const userId = message.id.replace(/^asst:/, '')
    const existing = turns.find((turn) => turn.user.id === userId)
    if (existing) {
      existing.assistant = message
    }
  }
  return turns
})

const latestPromptText = computed(() => {
  for (let index = displayTurns.value.length - 1; index >= 0; index -= 1) {
    const text = getUserMessageText(displayTurns.value[index]!.user).trim()
    if (text) return text
  }
  return ''
})

const generatedResults = computed<GeneratedResultItem[]>(() => {
  const items: GeneratedResultItem[] = []

  for (const turn of displayTurns.value) {
    if (!turn.assistant) continue

    const prompt = getUserMessageText(turn.user).trim()

    for (const part of turn.assistant.parts) {
      if (part.type !== 'file') continue
      const mime = part.mime?.toLowerCase() ?? ''
      const filename = part.filename || part.url.split('/').at(-1) || '生成结果'
      const looksLikeImage = mime.includes('image') || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(filename)
      if (!looksLikeImage) continue

      items.push({
        id: part.id,
        url: part.url,
        filename,
        time: turn.assistant.time,
        prompt,
      })
    }
  }

  return items.sort((left, right) => right.time.getTime() - left.time.getTime())
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

const showPendingResultTile = computed(() => isLoading.value && generatedResults.value.length > 0)

const sidePanelResultCount = computed(() => generatedResults.value.length + (showPendingResultTile.value ? 1 : 0))

const selectedGeneratedResult = computed<GeneratedResultItem | null>(() => {
  const selected = generatedResults.value.find((item) => item.id === selectedResultId.value)
  return selected ?? generatedResults.value[0] ?? null
})

const resultsPanelItems = computed<ResultPanelItem[]>(() => generatedResults.value.map((item) => ({
  id: item.id,
  url: item.url,
  filename: item.filename,
  prompt: item.prompt,
  timeLabel: formatResultTime(item.time),
})))

const selectedResultPanelItem = computed<ResultPanelItem | null>(() => {
  if (!selectedGeneratedResult.value) return null
  return {
    id: selectedGeneratedResult.value.id,
    url: selectedGeneratedResult.value.url,
    filename: selectedGeneratedResult.value.filename,
    prompt: selectedGeneratedResult.value.prompt,
    timeLabel: formatResultTime(selectedGeneratedResult.value.time),
  }
})

watch(generatedResults, (items) => {
  if (items.length === 0) {
    selectedResultId.value = null
    return
  }

  if (!selectedResultId.value || !items.some((item) => item.id === selectedResultId.value)) {
    selectedResultId.value = items[0]!.id
  }
}, { immediate: true })

// ── Session helpers ───────────────────────────────────────────────────────────

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
      const part = parts[partIndex]
        if (part?.type !== 'tool' || part.tool !== 'task') continue

        const state = part.state as {
          metadata?: Record<string, unknown>
          input?: Record<string, unknown>
        }
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

// ── UI helpers ────────────────────────────────────────────────────────────────

function getUserMessageText(msg: DisplayMessage): string {
  return msg.parts
    .filter((p): p is TextPart => p.type === 'text' && !p.synthetic)
    .map((p) => p.text)
    .join('')
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
    const mime = part.mime?.toLowerCase() ?? ''
    const filename = part.filename || ''
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

function handleSelectResult(id: string) {
  selectedResultId.value = id
}



// ── Infinite scroll ───────────────────────────────────────────────────────────

function onLoadHistory(_index: number, done: (stop?: boolean) => void) {
  void loadOlderMessages()
    .then((hasMore) => done(!hasMore))
    .catch(() => done(true))
}

// ── Input helpers ─────────────────────────────────────────────────────────────

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

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(() => {
  void loadAgents()
  void loadCommands()
  void loadSessionList().then(() => {
    // If landing directly on /sessions/:id, switch to that session
    const paramId = route.params.id
    if (paramId && typeof paramId === 'string' && paramId !== sessionId.value) {
      void switchSession(paramId)
    }
  })
  startEventSubscription()
  void nextTick(() => { inputRef.value?.focus() })
})

// Sync session when user navigates via browser back/forward
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
  color: var(--imago-text-primary);
  background: var(--imago-bg-void);
}

.session-layout {
  z-index: 1;
  width: 100%;
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

.session-topbar {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-bottom: 1px solid var(--imago-border-soft);
  background: var(--imago-bg-void);
}

.session-heading {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  color: var(--imago-text-secondary);
  background: transparent;
  border: 0;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.session-heading:hover {
  color: var(--imago-text-primary);
}

.col.min-width-0 {
  min-width: 0;
}

.breadcrumb-row {
  min-width: 0;
}

.breadcrumb-parent-btn {
  min-width: 0;
}

.breadcrumb-parent-btn :deep(.q-btn__content) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  max-width: 200px;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.topbar-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--imago-text-dim);
  font-size: 12px;
}

.topbar-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--imago-radius-md);
  background: transparent;
  cursor: pointer;
  color: var(--imago-text-muted);
  transition: color 120ms ease, background 120ms ease, border-color 120ms ease;
}

.topbar-icon-btn:hover {
  color: var(--imago-text-primary);
  background: var(--imago-bg-raised);
}

.topbar-icon-btn--active {
  color: var(--imago-neon-cyan);
  border-color: var(--imago-border-cyan);
  background: var(--imago-cyan-06);
}

/* ── Messages ────────────────────────────────────────────────────────────── */

.messages-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 24px 12px;
  position: relative;
}

/* Scroll-to-bottom floating button — sits above the footer, centered */
.scroll-to-bottom-btn {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translate(-50%, calc(-100% - 10px));
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--imago-border-light);
  background: var(--imago-bg-raised);
  color: var(--imago-text-secondary);
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: background var(--imago-ease-fast), border-color var(--imago-ease-fast);
  z-index: 1002;

  &:hover {
    background: var(--imago-bg-float);
    border-color: var(--imago-border-soft);
  }
}

.scroll-btn-fade-enter-active,
.scroll-btn-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.scroll-btn-fade-enter-from,
.scroll-btn-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, calc(-100% - 4px));
}

.empty-chat {
  height: 100%;
  color: var(--imago-text-dim);
}

.empty-chat__content {
  width: min(560px, 90%);
  padding: 0 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* ── AI Logo ── */
.empty-chat__logo-wrap {
  margin-bottom: 32px;
  position: relative;
  width: 160px;
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-chat__logo-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid transparent;
  background: linear-gradient(135deg, var(--imago-neon-cyan), var(--imago-neon-purple)) border-box;
  -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: destination-out;
  mask-composite: exclude;
  animation: logo-spin 6s linear infinite;
  box-shadow: 0 0 32px var(--imago-cyan-08), 0 0 80px rgba(168, 85, 247, 0.08);
}

.empty-chat__logo-ring::before {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 1.5px solid var(--imago-border-cyan);
}

.empty-chat__logo-ring::after {
  content: '';
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--imago-neon-cyan);
  top: 4px;
  left: 50%;
  transform: translateX(-50%);
  box-shadow: 0 0 8px var(--imago-neon-cyan);
}

.empty-chat__logo-inner {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: var(--imago-bg-panel);
  border: 1.5px solid var(--imago-border-purple);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 0 20px rgba(168, 85, 247, 0.1);
}

.empty-chat__logo-img {
  width: 52px;
  height: 52px;
  object-fit: contain;
  filter: drop-shadow(0 0 8px rgba(168, 85, 247, 0.5));
}

@keyframes logo-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.empty-chat__title {
  font-size: 20px;
  font-weight: 600;
  color: var(--imago-text-primary);
  margin-bottom: 28px;
  letter-spacing: 0.01em;
}

.suggestions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  width: 100%;
}

.suggestion-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--imago-bg-surface);
  border: 1px solid var(--imago-border-soft);
  border-radius: var(--imago-radius-md);
  color: var(--imago-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: color 120ms ease, background 120ms ease, border-color 120ms ease;
  text-align: left;
  white-space: nowrap;
}

.suggestion-chip__icon {
  color: var(--imago-neon-cyan);
  opacity: 0.75;
  flex-shrink: 0;
}

.suggestion-chip:hover {
  color: var(--imago-text-primary);
  border-color: var(--imago-border-cyan-active);
  background: var(--imago-cyan-04);
}

.suggestion-chip:hover .suggestion-chip__icon {
  opacity: 1;
}

.message-turn + .message-turn {
  margin-top: 30px;
}

.turn-container {
  max-width: 760px;
  margin: 0 auto;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-turn-content {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  width: 100%;
  max-width: 100%;
  gap: 4px;
  margin-bottom: 10px;
}

.user-message-body {
  max-width: min(100%, 62ch);
  margin-left: auto;
  padding: 10px 14px;
  color: var(--imago-text-primary);
  border-radius: var(--imago-radius-md);
  border: 1px solid var(--imago-border-soft);
  background: var(--imago-bg-surface);
}

.assistant-turn-content {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.compaction-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  color: var(--imago-text-dim);
  font-size: 12px;
}

.compaction-divider__line {
  flex: 1;
  height: 1px;
  background: var(--imago-border-soft);
}

.compaction-divider__label {
  white-space: nowrap;
  color: var(--imago-text-dim);
}

.assistant-content {
  max-width: min(100%, 72ch);
  word-break: break-word;
  overflow-wrap: break-word;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.user-attachments {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  width: fit-content;
  max-width: min(100%, 62ch);
  margin-left: auto;
}

.user-attachment-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: min(100%, 220px);
  height: 48px;
  padding: 0 8px;
  border-radius: 10px;
  background: var(--imago-bg-raised);
  border: 1px solid var(--imago-border-soft);
  font-size: 12px;
  line-height: 1.3;
  min-width: 0;
  overflow: hidden;
}

.user-attachment-chip:has(.user-attachment-image) {
  height: auto;
  padding: 0;
}

.user-attachment-image {
  display: block;
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: var(--imago-radius-sm);
}

.user-attachments + .user-message-body {
  margin-top: 8px;
}

.user-comments {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
  width: 100%;
  max-width: min(100%, 62ch);
  margin-bottom: 8px;
}

.user-comment-card {
  width: 100%;
  max-width: 100%;
  padding: 4px 0 4px 12px;
  border-radius: 0;
  background: transparent;
  border-left: 1px solid var(--imago-border-cyan-active);
}

.user-comment-meta {
  color: var(--imago-text-muted);
}

.user-comment-path {
  max-width: 260px;
}

.user-comment-preview {
  padding: 4px 0 0;
  border-radius: 0;
  background: transparent;
  color: var(--imago-text-dim);
  white-space: pre-wrap;
}

.user-context-files {
  width: fit-content;
  max-width: min(100%, 62ch);
  margin-left: auto;
  margin-bottom: 8px;
}

.user-context-files__list {
  justify-content: flex-end;
}

.user-context-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 280px;
  padding: 3px 0;
  border-radius: 0;
  background: transparent;
  border: 0;
  font-size: 12px;
  line-height: 1.3;
  color: var(--imago-text-secondary);
}

.user-message-footer {
  min-height: 24px;
  width: 100%;
  max-width: min(100%, 62ch);
}

.user-message-meta {
  font-size: 12px;
  line-height: 1.2;
  color: var(--imago-text-faint);
}

.user-turn-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: var(--imago-bg-raised);
  color: var(--imago-text-muted);
  cursor: pointer;
  border-radius: 4px;
  opacity: 0;
  transition: opacity 150ms ease, background var(--imago-ease-fast);
  padding: 0;

  &:hover {
    background: var(--imago-bg-surface);
    color: var(--imago-text-primary);
  }
}

.user-turn-content:hover .user-turn-action,
.user-turn-content:focus-within .user-turn-action {
  opacity: 1;
}

.assistant-turn-footer {
  min-height: 24px;
  width: min(100%, 72ch);
  opacity: 0;
  transition: opacity 0.15s ease;
}

.assistant-content:hover .assistant-turn-footer {
  opacity: 1;
}

.assistant-copy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: none;
  color: var(--imago-text-dim);
  cursor: pointer;
  border-radius: 4px;
  transition: color var(--imago-ease-fast), background var(--imago-ease-fast);
  padding: 0;

  &:hover {
    color: var(--imago-text-secondary);
    background: rgba(148 163 184 / 0.1);
  }
}

.thinking-indicator {
  padding: 0 0 4px;
  color: var(--imago-text-dim);
}

.text-part {
  width: min(100%, 72ch);
  margin-top: 16px;
  white-space: pre-wrap;
  line-height: 1.65;
  word-break: break-word;
  overflow-wrap: break-word;
}

.assistant-content :deep(.reasoning-container),
.assistant-content :deep(.tool-call-item),
.assistant-content :deep(.part-meta-item) {
  width: min(100%, 72ch);
}

.text-part :deep(p) {
  margin: 0 0 10px;
}

.text-part :deep(p:last-child) {
  margin-bottom: 0;
}

.text-part :deep(h1),
.text-part :deep(h2),
.text-part :deep(h3),
.text-part :deep(h4) {
  margin: 12px 0 6px;
  font-weight: 600;
  line-height: 1.3;
}

.text-part :deep(code) {
  background: var(--imago-border-light);
  border: 1px solid var(--imago-border-soft);
  padding: 1px 5px;
  border-radius: var(--imago-radius-xs);
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.875em;
  word-break: break-all;
}

.text-part :deep(pre) {
  background: var(--imago-bg-code);
  padding: 12px 16px;
  border-radius: var(--imago-radius-md);
  overflow-x: auto;
  margin: 10px 0;
  font-size: 0.875em;
  max-height: 400px;
}

.text-part :deep(pre code) {
  background: none;
  border: none;
  padding: 0;
  word-break: normal;
}

.text-part :deep(ul),
.text-part :deep(ol) {
  padding-left: 22px;
  margin: 4px 0 10px;
}

.text-part :deep(li) {
  margin-bottom: 3px;
}

.text-part :deep(blockquote) {
  border-left: 3px solid var(--imago-border-dim);
  margin: 8px 0;
  padding: 6px 12px;
  color: var(--imago-text-muted);
  background: var(--imago-border-subtle);
  border-radius: 0 var(--imago-radius-sm) var(--imago-radius-sm) 0;
}

.text-part :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 10px 0;
  font-size: 13px;
}

.text-part :deep(th),
.text-part :deep(td) {
  border: 1px solid var(--imago-border-soft);
  padding: 6px 10px;
  text-align: left;
}

.text-part :deep(th) {
  background: var(--imago-bg-raised);
  font-weight: 600;
}

.text-part :deep(tr:nth-child(even)) {
  background: var(--imago-border-subtle);
}

.text-part :deep(img) {
  width: min(100%, 440px);
  max-width: 100%;
  max-height: 248px;
  height: auto;
  aspect-ratio: auto;
  object-fit: contain;
  border-radius: var(--imago-radius-sm);
  display: block;
  border: 1px solid var(--imago-border-soft);
  background: var(--imago-bg-raised);
}

/* ── Input / composer region ─────────────────────────────────────────────── */

.input-area {
  padding: 12px 20px 16px;
  background: var(--imago-bg-void);

}

.input-container {
  max-width: 760px;
  margin: 0 auto;
}

.todo-dock {
  padding: 10px 12px;
}

.todo-dock__preview {
  max-width: 55%;
}

.todo-dock__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 180px;
  overflow-y: auto;
}

.todo-dock__item {
  align-items: flex-start;
}

.revert-dock {
  padding: 10px 12px;
}

.followup-dock {
  padding: 10px 12px;
}

.followup-dock__header {
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.followup-dock__preview {
  max-width: 55%;
}

.followup-dock__toggle {
  transition: transform 0.15s ease;
}

.followup-dock__toggle--collapsed {
  transform: rotate(180deg);
}

.followup-dock__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 180px;
  overflow-y: auto;
}

.followup-dock__item {
  min-width: 0;
}

.imago-dock {
  background: var(--imago-bg-surface);
  border: 1px solid var(--imago-border-soft);
  border-radius: var(--imago-radius-lg);
}

.child-session-input-disabled {
  width: 100%;
  padding: 14px 16px;
}

/* ── Responsive ──────────────────────────────────────────────────────────── */

@media (max-width: 1280px) {
  .messages-container {
    padding-inline: 20px;
  }
}

@media (max-width: 900px) {
  .messages-container {
    padding-inline: 16px;
  }
}
</style>
