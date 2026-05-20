<template>
  <q-page padding>
    <div class="row items-center q-mb-lg">
      <h4 class="neon-text-cyan q-my-none">Prompt 模板</h4>
      <q-space />
      <q-btn label="新建模板" icon="add" color="primary" @click="openCreate" unelevated rounded />
    </div>

    <div v-if="store.loading" class="flex flex-center q-pa-xl"><q-spinner color="primary" size="3em" /></div>

    <div v-else-if="store.templates.length === 0" class="flex flex-center q-pa-xl text-grey-5">
      <div class="text-center"><q-icon name="auto_awesome" size="4em" /><p>还没有 Prompt 模板</p></div>
    </div>

    <div v-else class="row q-col-gutter-md">
      <div v-for="t in store.templates" :key="t.id" class="col-12 col-sm-6 col-md-4">
        <q-card class="neon-card">
          <q-card-section>
            <div class="text-h6">{{ t.title }}</div>
            <div class="text-body2 text-grey-4 q-mt-sm" style="white-space: pre-wrap">{{ t.content }}</div>
            <div v-if="t.tags?.length" class="q-mt-sm">
              <q-badge v-for="tag in t.tags" :key="tag" color="primary" class="q-mr-xs">{{ tag }}</q-badge>
            </div>
          </q-card-section>
          <q-card-actions align="right">
            <q-btn flat size="sm" icon="delete" color="negative" @click="store.remove(t.id)" />
          </q-card-actions>
        </q-card>
      </div>
    </div>

    <!-- Create Dialog -->
    <q-dialog v-model="showCreate">
      <q-card class="neon-card" style="min-width: 500px">
        <q-card-section><div class="text-h6">新建模板</div></q-card-section>
        <q-card-section class="q-gutter-y-md">
          <q-input v-model="form.title" label="标题" outlined dark dense :rules="[(v: string) => !!v || '必填']" />
          <q-input v-model="form.content" label="Prompt 内容" outlined dark dense type="textarea" rows="5" :rules="[(v: string) => !!v || '必填']" />
          <q-input v-model="form.tagsStr" label="标签（逗号分隔）" outlined dark dense />
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
import { usePromptsStore } from 'src/stores/prompts'
const store = usePromptsStore()
const showCreate = ref(false)
const creating = ref(false)
const form = reactive({ title: '', content: '', tagsStr: '' })

onMounted(() => store.fetchAll())

function openCreate() { form.title = ''; form.content = ''; form.tagsStr = ''; showCreate.value = true }

async function handleCreate() {
  if (!form.title || !form.content) return
  creating.value = true
  try {
    await store.create({ title: form.title, content: form.content, tags: form.tagsStr.split(',').map((t: string) => t.trim()).filter(Boolean) })
    showCreate.value = false
  } finally { creating.value = false }
}
</script>
