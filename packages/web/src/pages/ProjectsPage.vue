<template>
  <q-page padding>
    <div class="row items-center q-mb-lg">
      <h4 class="neon-text-cyan q-my-none">项目</h4>
      <q-space />
      <q-btn label="新建项目" icon="add" color="primary" @click="showCreate = true" unelevated rounded />
    </div>

    <div v-if="store.loading" class="flex flex-center q-pa-xl">
      <q-spinner color="primary" size="3em" />
    </div>

    <div v-else-if="store.projects.length === 0" class="flex flex-center q-pa-xl">
      <div class="text-center text-grey-5">
        <q-icon name="folder_open" size="4em" />
        <p>还没有项目，创建第一个吧</p>
      </div>
    </div>

    <div v-else class="row q-col-gutter-md">
      <div v-for="p in store.projects" :key="p.id" class="col-12 col-sm-6 col-md-4">
        <q-card class="neon-card cursor-pointer" @click="$router.push(`/projects/${p.id}`)">
          <q-card-section>
            <div class="text-h6">{{ p.name || p.fullPath?.split('/').pop() }}</div>
            <div class="text-caption text-grey-5">{{ p.description || '暂无描述' }}</div>
          </q-card-section>
          <q-card-section>
            <q-badge :color="p.status === 'active' ? 'positive' : 'grey'">
              {{ p.status || 'active' }}
            </q-badge>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Create Dialog -->
    <q-dialog v-model="showCreate">
      <q-card class="neon-card" style="min-width: 400px">
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
</script>
