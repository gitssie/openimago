<template>
  <q-page
    :style-fn="pageHeightFn"
    class="project-workspace"
    style="padding: 0; overflow: hidden; min-height: 0; display: flex; flex-direction: column;"
  >
    <!--
      Full-viewport top toolbar — spans the entire width above the
      3-column body, mirroring the approved mockup. Carries the project
      brand + title (wordmark), the 4-tab segmented control, the project
      session switcher chip, and the right-side global actions.
    -->
    <WorkspaceTopBar
      class="project-workspace__topbar"
      :brand-variant="'wordmark'"
      :brand-label="projectName"
      :tabs="PROJECT_WORKSPACE_TABS"
      :active-tab="activeWorkspaceTab"
      :panel-base-id="'project-workspace'"
      @tab-change="onWorkspaceTabChange"
    >
      <template #middle-right>
        <WorkspaceSessionChip
          :sessions="sidebarSessions"
          :current-label="currentSessionLabel"
          :creating="isSessionSwitching"
          @select="handleChipSelect"
          @create="onSessionCreate"
        />
      </template>
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

    <UILayout class="project-workspace-layout relative full-height" view="lhr lpr lfr" container>
      <!-- ── Left drawer: storyboard scene cards ─────────────────────── -->
      <UILayoutDrawer
        :model-value="leftPanelOpen"
        side="left"
        :width="300"
        :breakpoint="1024"
        bordered
        show-if-above
        @update:model-value="leftPanelOpen = $event"
      >
        <ProjectWorkspaceLeftPanel
          :scenes="storyboardShots"
          :selected-id="selectedSceneId"
          :view-density="storyboardDensity"
          :read-only="true"
          :can-add-shot="canAddShot"
          :can-generate="canAddShot"
          :generating-ids="generatingShotIds"
          :editable="canAddShot"
          :mutating-ids="mutatingShotIds"
          @scene-select="onSceneSelect"
          @scene-add="onSceneAdd"
          @scene-add-image="onSceneAddImage"
          @scene-image-type="onSceneImageType"
          @scene-generate="onShotGenerate"
          @shot-delete="onShotDelete"
          @shot-update="onShotUpdate"
          @shot-move="onShotMove"
          @add-scene="onAddScene"
          @view-change="(d) => { storyboardDensity = d }"
        />
      </UILayoutDrawer>

      <!-- ── Center page: grid + chat + input dock ────────────────────── -->
      <UILayoutPageContainer>
        <UILayoutPage class="project-workspace-page">
          <!--
            Center content switches with the top-bar tab. The chat/storyboard
            surface (ProjectWorkspaceGrid) stays mounted via v-show so the chat
            session and its scroll state survive tab switches; the overview /
            timeline panels mount on demand.
          -->
          <ProjectWorkspaceGrid
            v-show="isChatSurfaceTab"
            ref="gridRef"
            :project-name="projectName"
            :project-status="projectStatus"
            :outputs="gridOutputs"
            :story-elements="storyElements"
            :session-count="sessionList.length"
            :file-count="projectFiles.length"
            :is-assistant-busy="isLoading"
            @workspace-tab-change="onWorkspaceTabChange"
          >
            <template #context-strip>
              <ProjectContextStrip
                v-if="contextStrip"
                :title="contextStrip.title"
                :subtitle="contextStrip.subtitle"
                :meta="contextStrip.meta"
                :thumbnail-url="contextStrip.thumbnailUrl"
                :kind="contextStrip.kind"
                @download="onContextDownload"
                @clear="onContextClear"
              />
            </template>
            <template #center-session>
              <div class="center-stack">
                <div class="center-stack__chat">
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
                    :is-session-switching="messagesLoading"
                    @load-history="onLoadHistory"
                    @switch-session="handleSwitchSession"
                    @revert-turn="(msgId) => void revertMessage(msgId)"
                    @use-suggestion="useSuggestion"
                  />
                </div>
                <div v-if="hasExtras" class="center-stack__extras">
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
                </div>
                <ChatInputDock
                  :loading="isLoading"
                  :connected="isConnected"
                  :disabled="isSessionSwitching"
                  :attachments="pendingAttachments"
                  @submit="submitDraftMessage"
                  @abort="abortSession"
                  @remove-attachment="(id) => removeAttachment(id)"
                  @attach-files="onFilesSelected"
                />
              </div>
            </template>
          </ProjectWorkspaceGrid>

          <!-- 概览 tab → story bible + episode list -->
          <StoryOverviewPanel
            v-if="activeWorkspaceTab === 'overview'"
            class="project-workspace-page__story-view"
            :bible="storyBibleSummary"
            :episodes="storyEpisodeSummaries"
            :selected-episode-id="currentStoryEpisodeId"
            @episode-select="onEpisodeSelect"
          />

          <!-- 时间线 tab → NLE Cut editor (omniclip) for the current episode -->
          <StoryCutPanel
            v-else-if="activeWorkspaceTab === 'timeline' && currentStoryEpisodeId"
            class="project-workspace-page__story-view"
            :project-id="projectId"
            :episode-id="currentStoryEpisodeId"
            :cut="storyCut"
            :shots="currentStoryShots"
            :runs="currentStoryRuns"
            @request-assemble="onRequestAssemble"
            @cut-changed="onCutChanged"
            @cut-conflict="onCutConflict"
            @clip-regenerate="onClipRegenerate"
            @clip-manual-edit="onClipManualEdit"
            @clip-delete="onClipDelete"
            @clip-add-to-chat="onClipAddToChat"
          />

          <!-- 时间线 tab, no episode selected → empty-state guidance -->
          <StoryTimelineEmpty
            v-else-if="activeWorkspaceTab === 'timeline'"
            class="project-workspace-page__story-view"
            :has-episodes="storyEpisodeSummaries.length > 0"
            @go-to-overview="onWorkspaceTabChange('overview')"
          />

          <!-- AI产出 tab → full-width outputs view (same panel as the right drawer) -->
          <ProjectWorkspaceRightPanel
            v-else-if="activeWorkspaceTab === 'outputs'"
            class="project-workspace-page__story-view"
            :items="aiOutputItems"
            :selected-id="selectedOutputId"
            :layout="outputLayout"
            :show-view-all="aiOutputItems.length > 6"
            :project-name="projectName"
            @item-select="onGridOutputSelect"
            @item-menu="onOutputMenu"
            @layout-change="(l) => { outputLayout = l }"
            @filter="onOutputFilter"
            @view-all="onOutputViewAll"
          />
        </UILayoutPage>
      </UILayoutPageContainer>

      <!-- ── Right drawer: project AI outputs ─────────────────────────── -->
      <UILayoutDrawer
        :model-value="rightPanelOpen"
        side="right"
        :width="360"
        :breakpoint="1280"
        behavior="desktop"
        bordered
        @update:model-value="rightPanelOpen = $event"
      >
        <ProjectWorkspaceRightPanel
          :items="aiOutputItems"
          :selected-id="selectedOutputId"
          :layout="'grid'"
          :show-view-all="aiOutputItems.length > 6"
          :project-name="projectName"
          @item-select="onGridOutputSelect"
          @item-menu="onOutputMenu"
          @layout-change="(l) => { outputLayout = l }"
          @filter="onOutputFilter"
          @view-all="onOutputViewAll"
        />
      </UILayoutDrawer>
    </UILayout>

    <!-- WorkspaceArtifactsPanel overlay (project scope, ADR 0003) — unchanged -->
    <div v-if="showArtifactsPanel" class="artifacts-panel-overlay">
      <div class="artifacts-panel-overlay__backdrop" @click="toggleArtifactsPanel" />
      <div class="artifacts-panel-overlay__panel">
        <WorkspaceArtifactsPanel
          v-model="artifactsPanelTab"
          :artifacts="projectArtifacts"
          :selected-id="artifactsPanelSelectedId"
          :scope="'project'"
          @select="onArtifactSelect"
          @edit-params="onArtifactEditParams"
          @rerun="onArtifactRerun"
          @delete="onArtifactDelete"
        />
      </div>
      <button
        type="button"
        class="artifacts-panel-close"
        aria-label="关闭制品面板"
        @click="toggleArtifactsPanel"
      >
        <q-icon name="close" size="20px" />
      </button>
    </div>

    <button
      v-if="!showArtifactsPanel && projectArtifacts.length > 0"
      type="button"
      class="artifacts-panel-toggle"
      aria-label="打开制品面板"
      @click="toggleArtifactsPanel"
    >
      <q-icon name="view_in_ar" size="18px" />
      <span class="artifacts-panel-toggle__count">{{ projectArtifacts.length }}</span>
    </button>
  </q-page>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import SessionChatView from 'src/components/session-workspace/SessionChatView.vue'
import ProjectWorkspaceGrid from 'src/components/session-workspace/ProjectWorkspaceGrid.vue'
import ProjectWorkspaceLeftPanel, { type StoryboardScene } from 'src/components/session-workspace/ProjectWorkspaceLeftPanel.vue'
import ProjectWorkspaceRightPanel from 'src/components/session-workspace/ProjectWorkspaceRightPanel.vue'
import AgentQuestion from 'src/components/AgentQuestion.vue'
import AgentPermission from 'src/components/AgentPermission.vue'
import AIOutputsPanel from 'src/components/workspace/AIOutputsPanel.vue'
import ChatInputDock from 'src/components/workspace/ChatInputDock.vue'
import ProjectContextStrip from 'src/components/workspace/ProjectContextStrip.vue'
import TopbarActionButton from 'src/components/workspace/TopbarActionButton.vue'
import WorkspaceTopBar from 'src/components/workspace/WorkspaceTopBar.vue'
import WorkspaceSessionChip from 'src/components/workspace/WorkspaceSessionChip.vue'
import { useAgentSession } from 'src/composables/useAgentSession'
import type { TextPart } from '@opencode-ai/sdk/v2'
import type { SessionItem } from 'src/services/agents'
import { api, ApiError, type OpenimagoProject, type OpenimagoStoryBible, type OpenimagoStorySeries, type OpenimagoStoryEpisode, type OpenimagoStoryWorkflow, type OpenimagoStoryRuns, type WorkspaceFile } from 'src/api/client'
import WorkspaceArtifactsPanel from 'src/components/session-workspace/WorkspaceArtifactsPanel.vue'
import { UILayout, UILayoutDrawer, UILayoutPage, UILayoutPageContainer } from 'src/components/ui/layout'
import type {
  WorkspaceArtifact,
  GenerationRunMetadata,
  StoryBibleSummary,
  StoryEpisodeSummary,
  StorySelection,
  StoryEditIntent,
  StoryShotSummary,
  StoryRunSummary,
  ShotOutputItem,
  StoryElement,
  StoryElementKind,
  AssistantStatus,
  SessionCardItem,
  AIOutputItem,
} from 'src/components/session-workspace/types'
import { storiesFromBible, storiesFromEpisodes } from 'src/utils/story-mapping'
import {
  rawBibleToSummary,
  rawSeriesToEpisodeSummaries,
  rawEpisodeToShotSummaries,
  rawRunsToRunSummaries,
} from 'src/utils/story-summary-mapper'
import { workspaceFileToAIOutputItem } from 'src/utils/session-output-mapper'
import { formatRelativeTime } from 'src/utils/format-time'
import StoryOverviewPanel from 'src/components/session-workspace/StoryOverviewPanel.vue'
import StoryCutPanel from 'src/components/session-workspace/StoryCutPanel.vue'
import StoryTimelineEmpty from 'src/components/session-workspace/StoryTimelineEmpty.vue'
import type { EpisodeCut } from 'src/utils/cut/cut-types'
import { rawCutToEpisodeCut } from 'src/utils/cut/cut-api-mapper'
import { dispatchCutEdit } from 'src/utils/cut/cut-edit-dispatcher'
import { resolveShotMediaSource } from 'src/utils/cut/shot-media-resolver'
import { buildReferenceAttachment } from 'src/utils/cut/clip-reference'

// ── Local types ─────────────────────────────────────────────────────────────

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
  genRun?: GenerationRunMetadata
}

type WorkspaceTabId = 'overview' | 'storyboard' | 'timeline' | 'edit' | 'audio' | 'exports' | 'conversation'

// ── Workspace tabs (shared 4-tab pill switcher) ─────────────────────────────

const PROJECT_WORKSPACE_TABS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'storyboard', label: '故事板' },
  { id: 'timeline', label: '时间线' },
  { id: 'overview', label: '概览' },
  { id: 'outputs', label: 'AI产出' },
  { id: 'conversation', label: '对话' },
]

// ── UI refs ─────────────────────────────────────────────────────────────────

const $q = useQuasar()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const chatViewRef = ref<InstanceType<typeof SessionChatView> | null>(null)
const draftInputMessage = ref('')
const isSessionSwitching = ref(false)
const gridRef = ref<{ setActiveWorkspaceTab: (tab: WorkspaceTabId) => void; getActiveWorkspaceTab: () => WorkspaceTabId } | null>(null)
const leftPanelOpen = ref(true)
const rightPanelOpen = ref(true)
const activeWorkspaceTab = ref<string>('storyboard')
const addingShot = ref(false)
const generatingShotIds = ref<string[]>([])
const mutatingShotIds = ref<string[]>([])
const storyboardDensity = ref<'grid' | 'list'>('grid')
const outputLayout = ref<'grid' | 'rows'>('grid')
const hasUnreadNotifications = ref(true)

const projectId = computed(() => route.params.id as string)
const project = ref<OpenimagoProject | null>(null)
const projectName = computed(() => project.value?.name || '项目工作台')
const projectStatus = computed<'active' | 'archived'>(() => project.value?.status || 'active')

const projectOutputs = ref<OutputItem[]>([])
const projectOutputsLoading = ref(false)
// DB-backed generated media for the right-side "AI 产出" panel (openimago-owy7).
// Kept separate from projectOutputs (filesystem scan) so the storyboard
// fallback that reads projectOutputs/projectFiles is not affected.
const projectWorkspaceFileItems = ref<AIOutputItem[]>([])
const selectedOutputId = ref<string | null>(null)
const selectedSceneId = ref<string | null>(null)
const projectFiles = ref<OutputItem[]>([])
const projectFilesLoading = ref(false)
const storyBible = ref<OpenimagoStoryBible | null>(null)
const storySeries = ref<OpenimagoStorySeries | null>(null)
const storyEpisodes = ref<OpenimagoStoryEpisode[]>([])

const currentStoryEpisodeId = ref<string | null>(null)
const currentStoryShotId = ref<string | null>(null)
const currentStorySceneId = ref<string | null>(null)
const storySelectedCharacterId = ref<string | null>(null)
const storySelectedStyleSeedId = ref<string | null>(null)
const storyWorkflow = ref<OpenimagoStoryWorkflow | null>(null)
const storyRuns = ref<OpenimagoStoryRuns | null>(null)
// Episode Cut (ADR 0006/0007) — the 时间线 tab's NLE editor state, canonical
// in cut.json. Loaded alongside the episode's runs (openimago-4eiw).
const storyCut = ref<EpisodeCut | null>(null)
const storyPanelLoading = ref(false)
const storyPanelError = ref<string | null>(null)
const showArtifactsPanel = ref(false)
const artifactsPanelTab = ref('result')
const artifactsPanelSelectedId = ref<string | null>(null)

function pageHeightFn(offset: number) {
  return { height: `${window.innerHeight - offset}px` }
}

// ── Composable ──────────────────────────────────────────────────────────────

const {
  displayMessages,
  historyExhausted,
  historyLoading,
  messagesLoading,
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
  addAttachment,
  addReferenceAttachment,
  removeAttachment,
  sendMessage,
  abortSession,
  replyToQuestion,
  rejectQuestion,
  replyToPermission,
  revertMessage,
  startEventSubscription,
  stopEventSubscription,
} = useAgentSession(
  () => chatViewRef.value?.scrollToBottomNow() ?? Promise.resolve(),
  () => chatViewRef.value?.doScrollToBottom(),
  (msg) => $q.notify({ color: 'negative', message: msg, icon: 'error' }),
  (msg, opts) => $q.notify({ color: 'info', message: msg, icon: opts?.icon ?? 'info', ...(opts?.timeout !== undefined ? { timeout: opts.timeout } : {}) }),
  (msg) => $q.notify({ color: 'positive', message: msg, icon: 'check' }),
  () => { /* focus handled inside ChatInputDock */ },
  () => projectId.value,
)

// ── Derived ─────────────────────────────────────────────────────────────────

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

const selectedGridOutput = computed<ShotOutputItem | null>(
  () => gridOutputs.value.find((item) => item.id === selectedOutputId.value) ?? null,
)

// Right-side "AI 产出" panel is now sourced from the DB-backed
// workspace_generated_files (openimago-owy7), persistent across refresh.
const aiOutputItems = computed<AIOutputItem[]>(() => projectWorkspaceFileItems.value)

// ── Story elements (unchanged from prior version) ───────────────────────────

function storiesFromFallback(): StoryElement[] {
  const items: StoryElement[] = []
  for (const output of projectOutputs.value) {
    if (output.kind === "image" && output.url) {
      items.push({
        id: `scene-${output.id}`,
        title: output.filename || "场景镜头",
        preview: output.promptText || "",
        thumbnailUrl: output.url,
        kind: "scene",
        timeLabel: output.timeLabel,
        syncState: "synced",
      })
    }
  }
  for (const file of projectFiles.value) {
    if (file.kind === "image" && file.url) {
      items.push({
        id: `ref-${file.id}`,
        title: file.filename || "参考图",
        preview: file.promptText || "",
        thumbnailUrl: file.url,
        kind: "reference",
        timeLabel: file.timeLabel,
        syncState: "synced",
      })
    }
  }
  return items
}

const storyElements = computed<StoryElement[]>(() => {
  const items: StoryElement[] = []
  let hasStoryData = false
  if (storyBible.value) {
    items.push(...storiesFromBible(storyBible.value))
    if (
      storyBible.value.characters.length > 0
      || storyBible.value.scenes.length > 0
      || storyBible.value.styleSeeds.length > 0
    ) {
      hasStoryData = true
    }
  }
  if (storyEpisodes.value.length > 0) {
    items.push(...storiesFromEpisodes(storyEpisodes.value))
    hasStoryData = true
  }
  if (!hasStoryData) {
    items.push(...storiesFromFallback())
  }
  return items
})

// ── Storyboard shots (left drawer) ──────────────────────────────────────────

const storyboardShots = computed<StoryboardScene[]>(() => {
  // Each card is a Shot (镜头) of the current episode. Thumbnails come from the
  // shot's own completed runs (run.result.access.thumbnail, inlined in the run
  // — the authoritative source; no join against projectOutputs). Concept-art
  // runs have shotId === null, so they never match a shot here.
  const thumbsByShot = new Map<string, string[]>()
  for (const run of currentStoryRuns.value) {
    if (run.status !== 'completed' || !run.shotId || !run.thumbnailUrl) continue
    const list = thumbsByShot.get(run.shotId) ?? []
    list.push(run.thumbnailUrl)
    thumbsByShot.set(run.shotId, list)
  }
  return currentStoryShots.value.map((shot) => ({
    id: shot.id,
    title: `镜头 ${String(shot.shotNumber).padStart(2, '0')}`,
    description: shot.description,
    thumbnails: thumbsByShot.get(shot.id) ?? [],
  }))
})

// ── Storyboard context strip (above the chat) ───────────────────────────────

const contextStrip = computed(() => {
  // Prefer the selected scene; fall back to the selected output.
  const scene = selectedSceneId.value
    ? storyboardShots.value.find((s) => s.id === selectedSceneId.value)
    : null
  if (scene) {
    return {
      title: scene.title,
      subtitle: scene.description ?? '',
      meta: null,
      thumbnailUrl: scene.thumbnails[0] ?? null,
      kind: 'scene' as const,
    }
  }
  const out = selectedGridOutput.value
  if (out) {
    return {
      title: out.filename,
      subtitle: out.promptText,
      meta: out.timeLabel,
      thumbnailUrl: out.url || null,
      kind: out.kind,
    }
  }
  return null
})

// ── Story summary projections (ADR 0004, openimago-9so) ─────────────────────

const storyBibleSummary = computed<StoryBibleSummary | null>(() => {
  if (!storyBible.value) return null
  return rawBibleToSummary(storyBible.value)
})

const storyEpisodeSummaries = computed<StoryEpisodeSummary[]>(() => {
  if (!storySeries.value) return []
  return rawSeriesToEpisodeSummaries(storySeries.value)
})

const currentStoryShots = computed<StoryShotSummary[]>(() => {
  const epId = currentStoryEpisodeId.value
  if (!epId) return []
  const episode = storyEpisodes.value.find((ep) => ep.id === epId)
  if (!episode) return []
  return rawEpisodeToShotSummaries(episode)
})

const currentStoryRuns = computed<StoryRunSummary[]>(() => {
  if (!storyRuns.value) return []
  return rawRunsToRunSummaries(storyRuns.value)
})

// The chat/storyboard surface (Grid + chat) backs both the 对话 and 故事板 tabs;
// overview/timeline render their own center panels instead.
const isChatSurfaceTab = computed(
  () => activeWorkspaceTab.value === 'conversation' || activeWorkspaceTab.value === 'storyboard',
)

// Shot-adding is the single supported story write (ADR 0005); enabled once an
// episode is selected so the new shot has a target.
const canAddShot = computed(() => Boolean(currentStoryEpisodeId.value))

// ── WorkspaceArtifact[] for WorkspaceArtifactsPanel (ADR 0003) ───────────

const projectArtifacts = computed<WorkspaceArtifact[]>(() => {
  const artifacts: WorkspaceArtifact[] = []
  for (const output of projectOutputs.value) {
    artifacts.push({
      id: output.id,
      kind: output.kind,
      access: {
        preview: output.url,
        thumbnail: output.url,
      },
      filename: output.filename,
      prompt: output.promptText,
      timeLabel: output.timeLabel,
      ...(output.model ? { model: output.model } : {}),
      ...(output.genRun ? { genRun: output.genRun } : {}),
    })
  }
  for (const file of projectFiles.value) {
    if (!artifacts.some((a) => a.id === file.id)) {
      artifacts.push({
        id: file.id,
        kind: file.kind,
        access: {
          preview: file.url,
          thumbnail: file.url,
        },
        filename: file.filename,
        prompt: file.promptText,
        timeLabel: file.timeLabel,
        ...(file.genRun ? { genRun: file.genRun } : {}),
      })
    }
  }
  return artifacts
})

const currentSessionItem = computed<SessionItem | null>(() => {
  if (!sessionId.value) return null
  return sessionList.value.find((session) => session.id === sessionId.value) ?? null
})

const currentSessionLabel = computed(() => {
  const session = currentSessionItem.value
  if (!session) return t('agent.untitled')
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

const hasExtras = computed(() => {
  return Boolean(pendingQuestion.value || pendingPermission.value)
})

// ── Session helpers ─────────────────────────────────────────────────────────

function getChildTaskDescription(session: SessionItem): string {
  const parentId = session.parentID
  if (!parentId) return ''
  const parentEntries = sessionMessages.value[parentId] ?? []
  for (let entryIndex = parentEntries.length - 1; entryIndex >= 0; entryIndex -= 1) {
    const parts = parentEntries[entryIndex]?.parts ?? []
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = parts[partIndex]
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
  return session.id === sessionId.value
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
// dash placeholder so the chip in the top bar always renders.
const creditsLabel = '—'

// ── Grid / output event handlers ───────────────────────────────────────────

function onWorkspaceTabChange(tab: string) {
  activeWorkspaceTab.value = tab
}

// The AI产出 center tab renders the same outputs panel as the right drawer, so
// showing both at once is redundant. Auto-collapse the drawer while that tab is
// active and restore the user's prior drawer state when they leave it.
let rightPanelOpenBeforeOutputs: boolean | null = null
watch(activeWorkspaceTab, (tab, prev) => {
  if (tab === 'outputs' && prev !== 'outputs') {
    rightPanelOpenBeforeOutputs = rightPanelOpen.value
    rightPanelOpen.value = false
  } else if (tab !== 'outputs' && prev === 'outputs' && rightPanelOpenBeforeOutputs !== null) {
    rightPanelOpen.value = rightPanelOpenBeforeOutputs
    rightPanelOpenBeforeOutputs = null
  }
})

function onEpisodeSelect(episodeId: string) {
  if (episodeId === currentStoryEpisodeId.value) return
  currentStoryEpisodeId.value = episodeId
}

/** Pull the workflow DAG + run history for one episode (ADR 0004). */
async function fetchEpisodeWorkflowRuns(episodeId: string): Promise<void> {
  const pid = projectId.value
  try {
    const [wf, runs, cut] = await Promise.all([
      api.projectStoryWorkflow(pid, episodeId),
      api.projectStoryRuns(pid, episodeId),
      api.projectStoryCut(pid, episodeId),
    ])
    // Guard against an out-of-order resolve after another episode was selected.
    if (currentStoryEpisodeId.value !== episodeId) return
    storyWorkflow.value = wf
    storyRuns.value = runs
    storyCut.value = rawCutToEpisodeCut(cut)
  } catch {
    if (currentStoryEpisodeId.value === episodeId) {
      storyWorkflow.value = null
      storyRuns.value = null
      storyCut.value = null
    }
  }
}

/** Refetch just the episode's Cut (after an edit or assemble, openimago-4eiw). */
async function refreshStoryCut(): Promise<void> {
  const episodeId = currentStoryEpisodeId.value
  if (!episodeId) return
  const cut = await api.projectStoryCut(projectId.value, episodeId)
  if (episodeId === currentStoryEpisodeId.value) {
    storyCut.value = rawCutToEpisodeCut(cut)
  }
}

function onCutChanged(): void {
  void refreshStoryCut()
}

function onCutConflict(): void {
  $q.notify({ color: 'warning', message: '该粗剪已被更新，请重试', icon: 'sync_problem', timeout: 2000 })
  void refreshStoryCut()
}

function onRequestAssemble(): void {
  void refreshStoryCut()
  $q.notify({ color: 'positive', message: '已拼接粗剪', icon: 'check', timeout: 1200 })
}

// ── Cut clip context-menu actions (openimago-e0n3) ──────────────────────────

/** 重新生成 — regenerate the source shot's media (reuses ADR 0005 path). */
function onClipRegenerate(sourceShotId: string): void {
  void onShotGenerate(sourceShotId)
}

/** 手动编辑 — edit the source shot's description (reuses ADR 0005 path). */
function onClipManualEdit(sourceShotId: string): void {
  const shot = currentStoryShots.value.find((s) => s.id === sourceShotId)
  const next = window.prompt('编辑镜头描述', shot?.description ?? '')
  if (next === null) return
  onShotUpdate(sourceShotId, { description: next })
}

/** 删除 — delete the CLIP (cut edit-layer), NOT the source shot. */
function onClipDelete(clipId: string): void {
  const episodeId = currentStoryEpisodeId.value
  if (!episodeId) return
  void (async () => {
    const outcome = await dispatchCutEdit(
      {
        api,
        projectId: projectId.value,
        episodeId,
        currentUpdatedAt: () => storyCut.value?.updatedAt,
        refetch: async () => {
          const fresh = await api.projectStoryCut(projectId.value, episodeId)
          return fresh?.updatedAt
        },
      },
      { kind: 'delete', clipId },
    )
    if (outcome === 'conflict') onCutConflict()
    else onCutChanged()
  })()
}

/**
 * 添加到对话 — attach the clip's current media as a chat reference (NON-upload),
 * switch to the 对话 tab, and seed the composer with the shot description.
 */
function onClipAddToChat(sourceShotId: string): void {
  const source = resolveShotMediaSource(sourceShotId, currentStoryShots.value, currentStoryRuns.value)
  const run = currentStoryRuns.value
    .filter((r) => r.shotId === sourceShotId && r.status === 'completed' && r.previewUrl)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))[0]
  const reference = buildReferenceAttachment(sourceShotId, run ?? null, generateReferenceId)
  if (!reference || !source) {
    $q.notify({ color: 'warning', message: '该镜头暂无可引用的媒体', icon: 'info', timeout: 1800 })
    return
  }
  addReferenceAttachment({
    name: reference.name,
    mime: reference.mime,
    url: reference.url,
    ...(reference.assetId !== undefined ? { assetId: reference.assetId } : {}),
  })
  // Seed the composer with the shot description (only if empty, don't clobber).
  const shot = currentStoryShots.value.find((s) => s.id === sourceShotId)
  if (shot?.description && !draftInputMessage.value.trim()) {
    draftInputMessage.value = shot.description
  }
  // Switch to the 对话 tab so the reference is visible in the composer.
  activeWorkspaceTab.value = 'conversation'
  gridRef.value?.setActiveWorkspaceTab?.('conversation')
  $q.notify({ color: 'positive', message: '已添加到对话作为参考', icon: 'check', timeout: 1400 })
}

/** Stable-ish id for a reference attachment. */
function generateReferenceId(): string {
  return `ref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function onGridOutputSelect(id: string) {
  selectedOutputId.value = id
}

function onOutputMenu(id: string, _event: MouseEvent) {
  $q.notify({ color: 'info', message: `对 ${id} 打开菜单（待接入）`, icon: 'info', timeout: 1200 })
}

function onOutputFilter() {
  $q.notify({ color: 'info', message: '筛选面板即将上线', icon: 'filter_list', timeout: 1200 })
}

function onOutputViewAll() {
  $q.notify({ color: 'info', message: '全部结果视图即将上线', icon: 'list', timeout: 1200 })
}

function onSceneSelect(id: string) {
  selectedSceneId.value = id
}

function onSceneAdd(id: string) {
  $q.notify({ color: 'info', message: `向场景 ${id} 添加元素（待接入）`, icon: 'info', timeout: 1200 })
}

function onSceneAddImage(id: string) {
  $q.notify({ color: 'info', message: `为场景 ${id} 上传图片（待接入）`, icon: 'image', timeout: 1200 })
}

function onSceneImageType(id: string) {
  $q.notify({ color: 'info', message: `切换场景 ${id} 的素材类型（待接入）`, icon: 'category', timeout: 1200 })
}

/** Replace one episode in storyEpisodes with the latest from the backend. When
 *  it is the current episode, also re-pull its runs so the timeline and the
 *  left-panel shot thumbnails (sourced from completed runs) refresh. */
async function refreshEpisode(episodeId: string): Promise<OpenimagoStoryEpisode | null> {
  const fresh = await api.projectStoryEpisode(projectId.value, episodeId)
  if (!fresh) return null
  const idx = storyEpisodes.value.findIndex((ep) => ep.id === episodeId)
  if (idx >= 0) storyEpisodes.value.splice(idx, 1, fresh)
  else storyEpisodes.value.push(fresh)
  if (episodeId === currentStoryEpisodeId.value) {
    const runs = await api.projectStoryRuns(projectId.value, episodeId)
    if (episodeId === currentStoryEpisodeId.value) storyRuns.value = runs
  }
  return fresh
}

/**
 * Append a new shot to the current episode (ADR 0005). Sends the episode's
 * last-read updatedAt for optimistic concurrency; on 409 it refetches and
 * retries once, then surfaces the conflict if it still loses.
 */
async function onAddScene() {
  const episodeId = currentStoryEpisodeId.value
  if (!episodeId || addingShot.value) return
  const current = storyEpisodes.value.find((ep) => ep.id === episodeId)

  addingShot.value = true
  try {
    let expectedUpdatedAt = current?.updatedAt
    try {
      await api.addEpisodeShot(projectId.value, episodeId, expectedUpdatedAt)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Stale read — refetch, then retry once with the latest updatedAt.
        const fresh = await refreshEpisode(episodeId)
        expectedUpdatedAt = fresh?.updatedAt
        try {
          await api.addEpisodeShot(projectId.value, episodeId, expectedUpdatedAt)
        } catch (retryErr) {
          if (retryErr instanceof ApiError && retryErr.status === 409) {
            $q.notify({ color: 'warning', message: '该集已被更新，请重试', icon: 'sync_problem', timeout: 2000 })
            return
          }
          throw retryErr
        }
      } else {
        throw err
      }
    }
    // Success — refresh the episode so the new shot appears in the left panel.
    await refreshEpisode(episodeId)
    $q.notify({ color: 'positive', message: '已添加镜头', icon: 'check', timeout: 1200 })
  } catch {
    $q.notify({ color: 'negative', message: '添加镜头失败', icon: 'error', timeout: 2000 })
  } finally {
    addingShot.value = false
  }
}

/**
 * Trigger mock generation for a shot (ADR 0005 — backend mock command appends a
 * completed run + flips the shot to generated). On success, refresh the episode
 * so the new keyframe thumbnail + status + timeline run appear.
 */
async function onShotGenerate(shotId: string) {
  const episodeId = currentStoryEpisodeId.value
  if (!episodeId || generatingShotIds.value.includes(shotId)) return

  generatingShotIds.value = [...generatingShotIds.value, shotId]
  try {
    await api.generateShot(projectId.value, episodeId, shotId)
    await refreshEpisode(episodeId)
    $q.notify({ color: 'positive', message: '已生成关键帧', icon: 'check', timeout: 1200 })
  } catch {
    $q.notify({ color: 'negative', message: '生成失败', icon: 'error', timeout: 2000 })
  } finally {
    generatingShotIds.value = generatingShotIds.value.filter((id) => id !== shotId)
  }
}

/**
 * Run a shot mutation (delete/update/reorder, ADR 0005) with the shared write
 * lifecycle: per-shot loading guard, optimistic concurrency via the episode's
 * updatedAt, refetch-and-retry-once on 409, refresh on success.
 *
 * `mutate(expectedUpdatedAt)` performs one API call; it is retried with a fresh
 * updatedAt if the first attempt 409s.
 */
async function runShotMutation(
  shotId: string,
  mutate: (expectedUpdatedAt: string | undefined) => Promise<unknown>,
  successMessage: string,
): Promise<void> {
  const episodeId = currentStoryEpisodeId.value
  if (!episodeId || mutatingShotIds.value.includes(shotId)) return

  mutatingShotIds.value = [...mutatingShotIds.value, shotId]
  try {
    const current = storyEpisodes.value.find((ep) => ep.id === episodeId)
    let expectedUpdatedAt = current?.updatedAt
    try {
      await mutate(expectedUpdatedAt)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const fresh = await refreshEpisode(episodeId)
        expectedUpdatedAt = fresh?.updatedAt
        try {
          await mutate(expectedUpdatedAt)
        } catch (retryErr) {
          if (retryErr instanceof ApiError && retryErr.status === 409) {
            $q.notify({ color: 'warning', message: '该集已更新，请重试', icon: 'sync_problem', timeout: 2000 })
            return
          }
          throw retryErr
        }
      } else {
        throw err
      }
    }
    await refreshEpisode(episodeId)
    $q.notify({ color: 'positive', message: successMessage, icon: 'check', timeout: 1200 })
  } catch {
    $q.notify({ color: 'negative', message: '操作失败', icon: 'error', timeout: 2000 })
  } finally {
    mutatingShotIds.value = mutatingShotIds.value.filter((id) => id !== shotId)
  }
}

function onShotDelete(shotId: string) {
  const episodeId = currentStoryEpisodeId.value
  if (!episodeId) return
  void runShotMutation(
    shotId,
    (expected) => api.deleteShot(projectId.value, episodeId, shotId, expected),
    '已删除镜头',
  )
}

function onShotUpdate(shotId: string, patch: { description: string }) {
  const episodeId = currentStoryEpisodeId.value
  if (!episodeId) return
  void runShotMutation(
    shotId,
    (expected) => api.updateShot(projectId.value, episodeId, shotId, patch, expected),
    '已更新镜头',
  )
}

/** MVP reorder: move one shot up/down by one, then persist the full order. */
function onShotMove(shotId: string, direction: 'up' | 'down') {
  const episodeId = currentStoryEpisodeId.value
  if (!episodeId) return
  const ids = currentStoryShots.value.map((s) => s.id)
  const from = ids.indexOf(shotId)
  if (from < 0) return
  const to = direction === 'up' ? from - 1 : from + 1
  if (to < 0 || to >= ids.length) return
  const reordered = [...ids]
  const [moved] = reordered.splice(from, 1)
  reordered.splice(to, 0, moved!)
  void runShotMutation(
    shotId,
    (expected) => api.reorderShots(projectId.value, episodeId, reordered, expected),
    '已调整顺序',
  )
}

function onContextDownload() {
  if (!selectedOutputId.value && !selectedSceneId.value) return
  const id = selectedOutputId.value ?? selectedSceneId.value
  $q.notify({ color: 'info', message: `下载 ${id}（待接入）`, icon: 'download', timeout: 1200 })
}

function onContextClear() {
  selectedOutputId.value = null
  selectedSceneId.value = null
}

// ── Top bar / chip handlers ────────────────────────────────────────────────

function handleOpenCommunity() {
  $q.notify({ color: 'info', message: 'OpenImago 交流群即将上线', icon: 'people', timeout: 1200 })
}

function handleOpenProUpgrade() {
  $q.notify({ color: 'info', message: 'Pro 升级流程即将上线', icon: 'crown', timeout: 1200 })
}

function handleOpenNotifications() {
  $q.notify({ color: 'info', message: '通知中心即将上线', icon: 'bell', timeout: 1200 })
  hasUnreadNotifications.value = false
}

function handleChipSelect(sid: string) {
  gridRef.value?.setActiveWorkspaceTab?.('storyboard')
  void handleSwitchSession(sid)
}

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

// ── WorkspaceArtifactsPanel event handlers (ADR 0003, openimago-nhp) ──────

function onArtifactSelect(id: string) {
  artifactsPanelSelectedId.value = id
}

function onArtifactEditParams(_id: string) {
  // Parameter editor is now inline in the panel (openimago-nhp).
}

async function onArtifactRerun(payload: unknown) {
  try {
    const result = await api.rerunArtifact(payload as {
      artifactId: string
      prompt?: string
      model?: string
      aspectRatio?: string
      duration?: number
      seed?: number
      inputArgs?: Record<string, unknown>
    })
    if (result.ok) {
      $q.notify({ color: 'positive', message: '重新生成已提交', icon: 'check', timeout: 1500 })
    } else {
      $q.notify({ color: 'info', message: result.message || '重新生成即将上线（项目作用域）', icon: 'refresh', timeout: 2000 })
    }
  } catch {
    $q.notify({ color: 'info', message: '重新生成即将上线（项目作用域）', icon: 'refresh', timeout: 1500 })
  }
}

function onArtifactDelete(_id: string) {
  $q.notify({ color: 'info', message: '删除制品功能即将上线', icon: 'delete', timeout: 1500 })
}

function toggleArtifactsPanel() {
  showArtifactsPanel.value = !showArtifactsPanel.value
}

// ── Data fetching ───────────────────────────────────────────────────────────

async function fetchProjectData() {
  try {
    const projects = await api.listProjects()
    project.value = projects.find((p) => p.id === projectId.value) ?? null
  } catch {
    // Silent
  }
}

async function fetchStoryData() {
  const pid = projectId.value
  storyPanelLoading.value = true
  storyPanelError.value = null
  try {
    const [bible, series] = await Promise.all([
      api.projectStoryBible(pid),
      api.projectStorySeries(pid),
    ])
    storyBible.value = bible
    storySeries.value = series
    if (series && series.episodes.length > 0) {
      const epIds = series.episodes
        .slice(0, 10)
        .map((e: unknown) => (e as Record<string, unknown>).id as string | undefined)
        .filter((id): id is string => Boolean(id))
      const episodes = await Promise.all(
        epIds.map((epId) => api.projectStoryEpisode(pid, epId)),
      )
      storyEpisodes.value = episodes.filter((ep): ep is OpenimagoStoryEpisode => ep !== null)
      if (epIds.length > 0 && !currentStoryEpisodeId.value) {
        // Setting the episode id triggers the watcher, which pulls the
        // episode's workflow/runs (see watch(currentStoryEpisodeId)).
        currentStoryEpisodeId.value = epIds[0]!
      }
    }
  } catch {
    // Silent — story data is optional
  } finally {
    storyPanelLoading.value = false
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
      model: wf.model ?? null,
      resolution: null,
      durationLabel: null,
      ...(wf.generationRun ? { genRun: wf.generationRun } : {}),
    }))
    if (!selectedOutputId.value && projectOutputs.value.length > 0) {
      selectedOutputId.value = projectOutputs.value[0]!.id
    }
  } catch {
    projectOutputs.value = []
  } finally {
    projectOutputsLoading.value = false
  }
}

async function fetchProjectWorkspaceFiles() {
  const pid = projectId.value
  if (!pid) {
    projectWorkspaceFileItems.value = []
    return
  }
  try {
    const files = await api.projectWorkspaceFiles(pid)
    // Guard against a race where the route changed mid-flight.
    if (projectId.value !== pid) return
    projectWorkspaceFileItems.value = files.map((wf: WorkspaceFile) =>
      workspaceFileToAIOutputItem(wf, formatResultTime),
    )
  } catch {
    if (projectId.value === pid) projectWorkspaceFileItems.value = []
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
      ...(wf.generationRun ? { genRun: wf.generationRun } : {}),
    }))
  } catch {
    projectFiles.value = []
  } finally {
    projectFilesLoading.value = false
  }
}

function formatResultTime(date: Date): string {
  return formatRelativeTime(date)
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

onMounted(() => {
  void loadAgents()
  void loadCommands()
  void fetchProjectData()
  void fetchProjectOutputs()
  void fetchProjectWorkspaceFiles()
  void fetchProjectFiles()
  void fetchStoryData()
  void loadSessionList().then(() => {
    const paramSessionId = route.params.sessionId
    if (paramSessionId && typeof paramSessionId === 'string' && paramSessionId !== sessionId.value) {
      void switchSession(paramSessionId)
    }
  })
  startEventSubscription()
})

watch(
  () => route.params.sessionId,
  (sid) => {
    const s = typeof sid === 'string' ? sid : undefined
    if (s && s !== sessionId.value) void switchSession(s)
  },
)

// After a generation round completes (isLoading true → false), refresh the
// DB-backed "AI 产出" panel so newly generated media appears without a manual
// reload (openimago-owy7). Also refresh the filesystem-scanned projectOutputs
// so the storyboard fallback stays in sync.
watch(isLoading, (loading, wasLoading) => {
  if (wasLoading && !loading) {
    void fetchProjectWorkspaceFiles()
    void fetchProjectOutputs()
  }
})

// When the selected episode changes, pull its workflow DAG + run history so the
// timeline tab and the left storyboard shots track the chosen episode. Reset
// per-episode timeline selection to avoid highlighting a stale node/run.
watch(currentStoryEpisodeId, (episodeId) => {
  if (!episodeId) {
    storyWorkflow.value = null
    storyRuns.value = null
    storyCut.value = null
    return
  }
  void fetchEpisodeWorkflowRuns(episodeId)
})

onUnmounted(() => {
  stopEventSubscription()
})

// Suppress unused-param warnings for refs kept for future use.
// (No-op calls to satisfy eslint; these refs are intentionally retained
// for the story panel overlay that will be re-introduced in a follow-up.)
const _storyRefsKept = {
  creditsLabel,
  storyPanelError,
  currentStorySceneId,
  storySelectedCharacterId,
  storySelectedStyleSeedId,
}
void _storyRefsKept

function onStorySelect(_selection: StorySelection): void {
  // Reserved — story panel overlay not active in this redesign.
  void _selection
}

function onStoryIntent(_intent: StoryEditIntent): void {
  void _intent
}

function onStoryEpisodeChange(_episodeId: string): void {
  void _episodeId
}

function onSessionSelect(sid: string) {
  gridRef.value?.setActiveWorkspaceTab?.('storyboard')
  void handleSwitchSession(sid)
}
</script>

<style lang="scss" scoped>
:global(body) {
  background: var(--imago-bg-void);
}

.project-workspace {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  color: var(--imago-text-primary);
  background: var(--imago-bg-void);
}

// Top toolbar (full viewport width, above the 3-column body)
.project-workspace__topbar {
  flex-shrink: 0;
  position: relative;
  z-index: 5;
  width: 100%;
}

.project-workspace-layout {
  z-index: 1;
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;
}

.project-workspace-layout :deep(.ui-layout__drawer) {
  background: var(--imago-bg-panel) !important;
  color: var(--imago-text-primary);
  border-color: var(--imago-border-dim);
}

.project-workspace-layout :deep(.ui-layout__drawer--left) {
  border-right: 1px solid var(--imago-border-dim);
}

.project-workspace-layout :deep(.ui-layout__drawer--right) {
  border-left: 1px solid var(--imago-border-dim);
}

.project-workspace-page {
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

// Overview / timeline tab center panels fill the page below the top bar.
.project-workspace-page__story-view {
  flex: 1 1 auto;
  min-height: 0;
}

// ── Center stack (chat + input dock) ───────────────────────────────────────

.center-stack {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.center-stack__chat {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.center-stack__extras {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 20px 0;
}

// ── WorkspaceArtifactsPanel overlay (ADR 0003) — unchanged ──────────────

.artifacts-panel-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
  pointer-events: none;
}

.artifacts-panel-overlay__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  pointer-events: auto;
}

.artifacts-panel-overlay__panel {
  position: relative;
  z-index: 1;
  width: 360px;
  height: 100%;
  pointer-events: auto;
  box-shadow: -4px 0 40px rgba(0, 0, 0, 0.5);
}

.artifacts-panel-close {
  position: absolute;
  top: 12px;
  right: 372px;
  z-index: 2;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(16, 17, 30, 0.92);
  color: var(--imago-text-dim);
  cursor: pointer;
  pointer-events: auto;
  transition: border-color var(--imago-ease-default), color var(--imago-ease-default);
}

.artifacts-panel-close:hover {
  border-color: rgba(0, 240, 255, 0.3);
  color: var(--imago-text-primary);
}

// ── Panel toggle FAB ────────────────────────────────────────────────────

.artifacts-panel-toggle {
  position: fixed;
  right: 16px;
  bottom: 100px;
  z-index: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border-radius: 28px;
  border: 1px solid rgba(0, 240, 255, 0.18);
  background: linear-gradient(135deg, rgba(16, 17, 30, 0.94), rgba(11, 12, 22, 0.92));
  color: var(--imago-text-secondary);
  font-size: 13px;
  cursor: pointer;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
  transition: border-color var(--imago-ease-default), transform var(--imago-ease-default);
}

.artifacts-panel-toggle:hover {
  border-color: rgba(0, 240, 255, 0.35);
  transform: translateY(-1px);
}

.artifacts-panel-toggle__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: rgba(0, 240, 255, 0.15);
  color: rgba(0, 240, 255, 0.9);
  font-size: 11px;
  font-weight: 600;
}
</style>
