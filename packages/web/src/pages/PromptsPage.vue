<template>
  <q-page class="prompts-page">
    <div class="prompts-header row items-start no-wrap">
      <div>
        <h1 class="prompts-title">提示词模板 <OiIcon name="star" size="22px" class="title-star" /></h1>
        <p class="prompts-subtitle">探索、复用与分享优秀的提示词模板，激发无限创意</p>
      </div>
      <q-space />
      <q-input v-model="searchQuery" placeholder="搜索模板、关键词或风格..." outlined dense dark class="prompts-search">
        <template #prepend><OiIcon name="search" size="22px" class="search-icon" /></template>
        <template #append><OiIcon name="search" size="20px" class="search-icon" /></template>
      </q-input>
      <q-btn class="create-btn q-ml-md" @click="openCreate" unelevated no-caps>
        <OiIcon name="plus" size="18px" class="btn-icon" />
        <span>新建模板</span>
      </q-btn>
    </div>

    <div v-if="store.loading" class="prompts-loading flex flex-center">
      <q-spinner color="primary" size="3em" />
    </div>

    <div v-else-if="filteredTemplates.length === 0" class="empty-state flex flex-center">
      <div class="text-center empty-content">
        <q-icon name="auto_awesome" size="4em" color="grey-7" />
        <p>{{ store.templates.length === 0 ? '还没有 Prompt 模板' : '没有找到匹配的模板' }}</p>
      </div>
    </div>

    <div v-else class="prompts-grid">
      <article v-for="(t, index) in filteredTemplates" :key="t.id" class="prompt-card" :class="{ 'prompt-card--featured': index === 0 }">
        <div class="prompt-thumb" :style="thumbStyle(t.id, index)">
          <div class="prompt-thumb__shine" />
        </div>

        <div class="prompt-body">
          <div class="row items-start no-wrap">
            <div class="prompt-title ellipsis">{{ t.title }}</div>
            <q-space />
            <q-btn flat dense round class="delete-btn" @click.stop="void store.remove(t.id)"><OiIcon name="trash" size="16px" /></q-btn>
          </div>
          <p class="prompt-desc">{{ promptDescription(t.content) }}</p>

          <div class="tag-row row items-center no-wrap">
            <span v-for="tag in normalizedTags(t.tags, index)" :key="tag" class="prompt-tag">{{ tag }}</span>
          </div>

          <pre class="prompt-code"><code>{{ previewPrompt(t.content) }}</code></pre>

          <div class="prompt-footer row items-center no-wrap">
            <OiIcon name="copy" size="15px" class="usage-icon" />
            <span>使用 {{ usageCount(t.id, index) }} 次</span>
            <q-space />
            <q-btn flat dense no-caps class="copy-btn" @click.stop="copyPrompt(t.content)">
              <OiIcon name="copy" size="14px" class="btn-icon" />
              <span>复制 Prompt</span>
            </q-btn>
          </div>
        </div>
      </article>
    </div>

    <q-dialog v-model="showCreate">
      <q-card class="prompt-dialog">
        <q-card-section><div class="text-h6">新建模板</div></q-card-section>
        <q-card-section class="q-gutter-y-md">
          <q-input v-model="form.title" label="标题" outlined dark dense :rules="[(v: string) => !!v || '必填']" />
          <q-input v-model="form.content" label="Prompt 内容" outlined dark dense type="textarea" rows="5" :rules="[(v: string) => !!v || '必填']" />
          <q-input v-model="form.tagsStr" label="标签（逗号分隔）" outlined dark dense />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="取消" v-close-popup />
          <q-btn class="create-btn" @click="handleCreate" :loading="creating" unelevated>
            <OiIcon name="plus" size="18px" class="btn-icon" />
            <span>创建</span>
          </q-btn>
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, reactive, ref, onMounted } from 'vue'
import { usePromptsStore } from 'src/stores/prompts'
import OiIcon from 'src/components/ui/OiIcon.vue'

const store = usePromptsStore()
const showCreate = ref(false)
const creating = ref(false)
const searchQuery = ref('')
const form = reactive({ title: '', content: '', tagsStr: '' })

const fallbackTags = [
  ['科幻', '城市', '概念设计'],
  ['人像', '奇幻', '插画'],
  ['室内', '设计', '极简'],
  ['3D', '角色', '卡通'],
  ['宇宙', '科幻', '写实'],
  ['国风', '山水', '水墨'],
]

const filteredTemplates = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return store.templates
  return store.templates.filter((t) =>
    t.title.toLowerCase().includes(q)
    || t.content.toLowerCase().includes(q)
    || t.tags?.some((tag) => tag.toLowerCase().includes(q))
  )
})

onMounted(() => store.fetchAll())

function openCreate() {
  form.title = ''
  form.content = ''
  form.tagsStr = ''
  showCreate.value = true
}

async function handleCreate() {
  if (!form.title || !form.content) return
  creating.value = true
  try {
    await store.create({
      title: form.title,
      content: form.content,
      tags: form.tagsStr.split(',').map((t: string) => t.trim()).filter(Boolean),
    })
    showCreate.value = false
  } finally {
    creating.value = false
  }
}

function normalizedTags(tags: string[] | undefined, index: number): string[] {
  return tags?.length ? tags.slice(0, 3) : fallbackTags[index % fallbackTags.length]!
}

function promptDescription(content: string): string {
  const clean = content.replace(/--\S+(\s+\S+)?/g, '').replace(/[,，]/g, '，').trim()
  return clean.length > 36 ? `${clean.slice(0, 36)}…` : clean || '精选提示词模板，适合快速生成高质量视觉方向'
}

function previewPrompt(content: string): string {
  const oneLine = content.replace(/\s+/g, ' ').trim()
  return oneLine.length > 145 ? `${oneLine.slice(0, 145)}…` : oneLine
}

function usageCount(id: string, index: number): string {
  const n = (id.charCodeAt(0) + index * 239) % 1800 + 680
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`
}

async function copyPrompt(content: string) {
  await navigator.clipboard.writeText(content)
}

function thumbStyle(id: string, index: number): Record<string, string> {
  const seed = id.charCodeAt(0) + index * 31
  const palettes = [
    ['#ff7a90', '#56f0ff', '#3946ff', '#10192f'],
    ['#f6e5d6', '#8ecaff', '#6f4a35', '#1d2436'],
    ['#f8eee0', '#d5b892', '#8a6748', '#22212a'],
    ['#9bffd0', '#6b82ff', '#5b3d22', '#15251c'],
    ['#ff9b45', '#f4c06d', '#5228ff', '#100d18'],
    ['#f4eee5', '#9fb4a9', '#4f6f6a', '#1a2229'],
  ]
  const p = palettes[index % palettes.length]!
  const angle = (seed * 29) % 360
  return {
    background: `radial-gradient(ellipse at 50% 18%, ${p[0]}cc, transparent 28%), radial-gradient(circle at 28% 52%, ${p[1]}88, transparent 30%), radial-gradient(circle at 80% 70%, ${p[2]}99, transparent 34%), linear-gradient(${angle}deg, ${p[3]}, #111827 78%)`,
  }
}
</script>

<style scoped>
.prompts-page {
  position: relative;
  min-height: calc(100vh - 86px);
  padding: 36px 40px 48px;
  overflow: hidden;
  background: var(--imago-bg-void);
}

.prompts-page::before {
  position: absolute;
  inset: 0;
  content: '';
  pointer-events: none;
  background:
    radial-gradient(ellipse 80% 60% at 30% 20%, var(--imago-cyan-04) 0%, transparent 60%),
    radial-gradient(ellipse 60% 80% at 70% 80%, rgba(168, 85, 247, 0.04) 0%, transparent 60%),
    radial-gradient(ellipse 40% 40% at 50% 50%, rgba(255, 45, 149, 0.02) 0%, transparent 70%);
}

.prompts-header,
.prompts-grid,
.prompts-loading,
.empty-state { position: relative; z-index: 1; }

.prompts-header { margin-bottom: 28px; gap: 20px; }

.prompts-title {
  margin: 0;
  color: var(--imago-text-primary);
  font-size: 36px;
  line-height: 1;
  font-weight: 700;
  letter-spacing: -0.035em;
}

.title-star { color: var(--imago-neon-purple); margin-left: 6px; }

.prompts-subtitle {
  margin: 12px 0 0;
  color: var(--imago-text-muted);
  font-size: 16px;
}

.prompts-search { width: 458px; }

.prompts-search :deep(.q-field__control) {
  height: 52px;
  border-radius: 10px;
  background: var(--imago-bg-void);
  border: 1px solid var(--imago-border-dim);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 1%);
  padding: 0 16px;
}

.prompts-search :deep(.q-field__marginal) { height: 52px; }
.prompts-search :deep(.q-field__native) { color: var(--imago-text-secondary); font-size: 14px; }
.prompts-search :deep(.q-field__native::placeholder) { color: var(--imago-text-dim); opacity: 1; }
.search-icon { color: var(--imago-text-muted); }

.create-btn {
  height: 40px;
  min-width: 132px;
  border-radius: 10px;
  color: var(--imago-btn-text-dark);
  font-weight: 800;
  background: linear-gradient(90deg, var(--imago-neon-cyan), var(--imago-cyan-bright));
  box-shadow: 0 12px 34px rgb(0 207 255 / 28%);
}

.create-btn :deep(.q-btn__content),
.copy-btn :deep(.q-btn__content) {
  gap: 8px;
}

.btn-icon {
  color: currentColor;
}

.prompts-loading,
.empty-state { min-height: calc(100vh - 240px); }
.empty-content { color: var(--imago-text-muted); }

.prompts-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px 28px;
}

.prompt-card {
  display: grid;
  grid-template-columns: 192px minmax(0, 1fr);
  gap: 22px;
  min-height: 280px;
  padding: 18px;
  border-radius: 16px;
  background: linear-gradient(180deg, rgb(16 21 35 / 96%), rgb(10 14 24 / 96%));
  border: 1px solid var(--imago-border-dim);
  box-shadow: 0 14px 36px rgb(0 0 0 / 28%);
}

.prompt-card--featured {
  border-color: var(--imago-neon-cyan);
  box-shadow: -1px 0 0 1px rgb(190 70 255 / 74%), 1px 0 0 1px rgb(0 236 255 / 58%), 0 0 30px rgb(0 236 255 / 20%);
}

.prompt-thumb {
  position: relative;
  width: 192px;
  height: 242px;
  overflow: hidden;
  border-radius: 11px;
  border: 1px solid rgb(255 255 255 / 10%);
}

.prompt-thumb__shine {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 32% 22%, rgb(255 255 255 / 24%), transparent 17%),
    linear-gradient(to top, rgb(0 0 0 / 34%), transparent 45%),
    linear-gradient(135deg, transparent 40%, rgb(255 255 255 / 10%) 50%, transparent 62%);
  mix-blend-mode: screen;
}

.prompt-body { min-width: 0; display: flex; flex-direction: column; }

.prompt-title {
  color: var(--imago-text-primary);
  font-size: 21px;
  line-height: 1.25;
  font-weight: 700;
}

.delete-btn { color: var(--imago-text-dim); opacity: 0; transition: opacity 0.2s; }
.prompt-card:hover .delete-btn { opacity: 1; }

.prompt-desc {
  margin: 8px 0 10px;
  color: var(--imago-text-muted);
  font-size: 14px;
  line-height: 1.45;
}

.tag-row { gap: 10px; margin-bottom: 12px; }

.prompt-tag {
  height: 26px;
  padding: 0 12px;
  border-radius: 8px;
  color: var(--imago-text-secondary);
  background: linear-gradient(180deg, rgb(99 70 146 / 48%), rgb(50 45 69 / 62%));
  display: inline-flex;
  align-items: center;
  font-size: 12px;
}

.prompt-tag:nth-child(2) {
  background: linear-gradient(180deg, rgb(71 88 119 / 50%), rgb(43 51 65 / 70%));
}

.prompt-tag:nth-child(3) {
  background: linear-gradient(180deg, rgb(110 88 50 / 54%), rgb(61 54 42 / 70%));
}

.prompt-code {
  min-height: 92px;
  margin: 0;
  padding: 13px 14px;
  border-radius: 8px;
  color: var(--imago-neon-cyan);
  background: var(--imago-bg-code);
  border: 1px solid var(--imago-border-dim);
  white-space: pre-wrap;
  overflow: hidden;
  font: 12px/1.46 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.prompt-footer {
  margin-top: 10px;
  color: var(--imago-text-muted);
  font-size: 13px;
}

.usage-icon { color: var(--imago-text-muted); margin-right: 6px; }

.copy-btn {
  min-width: 112px;
  height: 32px;
  border-radius: 8px;
  color: var(--imago-text-secondary);
  border: 1px solid var(--imago-neon-cyan);
  background: rgb(0 160 200 / 10%);
  box-shadow: inset 0 0 14px rgb(0 223 255 / 12%);
}

.delete-btn {
  width: 28px;
  height: 28px;
}

.prompt-dialog {
  min-width: 500px;
  color: var(--imago-text-primary);
  background: var(--imago-bg-panel);
  border: 1px solid var(--imago-border-dim);
  border-radius: 14px;
}

@media (max-width: 1240px) {
  .prompts-grid { grid-template-columns: 1fr; }
  .prompts-search { width: 360px; }
}

@media (max-width: 780px) {
  .prompts-page { padding: 22px 18px 36px; }
  .prompts-header { align-items: stretch; flex-direction: column; }
  .prompts-search { width: 100%; }
  .prompt-card { grid-template-columns: 1fr; }
  .prompt-thumb { width: 100%; height: 220px; }
}
</style>
