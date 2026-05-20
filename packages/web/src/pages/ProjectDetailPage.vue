<template>
  <q-page padding>
    <q-btn flat icon="arrow_back" label="返回" @click="$router.push('/projects')" class="q-mb-md" />

    <div v-if="loading" class="flex flex-center q-pa-xl">
      <q-spinner color="primary" size="3em" />
    </div>

    <div v-else>
      <h4 class="neon-text-cyan q-my-none">{{ project?.name || '项目详情' }}</h4>
      <p class="text-grey-5">ID: {{ $route.params.id }}</p>

      <q-separator class="q-my-lg" />

      <!-- Sessions -->
      <div class="row items-center q-mb-md">
        <h5 class="q-my-none">会话</h5>
        <q-space />
        <q-btn label="新建会话" icon="add" color="primary" @click="createSession" unelevated rounded />
      </div>

      <div v-if="sessions.length === 0" class="text-center text-grey-5 q-pa-xl">
        <q-icon name="chat" size="3em" />
        <p>还没有会话</p>
      </div>

      <q-list v-else bordered separator class="rounded-borders">
        <q-item v-for="s in sessions" :key="s.id" clickable @click="$router.push(`/sessions/${s.id}`)">
          <q-item-section avatar>
            <q-icon name="chat" color="primary" />
          </q-item-section>
          <q-item-section>
            <q-item-label>{{ s.title || s.id }}</q-item-label>
              <q-item-label caption>{{ formatTime(s.time) }}</q-item-label>
          </q-item-section>
        </q-item>
      </q-list>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { api, type SessionInfo } from 'src/api/client'
import type { OpenimagoProject } from 'src/api/client'

const route = useRoute()
const project = ref<OpenimagoProject>()
const sessions = ref<SessionInfo[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    const [projects, sessionList] = await Promise.all([
      api.listProjects(),
      api.listSessions(),
    ])
    project.value = projects.find((p) => p.id === route.params.id)
    sessions.value = sessionList.filter(
      (s) => s.projectId === route.params.id || s.projectID === route.params.id,
    )
  } finally {
    loading.value = false
  }
})

async function createSession() {
  const s = await api.createSession({ projectId: route.params.id as string })
  if (s) window.location.href = `/sessions/${String(s.id)}`
}

function formatTime(t?: { created?: number }): string {
  if (!t?.created) return ''
  try { return new Date(t.created).toLocaleDateString('zh-CN') } catch { return String(t.created) }
}
</script>
