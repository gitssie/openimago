<template>
  <!--
    DESIGN NOTE — page-level composition (Designer → Coder hand-off)
    ────────────────────────────────────────────────────────────────
    This page is a *thin* data shell. All of its previous left-sidebar /
    preview-panel scaffolding has been removed in favor of the new
    ProjectWorkspaceGrid component, which now owns the three-column visual
    layout (story elements · shot/output workspace · AI assistant).

    Responsibilities retained by the page:
      • Owns the useAgentSession composable and the project output/file state
      • Owns the PromptInput footer (bottom composer) and AgentQuestion slot
      • Fetches project data, archives / edits the project
      • Computes derived data (sidebarSessions, storyElements, outputCount)
        and forwards them as props to the new grid
      • Injects <SessionChatView> into the grid's `assistant-chat` slot

    The grid's emit handlers are wired 1:1 to existing page handlers below
    so the existing routing, archive, and message-send flows keep working.
  -->
  <q-page :style-fn="pageHeightFn" class="project-workspace" style="padding: 0; overflow: hidden;">
    <ProjectWorkspaceGrid
      :project-name="projectName"
      :project-status="projectStatus"
      :outputs="gridOutputs"
      :outputs-loading="projectOutputsLoading"
      :selected-output-id="selectedOutputId"
      :story-elements="storyElements"
      :session-count="sessionList.length"
      :output-count="projectOutputs.length"
      :file-count="projectFiles.length"
      :has-session="Boolean(sessionId)"
      :session-label="currentSessionLabel"
      :is-assistant-busy="isLoading"
      :assistant-status="assistantStatus"
      :credits-label="creditsLabel"
      :sessions="sidebarSessions"
      :active-session-id="sessionId"
      :is-session-switching="isSessionSwitching"
      @back="onBackToProjects"
      @open-assets="onOpenAssets"
      @open-export="onOpenExport"
      @workspace-tab-change="onWorkspaceTabChange"
      @output-select="onGridOutputSelect"
      @element-select="onGridElementSelect"
      @add-element="onAddElement"
      @add-to-group="onAddToGroup"
      @play-output="onPlayOutput"
      @apply-prompt="onApplyPrompt"
      @session-select="onSessionSelect"
      @session-create="onSessionCreate"
    >
      <template #assistant-chat>
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
      </template>
    </ProjectWorkspaceGrid>

    <!-- Bottom composer — kept at page level so PromptInput can focus on mount -->
    <div class="input-dock">
      <div class="input-container">
        <AgentQuestion
          v-if="pendingQuestion"
          :request="pendingQuestion"
          :on-reply="replyToQuestion"
          :on-reject="rejectQuestion"
        />
        <PromptInput
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
        />
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import SessionChatView from 'src/components/session-workspace/SessionChatView.vue'
import ProjectWorkspaceGrid, {
  type ShotOutputItem,
  type StoryElement,
  type StoryElementKind,
  type AssistantStatus,
  type WorkspaceTabId,
  type SessionCardItem,
} from 'src/components/session-workspace/ProjectWorkspaceGrid.vue'
import AgentQuestion from 'src/components/AgentQuestion.vue'
import PromptInput from 'src/components/PromptInput.vue'
import { useAgentSession, type DisplayMessage } from 'src/composables/useAgentSession'
import type { SessionItem } from 'src/services/agents'
import { api, type OpenimagoProject } from 'src/api/client'
import type { TextPart } from '@opencode-ai/sdk/v2'

// ── Local shapes (unchanged from previous version) ───────────────────────────

type OutputItem = {
  id: string
  url: string
  filename: string
  kind: 'image' | 'video' | 'audio'
  timeLabel: string
  promptText: string
  model?: string | null
  resolution?: string | null
  durationLabel?: string | null
}

// ── UI refs ───────────────────────────────────────────────────────────────────

const $q = useQuasar()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const chatViewRef = ref<InstanceType<typeof SessionChatView> | null>(null)
const inputRef = ref<{ focus: () => void; setDraft: (value: string) => void } | null>(null)
const draftInputMessage = ref('')
const isSessionSwitching = ref(false)

const projectId = computed(() => route.params.id as string)
const project = ref<OpenimagoProject | null>(null)
const projectName = computed(() => project.value?.name || '项目工作台')
const projectStatus = computed<'active' | 'archived'>(() => project.value?.status || 'active')

const projectOutputs = ref<OutputItem[]>([])
const projectOutputsLoading = ref(false)
const selectedOutputId = ref<string | null>(null)
const projectFiles = ref<OutputItem[]>([])
const projectFilesLoading = ref(false)
const selectedElementId = ref<string | null>(null)

function pageHeightFn(offset: number) {
  return { minHeight: `${window.innerHeight - offset}px`, height: `${window.innerHeight - offset}px` }
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
  partText,
  pendingQuestion,
  pendingPermission,
  loadAgents,
  loadCommands,
  loadSessionList,
  loadOlderMessages,
  switchSession,
  createNewSession,
  addAttachment,
  removeAttachment,
  sendMessage,
  abortSession,
  replyToQuestion,
  rejectQuestion,
  revertMessage,
  startEventSubscription,
  stopEventSubscription,
} = useAgentSession(
  () => chatViewRef.value?.scrollToBottomNow() ?? Promise.resolve(),
  () => chatViewRef.value?.doScrollToBottom(),
  (msg) => $q.notify({ color: 'negative', message: msg, icon: 'error' }),
  (msg, opts) => $q.notify({ color: 'info', message: msg, icon: opts?.icon ?? 'info', ...(opts?.timeout !== undefined ? { timeout: opts.timeout } : {}) }),
  (msg) => $q.notify({ color: 'positive', message: msg, icon: 'check' }),
  () => void nextTick(() => inputRef.value?.focus()),
)

// ── Derived: shape data for the new grid ──────────────────────────────────────

const gridOutputs = computed<ShotOutputItem[]>(() => projectOutputs.value.map((item) => ({
  id: item.id,
  url: item.url,
  filename: item.filename,
  kind: item.kind,
  timeLabel: item.timeLabel,
  promptText: item.promptText,
  model: item.model ?? null,
  resolution: item.resolution ?? null,
  durationLabel: item.durationLabel ?? null,
})))

// TODO: derive story elements from real data. For the scaffold, we surface
// the most visually obvious mapping (project outputs → scenes, project image
// files → references) so the left column has something to show. Proper
// classification (character, prop) needs the assets API to expose a tag/role
// field — that is not available yet, hence the empty groups.
const storyElements = computed<StoryElement[]>(() => {
  const items: StoryElement[] = []

  for (const output of projectOutputs.value) {
    if (output.kind === 'image' && output.url) {
      items.push({
        id: `scene-${output.id}`,
        title: output.filename || '场景镜头',
        preview: output.promptText || '',
        thumbnailUrl: output.url,
        kind: 'scene',
        timeLabel: output.timeLabel,
        syncState: 'synced',
      })
    }
  }

  for (const file of projectFiles.value) {
    if (file.kind === 'image' && file.url) {
      items.push({
        id: `ref-${file.id}`,
        title: file.filename || '参考图',
        preview: file.promptText || '',
        thumbnailUrl: file.url,
        kind: 'reference',
        timeLabel: file.timeLabel,
        syncState: 'synced',
      })
    }
  }

  return items
})

const currentSessionItem = computed<SessionItem | null>(() => {
  if (!sessionId.value) return null
  return sessionList.value.find((session) => session.id === sessionId.value) ?? null
})

const currentSessionLabel = computed(() => {
  const session = currentSessionItem.value
  if (!session) return null
  const title = session.title?.trim()
  if (!title) return t('agent.untitled')
  return title.replace(/\s+\(@[^)]+ subagent\)$/, '')
})

const activeAttentionCallId = computed(() => {
  return pendingPermission.value?.tool?.callID ?? pendingQuestion.value?.tool?.callID ?? null
})

const assistantStatus = computed<AssistantStatus>(() => {
  if (isLoading.value) return { label: '生成中', tone: 'busy' }
  if (isConnected.value) return { label: '已连接', tone: 'connected' }
  return { label: '就绪', tone: 'idle' }
})

// ── Session helpers (ported from SessionWorkspacePage) ─────────────────────

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
  return session.id === sessionId.value
}

function getSessionPreview(session: SessionItem): string {
  const entries = sessionMessages.value[session.id] ?? []

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (!entry || entry.info.role !== 'user') continue

    const preview = entry.parts
      .filter((part): part is TextPart => part.type === 'text' && !(part as { synthetic?: boolean }).synthetic)
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

function formatSessionTime(date: Date): string {
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function clipText(value: string, max = 48): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, Math.max(0, max - 1))}…`
}

const sidebarSessions = computed<SessionCardItem[]>(() => sessionList.value
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

// TODO: integrate with billing API to show real credits. Scaffold uses a
// dash placeholder so the command bar's credits chip always renders.
const creditsLabel = '—'

// ── Grid event handlers ───────────────────────────────────────────────────────

function onBackToProjects() {
  void router.push('/projects')
}

function onOpenAssets() {
  // TODO: navigate to project assets page when the route lands
  $q.notify({ color: 'info', message: '素材库即将上线', icon: 'info' })
}

function onOpenExport() {
  // TODO: open export dialog wired to api.projectExports(...) when supported
  $q.notify({ color: 'info', message: '导出流程即将上线', icon: 'info' })
}

function onWorkspaceTabChange(tab: WorkspaceTabId) {
  // TODO: route to the right deep-link per workspace tab
  // (e.g. /projects/:id/storyboard, /projects/:id/timeline, /projects/:id/edit)
  // For now we only log + show a notice so the user sees the tab reacts.
  $q.notify({ color: 'info', message: `切换到 ${tab} 视图（待接入）`, icon: 'info', timeout: 1200 })
}

function onGridOutputSelect(id: string) {
  selectedOutputId.value = id
}

function onGridElementSelect(id: string) {
  // TODO: when assets have classification metadata, route to the right
  // workspace tab. For now, treat the click as "select for prompt context".
  $q.notify({ color: 'info', message: '已选择元素 — 等待提示词编辑器接入', icon: 'info', timeout: 1200 })
  // Stash the id on a ref so the coder can wire it into the prompt editor.
  selectedElementId.value = id
}

function onAddElement() {
  // TODO: open asset upload dialog and then refresh storyElements
  $q.notify({ color: 'info', message: '添加故事元素（待接入）', icon: 'info' })
}

function onAddToGroup(group: StoryElementKind) {
  // TODO: scoped add per group; same handler as onAddElement for now
  $q.notify({ color: 'info', message: `向 ${group} 添加元素（待接入）`, icon: 'info' })
}

function onPlayOutput(id: string) {
  // TODO: open the video in a player overlay. The grid already shows a play
  // button for video outputs; coder needs to wire up playback.
  const output = projectOutputs.value.find((item) => item.id === id)
  if (output) {
    $q.notify({ color: 'info', message: `播放 ${output.filename}（待接入）`, icon: 'play_circle' })
  }
}

function onApplyPrompt(value: string) {
  // Forward the prompt into the active session via the existing input flow.
  // The grid's `apply-prompt` is a UI shortcut; the real submission goes
  // through submitDraftMessage so attachments / queueing stay consistent.
  draftInputMessage.value = value
  void submitDraftMessage(value)
}

async function onSessionSelect(sid: string) {
  await handleSwitchSession(sid)
}

async function onSessionCreate() {
  const pid = projectId.value
  if (!pid) return
  isSessionSwitching.value = true
  try {
    createNewSession()
    const created = await api.createSession({ projectId: pid })
    if (created?.id) {
      await handleSwitchSession(created.id)
    }
  } finally {
    isSessionSwitching.value = false
  }
}

// ── Session handlers ──────────────────────────────────────────────────────────

async function handleSwitchSession(sid: string) {
  if (!sid || sid === sessionId.value) return
  isSessionSwitching.value = true
  try {
    await switchSession(sid)
    void router.push({ name: 'project-session', params: { id: projectId.value, sessionId: sid } })
  } finally {
    isSessionSwitching.value = false
  }
}

function onLoadHistory(_index: number, done: (stop?: boolean) => void) {
  void loadOlderMessages()
    .then((hasMore) => done(!hasMore))
    .catch(() => done(true))
}

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

function onFilesSelected(files: File[]) {
  if (files.length === 0) return
  void Promise.all(files.map((file) => addAttachment(file))).catch(() => {
    $q.notify({ color: 'negative', message: '附件上传失败', icon: 'error' })
  })
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchProjectData() {
  try {
    const projects = await api.listProjects()
    project.value = projects.find((p) => p.id === projectId.value) ?? null
  } catch {
    // Silent
  }
}

async function fetchProjectOutputs() {
  projectOutputsLoading.value = true
  try {
    const outputs = await api.projectOutputs(projectId.value)
    projectOutputs.value = outputs.map((wf) => ({
      id: wf.workspaceFileId,
      url: wf.access.thumbnail?.href ?? wf.access.preview.href ?? '',
      filename: wf.filename || wf.kind || '生成结果',
      kind: wf.kind,
      timeLabel: formatResultTime(new Date(wf.createdAt)),
      promptText: wf.prompt ?? '',
      // Optional richer fields — WorkspaceFile already exposes model and
      // prompt; render-time metadata is left undefined until the API
      // exposes resolution / duration.
      model: wf.model ?? null,
      resolution: null,
      durationLabel: null,
    }))
    // Auto-select the most recent output the first time we load.
    if (!selectedOutputId.value && projectOutputs.value.length > 0) {
      selectedOutputId.value = projectOutputs.value[0]!.id
    }
  } catch {
    projectOutputs.value = []
  } finally {
    projectOutputsLoading.value = false
  }
}

async function fetchProjectFiles() {
  projectFilesLoading.value = true
  try {
    const files = await api.projectFiles(projectId.value)
    projectFiles.value = files.map((wf) => ({
      id: wf.workspaceFileId,
      url: wf.access.preview.href ?? '',
      filename: wf.filename || wf.kind || '文件',
      kind: wf.kind,
      timeLabel: formatResultTime(new Date(wf.createdAt)),
      promptText: wf.prompt ?? '',
    }))
  } catch {
    projectFiles.value = []
  } finally {
    projectFilesLoading.value = false
  }
}

function formatResultTime(date: Date): string {
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(() => {
  void loadAgents()
  void loadCommands()
  void fetchProjectData()
  // Eagerly fetch outputs/files so the shot strip and story elements have
  // something to show on first paint. The previous version only fetched on
  // tab change; the new grid renders outputs and elements at all times.
  void fetchProjectOutputs()
  void fetchProjectFiles()
  void loadSessionList().then(() => {
    const paramSessionId = route.params.sessionId
    if (paramSessionId && typeof paramSessionId === 'string' && paramSessionId !== sessionId.value) {
      void switchSession(paramSessionId)
    }
  })
  startEventSubscription()
  void nextTick(() => { inputRef.value?.focus() })
})

// Watch route sessionId changes
watch(
  () => route.params.sessionId,
  (sid) => {
    const s = typeof sid === 'string' ? sid : undefined
    if (s && s !== sessionId.value) void switchSession(s)
  },
)

onUnmounted(() => {
  stopEventSubscription()
})
</script>

<style scoped>
/* ── Page-level chrome ─────────────────────────────────────────────────── */

:global(body) {
  background: var(--imago-bg-void);
}

.project-workspace {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--imago-text-primary);
  background: var(--imago-bg-void);
}

/* ── Input dock (bottom composer) ───────────────────────────────────────── */

.input-dock {
  flex-shrink: 0;
  padding: 12px 20px 16px;
  border-top: 1px solid var(--imago-border-light);
  background: linear-gradient(180deg, var(--imago-bg-void), var(--imago-bg-deep));
  backdrop-filter: var(--imago-blur-panel);
  -webkit-backdrop-filter: var(--imago-blur-panel);
}

.input-container {
  max-width: 760px;
  margin: 0 auto;
}

@media (max-width: 768px) {
  .input-dock {
    padding: 10px 14px 14px;
  }
}
</style>
