<template>
  <div class="workspace-results-panel">
    <q-tabs v-model="tabModel" dense no-caps active-color="grey-4" indicator-color="grey-7" class="side-tabs">
      <q-tab name="result" label="生成结果" />
      <q-tab name="canvas" label="画布" />
      <q-tab name="prompt" label="提示词" />
    </q-tabs>

    <div class="side-panel__body">
      <div v-if="tabModel === 'result'" class="results-panel">
        <div class="results-panel__toolbar">
          <div>
            <div class="results-panel__eyebrow">全部结果 ({{ sidePanelResultCount }})</div>
            <div class="results-panel__subtle">当前会话最近产出</div>
          </div>
          <div class="row items-center q-gutter-xs">
            <q-btn flat dense no-caps label="最新" class="results-panel__sort-btn" />
            <q-btn flat round dense icon="filter_list" class="results-panel__filter-btn" />
          </div>
        </div>

        <div v-if="selectedResult" class="result-feature imago-surface">
          <div class="result-feature__frame">
            <img :src="selectedResult.url" :alt="selectedResult.filename" class="result-feature__image">
            <span class="result-feature__badge">当前预览</span>
          </div>
          <div class="result-feature__body">
            <div class="result-feature__title">{{ selectedResult.filename }}</div>
            <div class="result-feature__prompt">{{ clipText(selectedResult.prompt || '生成结果', 68) }}</div>
          </div>
        </div>

        <div v-if="generatedResults.length > 0 || showPendingResultTile" class="result-grid">
          <button
            v-for="item in generatedResults"
            :key="item.id"
            type="button"
            class="result-card"
            :class="{ 'result-card--active': item.id === selectedResultId }"
            @click="$emit('select-result', item.id)"
          >
            <div class="result-card__frame">
              <img :src="item.url" :alt="item.filename" class="result-card__image">
            </div>
            <div class="result-card__body">
              <div class="result-card__title ellipsis">{{ item.filename }}</div>
              <div class="result-card__prompt">{{ clipText(item.prompt || '生成结果', 34) }}</div>
              <div class="result-card__meta">
                <span>{{ item.timeLabel }}</span>
                <span>查看</span>
              </div>
            </div>
          </button>

          <div v-if="showPendingResultTile" class="result-card result-card--loading">
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

        <div v-else class="side-panel__placeholder side-panel__placeholder--rich">
          <q-icon name="image" size="28px" color="grey-7" class="q-mb-sm" />
          <div class="text-caption text-grey-7">暂无生成结果</div>
          <div class="text-caption text-grey-6">生成图像后会在这里形成缩略图库</div>
        </div>
      </div>

      <div v-else-if="tabModel === 'canvas'" class="canvas-panel">
        <div v-if="selectedResult" class="canvas-panel__preview imago-surface">
          <img :src="selectedResult.url" :alt="selectedResult.filename" class="canvas-panel__image">
          <div class="canvas-panel__body">
            <div class="canvas-panel__title">画布预览</div>
            <div class="canvas-panel__hint">选中的结果会作为下一步精修与延展的起点。</div>
          </div>
        </div>
        <div v-else class="side-panel__placeholder side-panel__placeholder--rich">
          <q-icon name="brush" size="28px" color="grey-7" class="q-mb-sm" />
          <div class="text-caption text-grey-7">画布暂时为空</div>
          <div class="text-caption text-grey-6">先生成一张图，再进入画布继续调整。</div>
        </div>
      </div>

      <div v-else class="prompt-panel">
        <div v-if="latestPromptText" class="prompt-panel__card imago-surface">
          <div class="prompt-panel__label">当前提示词</div>
          <div class="prompt-panel__content">{{ latestPromptText }}</div>
          <div class="prompt-panel__meta">
            <span>{{ currentSessionLabel }}</span>
            <span v-if="selectedResult">{{ selectedResult.timeLabel }}</span>
          </div>
        </div>
        <div v-else class="side-panel__placeholder side-panel__placeholder--rich">
          <q-icon name="auto_awesome" size="28px" color="grey-7" class="q-mb-sm" />
          <div class="text-caption text-grey-7">暂无提示词</div>
          <div class="text-caption text-grey-6">发送第一条创作指令后，这里会同步展示。</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: string
  currentSessionLabel: string
  latestPromptText: string
  generatedResults: Array<{
    id: string
    url: string
    filename: string
    prompt: string
    timeLabel: string
  }>
  selectedResultId: string | null
  selectedResult: {
    id: string
    url: string
    filename: string
    prompt: string
    timeLabel: string
  } | null
  showPendingResultTile: boolean
  sidePanelResultCount: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'select-result', id: string): void
}>()

const tabModel = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value),
})

function clipText(value: string, max = 48): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, Math.max(0, max - 1))}…`
}
</script>

<style scoped>
.workspace-results-panel {
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
