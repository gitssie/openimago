<template>
  <q-page :style-fn="pageHeightFn" class="project-workspace" style="padding: 0; overflow: hidden;">
    <UILayout class="project-layout relative full-height" view="hhh lpr lfr" container>
      <UILayoutDrawer :model-value="!sidebarCollapsed" side="left" :width="256" :breakpoint="1024" bordered show-if-above @update:model-value="sidebarCollapsed = !$event">
        <div class="sidebar-with-tabs">
          <q-tabs v-model="activeTab" dense no-caps active-color="grey-4" indicator-color="grey-7" class="project-tabs" narrow-indicator>
            <q-tab name="chat" icon="chat" label="会话" />
            <q-tab name="outputs" icon="image" label="产出" />
            <q-tab name="files" icon="folder" label="文件" />
          </q-tabs>

          <div v-if="activeTab === 'chat'" class="sidebar-tab-content">
            <SessionWorkspaceSidebar
              :sessions="sidebarSessions"
              :session-count="sidebarSessions.length"
              :collapsed="sidebarCollapsed"
              :project-id="projectId"
              @create="createNewSession"
              @select="handleSwitchSession"
              @delete="deleteSession"
              @toggle-collapse="sidebarCollapsed = !sidebarCollapsed"
            />
          </div>

          <div v-else-if="activeTab === 'outputs'" class="sidebar-tab-content">
            <div class="outputs-sidebar">
              <div class="outputs-sidebar__title">项目产出</div>
              <div v-if="projectOutputsLoading" class="flex flex-center q-py-lg">
                <q-spinner-dots size="24px" color="grey-5" />
              </div>
              <div v-else-if="projectOutputs.length > 0" class="outputs-grid">
                <button
                  v-for="item in projectOutputs"
                  :key="item.id"
                  type="button"
                  class="output-card"
                  :class="{ 'output-card--active': selectedOutputId === item.id }"
                  @click="selectedOutputId = item.id"
                >
                  <div class="output-card__frame">
                    <img v-if="item.kind === 'image'" :src="item.url" :alt="item.filename" class="output-card__image">
                    <div v-else-if="item.kind === 'video'" class="output-card__video-frame">
                      <img v-if="item.url" :src="item.url" :alt="item.filename" class="output-card__image">
                      <q-icon name="play_circle" size="22px" color="white" class="output-card__play-icon" />
                    </div>
                    <div v-else class="output-card__generic-frame">
                      <q-icon name="description" size="28px" color="grey-6" />
                    </div>
                  </div>
                  <div class="output-card__body">
                    <div class="output-card__title ellipsis">{{ item.filename || '生成结果' }}</div>
                    <div class="output-card__meta">
                      <span>{{ item.timeLabel }}</span>
                    </div>
                  </div>
                </button>
              </div>
              <div v-else class="outputs-empty">
                <q-icon name="image" size="28px" color="grey-7" class="q-mb-sm" />
                <div class="text-caption text-grey-7">暂无产出</div>
                <div class="text-caption text-grey-6">在会话中生成内容后会显示在这里</div>
              </div>
            </div>
          </div>

          <div v-else-if="activeTab === 'files'" class="sidebar-tab-content">
            <div class="files-sidebar">
              <div class="files-sidebar__title">项目文件</div>
              <div v-if="projectFilesLoading" class="flex flex-center q-py-lg">
                <q-spinner-dots size="24px" color="grey-5" />
              </div>
              <q-list v-else-if="projectFiles.length > 0" class="files-list">
                <q-item
                  v-for="file in projectFiles"
                  :key="file.id"
                  clickable
                  class="file-item"
                  @click="selectedFileId = file.id"
                >
                  <q-item-section avatar>
                    <q-icon :name="file.kind === 'image' ? 'image' : file.kind === 'video' ? 'movie' : 'description'" color="grey-5" />
                  </q-item-section>
                  <q-item-section>
                    <q-item-label class="file-item__name">{{ file.filename || '文件' }}</q-item-label>
                    <q-item-label caption>{{ file.timeLabel }}</q-item-label>
                  </q-item-section>
                </q-item>
              </q-list>
              <div v-else class="outputs-empty">
                <q-icon name="folder" size="28px" color="grey-7" class="q-mb-sm" />
                <div class="text-caption text-grey-7">暂无文件</div>
              </div>
            </div>
          </div>
        </div>
      </UILayoutDrawer>

      <UILayoutPageContainer>
        <UILayoutPage class="workspace-page">
          <ProjectHeader
            :project-name="projectName"
            :project-status="projectStatus"
            @edit="onEditProject"
            @toggle-archive="onToggleArchive"
          />

          <main class="workspace-main">
            <!-- Output/File Preview Panel -->
            <div v-if="activeTab === 'outputs' && selectedOutput" class="output-preview imago-surface q-ma-md">
              <div class="output-preview__frame">
                <img v-if="selectedOutput.kind === 'image'" :src="selectedOutput.url" :alt="selectedOutput.filename" class="output-preview__image">
                <div v-else-if="selectedOutput.kind === 'video'" class="output-preview__video">
                  <img v-if="selectedOutput.url" :src="selectedOutput.url" :alt="selectedOutput.filename" class="output-preview__image">
                  <q-icon name="play_circle" size="48px" color="white" class="output-preview__play" />
                </div>
                <div v-else class="output-preview__generic flex flex-center">
                  <q-icon name="description" size="48px" color="grey-6" />
                </div>
              </div>
              <div class="output-preview__body">
                <div class="output-preview__title">{{ selectedOutput.filename }}</div>
                <div class="output-preview__prompt">{{ selectedOutput.promptText || '生成结果' }}</div>
              </div>
            </div>

            <div v-else-if="activeTab === 'files' && selectedFileItem" class="output-preview imago-surface q-ma-md">
              <div class="output-preview__frame">
                <img v-if="selectedFileItem.kind === 'image'" :src="selectedFileItem.url" :alt="selectedFileItem.filename" class="output-preview__image">
                <div v-else class="output-preview__generic flex flex-center">
                  <q-icon name="description" size="48px" color="grey-6" />
                </div>
              </div>
              <div class="output-preview__body">
                <div class="output-preview__title">{{ selectedFileItem.filename }}</div>
                <div class="output-preview__prompt">{{ selectedFileItem.promptText || '' }}</div>
              </div>
            </div>

            <!-- Chat Tab: SessionChatView -->
            <div v-if="activeTab === 'chat'" class="chat-tab-content">
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
          </main>
        </UILayoutPage>
      </UILayoutPageContainer>

      <UILayoutFooter bordered>
        <div v-if="activeTab === 'chat'" class="input-area">
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
      </UILayoutFooter>
    </UILayout>
  </q-page>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import ProjectHeader from 'src/components/session-workspace/ProjectHeader.vue'
import SessionChatView from 'src/components/session-workspace/SessionChatView.vue'
import SessionWorkspaceSidebar from 'src/components/session-workspace/SessionWorkspaceSidebar.vue'
import AgentQuestion from 'src/components/AgentQuestion.vue'
import PromptInput from 'src/components/PromptInput.vue'
import { UILayout, UILayoutDrawer, UILayoutFooter, UILayoutPage, UILayoutPageContainer } from 'src/components/ui/layout'
import { useAgentSession } from 'src/composables/useAgentSession'
import type { SessionItem } from 'src/services/agents'
import { api, type OpenimagoProject } from 'src/api/client'

type SidebarSessionItem = {
  id: string
  title: string
  preview: string
  timeLabel: string
  clockLabel: string
  meta: string
  active: boolean
}

type OutputItem = {
  id: string
  url: string
  filename: string
  kind: 'image' | 'video' | 'audio'
  timeLabel: string
  promptText: string
}

// ── UI refs ───────────────────────────────────────────────────────────────────

const $q = useQuasar()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const chatViewRef = ref<InstanceType<typeof SessionChatView> | null>(null)
const inputRef = ref<{ focus: () => void; setDraft: (value: string) => void } | null>(null)
const sidebarCollapsed = ref(false)
const activeTab = ref('chat')
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
const selectedFileId = ref<string | null>(null)

const selectedOutput = computed(() =>
  projectOutputs.value.find((item) => item.id === selectedOutputId.value) ?? null
)
const selectedFileItem = computed(() =>
  projectFiles.value.find((item) => item.id === selectedFileId.value) ?? null
)

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
  deleteSession,
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

// ── Computed ──────────────────────────────────────────────────────────────────

const activeAttentionCallId = computed(() => {
  return pendingPermission.value?.tool?.callID ?? pendingQuestion.value?.tool?.callID ?? null
})

const currentSessionItem = computed<SessionItem | null>(() => {
  if (!sessionId.value) return null
  return getAllSessions().find((session) => session.id === sessionId.value) ?? null
})

function getAllSessions(): SessionItem[] {
  return sessionList.value
}

function getSessionLabel(session: SessionItem): string {
  const title = session.title?.trim()
  if (!title) return t('agent.untitled')
  return title.replace(/\s+\(@[^)]+ subagent\)$/, '')
}

function getSessionPreview(session: SessionItem): string {
  const entries = sessionMessages.value[session.id] ?? []
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (!entry || entry.info.role !== 'user') continue
    const preview = entry.parts
      .filter((part) => (part as { type?: string; synthetic?: boolean }).type === 'text' && !(part as { synthetic?: boolean }).synthetic)
      .map((part) => (part as { text?: string }).text?.trim())
      .find(Boolean)
    if (preview) return clipText(preview, 42)
  }
  return ''
}

function getSessionMeta(): string {
  return '对话工作流'
}

function isSessionActive(session: SessionItem): boolean {
  if (!sessionId.value) return false
  return session.id === sessionId.value
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

function clipText(value: string, max = 48): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, Math.max(0, max - 1))}…`
}

const sidebarSessions = computed<SidebarSessionItem[]>(() => sessionList.value
  .slice()
  .sort((left, right) => right.time.getTime() - left.time.getTime())
  .map((session) => ({
    id: session.id,
    title: getSessionLabel(session),
    preview: getSessionPreview(session),
    timeLabel: formatSessionTime(session.time),
    clockLabel: formatClock(session.time),
    meta: getSessionMeta(),
    active: isSessionActive(session),
  })))

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

// ── Project actions ───────────────────────────────────────────────────────────

function onEditProject() {
  // Placeholder — will be implemented with a dialog later
  $q.notify({ color: 'info', message: '编辑功能即将上线', icon: 'info' })
}

async function onToggleArchive() {
  if (!project.value) return
  const newStatus = project.value.status === 'archived' ? 'active' : 'archived'
  try {
    await api.updateProject(projectId.value, { status: newStatus })
    project.value = { ...project.value, status: newStatus }
  } catch {
    $q.notify({ color: 'negative', message: '归档操作失败', icon: 'error' })
  }
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
    }))
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

// Fetch outputs/files when tab changes
watch(activeTab, (tab) => {
  if (tab === 'outputs' && projectOutputs.value.length === 0) void fetchProjectOutputs()
  if (tab === 'files' && projectFiles.value.length === 0) void fetchProjectFiles()
})

onUnmounted(() => {
  stopEventSubscription()
})
</script>

<style scoped>
:global(body) {
  background: var(--imago-bg-void);
}

.project-workspace {
  position: relative;
  width: 100%;
  height: 100%;
  color: var(--imago-text-primary);
  background: var(--imago-bg-void);
}

.project-layout {
  z-index: 1;
  width: 100%;
}

.project-layout :deep(.ui-layout__drawer) {
  background: var(--imago-bg-void) !important;
  color: var(--imago-text-primary);
  border-color: var(--imago-border-light);
}

.project-layout :deep(.ui-layout__drawer--left) {
  border-right: 1px solid var(--imago-border-light);
}

.sidebar-with-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.project-tabs {
  flex-shrink: 0;
  padding: 8px 12px 0;
  color: var(--imago-text-dim);
}

.sidebar-tab-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.workspace-page {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.workspace-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-tab-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.output-preview {
  padding: 16px;
  margin: 16px;
  background: linear-gradient(180deg, rgba(15, 17, 30, 0.9), rgba(10, 11, 21, 0.82));
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.output-preview__frame {
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid rgba(0, 240, 255, 0.14);
  background: rgba(255, 255, 255, 0.02);
  aspect-ratio: 4 / 3;
  position: relative;
}

.output-preview__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.output-preview__video {
  position: relative;
  width: 100%;
  height: 100%;
}

.output-preview__play {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  opacity: 0.85;
  filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.6));
}

.output-preview__generic {
  width: 100%;
  height: 100%;
  background: var(--imago-bg-code);
}

.output-preview__body {
  padding: 12px 4px 2px;
}

.output-preview__title {
  color: var(--imago-text-secondary);
  font-size: 14px;
  font-weight: 600;
}

.output-preview__prompt {
  margin-top: 6px;
  color: var(--imago-text-dim);
  font-size: 12px;
  line-height: 1.5;
}

/* ── Input area ─────────────────────────────────────────────────────────── */

.input-area {
  padding: 12px 20px 14px;
  background: var(--imago-bg-void);
}

.input-container {
  max-width: 760px;
  margin: 0 auto;
}

/* ── Outputs sidebar grid ───────────────────────────────────────────────── */

.outputs-sidebar,
.files-sidebar {
  padding: 14px 12px 14px 16px;
}

.outputs-sidebar__title,
.files-sidebar__title {
  color: var(--imago-text-dim);
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.outputs-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.output-card {
  display: flex;
  flex-direction: column;
  padding: 6px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.02);
  text-align: left;
  cursor: pointer;
  transition: border-color var(--imago-ease-default), box-shadow var(--imago-ease-default);
}

.output-card:hover {
  border-color: rgba(0, 240, 255, 0.16);
  box-shadow: 0 0 20px rgba(0, 240, 255, 0.06);
}

.output-card--active {
  border-color: rgba(0, 240, 255, 0.28);
  box-shadow: inset 0 0 0 1px rgba(0, 240, 255, 0.1), 0 0 24px rgba(0, 240, 255, 0.08);
}

.output-card__frame {
  overflow: hidden;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.02);
  aspect-ratio: 1 / 1;
}

.output-card__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.output-card__video-frame {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  background: var(--imago-bg-code);
  position: relative;
}

.output-card__play-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  opacity: 0.85;
}

.output-card__generic-frame {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  background: var(--imago-bg-code);
}

.output-card__body {
  padding: 6px 2px 2px;
}

.output-card__title {
  color: var(--imago-text-secondary);
  font-size: 11px;
}

.output-card__meta {
  color: rgba(255, 255, 255, 0.34);
  font-size: 10px;
  margin-top: 2px;
}

.outputs-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 4px;
  min-height: 180px;
  justify-content: center;
  border: 1px dashed rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.02);
}

/* ── Files sidebar ──────────────────────────────────────────────────────── */

.files-list {
  display: grid;
  gap: 4px;
}

.file-item {
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(255, 255, 255, 0.02);
  color: var(--imago-text-muted);
  transition: border-color var(--imago-ease-default);
}

.file-item:hover {
  border-color: rgba(0, 240, 255, 0.12);
}

.file-item__name {
  font-size: 12px;
  color: var(--imago-text-secondary);
}
</style>
