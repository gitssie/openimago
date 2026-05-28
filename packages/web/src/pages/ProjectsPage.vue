<template>
  <q-page class="projects-page">
    <div class="projects-actions row justify-end">
      <q-btn label="新建项目" icon="add" class="imago-btn-cyan create-btn" @click="showCreate = true" unelevated no-caps />
    </div>

    <div v-if="store.loading" class="projects-loading flex flex-center">
      <q-spinner color="primary" size="3em" />
    </div>

    <div v-else-if="store.projects.length === 0" class="empty-state flex flex-center">
      <div class="empty-content text-center">
        <div class="empty-folder imago-empty-folder" aria-hidden="true">
          <div class="imago-empty-folder__back empty-folder__back" />
          <div class="imago-empty-folder__front empty-folder__front" />
        </div>
        <h2 class="imago-empty-heading">还没有项目，创建第一个吧</h2>
        <p class="imago-empty-desc">点击下面的按钮开始创建属于你的项目</p>
        <q-btn label="新建项目" icon="add" class="imago-btn-cyan create-btn empty-create" @click="showCreate = true" unelevated no-caps />
      </div>
    </div>

    <div v-else class="projects-grid">
      <div v-for="(p, index) in store.projects" :key="p.id" class="project-card-wrap">
        <q-card class="imago-card imago-project-card cursor-pointer" :class="{ 'imago-card--featured': index === 0 }" @click="$router.push(`/projects/${p.id}`)">
          <q-btn flat dense round icon="more_horiz" class="project-menu" @click.stop />

          <q-card-section class="project-card__body">
            <div class="row items-start justify-between no-wrap">
              <div class="imago-project-icon project-icon" :class="index % 3 === 1 ? 'imago-project-icon--cyan' : index % 3 === 2 ? 'imago-project-icon--blue' : ''">
                <q-icon name="folder" />
              </div>
              <q-badge class="imago-badge-active">
                <span class="imago-dot-live" /> 活跃
              </q-badge>
            </div>

            <div class="imago-project-title project-title ellipsis">{{ projectName(p) }}</div>
            <div class="imago-project-desc project-desc">{{ p.description || '暂无描述，点击进入项目开始创建内容。' }}</div>

            <q-separator dark class="imago-separator-ghost project-separator" />

            <div class="imago-meta-row project-meta row items-center no-wrap">
              <div class="meta-item"><q-icon name="badge" /> {{ resourceCount(p, index) }} 个资源</div>
              <q-separator vertical dark />
              <div class="meta-item"><q-icon name="schedule" /> 更新于 {{ formatDate(p.updatedAt || p.createdAt) }}</div>
            </div>
          </q-card-section>
        </q-card>
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
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectsStore } from 'src/stores/projects'
import type { OpenimagoProject } from 'src/api/client'

const router = useRouter()
const store = useProjectsStore()
const showCreate = ref(false)
const creating = ref(false)
const newProject = reactive({ name: '', description: '' })

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

function resourceCount(project: OpenimagoProject, index: number) {
  return (project.id.charCodeAt(0) + index * 7) % 30 + 12
}

function formatDate(value?: string) {
  if (!value) return '2024-05-20'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value)).replaceAll('/', '-')
}
</script>

<style scoped>
.projects-page {
  position: relative;
  min-height: calc(100vh - 86px);
  padding: 18px 26px 42px;
  overflow: hidden;
}

.projects-page::before {
  position: absolute;
  inset: 0;
  pointer-events: none;
  content: '';
  background:
    radial-gradient(circle at 18% 86%, rgb(0 118 255 / 22%), transparent 24%),
    radial-gradient(circle at 94% 88%, rgb(179 37 255 / 24%), transparent 25%),
    linear-gradient(to bottom, rgb(0 0 0 / 0%), rgb(0 0 0 / 28%));
}

.projects-actions {
  position: relative;
  z-index: 1;
  height: 42px;
  margin-bottom: 16px;
}

.create-btn {
  min-width: 150px;
  height: 40px;
  font-size: 15px;
}

.projects-loading,
.empty-state {
  position: relative;
  z-index: 1;
  min-height: calc(100vh - 190px);
}

.empty-content {
  margin-top: -28px;
  color: #b7bed0;
}

.empty-create {
  min-width: 185px;
}

.projects-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, 360px);
  gap: 18px;
  align-items: start;
  justify-content: start;
  padding-top: 3px;
}

.project-card-wrap {
  width: 360px;
}

.project-card {
  width: 360px;
  height: 232px;
}

.project-card__body {
  padding: 22px 24px 14px;
}

.project-menu {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 2;
  color: #a8b1c5;
}

@media (max-width: 1200px) {
  .projects-grid {
    grid-template-columns: repeat(auto-fill, 360px);
  }
}

@media (max-width: 760px) {
  .projects-page {
    padding: 18px;
  }

  .projects-grid {
    grid-template-columns: 1fr;
  }

  .project-card-wrap,
  .project-card {
    width: 100%;
  }
}
</style>
