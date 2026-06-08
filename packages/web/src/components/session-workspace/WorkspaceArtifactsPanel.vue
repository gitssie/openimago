<template>
  <div class="workspace-artifacts-panel">
    <q-tabs v-model="tabModel" dense no-caps active-color="grey-4" indicator-color="grey-7" class="side-tabs">
      <q-tab name="result" label="生成结果" />
      <q-tab name="canvas" label="画布" />
      <q-tab name="prompt" label="提示词" />
    </q-tabs>

    <div class="side-panel__body">
      <!-- ── Result tab ────────────────────────────────────────────────────────── -->
      <div v-if="tabModel === 'result'" class="results-panel">
        <div class="results-panel__toolbar">
          <div>
            <div class="results-panel__eyebrow">全部结果 ({{ artifacts.length }})</div>
            <div class="results-panel__subtle">{{ scopeLabel }}</div>
          </div>
          <div class="row items-center q-gutter-xs">
            <q-btn flat dense no-caps label="最新" class="results-panel__sort-btn" />
            <q-btn flat round dense icon="filter_list" class="results-panel__filter-btn" />
          </div>
        </div>

        <!-- Selected artifact detail -->
        <div v-if="selected" class="result-feature imago-surface">
          <div class="result-feature__frame">
            <img
              v-if="selected.kind === 'image'"
              :src="selectedUrl"
              :alt="selected.filename"
              class="result-feature__image"
            >
            <div v-else-if="selected.kind === 'video'" class="result-feature__video">
              <video
                v-if="selectedUrl"
                :src="selectedUrl"
                :poster="selected.access.poster ?? selected.access.thumbnail ?? ''"
                class="result-feature__image"
                muted
                loop
                @mouseenter="(e: Event) => (e.target as HTMLVideoElement).play()"
                @mouseleave="(e: Event) => { (e.target as HTMLVideoElement).pause(); (e.target as HTMLVideoElement).currentTime = 0; }"
              />
              <q-icon v-else name="videocam" size="48px" color="grey-6" />
            </div>
            <div v-else-if="selected.kind === 'audio'" class="result-feature__audio">
              <q-icon name="audiotrack" size="48px" color="grey-5" />
            </div>
            <span class="result-feature__badge">{{ kindBadge(selected.kind) }}</span>
          </div>
          <div class="result-feature__body">
            <div class="result-feature__title">{{ selected.filename || selected.kind || '生成结果' }}</div>
            <div class="result-feature__prompt">{{ clipText(selected.prompt || '生成结果', 68) }}</div>
            <div class="result-feature__actions row q-gutter-xs q-mt-sm">
              <q-btn
                v-if="selected.kind === 'video' && selectedUrl"
                flat dense no-caps size="sm"
                icon="play_circle"
                label="播放"
                class="result-action-btn"
                @click="$emit('rerun', { artifactId: selected.id })"
              />
              <q-btn
                flat dense no-caps size="sm"
                icon="edit"
                label="编辑参数"
                class="result-action-btn"
                @click="$emit('edit-params', selected.id)"
              />
              <q-btn
                v-if="selectedUrl"
                flat dense no-caps size="sm"
                icon="download"
                label="下载"
                class="result-action-btn"
                :href="selected.access.download ?? selectedUrl"
                target="_blank"
                download
              />
            </div>
          </div>
        </div>

        <!-- Artifact grid -->
        <div v-if="artifacts.length > 0 || showPendingTile || loading" class="result-grid">
          <button
            v-for="item in artifacts"
            :key="item.id"
            type="button"
            class="result-card"
            :class="{ 'result-card--active': item.id === selectedId }"
            @click="$emit('select', item.id)"
          >
            <div class="result-card__frame">
              <img
                v-if="item.kind === 'image'"
                :src="item.access.thumbnail ?? item.access.preview ?? ''"
                :alt="item.filename"
                class="result-card__image"
              >
              <div v-else-if="item.kind === 'video'" class="result-card__video">
                <img
                  v-if="item.access.thumbnail ?? item.access.poster"
                  :src="(item.access.thumbnail ?? item.access.poster)!"
                  :alt="item.filename"
                  class="result-card__image"
                >
                <div class="result-card__play-overlay">
                  <q-icon name="play_circle_filled" size="24px" color="white" />
                </div>
              </div>
              <div v-else-if="item.kind === 'audio'" class="result-card__audio">
                <div class="result-card__audio-art">
                  <q-icon name="audiotrack" size="36px" color="grey-5" />
                </div>
              </div>
              <div v-else class="result-card__fallback">
                <q-icon name="insert_drive_file" size="36px" color="grey-6" />
              </div>
            </div>
            <div class="result-card__body">
              <div class="result-card__title ellipsis">{{ item.filename || item.kind }}</div>
              <div class="result-card__prompt">{{ clipText(item.prompt || '生成结果', 34) }}</div>
              <div class="result-card__meta">
                <span>{{ item.timeLabel }}</span>
                <span>{{ kindChip(item.kind) }}</span>
              </div>
            </div>
          </button>

          <div v-if="showPendingTile" class="result-card result-card--loading">
            <div class="result-card__loading-art">
              <q-icon name="add" size="28px" color="grey-6" />
            </div>
            <div class="result-card__body">
              <div class="result-card__title">生成中</div>
              <div class="result-card__prompt">结果会在这里继续堆叠展示</div>
              <div class="result-card__progress"><span /></div>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-else class="side-panel__placeholder side-panel__placeholder--rich">
          <q-icon name="image" size="28px" color="grey-7" class="q-mb-sm" />
          <div class="text-caption text-grey-7">暂无生成结果</div>
          <div class="text-caption text-grey-6">生成图像后会在这里形成缩略图库</div>
        </div>
      </div>

      <!-- ── Canvas tab ────────────────────────────────────────────────────────── -->
      <div v-else-if="tabModel === 'canvas'" class="canvas-panel">
        <div v-if="selected && selected.kind === 'image'" class="canvas-panel__preview imago-surface">
          <img :src="selectedUrl" :alt="selected.filename" class="canvas-panel__image">
          <div class="canvas-panel__body">
            <div class="canvas-panel__title">画布预览</div>
            <div class="canvas-panel__hint">选中的结果会作为下一步精修与延展的起点。</div>
          </div>
        </div>
        <div v-else class="side-panel__placeholder side-panel__placeholder--rich">
          <q-icon name="brush" size="28px" color="grey-7" class="q-mb-sm" />
          <div class="text-caption text-grey-7">画布暂时为空</div>
          <div class="text-caption text-grey-6">选择一张图片制品，再进入画布继续调整。</div>
        </div>
      </div>

      <!-- ── Prompt tab ─────────────────────────────────────────────────────────── -->
      <div v-else class="prompt-panel">
        <div v-if="selected?.prompt" class="prompt-panel__card imago-surface">
          <div class="prompt-panel__label">当前提示词</div>
          <div class="prompt-panel__content">{{ selected.prompt }}</div>
          <div class="prompt-panel__meta">
            <span>{{ selected.filename || selected.kind }}</span>
            <span>{{ selected.timeLabel }}</span>
          </div>
        </div>
        <div v-else class="side-panel__placeholder side-panel__placeholder--rich">
          <q-icon name="auto_awesome" size="28px" color="grey-7" class="q-mb-sm" />
          <div class="text-caption text-grey-7">暂无提示词</div>
          <div class="text-caption text-grey-6">选择制品后，这里会同步展示对应的提示词。</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { WorkspaceArtifact, ArtifactRerunPayload, WorkspaceScope } from './types'

// ── Props ──────────────────────────────────────────────────────────────────────

const props = withDefaults(
  defineProps<{
    /** Tab model: 'result' | 'canvas' | 'prompt' */
    modelValue: string
    /** Artifacts to display (session-scoped or project-scoped) */
    artifacts: WorkspaceArtifact[]
    /** Currently selected artifact id */
    selectedId: string | null
    /** Show a loading/pending tile after existing artifacts */
    showPendingTile?: boolean
    /** Data scope — affects subtitle label */
    scope?: WorkspaceScope
    /** Whether artifacts are still loading */
    loading?: boolean
  }>(),
  {
    showPendingTile: false,
    scope: 'session',
    loading: false,
  },
)

// ── Emits (ADR 0003) ──────────────────────────────────────────────────────────

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'select', id: string): void
  (e: 'edit-params', id: string): void
  (e: 'rerun', payload: ArtifactRerunPayload): void
  (e: 'delete', id: string): void
}>()

// ── Computed ───────────────────────────────────────────────────────────────────

const tabModel = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value),
})

const selected = computed<WorkspaceArtifact | null>(() => {
  if (!props.selectedId) return props.artifacts[0] ?? null
  return props.artifacts.find((a) => a.id === props.selectedId) ?? props.artifacts[0] ?? null
})

const selectedUrl = computed(() => {
  if (!selected.value) return ''
  return selected.value.access.preview ?? ''
})

const scopeLabel = computed(() => {
  if (props.scope === 'project') return '项目范围下最近产出'
  return '当前会话最近产出'
})

// ── Helpers ────────────────────────────────────────────────────────────────────

function clipText(value: string, max = 48): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, Math.max(0, max - 1))}…`
}

function kindBadge(kind: WorkspaceArtifact['kind']): string {
  if (kind === 'image') return '图像预览'
  if (kind === 'video') return '视频预览'
  if (kind === 'audio') return '音频预览'
  return '文件预览'
}

function kindChip(kind: WorkspaceArtifact['kind']): string {
  if (kind === 'image') return '图像'
  if (kind === 'video') return '视频'
  if (kind === 'audio') return '音频'
  return '文件'
}
</script>

<style scoped>
.workspace-artifacts-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, rgba(16, 17, 30, 0.96), rgba(11, 12, 22, 0.94));
}

.side-tabs {
  flex-shrink: 0;
  padding: 8px 12px 0;
  color: var(--imago-text-dim);
}

.side-panel__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  padding: 16px 16px 18px;
  overflow-y: auto;
}

.side-panel__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 4px;
}

.side-panel__placeholder--rich {
  min-height: 220px;
  justify-content: center;
  border: 1px dashed rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.02);
}

.results-panel,
.canvas-panel,
.prompt-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 100%;
}

.results-panel__toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.results-panel__eyebrow {
  color: var(--imago-text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.results-panel__subtle {
  margin-top: 4px;
  color: var(--imago-text-dim);
  font-size: 11px;
}

.results-panel__sort-btn,
.results-panel__filter-btn {
  color: var(--imago-text-muted);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
}

.result-feature {
  padding: 10px;
  background: linear-gradient(180deg, rgba(15, 17, 30, 0.9), rgba(10, 11, 21, 0.82));
  border-radius: 20px;
}

.result-feature__frame {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid rgba(0, 240, 255, 0.14);
  background: rgba(255, 255, 255, 0.02);
  aspect-ratio: 4 / 3;
}

.result-feature__image,
.canvas-panel__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.result-feature__video,
.result-feature__audio {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.03);
}

.result-feature__badge {
  position: absolute;
  right: 10px;
  bottom: 10px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(9, 17, 28, 0.84);
  border: 1px solid rgba(0, 240, 255, 0.18);
  color: rgba(0, 240, 255, 0.84);
  font-size: 11px;
}

.result-feature__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 4px 2px;
}

.result-feature__title,
.canvas-panel__title,
.prompt-panel__label {
  color: var(--imago-text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.result-feature__prompt,
.canvas-panel__hint,
.prompt-panel__meta {
  color: var(--imago-text-dim);
  font-size: 12px;
  line-height: 1.5;
}

.result-feature__actions {
  /* action button row */
}

.result-action-btn {
  color: var(--imago-text-dim);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
}

.result-action-btn:hover {
  border-color: rgba(0, 240, 255, 0.18);
  color: rgba(0, 240, 255, 0.8);
}

.result-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.result-card {
  display: flex;
  flex-direction: column;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.02);
  text-align: left;
  cursor: pointer;
  transition: border-color var(--imago-ease-default), box-shadow var(--imago-ease-default), transform var(--imago-ease-default);
}

.result-card:hover {
  border-color: rgba(0, 240, 255, 0.16);
  box-shadow: 0 0 20px rgba(0, 240, 255, 0.06);
  transform: translateY(-1px);
}

.result-card--active {
  border-color: rgba(0, 240, 255, 0.28);
  box-shadow: inset 0 0 0 1px rgba(0, 240, 255, 0.1), 0 0 24px rgba(0, 240, 255, 0.08);
}

.result-card__frame {
  overflow: hidden;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.02);
  aspect-ratio: 1 / 1;
}

.result-card__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.result-card__video {
  position: relative;
  width: 100%;
  height: 100%;
}

.result-card__play-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  border-radius: 14px;
  opacity: 0.8;
  transition: opacity var(--imago-ease-default);
}

.result-card:hover .result-card__play-overlay {
  opacity: 1;
}

.result-card__audio,
.result-card__fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 50% 50%, rgba(0, 240, 255, 0.06), transparent 60%);
}

.result-card__audio-art {
  display: flex;
  align-items: center;
  justify-content: center;
}

.result-card__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 2px 2px;
}

.result-card__title {
  color: var(--imago-text-secondary);
  font-size: 12px;
}

.result-card__prompt {
  min-height: 32px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  line-height: 1.45;
}

.result-card__meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: rgba(255, 255, 255, 0.34);
  font-size: 10px;
}

.result-card--loading {
  justify-content: space-between;
  cursor: default;
}

.result-card__loading-art {
  display: grid;
  place-items: center;
  min-height: 148px;
  border-radius: 14px;
  border: 1px dashed rgba(255, 255, 255, 0.08);
  background: radial-gradient(circle at 50% 50%, rgba(0, 240, 255, 0.05), transparent 65%);
}

.result-card__progress {
  width: 100%;
  height: 3px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.result-card__progress span {
  display: block;
  width: 38%;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, rgba(0, 240, 255, 0.8), rgba(168, 85, 247, 0.8));
}

.canvas-panel__preview,
.prompt-panel__card {
  padding: 12px;
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(15, 17, 30, 0.88), rgba(10, 11, 21, 0.8));
}

.canvas-panel__preview {
  overflow: hidden;
}

.canvas-panel__image {
  aspect-ratio: 4 / 3;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.canvas-panel__body {
  padding: 10px 4px 2px;
}

.prompt-panel__content {
  margin-top: 10px;
  white-space: pre-wrap;
  color: rgba(255, 255, 255, 0.74);
  font-size: 13px;
  line-height: 1.7;
}

.prompt-panel__meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 12px;
}
</style>
