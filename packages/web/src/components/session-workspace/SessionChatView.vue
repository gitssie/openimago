<template>
  <div class="session-chat-view">
    <div ref="messagesAreaRef" class="messages-container">
      <q-inner-loading :showing="isSessionSwitching" color="grey-5" />

      <div v-if="!initialLoading && !isSessionSwitching && displayMessages.length === 0" class="empty-chat flex flex-center">
        <div class="empty-chat__content">
          <div class="empty-chat__logo-wrap">
            <div class="empty-chat__logo-ring">
              <div class="empty-chat__logo-inner">
                <img src="/icons/favicon-96x96.png" alt="AI" class="empty-chat__logo-img" />
              </div>
            </div>
          </div>
          <div class="empty-chat__title">描述你想要的画面，AI 即刻创作</div>
          <div class="suggestions">
            <button
              v-for="suggestion in suggestions"
              :key="suggestion.label"
              type="button"
              class="suggestion-chip"
              @click="$emit('use-suggestion', suggestion.label)"
            >
              <q-icon :name="suggestion.icon" size="16px" class="suggestion-chip__icon" />
              <span>{{ suggestion.label }}</span>
            </button>
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
            <!-- User message: minimal prompt flow -->
            <div class="user-turn-content">
              <div v-if="getUserComments(turn.user).length > 0" class="user-comments q-mb-sm">
                <div v-for="comment in getUserComments(turn.user)" :key="comment.id" class="user-comment-card">
                  <div class="row items-center q-gutter-xs text-caption user-comment-meta">
                    <span class="text-weight-medium">{{ t('agent.context') }}</span>
                    <span v-if="comment.path" class="ellipsis user-comment-path">{{ comment.path }}</span>
                  </div>
                  <div v-if="comment.preview" class="user-comment-preview text-caption q-mt-xs">{{ comment.preview }}</div>
                  <div class="q-mt-xs">{{ comment.comment }}</div>
                </div>
              </div>
              <div v-if="getUserContextFiles(turn.user).length > 0" class="user-context-files q-mb-sm">
                <div class="text-caption text-blue-grey-2 q-mb-xs">上下文</div>
                <div class="row q-col-gutter-xs q-row-gutter-xs user-context-files__list">
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
                  <button class="user-turn-action" type="button" :title="t('shared.copy')" @click="copyTurn(turn.user)">
                    <OiIcon name="copy" size="13px" />
                  </button>
                  <button v-if="canRevertTurn(turn.user)" class="user-turn-action" type="button" :title="t('agent.restore')" @click="$emit('revert-turn', turn.user.id)">
                    <OiIcon name="revert" size="13px" />
                  </button>
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
                    {{ sessionStatus === 'retry' ? '重试中...' : getAssistantThinkingLabel() }}
                  </span>
                </div>
                <template v-for="part in visibleAssistantParts(turn.assistant)" :key="part.id">
                   <AgentReasoning
                    v-if="part.type === 'reasoning' && (partText.get(part.id) ?? part.text ?? '').trim()"
                    :part="part"
                    :text="partText.get(part.id) ?? (part as { text: string }).text ?? ''"
                    :turn-active="isLoading && isActiveAssistantTurn(turn)"
                  />
                  <template v-else-if="part.type === 'tool' && !shouldHideToolPart(part)">
                    <AgentToolCall
                      :part="part"
                      :attention-call-id="activeAttentionCallId"
                      :child-session-label="getToolChildSessionLabel(part)"
                      @open-child-session="$emit('switch-session', $event)"
                    />
                    <AgentMediaCard
                      v-if="getMediaToolOutput(part)"
                      :media="getMediaToolOutput(part)"
                    />
                  </template>
                  <AgentFilePart v-else-if="part.type === 'file'" :part="part" />
                  <AgentSubtaskPart v-else-if="part.type === 'subtask'" :part="part" />
                  <AgentSimplePart v-else-if="part.type === 'agent'" icon="smart_toy" title="Agent" :description="part.name ?? ''" />
                  <AgentSimplePart v-else-if="part.type === 'snapshot'" icon="history" title="Snapshot" :description="part.snapshot ?? ''" />
                  <AgentSimplePart v-else-if="part.type === 'retry'" icon="refresh" title="Retry" :description="`Attempt ${(part as { attempt?: number }).attempt}: ${formatRetryError((part as { error?: unknown }).error)}`" />
                  <div v-else-if="part.type === 'text'" class="text-part">
                    <MarkdownRender
                      :content="partText.get(part.id) ?? (part as { text: string }).text ?? ''"
                      :final="!(isLoading && isActiveAssistantTurn(turn))"
                    />
                    <q-spinner-dots
                      v-if="isLoading && isActiveAssistantTurn(turn) && part.id === getLastTextPartId(turn.assistant!)"
                      size="1em"
                      color="grey-4"
                    />
                  </div>
                </template>

                <div v-if="getTurnMetaLabel(turn) || getAssistantCopyText(turn.assistant)" class="assistant-turn-footer row items-center justify-start q-gutter-xs q-mt-sm">
                  <div v-if="getTurnMetaLabel(turn)" class="turn-meta-label text-caption text-grey-5">
                    {{ getTurnMetaLabel(turn) }}
                  </div>
                  <button
                    v-if="getAssistantCopyText(turn.assistant)"
                    class="assistant-copy-btn"
                    type="button"
                    :title="t('shared.copy')"
                    @click="copyAssistantTurn(turn.assistant!)"
                  >
                    <OiIcon name="copy" size="13px" />
                  </button>
                </div>
              </div>
              <div v-else class="row items-center q-gutter-xs thinking-indicator">
                <q-spinner-dots size="16px" color="grey-5" />
                <span class="text-caption text-grey-5">{{ sessionStatus === 'retry' ? '重试中...' : 'Thinking...' }}</span>
              </div>
            </div>
          </div>
        </div>

        <div style="height: 24px" />
      </q-infinite-scroll>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { QInfiniteScroll } from 'quasar'
import { useI18n } from 'vue-i18n'
import type { AgentPart, FilePart, TextPart, ToolPart } from '@opencode-ai/sdk/v2'
import { MarkdownRender } from 'markstream-vue'
import 'markstream-vue/index.css'
import OiIcon from 'src/components/ui/OiIcon.vue'
import AgentReasoning from 'src/components/AgentReasoning.vue'
import AgentToolCall from 'src/components/AgentToolCall.vue'
import AgentMediaCard from 'src/components/AgentMediaCard.vue'
import AgentFilePart from 'src/components/AgentFilePart.vue'
import AgentSubtaskPart from 'src/components/AgentSubtaskPart.vue'
import AgentSimplePart from 'src/components/AgentSimplePart.vue'
import AgentUserMessageBody from 'src/components/AgentUserMessageBody.vue'
import type { DisplayMessage } from 'src/composables/useAgentSession'
import type { SessionItem } from 'src/services/agents'
import { parseMediaToolOutput, isMediaToolName, resolveMediaKind } from 'src/services/media'
import type { MediaToolOutputV1 } from 'src/services/media'

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

const props = defineProps<{
  sessionId: string | null
  displayMessages: DisplayMessage[]
  partText: Map<string, string>
  isLoading: boolean
  sessionStatus: 'idle' | 'busy' | 'retry'
  historyExhausted: boolean
  historyLoading: boolean
  currentSessionItem: SessionItem | null
  activeAttentionCallId: string | null
}>()

const emit = defineEmits<{
  (e: 'load-history', index: number, done: (stop?: boolean) => void): void
  (e: 'switch-session', sid: string): void
  (e: 'revert-turn', msgId: string): void
  (e: 'use-suggestion', label: string): void
}>()

const { t } = useI18n()

const isSessionSwitching = ref(false)
const initialLoading = ref(false)
const messagesAreaRef = ref<HTMLElement | null>(null)
const infiniteScrollRef = ref<QInfiniteScroll | null>(null)

const suggestions = [
  { label: '赛博朋克街道', icon: 'location_city' },
  { label: '东方水墨山水', icon: 'landscape' },
  { label: '3D 产品渲染', icon: 'view_in_ar' },
  { label: '未来感建筑', icon: 'domain' },
  { label: '电影感人像', icon: 'person' },
  { label: '极简品牌海报', icon: 'article' },
] as const

// ── Auto-scroll ────────────────────────────────────────────────────────────────

const userScrolled = ref(false)
const BOTTOM_THRESHOLD = 120

let programmaticScrolling = false
let programmaticScrollTimer: ReturnType<typeof setTimeout> | null = null
let lastScrollTop = 0

function doScrollToBottom() {
  const el = messagesAreaRef.value
  if (!el) return
  programmaticScrolling = true
  el.scrollTop = el.scrollHeight
  lastScrollTop = el.scrollTop
  if (programmaticScrollTimer) clearTimeout(programmaticScrollTimer)
  programmaticScrollTimer = setTimeout(() => { programmaticScrolling = false }, 50)
}

function scrollToBottom(force = false) {
  if (force) userScrolled.value = false
  if (userScrolled.value && !force) return
  doScrollToBottom()
}

function scrollToBottomNow() {
  void nextTick(() => scrollToBottom(true))
}

// ── Scroll observers ───────────────────────────────────────────────────────────

let resizeObserver: ResizeObserver | null = null

function setupAutoScroll() {
  const el = messagesAreaRef.value
  if (!el) return

  resizeObserver = new ResizeObserver(() => {
    if (!userScrolled.value) doScrollToBottom()
  })
  const inner = el.firstElementChild
  if (inner) resizeObserver.observe(inner)
  resizeObserver.observe(el)

  el.addEventListener('scroll', onScroll, { passive: true })
}

function teardownAutoScroll() {
  const el = messagesAreaRef.value
  if (!el) return

  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }

  el.removeEventListener('scroll', onScroll)
  if (programmaticScrollTimer) { clearTimeout(programmaticScrollTimer); programmaticScrollTimer = null }
}

function onScroll() {
  if (programmaticScrolling) return
  const el = messagesAreaRef.value
  if (!el) return

  const currentScrollTop = el.scrollTop
  const distanceFromBottom = el.scrollHeight - currentScrollTop - el.clientHeight

  if (distanceFromBottom <= BOTTOM_THRESHOLD) {
    userScrolled.value = false
  } else if (currentScrollTop < lastScrollTop) {
    userScrolled.value = true
  }

  lastScrollTop = currentScrollTop
}

// ── Auto-scroll on loading ────────────────────────────────────────────────────

watch(() => props.isLoading, (loading) => {
  if (loading && !userScrolled.value) {
    void nextTick(() => scrollToBottom(true))
  }
})

// ── Computed ──────────────────────────────────────────────────────────────────

const displayTurns = computed<DisplayTurn[]>(() => {
  const turns: DisplayTurn[] = []
  const revertMessageId = props.currentSessionItem?.revert?.messageID

  for (const message of props.displayMessages) {
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

// ── Infinite scroll ───────────────────────────────────────────────────────────

function onLoadHistory(index: number, done: (stop?: boolean) => void) {
  emit('load-history', index, done)
}

// ── Message rendering helpers ────────────────────────────────────────────────

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
  if (!props.currentSessionItem) return false
  return props.currentSessionItem.revert?.messageID !== msg.id
}

function copyTurn(msg: DisplayMessage) {
  const parts = [
    ...getUserComments(msg).map((comment) => comment.comment),
    getUserMessageText(msg),
  ].filter((value) => value.trim())

  if (parts.length === 0) return

  void navigator.clipboard.writeText(parts.join('\n\n'))
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

function getAssistantThinkingLabel(): string {
  return 'Thinking...'
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

function formatSessionTime(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 60_000) return t('agent.justNow')
  if (diff < 3_600_000) return t('agent.minutesAgo', { count: Math.floor(diff / 60_000) })
  if (diff < 86_400_000) return t('agent.hoursAgo', { count: Math.floor(diff / 3_600_000) })
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

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
        return [props.partText.get(part.id) ?? (part as { text: string }).text ?? '']
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

function getMediaToolOutput(part: ToolPart): MediaToolOutputV1 | null {
  if (part.state.status !== 'completed') return null
  if (!isMediaToolName(part.tool)) return null
  const expectedKind = resolveMediaKind(part.tool)
  return parseMediaToolOutput(part.state.output, expectedKind)
}

function isVisibleAssistantPart(part: DisplayMessage['parts'][number]): boolean {
  if (part.type === 'compaction') return false
  if (part.type === 'tool') return !shouldHideToolPart(part)
  if (part.type === 'text' || part.type === 'reasoning') {
    return !!(props.partText.get(part.id) ?? (part as { text?: string }).text ?? '').trim()
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
  if (!props.isLoading) return false
  if (props.sessionStatus === 'retry') return false
  return getVisibleAssistantPartCount(turn.assistant) === 0
}

function isActiveAssistantTurn(turn: DisplayTurn): boolean {
  return displayTurns.value.at(-1)?.user.id === turn.user.id
}

function getToolChildSessionLabel(part: ToolPart): string | null {
  if (part.tool !== 'task') return null

  const metadata = (part.state as { metadata?: Record<string, unknown> }).metadata
  const childSessionId = typeof metadata?.sessionId === 'string' ? metadata.sessionId : undefined
  if (!childSessionId) return null

  // We don't have access to session list here, so just return the ID
  return childSessionId
}

// ── Exposed API ───────────────────────────────────────────────────────────────

defineExpose({
  scrollToBottomNow,
  doScrollToBottom,
})

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(() => {
  void nextTick(() => { setupAutoScroll() })
})

onUnmounted(() => {
  teardownAutoScroll()
})
</script>

<style scoped>
/* ── Base ─────────────────────────────────────────────────────────────── */

.session-chat-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--imago-bg-void);
}

.messages-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 24px 12px;
  position: relative;
}

/* ── Empty chat ────────────────────────────────────────────────────────── */

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
  background: linear-gradient(135deg, rgba(0, 240, 255, 0.6), rgba(140, 80, 255, 0.6)) border-box;
  -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: destination-out;
  mask-composite: exclude;
  animation: logo-spin 6s linear infinite;
  box-shadow: 0 0 32px rgba(0, 240, 255, 0.15), 0 0 80px rgba(140, 80, 255, 0.08);
}

.empty-chat__logo-ring::before {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 1.5px solid rgba(0, 240, 255, 0.15);
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
  background: linear-gradient(145deg, #1a1a2e 0%, #0d0d1a 100%);
  border: 1.5px solid rgba(140, 80, 255, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 0 20px rgba(140, 80, 255, 0.1);
}

.empty-chat__logo-img {
  width: 52px;
  height: 52px;
  object-fit: contain;
  filter: drop-shadow(0 0 8px rgba(140, 80, 255, 0.5));
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
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--imago-border-light);
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
  border-color: rgba(0, 240, 255, 0.25);
  background: rgba(0, 240, 255, 0.05);
}

.suggestion-chip:hover .suggestion-chip__icon {
  opacity: 1;
}

/* ── Messages ──────────────────────────────────────────────────────────── */

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
  border: 1px solid var(--imago-border-light);
  background: var(--imago-bg-raised);
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
  background: rgba(255 255 255 / 0.015);
  border: 1px solid rgba(255 255 255 / 0.05);
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
  border-left: 1px solid rgba(0 229 255 / 0.24);
}

.user-comment-meta {
  color: rgba(148 163 184 / 0.9);
}

.user-comment-path {
  max-width: 260px;
}

.user-comment-preview {
  padding: 4px 0 0;
  border-radius: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.56);
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
  color: rgba(255 255 255 / 0.62);
}

.user-message-footer {
  min-height: 24px;
  width: 100%;
  max-width: min(100%, 62ch);
}

.user-message-meta {
  font-size: 12px;
  line-height: 1.2;
  color: rgba(255, 255, 255, 0.50);
}

.user-turn-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: rgba(255 255 255 / 0.08);
  color: rgba(255 255 255 / 0.6);
  cursor: pointer;
  border-radius: 4px;
  opacity: 0;
  transition: opacity 150ms ease, background var(--imago-ease-fast);
  padding: 0;
}

.user-turn-action:hover {
  background: rgba(255 255 255 / 0.15);
  color: rgba(255 255 255 / 0.9);
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
}

.assistant-copy-btn:hover {
  color: var(--imago-text-secondary);
  background: rgba(148 163 184 / 0.1);
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

.text-part :deep(p) { margin: 0 0 10px; }
.text-part :deep(p:last-child) { margin-bottom: 0; }
.text-part :deep(h1), .text-part :deep(h2), .text-part :deep(h3), .text-part :deep(h4) { margin: 12px 0 6px; font-weight: 600; line-height: 1.3; }
.text-part :deep(code) { background: var(--imago-border-light); border: 1px solid var(--imago-border-soft); padding: 1px 5px; border-radius: var(--imago-radius-xs); font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.875em; word-break: break-all; }
.text-part :deep(pre) { background: var(--imago-bg-code); padding: 12px 16px; border-radius: var(--imago-radius-md); overflow-x: auto; margin: 10px 0; font-size: 0.875em; max-height: 400px; }
.text-part :deep(pre code) { background: none; border: none; padding: 0; word-break: normal; }
.text-part :deep(ul), .text-part :deep(ol) { padding-left: 22px; margin: 4px 0 10px; }
.text-part :deep(li) { margin-bottom: 3px; }
.text-part :deep(blockquote) { border-left: 3px solid var(--imago-border-dim); margin: 8px 0; padding: 6px 12px; color: var(--imago-text-muted); background: var(--imago-border-subtle); border-radius: 0 var(--imago-radius-sm) var(--imago-radius-sm) 0; }
.text-part :deep(table) { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px; }
.text-part :deep(th), .text-part :deep(td) { border: 1px solid var(--imago-border-soft); padding: 6px 10px; text-align: left; }
.text-part :deep(th) { background: var(--imago-bg-raised); font-weight: 600; }
.text-part :deep(tr:nth-child(even)) { background: var(--imago-border-subtle); }
.text-part :deep(img) { width: min(100%, 440px); max-width: 100%; max-height: 248px; height: auto; aspect-ratio: auto; object-fit: contain; border-radius: var(--imago-radius-sm); display: block; border: 1px solid rgba(255 255 255 / 0.06); background: rgba(255 255 255 / 0.02); }

.history-loading {
  /* pass — QInfiniteScroll loading slot */
}
</style>
