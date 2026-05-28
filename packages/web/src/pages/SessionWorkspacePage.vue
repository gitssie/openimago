<template>
  <div class="session-workspace">
    <div class="workspace-layout">
      <aside class="session-sidebar">
        <div class="sidebar-brand">
          <span class="brand-name">openimago</span>
        </div>

        <div class="session-shell">
          <nav class="session-rail" aria-label="工作区导航">
            <q-btn
              v-for="item in railItems"
              :key="item.icon"
              round
              flat
              :icon="item.icon"
              :aria-label="item.label"
              :class="['rail-btn', { 'rail-btn--active': item.active }]"
            />
            <q-btn round flat icon="keyboard_double_arrow_right" aria-label="收起侧栏" class="rail-collapse" />
          </nav>

          <div class="session-list-panel">
            <q-btn label="新建会话" icon="add" class="new-session-btn" @click="createNewSession" unelevated no-caps />

            <div class="session-group">
              <div class="session-group__title">
                <span>会话流</span>
                <q-icon name="expand_more" />
              </div>
              <q-list v-if="sessionList.length > 0" class="session-list">
                <q-item
                  v-for="s in sessionList"
                  :key="s.id"
                  clickable
                  :active="isSessionActive(s)"
                  active-class="session-item--active"
                  class="session-item"
                  @click="handleSwitchSession(s.id)"
                >
                  <q-item-section>
                    <q-item-label class="session-title">{{ getSessionLabel(s) }}</q-item-label>
                    <q-item-label caption class="session-preview">{{ formatSessionTime(s.time) }}</q-item-label>
                  </q-item-section>
                  <q-item-section side class="session-time">{{ formatClock(s.time) }}</q-item-section>
                  <q-item-section side class="session-delete">
                    <q-btn flat round dense icon="close" size="xs" color="grey-5" @click.stop="deleteSession(s.id)" />
                  </q-item-section>
                </q-item>
              </q-list>
              <div v-else class="session-list-empty">暂无会话，点击上方按钮创建。</div>
            </div>
          </div>
        </div>
      </aside>

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
            <q-btn outline icon="light_mode" class="topbar-icon" aria-label="外观" round />
          </div>
        </header>

        <div ref="messagesAreaRef" class="messages-container">
          <q-inner-loading :showing="isSessionSwitching" color="grey-5" />

          <div v-if="!isSessionSwitching && displayMessages.length === 0" class="empty-chat flex flex-center">
            <div class="empty-chat__content imago-surface">
              <q-icon name="chat_bubble_outline" size="48px" color="grey-6" class="q-mb-md" />
              <div class="text-h6 text-grey-3 q-mb-xs">开始新会话</div>
              <p class="text-body2 text-grey-6">输入 prompt，生成图像、变体与可复用参数会同步出现在右侧面板。</p>
              <div class="suggestions">
                <q-btn
                  v-for="suggestion in suggestions"
                  :key="suggestion"
                   outline
                   no-caps
                   flat
                   class="suggestion-chip imago-option--chip"
                  :label="suggestion"
                  @click="useSuggestion(suggestion)"
                />
              </div>
            </div>
          </div>

          <q-infinite-scroll
            v-else
            ref="infiniteScrollRef"
            reverse
            :scroll-target="messagesAreaRef ?? undefined"
            :disable="historyExhausted || historyLoading"
            @load="onLoadHistory"
          >
            <template #loading>
              <div class="history-loading row justify-center items-center q-gutter-sm q-py-sm">
                <q-spinner-dots size="24px" color="grey-5" />
                <span>{{ t('agent.loadingEarlier') }}</span>
              </div>
            </template>

            <div v-for="turn in displayTurns" :key="turn.user.id" class="message-turn">
              <div class="turn-container">
                <!-- User message: right-aligned compact card -->
                <div class="user-turn-content">
                  <div v-if="getUserComments(turn.user).length > 0" class="user-comments q-mb-sm">
                    <div v-for="comment in getUserComments(turn.user)" :key="comment.id" class="user-comment-card">
                      <div class="row items-center q-gutter-xs text-caption text-blue-grey-2">
                        <q-icon name="comment" size="14px" />
                        <span class="text-weight-medium">{{ t('agent.context') }}</span>
                        <span v-if="comment.path" class="ellipsis user-comment-path">{{ comment.path }}</span>
                      </div>
                      <div v-if="comment.preview" class="user-comment-preview text-caption q-mt-xs">{{ comment.preview }}</div>
                      <div class="q-mt-xs">{{ comment.comment }}</div>
                    </div>
                  </div>
                  <div v-if="getUserContextFiles(turn.user).length > 0" class="user-context-files q-mb-sm">
                    <div class="text-caption text-blue-grey-2 q-mb-xs">上下文</div>
                    <div class="row q-col-gutter-xs q-row-gutter-xs" style="justify-content: flex-end">
                      <div v-for="attachment in getUserContextFiles(turn.user)" :key="attachment.id" class="col-auto">
                        <div class="user-context-chip">
                          <q-icon :name="attachment.mime.includes('image') ? 'image' : 'description'" size="14px" />
                          <span class="ellipsis">{{ attachment.filename || '附件' }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div v-if="getUserAttachments(turn.user).length > 0" class="user-attachments q-mb-sm">
                    <div v-for="attachment in getUserAttachments(turn.user)" :key="attachment.id" class="user-attachment-chip">
                      <img
                        v-if="attachment.mime.includes('image')"
                        :src="attachment.url"
                        :alt="attachment.filename || '附件'"
                        class="user-attachment-image"
                      >
                      <template v-else>
                        <q-icon name="attach_file" size="14px" />
                        <span class="ellipsis">{{ attachment.filename || '附件' }}</span>
                      </template>
                    </div>
                  </div>
                  <div class="user-message-body">
                    <AgentUserMessageBody
                      v-if="getUserMessageText(turn.user)"
                      :text="getUserMessageText(turn.user)"
                      :references="getUserContextFiles(turn.user)"
                      :agents="getUserAgentMentions(turn.user)"
                    />
                  </div>
                  <div v-if="getUserMetaLabel(turn.user) || canRevertTurn(turn.user)" class="user-message-footer q-mt-sm row items-center justify-between q-gutter-sm">
                    <div v-if="getUserMetaLabel(turn.user)" class="user-message-meta">{{ getUserMetaLabel(turn.user) }}</div>
                    <div class="row items-center q-gutter-xs">
                      <q-btn flat dense round size="sm" icon="content_copy" color="white" class="user-turn-action" @click="copyTurn(turn.user)">
                        <q-tooltip>{{ t('shared.copy') }}</q-tooltip>
                      </q-btn>
                      <q-btn v-if="canRevertTurn(turn.user)" flat dense round size="sm" icon="history" color="white" class="user-turn-action" @click="revertTurn(turn.user)">
                        <q-tooltip>{{ t('agent.restore') }}</q-tooltip>
                      </q-btn>
                    </div>
                  </div>
                </div>

                <!-- Compaction divider between user and assistant message -->
                <div v-if="hasCompaction(turn)" class="compaction-divider">
                  <div class="compaction-divider__line"></div>
                  <span class="compaction-divider__label">{{ getCompactionLabel(turn) }}</span>
                  <div class="compaction-divider__line"></div>
                </div>

                <!-- Assistant content: full-width -->
                <div
                  v-if="turn.assistant || shouldShowAssistantPlaceholder(turn)"
                  class="assistant-turn-content"
                >
                  <div v-if="turn.assistant" class="assistant-content">
                    <div v-if="shouldShowAssistantPlaceholder(turn)" class="row items-center q-gutter-xs thinking-indicator">
                      <q-spinner-dots size="16px" color="grey-5" />
                      <span class="text-caption text-grey-5">
                        {{ sessionStatus === 'retry' ? '重试中...' : getAssistantThinkingLabel(turn) }}
                      </span>
                    </div>
                    <template v-for="part in visibleAssistantParts(turn.assistant)" :key="part.id">
                       <AgentReasoning
                        v-if="part.type === 'reasoning' && (partText.get(part.id) ?? part.text ?? '').trim()"
                        :part="part"
                        :text="partText.get(part.id) ?? part.text ?? ''"
                        :turn-duration-ms="getTurnDurationMs(turn)"
                      />
                      <AgentToolCall
                        v-else-if="part.type === 'tool' && !shouldHideToolPart(part)"
                        :part="part"
                        :attention-call-id="activeAttentionCallId"
                        :child-session-label="getToolChildSessionLabel(part)"
                        @open-child-session="handleSwitchSession"
                      />
                      <AgentFilePart v-else-if="part.type === 'file'" :part="part" />
                      <AgentSubtaskPart v-else-if="part.type === 'subtask'" :part="part" />
                      <AgentSimplePart v-else-if="part.type === 'agent'" icon="smart_toy" title="Agent" :description="part.name ?? ''" />
                      <AgentSimplePart v-else-if="part.type === 'snapshot'" icon="history" title="Snapshot" :description="part.snapshot ?? ''" />
                      <AgentSimplePart v-else-if="part.type === 'retry'" icon="refresh" title="Retry" :description="`Attempt ${part.attempt}: ${formatRetryError(part.error)}`" />
                      <div v-else-if="part.type === 'text'" class="text-part">
                        <MarkdownRender
                          :content="partText.get(part.id) ?? part.text ?? ''"
                          :final="!(isLoading && isActiveAssistantTurn(turn))"
                        />
                        <q-spinner-dots
                          v-if="isLoading && isActiveAssistantTurn(turn) && part.id === getLastTextPartId(turn.assistant)"
                          size="1em"
                          color="grey-4"
                        />
                      </div>
                    </template>

                    <div v-if="getTurnMetaLabel(turn) || getAssistantCopyText(turn.assistant)" class="assistant-turn-footer row items-center justify-between q-gutter-sm q-mt-sm">
                      <div v-if="getTurnMetaLabel(turn)" class="turn-meta-label text-caption text-grey-5">
                        {{ getTurnMetaLabel(turn) }}
                      </div>
                      <q-btn
                        v-if="getAssistantCopyText(turn.assistant)"
                        flat
                        dense
                        round
                        size="sm"
                        icon="content_copy"
                        color="grey-5"
                        class="assistant-turn-action"
                        @click="copyAssistantTurn(turn.assistant)"
                      >
                        <q-tooltip>{{ t('shared.copy') }}</q-tooltip>
                      </q-btn>
                    </div>
                  </div>
                  <div v-else class="row items-center q-gutter-xs thinking-indicator">
                    <q-spinner-dots size="16px" color="grey-5" />
                    <span class="text-caption text-grey-5">{{ sessionStatus === 'retry' ? '重试中...' : '正在思考...' }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div style="height: 24px" />
          </q-infinite-scroll>
        </div>

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

            <AgentPromptInput
              v-if="!currentParentSession"
              ref="inputRef"
              :draft="draftInputMessage"
              :loading="isLoading"
              :connected="isConnected"
              :disabled="isSessionSwitching"
              :attachments="pendingAttachments"
              @submit="submitDraftMessage"
              @abort="abortSession"
              @remove-attachment="removeAttachment"
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
        </div>
      </main>

      <aside class="side-panel">
        <div class="side-panel__inner">
          <q-tabs v-model="resultTab" dense no-caps active-color="grey-4" indicator-color="grey-7" class="side-tabs">
            <q-tab name="result" label="生成结果" />
            <q-tab name="canvas" label="画布" />
            <q-tab name="prompt" label="提示词" />
          </q-tabs>

          <div class="side-panel__body">
            <div v-if="resultTab === 'result'" class="side-panel__placeholder">
              <q-icon name="image" size="28px" color="grey-7" class="q-mb-sm" />
              <div class="text-caption text-grey-7">暂无生成结果</div>
            </div>
            <div v-else-if="resultTab === 'canvas'" class="side-panel__placeholder">
              <q-icon name="brush" size="28px" color="grey-7" class="q-mb-sm" />
              <div class="text-caption text-grey-7">画布编辑器</div>
            </div>
            <div v-else class="side-panel__placeholder">
              <q-icon name="auto_awesome" size="28px" color="grey-7" class="q-mb-sm" />
              <div class="text-caption text-grey-7">提示词优化</div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useQuasar, QInfiniteScroll } from 'quasar'
import { useI18n } from 'vue-i18n'
import type { AgentPart, FilePart, TextPart, ToolPart } from '@opencode-ai/sdk/v2'
import { MarkdownRender } from 'markstream-vue'
import 'markstream-vue/index.css'
import AgentReasoning from 'src/components/AgentReasoning.vue'
import AgentToolCall from 'src/components/AgentToolCall.vue'
import AgentFilePart from 'src/components/AgentFilePart.vue'
import AgentSubtaskPart from 'src/components/AgentSubtaskPart.vue'
import AgentSimplePart from 'src/components/AgentSimplePart.vue'
import AgentUserMessageBody from 'src/components/AgentUserMessageBody.vue'
import AgentQuestion from 'src/components/AgentQuestion.vue'
import AgentPermission from 'src/components/AgentPermission.vue'
import AgentPromptInput from 'src/components/AgentPromptInput.vue'
import { useAgentSession, type DisplayMessage } from 'src/composables/useAgentSession'
import { extractHeading } from 'src/utils/heading'
import type { SessionItem } from 'src/services/agents'

type DisplayTurn = {
  user: DisplayMessage
  assistant: DisplayMessage | null
}

type UserComment = {
  id: string
  path?: string
  comment: string
  preview?: string
}

// ── UI refs ───────────────────────────────────────────────────────────────────

const $q = useQuasar()
const { t } = useI18n()
const followupCollapsed = ref(false)
const isSessionSwitching = ref(false)
const messagesAreaRef = ref<HTMLElement | null>(null)
const infiniteScrollRef = ref<QInfiniteScroll | null>(null)
const inputRef = ref<{ focus: () => void; setDraft: (value: string) => void } | null>(null)
const draftInputMessage = ref('')
const resultTab = ref('result')

const railItems = [
  { icon: 'chat_bubble', label: '会话', active: true },
  { icon: 'deployed_code', label: '模型', active: false },
  { icon: 'image', label: '素材', active: false },
  { icon: 'group', label: '团队', active: false },
  { icon: 'bar_chart', label: '数据', active: false },
  { icon: 'settings', label: '设置', active: false },
] as const

const suggestions = [
  t('agent.askDocs'),
  t('agent.summarizeBase'),
  t('agent.mainTopics'),
] as const

// ── Auto-scroll ────────────────────────────────────────────────────────────────

const userScrolled = ref(false)
const BOTTOM_THRESHOLD = 10

function scrollToBottom(force = false) {
  const el = messagesAreaRef.value
  if (!el) return
  if (force) userScrolled.value = false
  if (userScrolled.value && !force) return
  el.scrollTop = el.scrollHeight
}

function scrollToBottomNow() {
  void nextTick(() => scrollToBottom(true))
}

function scrollIfAtBottom() {
  scrollToBottom(false)
}

// ── Scroll observers ───────────────────────────────────────────────────────────

let resizeObserver: ResizeObserver | null = null

function setupAutoScroll() {
  const el = messagesAreaRef.value
  if (!el) return

  resizeObserver = new ResizeObserver(() => {
    const area = messagesAreaRef.value
    if (!area) return
    if (isLoading.value && !userScrolled.value) {
      area.scrollTop = area.scrollHeight
    }
  })
  resizeObserver.observe(el)

  el.addEventListener('wheel', onWheel, { passive: true })
  el.addEventListener('scroll', onScroll, { passive: true })
}

function teardownAutoScroll() {
  const el = messagesAreaRef.value
  if (!el) return

  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }

  el.removeEventListener('wheel', onWheel)
  el.removeEventListener('scroll', onScroll)
}

function onWheel(e: WheelEvent) {
  const target = e.target as HTMLElement | null
  if (target?.closest('[data-scrollable]')) return

  if (e.deltaY < 0) {
    userScrolled.value = true
  }
}

function onScroll() {
  const el = messagesAreaRef.value
  if (!el) return

  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  if (distanceFromBottom <= BOTTOM_THRESHOLD) {
    userScrolled.value = false
  } else {
    userScrolled.value = true
  }
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

watch(isLoading, (loading) => {
  if (loading && !userScrolled.value) {
    void nextTick(() => scrollToBottom(true))
  }
})

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

function getToolChildSessionLabel(part: ToolPart): string | null {
  if (part.tool !== 'task') return null

  const metadata = (part.state as { metadata?: Record<string, unknown> }).metadata
  const childSessionId = typeof metadata?.sessionId === 'string' ? metadata.sessionId : undefined
  if (!childSessionId) return null

  const childSession = getAllSessions().find((session) => session.id === childSessionId)
  return childSession ? getSessionLabel(childSession) : null
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function getUserMessageText(msg: DisplayMessage): string {
  return msg.parts
    .filter((p): p is TextPart => p.type === 'text' && !p.synthetic)
    .map((p) => p.text)
    .join('')
}

function getUserAttachments(msg: DisplayMessage): FilePart[] {
  return msg.parts.filter((part): part is FilePart => part.type === 'file' && part.url.startsWith('data:'))
}

function getUserContextFiles(msg: DisplayMessage): FilePart[] {
  return msg.parts.filter((part): part is FilePart => part.type === 'file' && !part.url.startsWith('data:'))
}

function getUserComments(msg: DisplayMessage): UserComment[] {
  return msg.parts.flatMap((part) => {
    if (part.type !== 'text' || !part.synthetic) return []

    const metadata = (part as TextPart & { metadata?: Record<string, unknown> }).metadata
    const raw = metadata && typeof metadata === 'object'
      ? (metadata as { opencodeComment?: unknown }).opencodeComment
      : undefined

    if (!raw || typeof raw !== 'object') return []

    const path = typeof (raw as { path?: unknown }).path === 'string'
      ? (raw as { path: string }).path
      : undefined
    const comment = typeof (raw as { comment?: unknown }).comment === 'string'
      ? (raw as { comment: string }).comment.trim()
      : ''
    const preview = typeof (raw as { preview?: unknown }).preview === 'string'
      ? (raw as { preview: string }).preview
      : undefined

    if (!comment) return []

    return [{
      id: part.id,
      ...(path ? { path } : {}),
      comment,
      ...(preview ? { preview } : {}),
    }]
  })
}

function getUserAgentMentions(msg: DisplayMessage): AgentPart[] {
  return msg.parts.filter((part): part is AgentPart => part.type === 'agent')
}

function getUserMetaLabel(msg: DisplayMessage): string {
  const items = [
    ...getUserAgentMentions(msg).map((part) => `@${part.name}`),
    formatUserMessageTime(msg.time),
  ].filter(Boolean)

  return items.join(' · ')
}

function canRevertTurn(msg: DisplayMessage): boolean {
  if (!currentSessionItem.value) return false
  return currentSessionItem.value.revert?.messageID !== msg.id
}

function revertTurn(msg: DisplayMessage) {
  void revertMessage(msg.id)
}

function copyTurn(msg: DisplayMessage) {
  const parts = [
    ...getUserComments(msg).map((comment) => comment.comment),
    getUserMessageText(msg),
  ].filter((value) => value.trim())

  if (parts.length === 0) return

  void navigator.clipboard.writeText(parts.join('\n\n'))
}

function formatSessionTime(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 60_000) return t('agent.justNow')
  if (diff < 3_600_000) return t('agent.minutesAgo', { count: Math.floor(diff / 60_000) })
  if (diff < 86_400_000) return t('agent.hoursAgo', { count: Math.floor(diff / 3_600_000) })
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function formatUserMessageTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(date)
}

function formatRetryError(error: unknown): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    if ('message' in error && typeof error.message === 'string') return error.message
    if ('name' in error && typeof error.name === 'string') return error.name
    try {
      return JSON.stringify(error)
    } catch {
      return '无法序列化'
    }
  }
  if (error == null) return 'Unknown error'
  if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') return String(error)
  return 'Unknown error'
}

// ── Message rendering helpers ────────────────────────────────────────────────

function getAssistantTurnHeading(message: DisplayMessage): string {
  if (message.role !== 'assistant') return ''

  const reasoningPart = message.parts.find((part) => (
    part.type === 'reasoning' && (partText.value.get(part.id) ?? (part as { text?: string }).text ?? '').trim()
  ))
  if (reasoningPart?.type === 'reasoning') {
    const heading = extractHeading(partText.value.get(reasoningPart.id) ?? (reasoningPart as { text: string }).text ?? '')
    if (heading) return heading
  }

  return ''
}

function getAssistantThinkingLabel(turn: DisplayTurn): string {
  const heading = turn.assistant ? getAssistantTurnHeading(turn.assistant) : ''
  if (heading) return heading
  return '正在思考...'
}

function getLastTextPartId(message: DisplayMessage): string | undefined {
  for (let index = message.parts.length - 1; index >= 0; index -= 1) {
    const part = message.parts[index]
    if (part?.type === 'text') {
      return part.id
    }
  }
  return undefined
}

// ── Turn meta ─────────────────────────────────────────────────────────────────

function formatTurnDuration(ms?: number): string {
  if (typeof ms !== 'number' || ms < 0) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function getTurnDurationMs(turn: DisplayTurn): number | undefined {
  const started = turn.user.info?.time?.created;
  const assistantTime = turn.assistant?.info?.time;
  const completed = assistantTime && 'completed' in assistantTime ? (assistantTime as { completed?: number }).completed : undefined;
  if (typeof started !== 'number' || typeof completed !== 'number' || completed < started) return undefined;
  return completed - started;
}

function getTurnMetaLabel(turn: DisplayTurn): string {
  const created = formatSessionTime(turn.user.time)
  const assistantTime = turn.assistant?.info?.time
  const completed = assistantTime && 'completed' in assistantTime ? (assistantTime as { completed?: number }).completed : undefined
  const started = turn.user.info?.time?.created
  const assistantInfo = turn.assistant?.info?.role === 'assistant' ? turn.assistant.info : undefined
  const provider = assistantInfo?.providerID
  const model = assistantInfo?.modelID
  const agent = assistantInfo?.agent
  const head = [agent, provider && model ? `${provider}/${model}` : model].filter(Boolean).join(' · ')

  if (typeof completed === 'number' && typeof started === 'number' && completed >= started) {
    const duration = formatTurnDuration(completed - started)
    const items = [head, created, duration].filter(Boolean)
    if (items.length > 0) return items.join(' · ')
  }

  return [head, created].filter(Boolean).join(' · ')
}

function getAssistantCopyText(message: DisplayMessage | null): string {
  if (!message || message.role !== 'assistant') return ''

  return message.parts
    .flatMap((part) => {
      if (part.type === 'text') {
        return [partText.value.get(part.id) ?? (part as { text: string }).text ?? '']
      }
      if (part.type === 'reasoning' && (part as { text?: string }).text?.trim()) {
        return [(part as { text: string }).text]
      }
      return []
    })
    .map((value) => value.trim())
    .filter(Boolean)
    .join('\n\n')
}

function copyAssistantTurn(message: DisplayMessage | null) {
  const text = getAssistantCopyText(message)
  if (!text) return
  void navigator.clipboard.writeText(text)
}

// ── Part visibility ───────────────────────────────────────────────────────────

function shouldHideToolPart(part: ToolPart): boolean {
  if (part.tool === 'todowrite') return true
  return part.tool === 'question' && (part.state.status === 'pending' || part.state.status === 'running')
}

function isVisibleAssistantPart(part: DisplayMessage['parts'][number]): boolean {
  if (part.type === 'compaction') return false
  if (part.type === 'tool') return !shouldHideToolPart(part)
  if (part.type === 'text' || part.type === 'reasoning') {
    return !!(partText.value.get(part.id) ?? (part as { text?: string }).text ?? '').trim()
  }
  return true
}

function hasCompaction(turn: DisplayTurn): boolean {
  return (turn.assistant?.parts ?? []).some((p) => p.type === 'compaction')
}

function getCompactionLabel(turn: DisplayTurn): string {
  const compactPart = (turn.assistant?.parts ?? []).find((p) => p.type === 'compaction')
  if (!compactPart) return ''
  return (compactPart as { auto?: boolean }).auto ? 'Automatic compaction' : 'Manual compaction'
}

function visibleAssistantParts(message: DisplayMessage): DisplayMessage['parts'] {
  return message.parts.filter((p) => p.type !== 'compaction')
}

function getVisibleAssistantPartCount(message: DisplayMessage | null): number {
  if (!message || message.role !== 'assistant') return 0
  return message.parts.filter((part) => isVisibleAssistantPart(part)).length
}

function shouldShowAssistantPlaceholder(turn: DisplayTurn): boolean {
  if (!isActiveAssistantTurn(turn)) return false
  if (!isLoading.value) return false
  if (sessionStatus.value === 'retry') return false
  return getVisibleAssistantPartCount(turn.assistant) === 0
}

function isActiveAssistantTurn(turn: DisplayTurn): boolean {
  return displayTurns.value.at(-1)?.user.id === turn.user.id
}

// ── Infinite scroll ───────────────────────────────────────────────────────────

function onLoadHistory(_index: number, done: (stop?: boolean) => void) {
  void loadOlderMessages()
    .then((hasMore) => done(!hasMore))
    .catch(() => done(true))
}

// ── Input helpers ─────────────────────────────────────────────────────────────

function useSuggestion(s: string) {
  inputRef.value?.setDraft(s)
  void submitDraftMessage(s)
}

async function submitDraftMessage(value: string) {
  const next = value
  if (!next.trim() && pendingAttachments.value.length === 0) return
  inputMessage.value = next
  inputRef.value?.setDraft('')
  await sendMessage()
}

async function handleSwitchSession(sid: string) {
  if (!sid || sid === sessionId.value) return
  isSessionSwitching.value = true
  try {
    await switchSession(sid)
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
  void loadSessionList()
  startEventSubscription()
  void nextTick(() => { inputRef.value?.focus(); setupAutoScroll() })
})

onUnmounted(() => {
  teardownAutoScroll()
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
  width: 100vw;
  min-height: 100vh;
  overflow: hidden;
  color: var(--imago-text-primary);
  background: var(--imago-bg-void);
}

.workspace-layout {
  position: relative;
  z-index: 1;
  height: 100vh;
  display: grid;
  grid-template-columns: 260px minmax(480px, 1fr) 320px;
}

.session-sidebar,
.chat-area,
.side-panel {
  min-width: 0;
}

/* ── Left sidebar ────────────────────────────────────────────────────────── */

.session-sidebar {
  border-right: 1px solid var(--imago-border-light);
  background: var(--imago-bg-void);
}

.sidebar-brand {
  height: 52px;
  display: flex;
  align-items: center;
  padding: 0 18px;
}

.brand-name {
  color: var(--imago-text-primary);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.session-shell {
  height: calc(100vh - 52px);
  display: grid;
  grid-template-columns: 64px 1fr;
  border-top: 1px solid var(--imago-border-light);
}

.session-rail {
  position: relative;
  display: grid;
  grid-auto-rows: 44px;
  gap: 4px;
  justify-items: center;
  padding-top: 16px;
  border-right: 1px solid var(--imago-border-light);
  background: var(--imago-bg-void);
}

.rail-btn,
.rail-collapse {
  width: 40px;
  height: 40px;
  color: var(--imago-text-muted);
  border: 1px solid transparent;
  transition: color 120ms ease;
}

.rail-btn:hover,
.rail-collapse:hover {
  color: var(--imago-text-secondary);
}

.rail-btn--active {
  color: var(--imago-text-primary);
  background: var(--imago-border-light);
}

.rail-collapse {
  position: absolute;
  bottom: 20px;
  color: var(--imago-text-dim);
}

/* ── Session list ────────────────────────────────────────────────────────── */

.session-list-panel {
  min-width: 0;
  padding: 14px 12px 14px 16px;
  overflow-y: auto;
  background: var(--imago-bg-void);
}

.new-session-btn {
  width: 100%;
  height: 36px;
  color: var(--imago-text-primary);
  background: var(--imago-border-soft);
  border-radius: var(--imago-radius-md);
  font-size: 14px;
  font-weight: 500;
}

.new-session-btn:hover {
  background: var(--imago-border-dim);
}

.session-group {
  margin-top: 20px;
}

.session-group__title {
  display: flex;
  justify-content: space-between;
  color: var(--imago-text-dim);
  font-size: 12px;
  font-weight: 500;
  margin: 0 8px 8px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.session-list {
  display: grid;
  gap: 2px;
}

.session-list-empty {
  margin-top: 12px;
  color: var(--imago-text-faint);
  font-size: 13px;
  text-align: center;
}

.session-item {
  min-height: 60px;
  padding: 8px 10px 8px 10px;
  color: var(--imago-text-muted);
  border: 1px solid transparent;
  border-radius: var(--imago-radius-md);
  background: transparent;
}

.session-item:hover {
  background: var(--imago-bg-raised);
}

.session-item--active {
  background: var(--imago-border-light);
  border-color: var(--imago-border-soft);
}

.session-title {
  color: var(--imago-text-secondary);
  font-size: 13px;
  line-height: 1.3;
}

.session-preview {
  margin-top: 4px;
  color: var(--imago-text-dim) !important;
  font-size: 12px;
}

.session-time {
  color: var(--imago-text-dim);
  font-size: 11px;
}

.session-delete {
  opacity: 0;
  transition: opacity 120ms ease;
}

.session-item:hover .session-delete {
  opacity: 1;
}

/* ── Chat area ───────────────────────────────────────────────────────────── */

.chat-area {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--imago-bg-void);
}

.session-topbar {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-bottom: 1px solid var(--imago-border-light);
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

.topbar-icon {
  width: 32px;
  height: 32px;
  color: var(--imago-text-muted);
  border-color: var(--imago-border-light);
  border-radius: var(--imago-radius-md);
  background: transparent;
}

/* ── Messages ────────────────────────────────────────────────────────────── */

.messages-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 24px 12px;
  scroll-behavior: smooth;
}

.empty-chat {
  height: 100%;
  color: var(--imago-text-dim);
}

.empty-chat__content {
  width: min(420px, 84%);
  padding: 32px 28px;
  text-align: center;
}

.suggestions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;
}

.suggestion-chip:hover {
  border-color: var(--imago-border-dim);
  background: var(--imago-bg-raised);
}

.message-turn + .message-turn {
  margin-top: 24px;
}

.turn-container {
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.user-turn-content {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  width: 100%;
  max-width: 100%;
  margin-bottom: 12px;
}

.user-message-body {
  width: fit-content;
  max-width: min(82%, 64ch);
  margin-left: auto;
  background: var(--imago-border-light);
  border: 1px solid var(--imago-border-soft);
  padding: 8px 12px;
  border-radius: var(--imago-radius-sm);
  display: inline-block;
}

.assistant-turn-content {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
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
  max-width: 100%;
  word-break: break-word;
  overflow-wrap: break-word;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.user-attachments {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  width: fit-content;
  max-width: min(82%, 64ch);
  margin-left: auto;
}

.user-attachment-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: min(100%, 220px);
  height: 48px;
  padding: 0 10px;
  border-radius: var(--imago-radius-sm);
  background: var(--imago-border-soft);
  border: 1px solid var(--imago-border-dim);
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
  max-width: min(82%, 64ch);
  margin-bottom: 8px;
}

.user-comment-card {
  width: 100%;
  max-width: min(100%, 520px);
  padding: 10px 12px;
  border-radius: var(--imago-radius-sm);
  background: var(--imago-border-light);
  border: 1px solid var(--imago-border-soft);
}

.user-comment-path {
  max-width: 260px;
}

.user-comment-preview {
  padding: 6px 8px;
  border-radius: var(--imago-radius-sm);
  background: var(--imago-bg-raised);
  color: rgba(255, 255, 255, 0.72);
  white-space: pre-wrap;
}

.user-context-files {
  width: fit-content;
  max-width: min(82%, 64ch);
  margin-left: auto;
  margin-bottom: 8px;
}

.user-context-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 280px;
  padding: 5px 10px;
  border-radius: var(--imago-radius-pill);
  background: var(--imago-border-light);
  border: 1px solid var(--imago-border-soft);
  font-size: 12px;
  line-height: 1.3;
}

.user-message-footer {
  min-height: 24px;
  width: 100%;
  max-width: min(82%, 64ch);
}

.user-message-meta {
  font-size: 12px;
  line-height: 1.2;
  color: rgba(255, 255, 255, 0.50);
}

.user-turn-action {
  background: var(--imago-border-light);
  opacity: 0;
  transition: opacity 150ms ease;
}

.user-turn-content:hover .user-turn-action,
.user-turn-content:focus-within .user-turn-action {
  opacity: 1;
}

.assistant-turn-footer {
  min-height: 24px;
}

.assistant-turn-action {
  background: rgba(148 163 184 / 0.06);
}

.thinking-indicator {
  padding: 2px 0 6px;
}

.text-part {
  margin-top: 24px;
  white-space: pre-wrap;
  line-height: 1.65;
  word-break: break-word;
  overflow-wrap: break-word;
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

/* ── Input / composer region ─────────────────────────────────────────────── */

.input-area {
  padding: 12px 20px 16px;
  background: var(--imago-bg-panel);
  border-top: 1px solid var(--imago-border-light);
}

.input-container {
  max-width: 800px;
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

.child-session-input-disabled {
  width: 100%;
  padding: 14px 16px;
}

/* ── Right side panel ────────────────────────────────────────────────────── */

.side-panel {
  height: 100vh;
  overflow: hidden;
  background: var(--imago-bg-panel);
  border-left: 1px solid var(--imago-border-light);
}

.side-panel__inner {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.side-tabs {
  flex-shrink: 0;
  color: var(--imago-text-dim);
}

.side-panel__body {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.side-panel__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 4px;
}

/* ── Responsive ──────────────────────────────────────────────────────────── */

@media (max-width: 1280px) {
  .workspace-layout {
    grid-template-columns: 260px minmax(480px, 1fr);
  }

  .side-panel {
    display: none;
  }
}

@media (max-width: 900px) {
  .workspace-layout {
    grid-template-columns: 1fr;
  }

  .session-sidebar {
    display: none;
  }

  .messages-container {
    padding-inline: 16px;
  }
}
</style>
