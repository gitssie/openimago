<template>
  <q-page class="projects-page">
    <!-- Header -->
    <div class="projects-header row items-center no-wrap">
      <h1 class="projects-title">我的项目</h1>
      <q-space />
      <q-input
        v-model="searchQuery"
        placeholder="搜索项目名称或描述"
        outlined
        dense
        dark
        class="projects-search"
        :bg-color="'transparent'"
      >
        <template #prepend>
          <OiIcon name="search" size="22px" class="search-icon" />
        </template>
      </q-input>
      <q-btn
        class="imago-btn-cyan create-btn q-ml-md"
        @click="showCreate = true"
        unelevated
        no-caps
      >
        <OiIcon name="plus" size="18px" class="btn-icon" />
        <span>新建项目</span>
      </q-btn>
    </div>

    <!-- Loading -->
    <div v-if="store.loading" class="projects-loading flex flex-center">
      <q-spinner color="primary" size="3em" />
    </div>

    <!-- Empty state -->
    <div v-else-if="filteredProjects.length === 0 && store.projects.length === 0" class="empty-state flex flex-center">
      <div class="empty-content text-center">
        <div class="empty-folder imago-empty-folder" aria-hidden="true">
          <div class="imago-empty-folder__back empty-folder__back" />
          <div class="imago-empty-folder__front empty-folder__front" />
        </div>
        <h2 class="imago-empty-heading">还没有项目，创建第一个吧</h2>
        <p class="imago-empty-desc">点击下面的按钮开始创建属于你的项目</p>
        <q-btn class="imago-btn-cyan create-btn empty-create" @click="showCreate = true" unelevated no-caps>
          <OiIcon name="plus" size="18px" class="btn-icon" />
          <span>新建项目</span>
        </q-btn>
      </div>
    </div>

    <!-- No search results -->
    <div v-else-if="filteredProjects.length === 0" class="empty-state flex flex-center">
      <div class="empty-content text-center">
        <q-icon name="search_off" size="64px" color="grey-7" />
        <h2 class="imago-empty-heading q-mt-md">没有找到匹配的项目</h2>
        <p class="imago-empty-desc">尝试其他关键词</p>
      </div>
    </div>

    <!-- Grid -->
    <div v-else class="projects-grid">
      <div
        v-for="(p, index) in filteredProjects"
        :key="p.id"
        class="project-card-wrap"
        @click="$router.push(`/projects/${p.id}`)"
      >
        <div class="project-card" :class="{ 'project-card--active': index === 0 && !searchQuery }">
          <!-- Image grid -->
          <div class="project-card__images">
            <div
              v-for="i in 4"
              :key="i"
              class="project-thumb"
              :style="thumbStyle(p.id, index, i)"
            />
          </div>

          <!-- Info -->
          <div class="project-card__info">
            <div class="project-card__title ellipsis">{{ projectName(p) }}</div>
            <div class="project-card__desc">{{ p.description || '暂无描述，点击进入项目开始创建内容。' }}</div>

            <div class="project-card__meta row items-center no-wrap">
              <OiIcon name="chat" size="14px" class="meta-icon q-mr-xs" />
              <span>会话数量</span>
              <span class="meta-val q-mr-sm">{{ sessionCount(p, index) }}</span>
              <span class="meta-divider">|</span>
              <OiIcon name="clock" size="15px" class="meta-icon q-ml-sm q-mr-xs" />
              <span>最近活跃</span>
              <span class="meta-val">{{ formatRelative(p.updatedAt || p.createdAt) }}</span>
              <q-space />
              <q-btn
                flat dense round
                size="xs"
                class="project-menu-btn"
                @click.stop
              >
                <OiIcon name="more" size="18px" />
              </q-btn>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Dialog -->
    <q-dialog v-model="showCreate">
      <q-card class="imago-dialog-glass project-dialog">
        <q-card-section>
          <div class="text-h6">新建项目</div>
        </q-card-section>
        <q-card-section>
          <q-input v-model="newProject.name" label="项目名称" outlined dark dense autofocus :rules="[(v: string) => !!v || '必填']" />
          <q-input v-model="newProject.description" label="描述（可选）" outlined dark dense class="q-mt-sm" type="textarea" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="取消" v-close-popup />
          <q-btn label="创建" color="primary" @click="handleCreate" :loading="creating" unelevated />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectsStore } from 'src/stores/projects'
import OiIcon from 'src/components/ui/OiIcon.vue'
import type { OpenimagoProject } from 'src/api/client'

const router = useRouter()
const store = useProjectsStore()
const showCreate = ref(false)
const creating = ref(false)
const searchQuery = ref('')
const newProject = reactive({ name: '', description: '' })

const filteredProjects = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return store.projects
  return store.projects.filter((p) =>
    p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)
  )
})

onMounted(() => {
  void store.fetchAll()
})

async function handleCreate() {
  if (!newProject.name) return
  creating.value = true
  try {
    const p = await store.create(newProject)
    showCreate.value = false
    newProject.name = ''
    newProject.description = ''
    void router.push(`/projects/${p.id}`)
  } finally {
    creating.value = false
  }
}

function projectName(project: OpenimagoProject) {
  return project.name || project.directory?.split('/').filter(Boolean).pop() || '未命名项目'
}

function sessionCount(project: OpenimagoProject, index: number) {
  return (project.id.charCodeAt(0) + index * 7) % 30 + 12
}

// Deterministic gradient palette for placeholder thumbnails
const THUMB_PALETTES = [
  ['#0d1b4b', '#1a3a6b', '#0b2d6e', '#162555'],  // deep blue
  ['#1a0d2e', '#2d1155', '#1e0d40', '#150a33'],  // deep purple
  ['#0d2b1a', '#0f3d22', '#0a2518', '#112e1e'],  // dark green
  ['#2b1a0d', '#3d220f', '#2e1708', '#2a1609'],  // dark amber
]

function thumbStyle(id: string, cardIndex: number, thumbIndex: number): Record<string, string> {
  const seed = id.charCodeAt(0) + thumbIndex
  const palette = THUMB_PALETTES[(cardIndex + thumbIndex) % THUMB_PALETTES.length]!
  const c1 = palette[(seed) % palette.length]!
  const c2 = palette[(seed + 1) % palette.length]!
  const angle = ((seed * 37) % 360)
  return {
    background: `linear-gradient(${angle}deg, ${c1}, ${c2})`,
  }
}

function formatRelative(value?: string): string {
  if (!value) return '未知'
  const diff = Date.now() - new Date(value).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const d = Math.floor(hr / 24)
  if (d < 30) return `${d} 天前`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo} 个月前`
  return `${Math.floor(mo / 12)} 年前`
}
</script>

<style scoped>
/* ── Page ──────────────────────────────────────────────────────── */
.projects-page {
  position: relative;
  min-height: calc(100vh - 86px);
  padding: 24px 32px 48px;
  overflow: hidden;
  background: var(--imago-bg-void);
}

.projects-page::before {
  position: absolute;
  inset: 0;
  pointer-events: none;
  content: '';
  background:
    radial-gradient(ellipse 80% 60% at 30% 20%, var(--imago-cyan-04) 0%, transparent 60%),
    radial-gradient(ellipse 60% 80% at 70% 80%, rgba(168, 85, 247, 0.04) 0%, transparent 60%),
    radial-gradient(ellipse 40% 40% at 50% 50%, rgba(255, 45, 149, 0.02) 0%, transparent 70%);
}

/* ── Header ────────────────────────────────────────────────────── */
.projects-header {
  position: relative;
  z-index: 1;
  margin-bottom: 28px;
  gap: 16px;
}

.projects-title {
  margin: 0;
  font-size: 28px;
  font-weight: 650;
  color: var(--imago-text-primary);
  letter-spacing: -0.02em;
  white-space: nowrap;
  line-height: 1;
}

.projects-search {
  width: 280px;
  flex-shrink: 0;
}

.projects-search :deep(.q-field__control) {
  border-radius: 9px;
  background: var(--imago-bg-void);
  border: 1px solid var(--imago-border-dim);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 1%);
  height: 48px;
  padding: 0 14px;
}

.projects-search :deep(.q-field__control:hover) {
  border-color: var(--imago-border-dim);
}

.projects-search :deep(.q-field__marginal) {
  height: 48px;
  color: var(--imago-text-muted);
}

.projects-search :deep(.q-field__native) {
  color: var(--imago-text-secondary);
  font-size: 14px;
}

.projects-search :deep(.q-field__native::placeholder) {
  color: var(--imago-text-dim);
  opacity: 1;
}

.search-icon {
  color: var(--imago-text-muted);
}

.create-btn {
  height: 40px;
  min-width: 132px;
  font-size: 13px;
  border-radius: var(--imago-radius-md);
  white-space: nowrap;
  flex-shrink: 0;
  color: var(--imago-text-secondary);
  background: linear-gradient(180deg, rgb(0 240 255 / 18%), rgb(0 174 215 / 12%));
  border: 1px solid var(--imago-neon-cyan);
  box-shadow: 0 0 18px rgb(0 221 255 / 34%), inset 0 0 16px rgb(0 221 255 / 10%);
}

.create-btn :deep(.q-btn__content) {
  gap: 8px;
}

.btn-icon {
  color: currentColor;
}

/* ── Loading / Empty ───────────────────────────────────────────── */
.projects-loading,
.empty-state {
  position: relative;
  z-index: 1;
  min-height: calc(100vh - 220px);
}

.empty-content {
  margin-top: -28px;
  color: var(--imago-text-muted);
}

.empty-create {
  min-width: 185px;
}

/* ── Grid ──────────────────────────────────────────────────────── */
.projects-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px 18px;
}

/* ── Card ──────────────────────────────────────────────────────── */
.project-card {
  border-radius: 9px;
  background: linear-gradient(180deg, var(--imago-bg-panel) 0%, var(--imago-bg-panel) 100%);
  border: 1px solid var(--imago-border-soft);
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 28px rgb(0 0 0 / 24%);
}

.project-card:hover {
  border-color: var(--imago-border-dim);
  box-shadow: 0 16px 42px rgb(0 0 0 / 34%);
  transform: translateY(-2px);
}

.project-card--active {
  border-color: var(--imago-neon-cyan);
  box-shadow: 0 0 0 1px rgb(0 234 255 / 42%), 0 0 24px rgb(0 234 255 / 26%), 0 16px 42px rgb(0 0 0 / 34%);
}

.project-card--active:hover {
  border-color: var(--imago-neon-cyan);
}

/* ── Image grid ────────────────────────────────────────────────── */
.project-card__images {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  aspect-ratio: 16 / 9;
  gap: 2px;
  padding: 9px 9px 0;
  background: var(--imago-bg-code);
}

.project-thumb {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 7px;
  transition: filter 0.2s;
}

.project-thumb::before {
  position: absolute;
  inset: -20%;
  content: '';
  background:
    radial-gradient(circle at 30% 22%, rgb(255 255 255 / 22%), transparent 14%),
    radial-gradient(circle at 70% 68%, rgb(0 240 255 / 30%), transparent 20%),
    linear-gradient(135deg, transparent 35%, rgb(255 255 255 / 10%) 48%, transparent 62%);
  mix-blend-mode: screen;
  opacity: 0.72;
}

.project-card:hover .project-thumb {
  filter: brightness(1.1);
}

/* ── Card info ─────────────────────────────────────────────────── */
.project-card__info {
  padding: 13px 16px 11px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.project-card__title {
  font-size: 17px;
  font-weight: 600;
  color: var(--imago-text-primary);
  line-height: 1.3;
}

.project-card__desc {
  font-size: 13px;
  color: var(--imago-text-muted);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 38px;
}

.project-card__meta {
  font-size: 12px;
  color: var(--imago-text-muted);
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--imago-border-soft);
  gap: 4px;
}

.meta-icon {
  color: var(--imago-text-muted);
}

.meta-val {
  color: var(--imago-text-secondary);
  margin-left: 4px;
  font-weight: 500;
}

.meta-divider {
  color: var(--imago-border-dim);
  margin: 0 4px;
}

.project-menu-btn {
  color: var(--imago-text-secondary);
  opacity: 1;
  transition: opacity 0.2s;
}

.project-card:hover .project-menu-btn {
  opacity: 1;
}

/* ── Responsive ────────────────────────────────────────────────── */
@media (max-width: 1100px) {
  .projects-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .projects-search {
    width: 200px;
  }
}

@media (max-width: 680px) {
  .projects-page {
    padding: 16px 16px 32px;
  }

  .projects-grid {
    grid-template-columns: 1fr;
  }

  .projects-title {
    font-size: 20px;
  }

  .projects-search {
    display: none;
  }
}
</style>
