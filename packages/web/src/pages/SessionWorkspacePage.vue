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
                  :active="s.id === sessionId"
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
          <button class="session-heading" type="button">
            {{ currentSessionLabel }}
            <q-icon name="expand_more" size="18px" />
          </button>

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
                    <AgentUserMessageBody
                      v-if="getUserMessageText(turn.user)"
                      :text="getUserMessageText(turn.user)"
                      :references="getUserContextFiles(turn.user)"
                      :agents="getUserAgentMentions(turn.user)"
                    />
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
                        {{ sessionStatus === 'retry' ? '重试中...' : '正在思考...' }}
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
                      />
                      <AgentFilePart v-else-if="part.type === 'file'" :part="part" />
                      <AgentSubtaskPart v-else-if="part.type === 'subtask'" :part="part" />
                      <AgentSimplePart v-else-if="part.type === 'agent'" icon="smart_toy" title="Agent" :description="part.name ?? ''" />
                      <AgentSimplePart v-else-if="part.type === 'snapshot'" icon="history" title="Snapshot" :description="part.snapshot ?? ''" />
                      <AgentSimplePart v-else-if="part.type === 'retry'" icon="refresh" title="Retry" :description="`Attempt ${part.attempt}: ${formatRetryError(part.error)}`" />
                      <AgentSimplePart v-else-if="part.type === 'compaction'" icon="compress" title="Compaction" :description="part.auto ? 'Automatic compaction' : 'Manual compaction'" />
                      <div v-else-if="part.type === 'text'" class="message-text">
                        {{ partText.get(part.id) ?? part.text ?? '' }}
                      </div>
                    </template>
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

            <AgentPermission
              v-if="pendingPermission"
              :request="pendingPermission"
              :on-respond="replyToPermission"
            />

            <AgentPromptInput
              ref="inputRef"
              :draft="draftInputMessage"
              :loading="isLoading"
              :connected="isConnected"
              :disabled="isLoading"
              :attachments="pendingAttachments"
              :selected-datasets="selectedDatasets"
              :dataset-options="datasetOptions"
              @submit="submitDraftMessage"
              @abort="abortSession"
              @toggle-dataset="toggleDataset"
              @clear-datasets="selectedDatasets = []"
              @remove-attachment="removeAttachment"
              @attach-files="onFilesSelected"
            />
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
import type { AgentPart, FilePart, TextPart, ToolPart } from '@opencode-ai/sdk/v2'
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

// ── UI refs ───────────────────────────────────────────────────────────────────

const $q = useQuasar()
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
const suggestions = ['生成一张未来城市海报', '优化这段图像提示词', '列出三种视觉方案'] as const

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
  selectedDatasets,
  pendingAttachments,
  partText,
  pendingQuestion,
  pendingPermission,
  datasetOptions,
  loadAgents,
  loadCommands,
  loadDatasets,
  loadSessionList,
  loadOlderMessages,
  switchSession,
  createNewSession,
  deleteSession,
  toggleDataset,
  addAttachment,
  removeAttachment,
  sendMessage,
  abortSession,
  replyToQuestion,
  rejectQuestion,
  replyToPermission,
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

const currentSessionLabel = computed(() => {
  const active = sessionList.value.find((s) => s.id === sessionId.value)
  return active ? getSessionLabel(active) : '工作台'
})

const displayTurns = computed<DisplayTurn[]>(() => {
  const turns: DisplayTurn[] = []
  for (const message of displayMessages.value) {
    if (message.role === 'user') {
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

// ── UI helpers ────────────────────────────────────────────────────────────────

function getSessionLabel(session: SessionItem): string {
  return session.title?.trim() || '未命名'
}

function formatSessionTime(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function getUserMessageText(msg: DisplayMessage): string {
  return msg.parts
    .filter((p): p is TextPart => p.type === 'text' && !p.synthetic)
    .map((p) => p.text)
    .join('')
}

function getUserContextFiles(msg: DisplayMessage): FilePart[] {
  return msg.parts.filter((part): part is FilePart => part.type === 'file' && !part.url.startsWith('data:'))
}

function getUserAgentMentions(msg: DisplayMessage): AgentPart[] {
  return msg.parts.filter((part): part is AgentPart => part.type === 'agent')
}

function shouldHideToolPart(part: ToolPart): boolean {
  if (part.tool === 'todowrite') return true
  return part.tool === 'question' && (part.state.status === 'pending' || part.state.status === 'running')
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

function getVisibleAssistantPartCount(message: DisplayMessage | null): number {
  if (!message || message.role !== 'assistant') return 0
  return message.parts.filter((part) => {
    if (part.type === 'tool') return !shouldHideToolPart(part)
    if (part.type === 'text' || part.type === 'reasoning') {
      return !!(partText.value.get(part.id) ?? (part as { text?: string }).text ?? '').trim()
    }
    return true
  }).length
}

function formatRetryError(error: unknown): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    if ('message' in error && typeof error.message === 'string') return error.message
  }
  return 'Unknown error'
}

function onLoadHistory(_index: number, done: (stop?: boolean) => void) {
  void loadOlderMessages()
    .then((hasMore) => done(!hasMore))
    .catch(() => done(true))
}

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
  void loadDatasets()
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

.message-text {
  white-space: pre-wrap;
  line-height: 1.6;
}

.thinking-indicator {
  padding: 2px 0 6px;
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

.input-area {
  padding: 16px 24px 24px;
  background: rgb(3 7 18 / 80%);
  border-top: 1px solid rgb(139 164 209 / 16%);
}

.input-container {
  max-width: 680px;
  margin: 0 auto;
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
