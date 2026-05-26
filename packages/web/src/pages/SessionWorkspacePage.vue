<template>
  <div class="session-workspace">
    <div class="aurora aurora--cyan" />
    <div class="aurora aurora--violet" />

    <div class="workspace-layout">
      <aside class="session-sidebar">
        <div class="session-sidebar__brand">
          <span class="brand-mark">openimago</span>
          <span class="brand-pulse" />
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
              :class="['rail-btn', { 'rail-btn--active': item.active, 'rail-settings': item.icon === 'settings' }]"
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
                color="cyan-4"
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
              <q-spinner-dots size="16px" color="cyan-4" />
              <span>{{ isLoading ? '生成中' : '切换会话' }}</span>
            </div>
            <q-btn outline icon="light_mode" class="topbar-icon" aria-label="外观" round />
          </div>
        </header>

        <div ref="messagesAreaRef" class="messages-container">
          <q-inner-loading :showing="isSessionSwitching" color="cyan-4" />

          <div v-if="!isSessionSwitching && displayMessages.length === 0" class="empty-chat flex flex-center">
            <div class="empty-chat__content">
              <q-icon name="auto_awesome" />
              <h1>把想象推入夜色引擎</h1>
              <p>输入 prompt，生成图像、变体与可复用参数会同步出现在右侧面板。</p>
              <div class="suggestions">
                <q-btn
                  v-for="suggestion in suggestions"
                  :key="suggestion"
                  outline
                  no-caps
                  class="suggestion-chip"
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
              <div class="row justify-center q-py-sm">
                <q-spinner-dots size="24px" color="cyan-5" />
              </div>
            </template>

            <div v-for="turn in displayTurns" :key="turn.user.id" class="message-turn">
              <q-chat-message sent bg-color="cyan-10" text-color="white" class="message-row">
                <template #avatar>
                  <q-avatar size="44px" class="message-avatar"><div class="portrait" /></q-avatar>
                </template>
                <template #default>
                  <div class="user-message-content">
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
                      <div class="row q-col-gutter-xs q-row-gutter-xs">
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
                    <AgentUserMessageBody
                      v-if="getUserMessageText(turn.user)"
                      :text="getUserMessageText(turn.user)"
                      :references="getUserContextFiles(turn.user)"
                      :agents="getUserAgentMentions(turn.user)"
                    />
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
                </template>
              </q-chat-message>

              <q-chat-message
                v-if="turn.assistant || shouldShowAssistantPlaceholder(turn)"
                bg-color="deep-purple-10"
                text-color="white"
                class="message-row"
              >
                <template #avatar>
                  <div class="ai-avatar">AI</div>
                </template>
                <template #default>
                  <div v-if="turn.assistant" class="assistant-content">
                    <div v-if="shouldShowAssistantPlaceholder(turn)" class="row items-center q-gutter-xs thinking-indicator">
                      <q-spinner-dots size="16px" color="cyan-4" />
                      <span class="text-caption text-grey-5">
                        {{ sessionStatus === 'retry' ? '重试中...' : getAssistantThinkingLabel(turn) }}
                      </span>
                    </div>
                    <template v-for="part in turn.assistant.parts" :key="part.id">
                      <AgentReasoning
                        v-if="part.type === 'reasoning' && (partText.get(part.id) ?? part.text ?? '').trim()"
                        :part="part"
                        :text="partText.get(part.id) ?? part.text ?? ''"
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
                      <AgentSimplePart v-else-if="part.type === 'compaction'" icon="compress" title="Compaction" :description="part.auto ? 'Automatic compaction' : 'Manual compaction'" />
                      <div v-else-if="part.type === 'text'" class="text-part">
                        <MarkdownRender
                          :content="partText.get(part.id) ?? part.text ?? ''"
                          :final="!(isLoading && isActiveAssistantTurn(turn))"
                        />
                        <q-spinner-dots
                          v-if="isLoading && isActiveAssistantTurn(turn) && part.id === getLastTextPartId(turn.assistant)"
                          size="1em"
                          color="cyan-4"
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
                    <q-spinner-dots size="16px" color="cyan-4" />
                    <span class="text-caption text-grey-5">{{ sessionStatus === 'retry' ? '重试中...' : '正在思考...' }}</span>
                  </div>
                </template>
              </q-chat-message>
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

            <div v-if="sessionTodos.length > 0" class="todo-dock q-mb-sm">
              <div class="row items-center justify-between q-mb-xs">
                <div class="text-caption text-weight-medium" style="color: #9fefff">
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
                    :color="todo.status === 'completed' ? 'positive' : todo.status === 'in_progress' ? 'cyan-4' : todo.status === 'cancelled' ? 'grey-5' : 'grey-4'"
                    size="16px"
                    class="q-mt-xs"
                  />
                  <div class="col text-body2" :class="{ 'text-grey-5': todo.status === 'completed' || todo.status === 'cancelled' }">
                    {{ todo.content }}
                  </div>
                </div>
              </div>
            </div>

            <div v-if="revertMessagePreview" class="revert-dock q-mb-sm row items-center justify-between q-gutter-sm">
              <div class="col min-width-0">
                <div class="text-caption text-grey-5">{{ t('agent.revertActive') }}</div>
                <div class="text-body2 text-weight-medium ellipsis">{{ revertMessagePreview }}</div>
              </div>
              <div class="row items-center q-gutter-sm">
                <q-btn flat dense no-caps size="sm" color="warning" :label="t('agent.restore')" @click="restoreRevert" />
                <q-icon name="history" size="18px" color="warning" />
              </div>
            </div>

            <div v-if="currentQueuedFollowups.length > 0" class="followup-dock q-mb-sm">
              <button type="button" class="followup-dock__header row items-center justify-between q-gutter-sm" @click="followupCollapsed = !followupCollapsed">
                <div class="text-caption text-weight-medium" style="color: #9fefff">
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
                  <q-btn dense no-caps size="sm" color="cyan-4" :loading="sendingFollowupId === item.id" :label="t('agent.sendNow')" @click="sendQueuedFollowup(item.id, true)" />
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
              :disabled="isLoading"
              :attachments="pendingAttachments"
              @submit="submitDraftMessage"
              @abort="abortSession"
              @remove-attachment="removeAttachment"
              @attach-files="onFilesSelected"
            />
            <div v-else class="child-session-input-disabled text-body2" style="color: #9fa8bb">
              <span>{{ t('agent.childInputDisabled') }}</span>
              <q-btn
                flat
                dense
                no-caps
                color="cyan-4"
                class="q-ml-sm"
                :label="t('agent.backToParent')"
                @click="handleSwitchSession(currentParentSession.id)"
              />
            </div>
          </div>
        </div>
      </main>

      <aside class="result-panel">
        <div class="result-panel__inner">
          <q-tabs v-model="resultTab" dense no-caps active-color="cyan-4" indicator-color="cyan-4" class="result-tabs">
            <q-tab name="result" label="生成结果" />
            <q-tab name="canvas" label="画布编辑" />
            <q-tab name="prompt" label="提示词优化" />
          </q-tabs>

          <section class="result-card glass-card">
            <div class="result-title">最终生成结果</div>
            <div class="result-image city-frame" />
            <q-separator dark class="soft-separator" />
            <div class="variant-title">变体方案 (3/3)</div>
            <div class="variants">
              <button
                v-for="variant in resultVariants"
                :key="variant"
                type="button"
                :class="['variant', `variant--${variant}`, { 'variant--active': variant === 'rain' }]"
                :aria-label="`变体 ${variant}`"
              />
            </div>
          </section>

          <section class="params-card glass-card">
            <div class="result-title">生成参数</div>
            <dl>
              <template v-for="param in generationParams" :key="param.label">
                <dt>{{ param.label }}</dt>
                <dd>{{ param.value }}</dd>
              </template>
            </dl>
          </section>

          <div class="result-actions">
            <q-btn outline icon="refresh" label="再次生成" class="result-action" no-caps />
            <q-btn outline icon="auto_awesome" label="变体生成" class="result-action result-action--violet" no-caps />
            <q-btn outline icon="favorite_border" label="收藏" class="result-action" no-caps />
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
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

const resultVariants = ['rain', 'skyline', 'drone'] as const
const suggestions = [
  t('agent.askDocs'),
  t('agent.summarizeBase'),
  t('agent.mainTopics'),
] as const

const generationParams = [
  { label: '模型', value: 'Midjourney v6' },
  { label: '风格', value: '赛博朋克 / Cyberpunk' },
  { label: '比例', value: '16:9' },
  { label: '质量', value: 'High Quality' },
  { label: '生成时间', value: '2024-05-24 14:35:18' },
  { label: '提示词', value: '赛博朋克城市夜景，雨天，霓虹灯光，未来感，飞行器，超高细节...' },
] as const

// ── Scroll helpers ────────────────────────────────────────────────────────────

function scrollToBottom() {
  const el = messagesAreaRef.value
  if (el) el.scrollTop = el.scrollHeight
}

function scrollToBottomNow() {
  void nextTick(() => scrollToBottom())
}

function isAtBottom(): boolean {
  const el = messagesAreaRef.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight < 80
}

function scrollIfAtBottom() {
  if (isAtBottom()) scrollToBottomNow()
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
      if (part?.type !== 'tool' || (part as ToolPart).tool !== 'task') continue

      const state = (part as ToolPart).state as {
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
    formatSessionTime(msg.time),
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

// ── Heading extraction ────────────────────────────────────────────────────────

function cleanHeadingText(value: string): string {
  return value
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~]+/g, '')
    .trim()
}

function extractHeading(text: string): string {
  const markdown = text.replace(/\r\n?/g, '\n')

  const html = markdown.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)
  if (html?.[1]) {
    const value = cleanHeadingText(html[1].replace(/<[^>]+>/g, ' '))
    if (value) return value
  }

  const atx = markdown.match(/^\s{0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+[ \t]*)?$/m)
  if (atx?.[1]) {
    const value = cleanHeadingText(atx[1])
    if (value) return value
  }

  const setext = markdown.match(/^([^\n]+)\n(?:=+|-+)\s*$/m)
  if (setext?.[1]) {
    const value = cleanHeadingText(setext[1])
    if (value) return value
  }

  const strong = markdown.match(/^\s*(?:\*\*|__)(.+?)(?:\*\*|__)\s*$/m)
  if (strong?.[1]) {
    const value = cleanHeadingText(strong[1])
    if (value) return value
  }

  return ''
}

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
  if (part.type === 'tool') return !shouldHideToolPart(part as ToolPart)
  if (part.type === 'text' || part.type === 'reasoning') {
    return !!(partText.value.get(part.id) ?? (part as { text?: string }).text ?? '').trim()
  }
  return true
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
  void nextTick(() => inputRef.value?.focus())
})

onUnmounted(() => {
  stopEventSubscription()
})
</script>

<style scoped>
:global(body) {
  background: #030713;
}

.session-workspace {
  position: relative;
  width: 100vw;
  min-height: 100vh;
  overflow: hidden;
  color: #e8eef9;
  background:
    linear-gradient(90deg, rgb(3 7 19 / 98%), rgb(5 8 22 / 92%) 38%, rgb(4 6 17 / 98%)),
    radial-gradient(circle at 44% 58%, rgb(0 78 255 / 25%), transparent 30%),
    #030713;
}

.session-workspace::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.33;
  background-image:
    linear-gradient(rgb(255 255 255 / 4%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(255 255 255 / 4%) 1px, transparent 1px);
  background-size: 54px 54px;
  mask-image: radial-gradient(circle at center, black, transparent 78%);
}

.aurora {
  position: absolute;
  width: 460px;
  height: 460px;
  filter: blur(44px);
  opacity: 0.38;
  pointer-events: none;
}

.aurora--cyan {
  left: 22%;
  bottom: -190px;
  background: radial-gradient(circle, rgb(0 229 255 / 72%), transparent 68%);
}

.aurora--violet {
  right: 16%;
  top: 42%;
  background: radial-gradient(circle, rgb(156 72 255 / 72%), transparent 70%);
}

.workspace-layout {
  position: relative;
  z-index: 1;
  height: 100vh;
  display: grid;
  grid-template-columns: 334px minmax(520px, 1fr) 490px;
}

.session-sidebar,
.chat-area,
.result-panel {
  min-width: 0;
}

.session-sidebar {
  border-right: 1px solid rgb(139 164 209 / 18%);
  background: linear-gradient(180deg, rgb(3 8 20 / 86%), rgb(4 7 18 / 64%));
  backdrop-filter: blur(22px);
}

.session-sidebar__brand {
  height: 76px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}

.brand-mark {
  color: #21f5ff;
  font-family: Orbitron, Eurostile, 'Trebuchet MS', sans-serif;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.08em;
  text-shadow: 0 0 14px rgb(33 245 255 / 72%);
}

.brand-pulse {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #20f4ff;
  box-shadow: 0 0 18px #20f4ff;
}

.session-shell {
  height: calc(100vh - 76px);
  display: grid;
  grid-template-columns: 75px 1fr;
  border-top: 1px solid rgb(139 164 209 / 18%);
}

.session-rail {
  position: relative;
  display: grid;
  grid-auto-rows: 48px;
  gap: 14px;
  justify-items: center;
  padding-top: 78px;
  border-right: 1px solid rgb(139 164 209 / 14%);
}

.rail-btn,
.rail-collapse {
  width: 48px;
  height: 48px;
  color: #d8dfed;
  border: 1px solid transparent;
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}

.rail-btn:hover,
.rail-collapse:hover {
  transform: translateY(-2px);
  border-color: rgb(22 243 255 / 38%);
}

.rail-btn--active {
  color: #16f3ff;
  border-color: #16f3ff;
  background: rgb(0 221 255 / 12%);
  box-shadow: 0 0 18px rgb(0 221 255 / 25%), inset 0 0 18px rgb(0 221 255 / 10%);
}

.rail-settings {
  margin-top: 18px;
}

.rail-collapse {
  position: absolute;
  bottom: 28px;
  color: #e3f5ff;
  border-color: #16f3ff;
  background: rgb(0 62 130 / 22%);
}

.session-list-panel {
  min-width: 0;
  padding: 22px 18px 18px 24px;
  overflow-y: auto;
}

.new-session-btn {
  width: 100%;
  height: 40px;
  color: #021018;
  background: linear-gradient(90deg, #22efff, #17cde4);
  border-radius: 9px;
  font-size: 15px;
  font-weight: 800;
  box-shadow: 0 14px 34px rgb(23 205 228 / 25%);
}

.session-group {
  margin-top: 30px;
}

.session-group__title {
  display: flex;
  justify-content: space-between;
  color: #a8b0c1;
  font-size: 13px;
  margin: 0 10px 12px;
}

.session-list {
  display: grid;
  gap: 6px;
}

.session-list-empty {
  margin-top: 16px;
  color: #8f98ac;
  font-size: 13px;
  text-align: center;
}

.session-item {
  min-height: 74px;
  padding: 11px 10px 11px 12px;
  color: #dce4f4;
  border: 1px solid transparent;
  border-radius: 10px;
  background: linear-gradient(90deg, transparent, rgb(255 255 255 / 2%));
}

.session-item:hover {
  background: rgb(20 28 48 / 44%);
}

.session-item--active {
  background: linear-gradient(135deg, rgb(32 255 255 / 9%), rgb(108 50 185 / 24%));
  border-color: rgb(22 239 255 / 62%);
  box-shadow: inset 2px 0 0 #16f3ff, 0 18px 36px rgb(0 0 0 / 22%), inset 0 0 22px rgb(120 74 255 / 10%);
}

.session-title {
  color: #dfe6f5;
  font-size: 14px;
  line-height: 1.2;
}

.session-preview {
  margin-top: 8px;
  color: #8f98ac !important;
  font-size: 12px;
}

.session-time {
  color: #9aa3b7;
  font-size: 12px;
}

.session-delete {
  opacity: 0;
  transition: opacity 160ms ease;
}

.session-item:hover .session-delete {
  opacity: 1;
}

.chat-area {
  display: flex;
  flex-direction: column;
  height: 100vh;
  border-right: 1px solid rgb(139 164 209 / 16%);
}

.session-topbar {
  height: 76px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 26px;
  border-bottom: 1px solid rgb(139 164 209 / 18%);
  background: rgb(3 7 18 / 34%);
}

.session-heading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  color: #dfe6f4;
  background: transparent;
  border: 0;
  font-size: 16px;
  font-weight: 700;
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
  max-width: 240px;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}

.topbar-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #9fefff;
  font-size: 12px;
}

.topbar-icon {
  width: 36px;
  height: 36px;
  color: #d4dbea;
  border-color: rgb(145 163 205 / 22%);
  border-radius: 9px;
  background: rgb(255 255 255 / 2%);
}

.message-avatar {
  background: linear-gradient(135deg, rgb(20 237 255 / 20%), rgb(141 55 255 / 45%));
  border: 1px solid rgb(145 78 255 / 72%);
  box-shadow: 0 0 18px rgb(145 78 255 / 38%);
}

.portrait {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background:
    radial-gradient(circle at 48% 36%, #f5d0ba 0 13%, transparent 14%),
    linear-gradient(135deg, #101b36, #07101e 42%, #0ecaff 43% 48%, #7326ff 49% 58%, #13031f 59%);
}

.messages-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 28px 28px 20px;
  scroll-behavior: smooth;
}

.empty-chat {
  height: 100%;
  color: #8f98ac;
}

.empty-chat__content {
  width: min(460px, 84%);
  padding: 34px;
  text-align: center;
  border: 1px solid rgb(145 163 205 / 16%);
  border-radius: 28px;
  background: linear-gradient(135deg, rgb(10 16 34 / 68%), rgb(10 8 24 / 38%));
}

.empty-chat__content .q-icon {
  color: #a855f7;
  font-size: 58px;
  text-shadow: 0 0 20px rgb(168 85 247 / 45%);
}

.empty-chat__content h1 {
  margin: 12px 0 8px;
  color: #eef7ff;
  font-size: 24px;
}

.empty-chat__content p {
  margin: 0;
  line-height: 1.7;
}

.suggestions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 22px;
}

.suggestion-chip {
  color: #9fefff;
  border-color: rgb(23 234 255 / 34%);
  border-radius: 999px;
}

.message-turn + .message-turn {
  margin-top: 8px;
}

.message-row {
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
}

.message-row :deep(.q-message-container.reverse > div:not(.q-message-avatar)) {
  max-width: 75%;
}

.ai-avatar {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  flex: 0 0 48px;
  color: #d6b8ff;
  background: rgb(101 34 173 / 32%);
  border: 1px solid #9a4cff;
  border-radius: 50%;
  font-size: 22px;
  box-shadow: 0 0 20px rgb(154 76 255 / 26%);
}

.assistant-content {
  max-width: 100%;
  word-break: break-word;
  overflow-wrap: break-word;
}

.user-message-content {
  max-width: 100%;
  word-break: break-word;
  overflow-wrap: break-word;
}

.user-attachments {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.user-comments {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.user-comment-card {
  max-width: min(100%, 520px);
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.user-comment-path {
  max-width: 260px;
}

.user-comment-preview {
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.12);
  color: rgba(255, 255, 255, 0.82);
  white-space: pre-wrap;
}

.user-context-files {
  max-width: 100%;
}

.user-context-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 280px;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.16);
  font-size: 12px;
  line-height: 1.3;
}

.user-attachment-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: min(100%, 320px);
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.22);
  font-size: 12px;
  line-height: 1.3;
}

.user-attachment-image {
  display: block;
  width: 120px;
  max-width: min(100%, 220px);
  max-height: 120px;
  object-fit: cover;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.24);
}

.user-message-footer {
  min-height: 24px;
}

.user-message-meta {
  font-size: 12px;
  line-height: 1.2;
  color: rgba(255, 255, 255, 0.72);
}

.user-turn-action {
  background: rgba(255, 255, 255, 0.12);
}

.assistant-turn-footer {
  min-height: 24px;
}

.assistant-turn-action {
  background: rgba(148, 163, 184, 0.08);
}

.thinking-indicator {
  padding: 2px 0 6px;
}

.text-part {
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
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 1px 5px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.875em;
  word-break: break-all;
}

.text-part :deep(pre) {
  background: #0d1117;
  padding: 12px 16px;
  border-radius: 8px;
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
  border-left: 3px solid #16f3ff;
  margin: 8px 0;
  padding: 6px 12px;
  color: #9fa8bb;
  background: rgba(22, 243, 255, 0.04);
  border-radius: 0 6px 6px 0;
}

.text-part :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 10px 0;
  font-size: 13px;
}

.text-part :deep(th),
.text-part :deep(td) {
  border: 1px solid rgba(139, 164, 209, 0.2);
  padding: 6px 10px;
  text-align: left;
}

.text-part :deep(th) {
  background: rgba(139, 164, 209, 0.1);
  font-weight: 600;
}

.text-part :deep(tr:nth-child(even)) {
  background: rgba(139, 164, 209, 0.04);
}

.input-area {
  padding: 16px 24px 24px;
  background: rgb(3 7 18 / 80%);
  border-top: 1px solid rgb(139 164 209 / 16%);
}

.input-container {
  max-width: 680px;
  margin: 0 auto;
}

.todo-dock {
  border: 1px solid rgba(22, 243, 255, 0.2);
  background: rgba(22, 243, 255, 0.05);
  border-radius: 14px;
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
  border: 1px solid rgba(245, 158, 11, 0.25);
  background: rgba(245, 158, 11, 0.08);
  border-radius: 14px;
  padding: 10px 12px;
}

.followup-dock {
  border: 1px solid rgba(22, 243, 255, 0.18);
  background: rgba(22, 243, 255, 0.04);
  border-radius: 14px;
  padding: 10px 12px;
}

.followup-dock__header {
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
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
  border-radius: 12px;
  border: 1px solid rgba(139, 164, 209, 0.2);
  background: rgba(10, 16, 34, 0.6);
  padding: 14px 16px;
}

.result-panel {
  height: 100vh;
  padding: 76px 20px 20px;
  overflow-y: auto;
}

.result-panel__inner {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 18px;
  border: 1px solid rgb(145 163 205 / 18%);
  border-radius: 18px;
  background: linear-gradient(180deg, rgb(7 11 28 / 60%), rgb(5 8 20 / 48%));
  backdrop-filter: blur(18px);
}

.result-tabs {
  align-self: stretch;
  color: #aeb6c8;
}

.glass-card {
  padding: 16px;
  background: rgb(8 12 29 / 72%);
  border: 1px solid rgb(145 163 205 / 18%);
  border-radius: 14px;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 5%);
}

.result-title,
.variant-title {
  color: #dfe6f5;
  font-size: 15px;
  margin-bottom: 14px;
}

.result-image {
  height: 252px;
  border-radius: 9px;
  margin-bottom: 16px;
}

.soft-separator {
  opacity: 0.45;
  margin-bottom: 14px;
}

.variants {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.variant {
  height: 64px;
  border: 1px solid rgb(141 78 255 / 38%);
  border-radius: 8px;
  cursor: pointer;
}

.variant--skyline {
  filter: hue-rotate(22deg) saturate(1.2);
}

.variant--drone {
  filter: hue-rotate(-32deg) brightness(1.08);
}

.variant--active {
  border-color: #17eaff;
  box-shadow: 0 0 0 1px rgb(23 234 255 / 45%), 0 0 24px rgb(23 234 255 / 18%);
}

.params-card dl {
  display: grid;
  grid-template-columns: 82px 1fr;
  gap: 10px 14px;
  margin: 0;
  color: #9fa8bb;
  font-size: 13px;
}

.params-card dt {
  color: #858da1;
}

.params-card dd {
  margin: 0;
  line-height: 1.55;
}

.result-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-top: auto;
}

.result-action {
  height: 44px;
  color: #19efff;
  border-color: rgb(25 239 255 / 46%);
  border-radius: 10px;
}

.result-action--violet {
  color: #b56cff;
  border-color: rgb(181 108 255 / 48%);
}

.city-frame {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  background:
    radial-gradient(circle at 22% 20%, rgb(0 231 255 / 80%), transparent 10%),
    radial-gradient(circle at 76% 28%, rgb(255 0 174 / 78%), transparent 12%),
    linear-gradient(90deg, transparent 0 8%, rgb(18 221 255 / 36%) 8% 10%, transparent 10% 22%, rgb(255 0 186 / 34%) 22% 24%, transparent 24% 38%, rgb(26 99 255 / 38%) 38% 41%, transparent 41%),
    linear-gradient(180deg, #061428 0 24%, #10143c 25% 48%, #300b42 49% 72%, #050a16 73%);
  border: 1px solid rgb(141 78 255 / 38%);
}

@media (max-width: 1280px) {
  .workspace-layout {
    grid-template-columns: 300px minmax(520px, 1fr);
  }

  .result-panel {
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
