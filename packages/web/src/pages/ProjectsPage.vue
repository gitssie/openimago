<template>
  <q-page class="projects-page">
    <div class="projects-actions row justify-end">
      <q-btn label="新建项目" icon="add" class="create-btn" @click="showCreate = true" unelevated no-caps />
    </div>

    <div v-if="store.loading" class="projects-loading flex flex-center">
      <q-spinner color="primary" size="3em" />
    </div>

    <div v-else-if="store.projects.length === 0" class="empty-state flex flex-center">
      <div class="empty-content text-center">
        <div class="empty-folder" aria-hidden="true">
          <div class="empty-folder__back" />
          <div class="empty-folder__front" />
        </div>
        <h2>还没有项目，创建第一个吧</h2>
        <p>点击下面的按钮开始创建属于你的项目</p>
        <q-btn label="新建项目" icon="add" class="create-btn empty-create" @click="showCreate = true" unelevated no-caps />
      </div>
    </div>

    <div v-else class="projects-grid">
      <div v-for="(p, index) in store.projects" :key="p.id" class="project-card-wrap">
        <q-card class="project-card cursor-pointer" :class="{ 'project-card--featured': index === 0 }" @click="$router.push(`/projects/${p.id}`)">
          <q-btn flat dense round icon="more_horiz" class="project-menu" @click.stop />

          <q-card-section class="project-card__body">
            <div class="row items-start justify-between no-wrap">
              <div class="project-icon" :class="index % 3 === 1 ? 'project-icon--cyan' : index % 3 === 2 ? 'project-icon--blue' : 'project-icon--violet'">
                <q-icon name="folder" />
              </div>
              <q-badge class="status-badge">
                <span class="status-dot" /> 活跃
              </q-badge>
            </div>

            <div class="project-title ellipsis">{{ projectName(p) }}</div>
            <div class="project-desc">{{ p.description || '暂无描述，点击进入项目开始创建内容。' }}</div>

            <q-separator dark class="project-separator" />

            <div class="project-meta row items-center no-wrap">
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
      <q-card class="project-dialog">
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
  return project.name || project.fullPath?.split('/').filter(Boolean).pop() || '未命名项目'
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
  color: #021018;
  background: linear-gradient(90deg, #22f2ff, #18d9ee);
  border-radius: 11px;
  box-shadow: 0 0 22px rgb(24 229 255 / 46%);
  font-size: 15px;
  font-weight: 700;
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

.empty-content h2 {
  margin: 28px 0 8px;
  color: #bfc5d3;
  font-size: 28px;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.empty-content p {
  margin: 0 0 34px;
  color: #8f96aa;
  font-size: 17px;
}

.empty-folder {
  position: relative;
  width: 220px;
  height: 174px;
  margin: 0 auto;
  filter: drop-shadow(0 24px 35px rgb(0 180 255 / 24%));
}

.empty-folder__back,
.empty-folder__front {
  position: absolute;
  border: 1px solid rgb(126 192 255 / 72%);
  background: linear-gradient(145deg, rgb(96 164 255 / 30%), rgb(33 116 202 / 16%));
  box-shadow: inset 0 0 34px rgb(134 197 255 / 20%), 0 0 32px rgb(0 189 255 / 20%);
}

.empty-folder__back {
  top: 35px;
  left: 38px;
  width: 190px;
  height: 122px;
  border-radius: 12px 18px 18px 18px;
  transform: translate(26px, -14px);
  opacity: 0.55;
}

.empty-folder__front {
  right: 28px;
  bottom: 14px;
  left: 28px;
  height: 138px;
  border-radius: 16px 16px 18px 18px;
}

.empty-folder__front::before {
  position: absolute;
  top: -46px;
  left: 13px;
  width: 95px;
  height: 52px;
  content: '';
  background: inherit;
  border: inherit;
  border-bottom: 0;
  border-radius: 15px 28px 0 0;
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
  position: relative;
  width: 360px;
  height: 232px;
  overflow: hidden;
  color: #e7ecf7;
  background: linear-gradient(145deg, rgb(7 13 30 / 78%), rgb(5 7 18 / 76%));
  border: 1px solid rgb(134 162 204 / 32%);
  border-radius: 12px;
  box-shadow: inset 0 0 40px rgb(63 123 255 / 5%);
  backdrop-filter: blur(18px);
}

.project-card--featured {
  border-color: #17efff;
  box-shadow: 0 0 26px rgb(23 239 255 / 18%), inset 0 0 42px rgb(0 225 255 / 8%);
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

.project-icon {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  color: #b76cff;
  background: rgb(139 64 255 / 16%);
  border: 1px solid rgb(145 78 255 / 70%);
  border-radius: 14px;
  box-shadow: inset 0 0 22px rgb(145 78 255 / 14%);
}

.project-icon--cyan {
  color: #38f0ff;
  background: rgb(30 219 255 / 15%);
  border-color: rgb(30 219 255 / 58%);
}

.project-icon--blue {
  color: #6a9cff;
  background: rgb(67 112 255 / 16%);
  border-color: rgb(67 112 255 / 62%);
}

.project-icon :deep(.q-icon) {
  font-size: 29px;
}

.status-badge {
  height: 28px;
  padding: 0 10px;
  color: #41ff70;
  background: rgb(20 142 63 / 20%);
  border: 1px solid rgb(46 255 108 / 18%);
  border-radius: 11px;
  font-size: 13px;
  font-weight: 700;
}

.status-dot {
  width: 8px;
  height: 8px;
  margin-right: 7px;
  display: inline-block;
  background: #28ff65;
  border-radius: 50%;
  box-shadow: 0 0 12px rgb(40 255 101 / 72%);
}

.project-title {
  margin-top: 16px;
  color: #e7ecf7;
  font-size: 21px;
  font-weight: 700;
}

.project-desc {
  height: 48px;
  margin-top: 8px;
  overflow: hidden;
  color: #aab1c1;
  font-size: 14px;
  line-height: 1.62;
}

.project-separator {
  margin: 15px 0 10px;
  background: rgb(151 168 203 / 18%);
}

.project-meta {
  gap: 14px;
  color: #aab1c1;
  font-size: 12px;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.project-dialog {
  min-width: 400px;
  color: #e7ecf7;
  background: rgb(7 13 30 / 92%);
  border: 1px solid rgb(23 239 255 / 35%);
  border-radius: 16px;
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
