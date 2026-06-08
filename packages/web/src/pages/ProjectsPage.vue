<template>
  <PageShell>
    <PageHeader
      title="我的项目"
      subtitle="管理 AI 创作工作流，跨会话复用项目上下文"
      v-model:search="searchQuery"
      search-placeholder="搜索项目名称或描述"
      create-label="新建项目"
      @create="showCreate = true"
    />

    <!-- Loading -->
    <PageLoading v-if="store.loading" />

    <!-- Empty state (no projects) -->
    <PageEmpty
      v-else-if="filteredProjects.length === 0 && store.projects.length === 0"
      icon="folder_open"
      title="还没有项目，创建第一个吧"
      description="点击下面的按钮开始创建属于你的项目"
      action-label="新建项目"
      @action="showCreate = true"
    />

    <!-- No search results -->
    <PageEmpty
      v-else-if="filteredProjects.length === 0"
      icon="search_off"
      title="没有找到匹配的项目"
      description="尝试其他关键词"
    />

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
              <span class="meta-val q-mr-sm">{{ p.sessionCount ?? 0 }}</span>
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
  </PageShell>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectsStore } from 'src/stores/projects'
import OiIcon from 'src/components/ui/OiIcon.vue'
import PageShell from 'src/components/page/PageShell.vue'
import PageHeader from 'src/components/page/PageHeader.vue'
import PageEmpty from 'src/components/page/PageEmpty.vue'
import PageLoading from 'src/components/page/PageLoading.vue'
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
    p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q),
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
/* ── Grid ─────────────────────────────────────────────────────────── */
.projects-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

@media (max-width: 1024px) { .projects-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px)  { .projects-grid { grid-template-columns: 1fr; } }

.project-card-wrap {
  cursor: pointer;
  transition: transform var(--imago-ease-smooth);
}

.project-card-wrap:hover { transform: translateY(-2px); }

/* ── Card ─────────────────────────────────────────────────────────── */
.project-card {
  position: relative;
  border: 1px solid var(--imago-border-light);
  border-radius: var(--imago-radius-md);
  overflow: hidden;
  background: var(--imago-bg-surface);
  transition:
    border-color var(--imago-ease-smooth),
    box-shadow var(--imago-ease-smooth);
}

.project-card:hover {
  border-color: var(--imago-border-cyan-active);
  box-shadow: 0 0 24px rgba(0, 240, 255, 0.18);
}

.project-card--active {
  border-color: var(--imago-neon-cyan);
  box-shadow: 0 0 24px rgba(0, 240, 255, 0.30);
}

/* Image grid (2x2 thumbnails) */
.project-card__images {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  aspect-ratio: 16 / 9;
  background: var(--imago-bg-deep);
}

.project-thumb {
  width: 100%;
  height: 100%;
  position: relative;
}

.project-thumb:nth-child(2),
.project-thumb:nth-child(3) {
  border-top: 0;
  border-left: 0;
}

/* Info */
.project-card__info {
  padding: 14px 16px 12px;
}

.project-card__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--imago-text-primary);
  margin-bottom: 4px;
}

.project-card__desc {
  font-size: 12.5px;
  color: var(--imago-text-dim);
  line-height: 1.5;
  min-height: 36px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 12px;
}

/* Meta */
.project-card__meta {
  font-size: 11.5px;
  color: var(--imago-text-dim);
  padding-top: 10px;
  border-top: 1px solid var(--imago-border-ghost);
}

.meta-icon { color: var(--imago-text-muted); }
.meta-val { color: var(--imago-text-secondary); font-weight: 500; }
.meta-divider {
  margin: 0 8px;
  color: var(--imago-text-faint);
}
.project-menu-btn { color: var(--imago-text-muted); }
.project-menu-btn:hover { color: var(--imago-text-primary); }

/* Dialog */
.project-dialog {
  min-width: 360px;
  max-width: 480px;
}
</style>
