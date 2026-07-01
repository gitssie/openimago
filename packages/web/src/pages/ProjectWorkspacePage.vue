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
      :brand-label="brandLabel"
      :tabs="workspaceTabs"
      :active-tab="activeWorkspaceTab"
      :panel-base-id="'project-workspace'"
      @tab-change="onWorkspaceTabChange"
    >
      <template v-if="hasProject" #middle-right>
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

    <!-- ── AI 产出 kind filter (openimago-oy1l / Step 5c) — small client-side popup ── -->
    <q-dialog v-model="outputFilterOpen" position="top">
      <q-card
        style="min-width: 248px; margin-top: 12vh; background: var(--imago-bg-panel); color: var(--imago-text-primary); border: 1px solid var(--imago-border-dim);"
      >
        <q-card-section style="font-size: 13px; font-weight: 600; padding-bottom: 4px;">按类型筛选产出</q-card-section>
        <q-list>
          <q-item
            v-for="opt in OUTPUT_FILTER_OPTIONS"
            :key="opt.value"
            v-close-popup
            clickable
            :active="outputKindFilter === opt.value"
            @click="outputKindFilter = opt.value"
          >
            <q-item-section avatar>
              <q-icon :name="opt.icon" size="18px" />
            </q-item-section>
            <q-item-section>{{ opt.label }}</q-item-section>
            <q-item-section v-if="outputKindFilter === opt.value" side>
              <q-icon name="check" size="18px" />
            </q-item-section>
          </q-item>
        </q-list>
      </q-card>
    </q-dialog>

    <!-- ════ Project / Story shell (project, or a session whose dir has story) ════ -->
    <template v-if="storyShell">
    <UILayout class="project-workspace-layout relative full-height" view="lhr lpr lfr" container>
      <!-- ── Left drawer: storyboard scene cards ─────────────────────── -->
      <UILayoutDrawer
        :model-value="leftPanelOpen"
        side="left"
        :width="300"
        :breakpoint="1024"
        bordered
        :show-if-above="activeWorkspaceTab !== 'timeline'"
        @update:model-value="leftPanelOpen = $event"
      >
        <ProjectWorkspaceLeftPanel
          :elements="leftPanelElements"
          :shots="leftPanelShots"
          :audio="leftPanelAudio"
          :selected-id="selectedSceneId"
          :view-density="storyboardDensity"
          :read-only="true"
          :editable="canAddShot"
          @item-select="onSceneSelect"
          @add="onAddScene"
          @section-toggle="onSectionToggle"
          @item-add-media="onItemAddMedia"
          @item-select-type="onItemSelectType"
          @comment-generate="onCommentGenerate"
          @view-change="(d) => { storyboardDensity = d }"
        />
      </UILayoutDrawer>

      <!-- ── Center page: grid + chat + input dock ────────────────────── -->
      <UILayoutPageContainer>
        <UILayoutPage class="project-workspace-page">
          <!--
            Center content switches with the top-bar tab:
              对话 / 故事板 → ProjectWorkspaceGrid + chat (this block, isChatSurfaceTab)
              概览/时间线/AI产出 → their own panels (below)
            故事板 keeps the full-width chat here; selecting a left-storyboard item
            opens the PreviewPane in a centered q-dialog (see below) rather than
            taking over the center.
          -->
          <ProjectWorkspaceGrid
            v-if="isChatSurfaceTab"
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
            v-else-if="activeWorkspaceTab === 'overview'"
            class="project-workspace-page__story-view"
            :bible="storyBibleSummary"
            :episodes="storyEpisodeSummaries"
            :selected-episode-id="currentStoryEpisodeId"
            @episode-select="onEpisodeSelect"
          />

          <!-- 时间线 tab → NLE Cut editor (omniclip) for the current episode -->
          <StoryCutPanel
            v-else-if="activeWorkspaceTab === 'timeline' && currentStoryEpisodeId && storyEditable"
            ref="storyCutPanelRef"
            class="project-workspace-page__story-view"
            :project-id="projectId"
            :episode-id="currentStoryEpisodeId"
            :cut="storyCut"
            :shots="currentStoryShots"
            :runs="currentStoryRuns"
            @request-assemble="onRequestAssemble"
            @cut-changed="onCutChanged"
            @cut-conflict="onCutConflict"
            @cut-error="onCutError"
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
            :items="filteredAiOutputItems"
            :selected-id="selectedOutputId"
            :layout="outputLayout"
            :show-view-all="filteredAiOutputItems.length > 6"
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
          :items="filteredAiOutputItems"
          :selected-id="selectedOutputId"
          :layout="'grid'"
          :show-view-all="filteredAiOutputItems.length > 6"
          :project-name="projectName"
          @item-select="onGridOutputSelect"
          @item-menu="onOutputMenu"
          @layout-change="(l) => { outputLayout = l }"
          @filter="onOutputFilter"
          @view-all="onOutputViewAll"
        />
      </UILayoutDrawer>
    </UILayout>

    <!-- ── Selection preview dialog (故事板: opens on a left-storyboard select) ── -->
    <q-dialog v-model="previewDialogOpen">
      <!-- Inline sizing: q-dialog teleports to <body>, so scoped CSS can't reach
           this; size the card directly. PreviewPane fills it (height:100%). -->
      <div
        class="preview-dialog"
        style="width: 880px; max-width: 92vw; height: 78vh; max-height: 860px; display: flex;"
      >
        <PreviewPane
          :preview="selectedPreview"
          @prev="onPreviewStep('prev')"
          @next="onPreviewStep('next')"
          @regenerate="onPreviewRegenerate"
          @manual-edit="onPreviewManualEdit"
          @comment-submit="onPreviewCommentSubmit"
          @download="onPreviewDownload"
          @delete="onPreviewDelete"
          @toggle-hd="onPreviewToggleHd"
        />
      </div>
    </q-dialog>

    <!-- ── 手动编辑: in-timeline AI re-generation dialog (clip context menu) ── -->
    <ClipGenerateDialog
      :open="clipGenDialog !== null"
      :shot="clipGenDialog?.shot ?? null"
      :latest-run="clipGenDialog?.latestRun ?? null"
      :anchor="clipGenDialog?.anchor ?? null"
      :elements="leftPanelElements"
      :generating="clipGenerating"
      @update:open="(open) => { if (!open && !clipGenerating) clipGenDialog = null }"
      @generate="onClipGenerate"
    />

    <!-- ── Output context menu (Rerun + Download + Delete) — openimago-oy1l/wc96 ── -->
    <!-- Seeded at the click position. Rerun re-executes the run behind the output. -->
    <div
      v-if="outputMenu.open"
      class="output-menu-anchor"
      :style="{ position: 'fixed', left: outputMenu.x + 'px', top: outputMenu.y + 'px', width: '0', height: '0' }"
    >
      <q-menu v-model="outputMenu.open" anchor="bottom left" self="top left">
        <q-list dense style="min-width: 148px">
          <q-item v-close-popup clickable @click="onOutputMenuRerun">
            <q-item-section avatar>
              <q-icon name="refresh" size="18px" />
            </q-item-section>
            <q-item-section>重新生成</q-item-section>
          </q-item>
          <q-item v-close-popup clickable @click="onOutputMenuDownload">
            <q-item-section avatar>
              <q-icon name="download" size="18px" />
            </q-item-section>
            <q-item-section>下载</q-item-section>
          </q-item>
          <q-item v-close-popup clickable @click="onOutputMenuDelete">
            <q-item-section avatar>
              <q-icon name="delete" size="18px" />
            </q-item-section>
            <q-item-section>删除</q-item-section>
          </q-item>
        </q-list>
      </q-menu>
    </div>

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
    </template>

    <!-- ════ Degraded session shell (standalone session, no story files) ════════ -->
    <!--
      Exactly the prior SessionWorkspacePage experience: a session sidebar, the
      chat surface with its todo / revert / follow-up docks, and the AI 产出
      right drawer. The dead no-op story tabs are gone (workspaceTabs is empty
      in this mode), per ADR 0009.
    -->
    <template v-else>
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
                  :is-session-switching="messagesLoading"
                  @load-history="onLoadHistory"
                  @switch-session="handleSwitchSession"
                  @revert-turn="(msgId) => void revertMessage(msgId)"
                  @use-suggestion="useSuggestion"
                />
              </div>

              <div v-if="hasSessionExtras" class="chat-body__extras">
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
          :items="filteredAiOutputItems"
          :selected-id="selectedResultId"
          :layout="'grid'"
          :show-view-all="filteredAiOutputItems.length > 6"
          :view-all-label="'查看全部'"
          :aria-label="'会话 AI 产出面板'"
          @item-select="handleSelectResult"
          @item-menu="handleItemMenu"
          @layout-change="(l) => { sessionLayoutMode = l }"
          @filter="handleFilterOutputs"
          @view-all="handleViewAll"
        />
      </UILayoutDrawer>
    </UILayout>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import SessionChatView from 'src/components/session-workspace/SessionChatView.vue'
import SessionWorkspaceSidebar from 'src/components/session-workspace/SessionWorkspaceSidebar.vue'
import ProjectWorkspaceGrid from 'src/components/session-workspace/ProjectWorkspaceGrid.vue'
import ProjectWorkspaceLeftPanel from 'src/components/session-workspace/ProjectWorkspaceLeftPanel.vue'
import type {
  ElementCardVM,
  ShotCardVM,
  AudioCardVM,
  LeftPanelSection,
} from 'src/components/session-workspace/left-panel/types'
import {
  mapElementCards,
  mapShotCards,
  mapAudioCards,
  mapSelectedPreview,
  stepPreviewSelection,
  type PreviewSelection,
  type PreviewSection,
} from 'src/components/session-workspace/left-panel/mapper'
import PreviewPane from 'src/components/session-workspace/PreviewPane.vue'
import ProjectWorkspaceRightPanel from 'src/components/session-workspace/ProjectWorkspaceRightPanel.vue'
import AgentQuestion from 'src/components/AgentQuestion.vue'
import AgentPermission from 'src/components/AgentPermission.vue'
import AIOutputsPanel from 'src/components/workspace/AIOutputsPanel.vue'
import ChatInputDock from 'src/components/workspace/ChatInputDock.vue'
import ProjectContextStrip from 'src/components/workspace/ProjectContextStrip.vue'
import TopbarActionButton from 'src/components/workspace/TopbarActionButton.vue'
import WorkspaceTopBar from 'src/components/workspace/WorkspaceTopBar.vue'
import WorkspaceSessionChip from 'src/components/workspace/WorkspaceSessionChip.vue'
import { useAgentSession, type DisplayMessage } from 'src/composables/useAgentSession'
import type { TextPart } from '@opencode-ai/sdk/v2'
import type { SessionItem } from 'src/services/agents'
import { api, ApiError, type OpenimagoProject, type OpenimagoStoryBible, type OpenimagoStorySeries, type OpenimagoStoryEpisode, type OpenimagoStoryWorkflow, type OpenimagoStoryRuns, type WorkspaceFile } from 'src/api/client'
import WorkspaceArtifactsPanel from 'src/components/session-workspace/WorkspaceArtifactsPanel.vue'
import { UILayout, UILayoutDrawer, UILayoutPage, UILayoutPageContainer } from 'src/components/ui/layout'
import type {
  WorkspaceArtifact,
  ArtifactRerunPayload,
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
import { workspaceFileToAIOutputItem, mergeAIOutputItems } from 'src/utils/session-output-mapper'
import { formatRelativeTime } from 'src/utils/format-time'
import StoryOverviewPanel from 'src/components/session-workspace/StoryOverviewPanel.vue'
import StoryCutPanel from 'src/components/session-workspace/StoryCutPanel.vue'
import ClipGenerateDialog from 'src/components/session-workspace/ClipGenerateDialog.vue'
import StoryTimelineEmpty from 'src/components/session-workspace/StoryTimelineEmpty.vue'
import type { EpisodeCut } from 'src/utils/cut/cut-types'
import { rawCutToEpisodeCut } from 'src/utils/cut/cut-api-mapper'
import { dispatchCutEdit } from 'src/utils/cut/cut-edit-dispatcher'
import { resolveShotMediaSource } from 'src/utils/cut/shot-media-resolver'
import { buildReferenceAttachment } from 'src/utils/cut/clip-reference'
import type { ShotGenerationParams } from 'src/utils/cut/clip-generate-form'

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

// ── Degraded session-shell state (ADR 0009) ─────────────────────────────────
// Used only when the page is in the no-project, no-story degenerate case — i.e.
// the standalone session experience (chat + AI 产出). Mirrors the prior
// SessionWorkspacePage refs so that shell behaves exactly as before.
const sidebarCollapsed = ref(false)
const rightPanelVisible = ref(true)
const followupCollapsed = ref(false)
const selectedResultId = ref<string | null>(null)
const sessionLayoutMode = ref<'grid' | 'rows'>('grid')
const sessionFileItems = ref<AIOutputItem[]>([])
// True once the resolved directory is known to contain Story files. Drives the
// Story tabs/panels for a standalone session (a project always shows them).
const storyHasFiles = ref(false)

// ── Workspace scope (ADR 0009) ───────────────────────────────────────────────
//
// This page is folder-driven: it is parameterized by a project key OR a session
// key, resolved from the route. The project routes carry `:id` = projectId (and
// an optional `:sessionId`); the standalone session routes carry `:id` =
// sessionId. Story data is fetched via whichever key is present; the project
// experience is unchanged when a projectId is present (`hasProject`).
const isProjectRoute = computed(
  () => route.name === 'project-workspace' || route.name === 'project-session',
)
// NOTE: kept named `projectId` so the (unchanged) project-mode code reads as
// before; it is now null on the standalone session routes.
const projectId = computed<string>(() => (isProjectRoute.value ? (route.params.id as string) : ''))
const hasProject = computed(() => Boolean(projectId.value))
// The standalone-session key. On a project route this is the optional nested
// `:sessionId`; on a session route it is the top-level `:id`.
const routeSessionId = computed<string | null>(() => {
  if (isProjectRoute.value) {
    const sid = route.params.sessionId
    return typeof sid === 'string' && sid ? sid : null
  }
  const id = route.params.id
  return typeof id === 'string' && id ? id : null
})
const project = ref<OpenimagoProject | null>(null)
const projectName = computed(() => project.value?.name || '项目工作台')
const brandLabel = computed(() => (hasProject.value ? projectName.value : '工作台'))
const projectStatus = computed<'active' | 'archived'>(() => project.value?.status || 'active')

const projectOutputs = ref<OutputItem[]>([])
const projectOutputsLoading = ref(false)
// DB-backed generated media for the right-side "AI 产出" panel (openimago-owy7).
// Kept separate from projectOutputs (filesystem scan) so the storyboard
// fallback that reads projectOutputs/projectFiles is not affected.
const projectWorkspaceFileItems = ref<AIOutputItem[]>([])
const selectedOutputId = ref<string | null>(null)
const selectedSceneId = ref<string | null>(null)
// Cross-section selection driving the PreviewPane dialog on the 故事板 tab
// ({ section: 'element' | 'shot' | 'audio', id }). selectedSceneId mirrors its id
// for the existing active-card highlight + context strip.
const previewSelection = ref<PreviewSelection | null>(null)
// Whether the selection-preview dialog is open (opened on left-storyboard select).
const previewDialogOpen = ref(false)
// Canonical HD toggle state for the PreviewPane (parent-owned).
const previewHdActive = ref(false)
// 手动编辑 clip action (openimago-ciqk): the in-timeline AI re-generation dialog.
// null = closed; otherwise the source shot being re-generated + its latest run
// (for prefill). clipGenerating gates the 生成 button while the request is in flight.
const clipGenDialog = ref<{
  shot: StoryShotSummary
  latestRun: StoryRunSummary | null
  /** clip's on-screen right-click point (openimago-816a) so the composer QMenu
   *  anchors near the clicked clip; null → the composer centers itself. */
  anchor: { x: number; y: number } | null
} | null>(null)
const clipGenerating = ref(false)
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
// Handle to the cut editor panel so a write-desync (openimago-vx2t) can force a
// re-hydrate after the page refetches the canonical cut.
const storyCutPanelRef = ref<{ rehydrate: () => void } | null>(null)
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
  childSessions,
  sessionMessages,
  pendingAttachments,
  currentQueuedFollowups,
  failedFollowupId,
  sendingFollowupId,
  sessionTodos,
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
  addReferenceAttachment,
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
  () => chatViewRef.value?.scrollToBottomNow() ?? Promise.resolve(),
  () => chatViewRef.value?.doScrollToBottom(),
  (msg) => $q.notify({ color: 'negative', message: msg, icon: 'error' }),
  (msg, opts) => $q.notify({ color: 'info', message: msg, icon: opts?.icon ?? 'info', ...(opts?.timeout !== undefined ? { timeout: opts.timeout } : {}) }),
  (msg) => $q.notify({ color: 'positive', message: msg, icon: 'check' }),
  () => { /* focus handled inside ChatInputDock */ },
  // Project scope only when a projectId is present; standalone sessions stay
  // project-less (created in a wrk_ dir), exactly as the old SessionWorkspacePage.
  () => projectId.value || undefined,
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

// ── Story read dispatch (ADR 0009) ──────────────────────────────────────────
//
// Story is directory-scoped: resolve it via the project key when present, else
// the session key (new session-reachable routes, openimago-zaet). Writes stay
// project-scoped for now (guarded below); the standalone-session story tabs are
// read-only until session-scoped story writes land.
const storyReads = {
  bible: () =>
    hasProject.value
      ? api.projectStoryBible(projectId.value)
      : routeSessionId.value
        ? api.sessionStoryBible(routeSessionId.value)
        : Promise.resolve(null),
  series: () =>
    hasProject.value
      ? api.projectStorySeries(projectId.value)
      : routeSessionId.value
        ? api.sessionStorySeries(routeSessionId.value)
        : Promise.resolve(null),
  episode: (epId: string) =>
    hasProject.value
      ? api.projectStoryEpisode(projectId.value, epId)
      : routeSessionId.value
        ? api.sessionStoryEpisode(routeSessionId.value, epId)
        : Promise.resolve(null),
  workflow: (epId: string) =>
    hasProject.value
      ? api.projectStoryWorkflow(projectId.value, epId)
      : routeSessionId.value
        ? api.sessionStoryWorkflow(routeSessionId.value, epId)
        : Promise.resolve(null),
  runs: (epId: string) =>
    hasProject.value
      ? api.projectStoryRuns(projectId.value, epId)
      : routeSessionId.value
        ? api.sessionStoryRuns(routeSessionId.value, epId)
        : Promise.resolve(null),
  cut: (epId: string) =>
    hasProject.value
      ? api.projectStoryCut(projectId.value, epId)
      : routeSessionId.value
        ? api.sessionStoryCut(routeSessionId.value, epId)
        : Promise.resolve(null),
}

// Whether to render the project/story shell. A project always shows it (project
// behavior is unchanged). A standalone session shows it only when its directory
// actually has Story files; otherwise the page degrades to the chat + AI 产出
// session shell — exactly the prior SessionWorkspacePage experience.
const storyShell = computed(() => hasProject.value || storyHasFiles.value)
// Story writes (add shot, generate, cut edits) remain project-scoped for now.
const storyEditable = computed(() => hasProject.value)

const workspaceTabs = computed<ReadonlyArray<{ id: string; label: string }>>(
  () => (storyShell.value ? PROJECT_WORKSPACE_TABS : []),
)

// ── Degraded session-shell derived state (ADR 0009) ─────────────────────────
// Verbatim port of the prior SessionWorkspacePage projections, used only when
// `storyShell` is false (standalone session, no story files).

function getAllSessions(): SessionItem[] {
  const nested = Object.values(childSessions.value).flatMap((items) => items)
  return [...sessionList.value, ...nested]
}

const currentParentSession = computed<SessionItem | null>(() => {
  if (!sessionId.value) return null
  const sessions = getAllSessions()
  const session = sessions.find((item) => item.id === sessionId.value)
  return session?.parentID
    ? sessions.find((item) => item.id === session.parentID) ?? null
    : null
})

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

const revertMessagePreview = computed(() => {
  const revertMessageId = currentSessionItem.value?.revert?.messageID
  if (!revertMessageId) return ''
  const revertedMessage = displayMessages.value.find((message) => message.id === revertMessageId && message.role === 'user')
  if (!revertedMessage) return revertMessageId
  const text = getUserMessageText(revertedMessage).trim()
  return text || revertMessageId
})

const completedTodoCount = computed(() => sessionTodos.value.filter((todo) => todo.status === 'completed').length)

const activeTodoLabel = computed(() => {
  return sessionTodos.value.find((todo) => todo.status === 'in_progress')?.content
    ?? sessionTodos.value.find((todo) => todo.status === 'pending')?.content
    ?? sessionTodos.value.at(-1)?.content
    ?? ''
})

const hasSessionExtras = computed(() => {
  return Boolean(
    pendingQuestion.value
    || sessionTodos.value.length > 0
    || revertMessagePreview.value
    || currentQueuedFollowups.value.length > 0
    || pendingPermission.value,
  )
})

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
  return items.sort((left, right) => right.timeLabel.localeCompare(left.timeLabel))
})

// Session AI-outputs: DB-backed workspace-files merged with inline `file` parts.
const sessionAiOutputItems = computed<AIOutputItem[]>(() =>
  mergeAIOutputItems(sessionFileItems.value, generatedResults.value),
)

// Right-side "AI 产出" panel. Project: DB-backed workspace_generated_files
// (openimago-owy7), persistent across refresh. Session: merged session files +
// inline chat-turn media (the prior SessionWorkspacePage behavior).
const aiOutputItems = computed<AIOutputItem[]>(() =>
  hasProject.value ? projectWorkspaceFileItems.value : sessionAiOutputItems.value,
)

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

// ── Left-panel 3-section accordion datasets (openimago-1omg) ─────────────────
//
// The redesigned ProjectWorkspaceLeftPanel renders three card sections. Each is
// a pure projection of the story summaries (bible / shots / runs) via the
// left-panel mapper. Thumbnails come from the runs' inlined result.access (the
// authoritative source; run.kind splits video vs audio).

const leftPanelElements = computed<ElementCardVM[]>(() =>
  storyBibleSummary.value ? mapElementCards(storyBibleSummary.value, currentStoryRuns.value) : [],
)

const leftPanelShots = computed<ShotCardVM[]>(() =>
  storyBibleSummary.value
    ? mapShotCards(currentStoryShots.value, storyBibleSummary.value, currentStoryRuns.value)
    : [],
)

const leftPanelAudio = computed<AudioCardVM[]>(() =>
  storyBibleSummary.value ? mapAudioCards(storyBibleSummary.value, currentStoryRuns.value) : [],
)

// ── Center PreviewPane (故事板 tab, selection-driven) ────────────────────────

const previewLists = computed(() => ({
  elements: leftPanelElements.value,
  shots: leftPanelShots.value,
  audio: leftPanelAudio.value,
}))

const selectedPreview = computed(() =>
  mapSelectedPreview(previewSelection.value, previewLists.value, currentStoryRuns.value),
)

// ── Storyboard context strip (above the chat) ───────────────────────────────

const contextStrip = computed(() => {
  // Prefer the selected shot card; fall back to the selected output.
  const shot = selectedSceneId.value
    ? leftPanelShots.value.find((s) => s.id === selectedSceneId.value)
    : null
  if (shot) {
    return {
      title: shot.title,
      subtitle: shot.description ?? '',
      meta: null,
      thumbnailUrl: shot.media[0]?.url ?? null,
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

// The center chat surface (Grid + chat) backs BOTH the 对话 and 故事板 tabs; on
// 故事板 a left-storyboard selection opens the PreviewPane in a dialog instead of
// taking over the center. overview/timeline/outputs render their own panels.
const isChatSurfaceTab = computed(
  () => activeWorkspaceTab.value === 'conversation' || activeWorkspaceTab.value === 'storyboard',
)

// Shot-adding is the single supported story write (ADR 0005); enabled once an
// episode is selected so the new shot has a target.
const canAddShot = computed(() => Boolean(currentStoryEpisodeId.value) && storyEditable.value)

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
  if (!session) return hasProject.value ? t('agent.untitled') : '工作台'
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

// Per-tab layout side effects.
let leftPanelOpenBeforeTimeline: boolean | null = null
let rightPanelOpenBeforeOutputs: boolean | null = null
watch(activeWorkspaceTab, (tab, prev) => {
  // 时间线 is a near-full-screen NLE editor → hide the left storyboard while
  // active, restore the user's prior state on leave.
  if (tab === 'timeline' && prev !== 'timeline') {
    leftPanelOpenBeforeTimeline = leftPanelOpen.value
    leftPanelOpen.value = false
  } else if (tab !== 'timeline' && prev === 'timeline' && leftPanelOpenBeforeTimeline !== null) {
    leftPanelOpen.value = leftPanelOpenBeforeTimeline
    leftPanelOpenBeforeTimeline = null
  }

  // The AI产出 center tab shows the same outputs panel as the right drawer, so
  // collapse the drawer while that tab is active and restore it on leave.
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
  try {
    const [wf, runs, cut] = await Promise.all([
      storyReads.workflow(episodeId),
      storyReads.runs(episodeId),
      storyReads.cut(episodeId),
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
  const cut = await storyReads.cut(episodeId)
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

/**
 * A cut write failed for a non-conflict reason (e.g. 400 — the editor sent a
 * phantom/stale clip id, openimago-vx2t). Show a visible error, refetch the
 * canonical cut, then force the editor to re-hydrate from it so it is back in
 * sync with the server (never leaves the user editing a phantom timeline).
 */
function onCutError(): void {
  $q.notify({ color: 'negative', message: '剪辑保存失败，已与服务器重新同步', icon: 'error', timeout: 2500 })
  void (async () => {
    await refreshStoryCut()
    storyCutPanelRef.value?.rehydrate()
  })()
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

/**
 * 手动编辑 (openimago-ciqk) — open the in-timeline AI re-generation dialog for the
 * clip's SOURCE shot, pre-filled from the shot's last-used generation params (or its
 * authored prompt + the latest run's model). 生成 re-runs video generation with the
 * edited params via onClipGenerate; the clip's media then refreshes.
 */
function onClipManualEdit(
  sourceShotId: string,
  anchor: { x: number; y: number } | null = null,
): void {
  const shot = currentStoryShots.value.find((s) => s.id === sourceShotId)
  if (!shot) {
    $q.notify({ color: 'warning', message: '该镜头已不存在', icon: 'info', timeout: 1800 })
    return
  }
  const latestRun =
    currentStoryRuns.value
      .filter((r) => r.shotId === sourceShotId && r.status === 'completed')
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))[0] ?? null
  clipGenDialog.value = { shot, latestRun, anchor }
}

/**
 * 生成 from the clip re-generation dialog: re-run video generation for the source
 * shot with the edited params, then refresh the episode (new run) and re-hydrate the
 * Cut editor so the clip's filmstrip/preview pick up the new media.
 */
async function onClipGenerate(params: ShotGenerationParams): Promise<void> {
  const dlg = clipGenDialog.value
  const episodeId = currentStoryEpisodeId.value
  if (!dlg || !episodeId || clipGenerating.value) return
  clipGenerating.value = true
  try {
    await api.generateShot(projectId.value, episodeId, dlg.shot.id, params)
    await refreshEpisode(episodeId)
    storyCutPanelRef.value?.rehydrate()
    clipGenDialog.value = null
    $q.notify({ color: 'positive', message: '已重新生成镜头', icon: 'check', timeout: 1400 })
  } catch {
    $q.notify({ color: 'negative', message: '重新生成失败', icon: 'error', timeout: 2000 })
  } finally {
    clipGenerating.value = false
  }
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
          const fresh = await storyReads.cut(episodeId)
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

// ── Output delete (openimago-oy1l) ───────────────────────────────────────────
//
// Outputs are files scanned from the project directory; deleting one removes the
// file via the project outputs DELETE endpoint, then refreshes every panel that
// projects those files. Project-scoped only (the endpoint needs a projectId).

/** Best-effort on-disk basename for an output, from its url (drops query + decodes). */
function outputNameFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const path = url.split('?')[0] ?? url
    const seg = path.split('/').pop() ?? ''
    const name = decodeURIComponent(seg)
    return name || null
  } catch {
    return null
  }
}

/** Re-pull the filesystem-scanned outputs/files + DB-backed workspace files so
 *  every outputs surface reflects a delete. */
async function refreshOutputs(): Promise<void> {
  await Promise.all([
    fetchProjectOutputs(),
    fetchProjectFiles(),
    fetchProjectWorkspaceFiles(),
  ])
}

/** Delete one scanned output file by name, then refresh the panels. Returns
 *  whether the delete succeeded so callers can clear their local selection. */
async function deleteOutputByName(name: string | null | undefined): Promise<boolean> {
  if (!name || !hasProject.value) return false
  try {
    await api.deleteOutput(projectId.value, name)
    await refreshOutputs()
    $q.notify({ color: 'positive', message: '已删除产出', icon: 'check', timeout: 1200 })
    return true
  } catch {
    $q.notify({ color: 'negative', message: '删除产出失败', icon: 'error', timeout: 2000 })
    return false
  }
}

// Output context menu (Download + Delete). Anchored at the click position via a
// fixed-position seed element; Rerun is intentionally omitted (openimago-wc96).
const outputMenu = ref<{ open: boolean; x: number; y: number; item: AIOutputItem | null }>({
  open: false,
  x: 0,
  y: 0,
  item: null,
})

function onOutputMenu(id: string, event: MouseEvent) {
  const item = aiOutputItems.value.find((o) => o.id === id) ?? null
  if (!item) return
  outputMenu.value = { open: true, x: event.clientX, y: event.clientY, item }
}

function onOutputMenuDownload() {
  const url = outputMenu.value.item?.url
  if (url) window.open(url, '_blank', 'noopener')
}

// Rerun the output's generation (ADR 0003, openimago-wc96). Re-executes the run
// behind the item via its id (the run's result.artifactId), carrying the item's
// prompt/model as overrides; the rest inherit from the source run.
async function onOutputMenuRerun() {
  const item = outputMenu.value.item
  const episodeId = currentStoryEpisodeId.value
  if (!item || !episodeId) {
    $q.notify({ color: 'info', message: '重新生成需要选择剧集', icon: 'info', timeout: 1800 })
    return
  }
  await rerunArtifactById(episodeId, item.id, {
    ...(item.prompt ? { prompt: item.prompt } : {}),
    ...(item.model ? { model: item.model } : {}),
  })
}

async function onOutputMenuDelete() {
  const item = outputMenu.value.item
  if (!item) return
  const name = item.filename || outputNameFromUrl(item.url)
  const ok = await deleteOutputByName(name)
  if (ok && selectedOutputId.value === item.id) selectedOutputId.value = null
}

// ── Outputs filter + view-all (openimago-oy1l / Step 5c) ─────────────────────
//
// Filter: a small popup that filters the AI 产出 items client-side by media kind
// (image/video/audio). View-all: switch to the existing full-width `outputs`
// workspace tab rather than navigating to a new page.

type OutputKindFilter = 'all' | 'image' | 'video' | 'audio'

const OUTPUT_FILTER_OPTIONS: ReadonlyArray<{ value: OutputKindFilter; label: string; icon: string }> = [
  { value: 'all', label: '全部', icon: 'apps' },
  { value: 'image', label: '图片', icon: 'image' },
  { value: 'video', label: '视频', icon: 'movie' },
  { value: 'audio', label: '音频', icon: 'music_note' },
]

const outputKindFilter = ref<OutputKindFilter>('all')
const outputFilterOpen = ref(false)

/** The AI 产出 items after applying the client-side kind filter. */
const filteredAiOutputItems = computed<AIOutputItem[]>(() =>
  outputKindFilter.value === 'all'
    ? aiOutputItems.value
    : aiOutputItems.value.filter((item) => item.kind === outputKindFilter.value),
)

function onOutputFilter() {
  outputFilterOpen.value = true
}

/** View all → switch to the existing full-width outputs tab (project shell). The
 *  tab watcher collapses the right drawer while it is active. */
function onOutputViewAll() {
  activeWorkspaceTab.value = 'outputs'
}

/** Resolve which accordion section an id belongs to (for PreviewPane). */
function previewSectionOf(id: string): PreviewSection | null {
  if (leftPanelShots.value.some((s) => s.id === id)) return 'shot'
  if (leftPanelAudio.value.some((a) => a.id === id)) return 'audio'
  if (leftPanelElements.value.some((e) => e.id === id)) return 'element'
  return null
}

/**
 * A card was selected in any of the three accordion sections (item-select).
 * `selectedSceneId` drives the active-card highlight + the context strip;
 * `previewSelection` feeds the PreviewPane dialog, which opens on select. When
 * the selected id is a shot, also track it as the current story shot so the
 * timeline / generate affordances target it.
 */
function onSceneSelect(id: string) {
  selectedSceneId.value = id
  const section = previewSectionOf(id)
  previewSelection.value = section ? { section, id } : null
  if (section === 'shot') {
    currentStoryShotId.value = id
  }
  // Open the centered preview dialog for a real selection (a known section).
  if (section) previewDialogOpen.value = true
}

/** A section header was collapsed/expanded. Collapse state is owned in-memory by
 *  the panel; the page has nothing to persist, so this is intentionally a no-op
 *  seam (kept for a future analytics/sync hook). */
function onSectionToggle(_section: LeftPanelSection) {
  // no-op — panel owns the collapse state
}

/** "+" add-media pressed on a card footer (待接入 — real upload is a follow-up). */
function onItemAddMedia(section: LeftPanelSection, id: string) {
  $q.notify({ color: 'info', message: `为${sectionLabel(section)} ${id} 添加素材（待接入）`, icon: 'add_photo_alternate', timeout: 1200 })
}

/** Type-selector pressed on a card footer (待接入). */
function onItemSelectType(section: LeftPanelSection, id: string) {
  $q.notify({ color: 'info', message: `切换${sectionLabel(section)} ${id} 的素材类型（待接入）`, icon: 'category', timeout: 1200 })
}

/** "评论生成" pressed on a card footer. Shots → mock video generate; 关键元素
 *  (Character/Scene) → Bible concept art (shotId:null image run, openimago-ugy9).
 *  The 旁白与音乐 (audio) section has no grounded op yet → 待接入 stub. */
function onCommentGenerate(section: LeftPanelSection, id: string) {
  if (section === 'shots') {
    void onShotGenerate(id)
    return
  }
  if (section === 'elements') {
    void onElementConceptGenerate(id)
    return
  }
  $q.notify({ color: 'info', message: `${sectionLabel(section)} ${id} 评论生成（待接入）`, icon: 'auto_awesome', timeout: 1200 })
}

/** Generate concept art for a Bible element (关键元素 card). Appends a shot-less
 *  image run linked to the element via nodeId, then refreshes the episode so the
 *  card's thumbnail row surfaces it (openimago-ugy9). */
async function onElementConceptGenerate(elementId: string) {
  const pid = projectId.value
  const episodeId = currentStoryEpisodeId.value
  if (!pid || !episodeId) {
    $q.notify({ color: 'info', message: '生成概念图需要选择剧集', icon: 'info', timeout: 1800 })
    return
  }
  try {
    await api.generateElementConcept(pid, episodeId, elementId)
    $q.notify({ color: 'positive', message: '概念图已生成', icon: 'auto_awesome', timeout: 1500 })
    await refreshEpisode(episodeId)
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 0
    const message = status === 404 ? '未找到该元素，无法生成概念图' : '概念图生成失败'
    $q.notify({ color: 'negative', message, icon: 'error', timeout: 2200 })
  }
}

/** Human-readable label for a left-panel section (notification copy). */
function sectionLabel(section: LeftPanelSection): string {
  if (section === 'elements') return '关键元素'
  if (section === 'shots') return '分镜'
  return '旁白与音乐'
}

// ── Center PreviewPane handlers (故事板 tab) ─────────────────────────────────

/** Step the PreviewPane selection within its current section. */
function onPreviewStep(direction: 'prev' | 'next') {
  if (!previewSelection.value) return
  const next = stepPreviewSelection(previewSelection.value, direction, previewLists.value)
  if (!next) return
  previewSelection.value = next
  selectedSceneId.value = next.id
  if (next.section === 'shot') currentStoryShotId.value = next.id
}

/** 重新生成 — for a selected shot reuse the mock generate command; other
 *  sections are 待接入 stubs until a real op exists. */
function onPreviewRegenerate() {
  const sel = previewSelection.value
  if (!sel) return
  if (sel.section === 'shot') {
    void onShotGenerate(sel.id)
    return
  }
  $q.notify({ color: 'info', message: `重新生成 ${sel.id}（待接入）`, icon: 'auto_awesome', timeout: 1200 })
}

/** 手动编辑 / 调色 — placeholder until a real editor op is wired. */
function onPreviewManualEdit() {
  const sel = previewSelection.value
  if (!sel) return
  $q.notify({ color: 'info', message: `手动编辑 ${sel.id}（待接入）`, icon: 'tune', timeout: 1200 })
}

/** Comment submitted from the PreviewPane bottom bar. Empty text is the header
 *  "评论" icon's focus stand-in (no-op here). For a shot a non-empty comment
 *  triggers a regenerate as the closest available op. */
function onPreviewCommentSubmit(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return
  const sel = previewSelection.value
  if (sel?.section === 'shot') {
    void onShotGenerate(sel.id)
    return
  }
  $q.notify({ color: 'info', message: `评论已记录（待接入）：${trimmed}`, icon: 'chat', timeout: 1200 })
}

/** Download the currently previewed media (opens the preview url in a new tab). */
function onPreviewDownload() {
  const url = selectedPreview.value.mediaUrl
  if (!url) return
  window.open(url, '_blank', 'noopener')
}

/** Delete the previewed media's underlying output file, then close the dialog
 *  and refresh the panels (openimago-oy1l). */
async function onPreviewDelete() {
  const sel = previewSelection.value
  if (!sel) return
  const name = outputNameFromUrl(selectedPreview.value.mediaUrl)
  const ok = await deleteOutputByName(name)
  if (ok) {
    previewDialogOpen.value = false
    previewSelection.value = null
  }
}

/** HD toggle — track the canonical state in the parent (visual only for now). */
function onPreviewToggleHd() {
  previewHdActive.value = !previewHdActive.value
}

/** Replace one episode in storyEpisodes with the latest from the backend. When
 *  it is the current episode, also re-pull its runs so the timeline and the
 *  left-panel shot thumbnails (sourced from completed runs) refresh. */
async function refreshEpisode(episodeId: string): Promise<OpenimagoStoryEpisode | null> {
  const fresh = await storyReads.episode(episodeId)
  if (!fresh) return null
  const idx = storyEpisodes.value.findIndex((ep) => ep.id === episodeId)
  if (idx >= 0) storyEpisodes.value.splice(idx, 1, fresh)
  else storyEpisodes.value.push(fresh)
  if (episodeId === currentStoryEpisodeId.value) {
    const runs = await storyReads.runs(episodeId)
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

function onShotUpdate(shotId: string, patch: { description: string }) {
  const episodeId = currentStoryEpisodeId.value
  if (!episodeId) return
  void runShotMutation(
    shotId,
    (expected) => api.updateShot(projectId.value, episodeId, shotId, patch, expected),
    '已更新镜头',
  )
}

/** Download the selected output / scene — opens its url in a new tab, mirroring
 *  onPreviewDownload. */
function onContextDownload() {
  const url = selectedGridOutput.value?.url || contextStrip.value?.thumbnailUrl || null
  if (!url) return
  window.open(url, '_blank', 'noopener')
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
    if (hasProject.value) {
      void router.push({ name: 'project-session', params: { id: projectId.value, sessionId: sid } })
    } else {
      void router.push({ name: 'session', params: { id: sid } })
    }
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
  const p = (payload ?? {}) as ArtifactRerunPayload
  const episodeId = currentStoryEpisodeId.value
  if (!episodeId || !p.artifactId) {
    $q.notify({ color: 'info', message: '重新生成需要选择剧集与制品', icon: 'info', timeout: 1800 })
    return
  }
  // Map the panel's payload (duration in seconds) to the backend override shape;
  // omitted fields inherit from the source run's persisted params.
  await rerunArtifactById(episodeId, p.artifactId, {
    ...(p.prompt !== undefined ? { prompt: p.prompt } : {}),
    ...(p.model !== undefined ? { model: p.model } : {}),
    ...(p.aspectRatio !== undefined ? { aspectRatio: p.aspectRatio } : {}),
    ...(p.duration !== undefined ? { durationSeconds: p.duration } : {}),
  })
}

/** Re-execute the run behind `artifactId` (ADR 0003 artifact rerun), then refresh
 *  the episode so the new run surfaces in the storyboard/timeline. Shared by the
 *  WorkspaceArtifactsPanel rerun event and the output context menu. */
async function rerunArtifactById(
  episodeId: string,
  artifactId: string,
  overrides: { prompt?: string; model?: string; aspectRatio?: string; durationSeconds?: number },
) {
  const pid = projectId.value
  if (!pid) return
  try {
    await api.rerunArtifact(pid, episodeId, artifactId, overrides)
    $q.notify({ color: 'positive', message: '重新生成已提交', icon: 'check', timeout: 1500 })
    await refreshEpisode(episodeId)
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 0
    const message = status === 404 ? '未找到该制品的生成记录，无法重新生成' : '重新生成失败'
    $q.notify({ color: 'negative', message, icon: 'error', timeout: 2200 })
  }
}

/** Delete the artifact's underlying output file by its name, then refresh
 *  (openimago-oy1l). */
async function onArtifactDelete(id: string) {
  const artifact = projectArtifacts.value.find((a) => a.id === id)
  const name = artifact?.filename || outputNameFromUrl(artifact?.access?.preview ?? artifact?.access?.thumbnail)
  const ok = await deleteOutputByName(name)
  if (ok && artifactsPanelSelectedId.value === id) artifactsPanelSelectedId.value = null
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
  // No scope at all (e.g. the bare /sessions list) → no story to read.
  if (!hasProject.value && !routeSessionId.value) {
    storyHasFiles.value = false
    return
  }
  storyPanelLoading.value = true
  storyPanelError.value = null
  try {
    const [bible, series] = await Promise.all([
      storyReads.bible(),
      storyReads.series(),
    ])
    storyBible.value = bible
    storySeries.value = series
    // A standalone session shows the Story tabs only when its directory actually
    // has Story files (ADR 0009). A project always shows them, so this flag is
    // only consulted via `storyShell` when there is no project.
    storyHasFiles.value = Boolean(
      (bible && (bible.characters.length > 0 || bible.scenes.length > 0 || bible.styleSeeds.length > 0))
      || (series && series.episodes.length > 0),
    )
    if (series && series.episodes.length > 0) {
      const epIds = series.episodes
        .slice(0, 10)
        .map((e: unknown) => (e as Record<string, unknown>).id as string | undefined)
        .filter((id): id is string => Boolean(id))
      const episodes = await Promise.all(
        epIds.map((epId) => storyReads.episode(epId)),
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

/** Map a mime type to the media kind used by the output surfaces, or null for
 *  non-media files (which the outputs/artifacts surfaces don't show). */
function mimeToMediaKind(mime: string): 'image' | 'video' | 'audio' | null {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return null
}

// fetchProjectOutputs maps the directory-scan /outputs response. The backend
// returns ProjectOutputEntry (name/path/size/mimeType/modifiedAt) — NOT the
// WorkspaceFile shape the old mapper assumed (openimago-r5h0), which threw on
// every item and left this surface empty at runtime. Directory scans carry no
// externally servable URL (the renderable, hosted outputs come from the
// workspace-files API → aiOutputItems), so `url` stays empty; we keep the
// on-disk filename (also the delete key) + kind + time so the storyboard
// fallback / artifacts surfaces actually populate.
async function fetchProjectOutputs() {
  projectOutputsLoading.value = true
  try {
    const outputs = await api.projectOutputs(projectId.value)
    projectOutputs.value = outputs.flatMap((o) => {
      const kind = mimeToMediaKind(o.mimeType)
      if (!kind) return []
      return [{
        id: o.name,
        url: '',
        filename: o.name,
        kind,
        timeLabel: formatResultTime(new Date(o.modifiedAt)),
        promptText: '',
        model: null,
        resolution: null,
        durationLabel: null,
      } satisfies OutputItem]
    })
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

// Same defect/shape as fetchProjectOutputs (openimago-r5h0): /files returns
// ProjectFileEntry (name/path/size/type/modifiedAt), not WorkspaceFile. Map the
// real fields, filtered to media kinds (the artifacts surface only shows media).
async function fetchProjectFiles() {
  projectFilesLoading.value = true
  try {
    const files = await api.projectFiles(projectId.value)
    projectFiles.value = files.flatMap((f) => {
      const kind = mimeToMediaKind(f.type)
      if (!kind) return []
      return [{
        id: f.name,
        url: '',
        filename: f.name,
        kind,
        timeLabel: formatResultTime(new Date(f.modifiedAt)),
        promptText: '',
      } satisfies OutputItem]
    })
  } catch {
    projectFiles.value = []
  } finally {
    projectFilesLoading.value = false
  }
}

function formatResultTime(date: Date): string {
  return formatRelativeTime(date)
}

// ── Degraded session-shell handlers (ADR 0009) ──────────────────────────────
// Port of the prior SessionWorkspacePage handlers, active only in session mode.

async function fetchSessionFiles(): Promise<void> {
  const sid = sessionId.value
  if (!sid) {
    sessionFileItems.value = []
    return
  }
  try {
    const files = await api.sessionWorkspaceFiles(sid)
    // Guard against a race where the session switched mid-flight.
    if (sessionId.value !== sid) return
    sessionFileItems.value = files.map((wf) => workspaceFileToAIOutputItem(wf, formatResultTime))
  } catch {
    if (sessionId.value === sid) sessionFileItems.value = []
  }
}

function handleSelectResult(id: string) {
  selectedResultId.value = id
}

function handleItemMenu(id: string, _event: MouseEvent) {
  $q.notify({ color: 'info', message: `对 ${id} 打开菜单（待接入）`, icon: 'info', timeout: 1200 })
}

// Session shell: same filter popup. The session shell has no full-width outputs
// tab (its drawer already lists every item), so view-all is a no-op there.
function handleFilterOutputs() {
  outputFilterOpen.value = true
}

function handleViewAll() {
  $q.notify({ color: 'info', message: '已在右侧面板展示全部产出', icon: 'list', timeout: 1200 })
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

onMounted(() => {
  void loadAgents()
  void loadCommands()
  // Project-only data sources; skipped on the standalone session shell.
  if (hasProject.value) {
    void fetchProjectData()
    void fetchProjectOutputs()
    void fetchProjectWorkspaceFiles()
    void fetchProjectFiles()
  }
  // Story is scope-aware (project OR session key); it sets storyHasFiles.
  void fetchStoryData()
  void loadSessionList().then(() => {
    const sid = routeSessionId.value
    if (sid && sid !== sessionId.value) void switchSession(sid)
  })
  startEventSubscription()
})

// Route-driven session switching: the nested `:sessionId` on a project route OR
// the top-level `:id` on a session route. Navigating to the bare /sessions list
// (no id, no project) clears the active session.
watch(routeSessionId, (sid) => {
  if (sid && sid !== sessionId.value) void switchSession(sid)
  else if (!sid && !hasProject.value && sessionId.value) void switchSession('')
})

// Pull DB-backed workspace files whenever the active session changes in the
// degraded session shell (initial load, route change, sidebar switch).
watch(
  sessionId,
  () => { if (!hasProject.value) void fetchSessionFiles() },
  { immediate: true },
)

// After a generation round completes (isLoading true → false), refresh the
// "AI 产出" panel so newly generated media appears without a manual reload.
// Project (openimago-owy7) also refreshes the filesystem-scanned projectOutputs
// so the storyboard fallback stays in sync; the session shell refreshes its
// session workspace files.
watch(isLoading, (loading, wasLoading) => {
  if (!(wasLoading && !loading)) return
  if (hasProject.value) {
    void fetchProjectWorkspaceFiles()
    void fetchProjectOutputs()
  } else {
    void fetchSessionFiles()
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

// ════ Degraded session shell (ADR 0009) — ported from SessionWorkspacePage ════

.session-layout {
  z-index: 1;
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;
}

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
