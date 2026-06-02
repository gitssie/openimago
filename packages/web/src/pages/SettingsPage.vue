<template>
  <PageShell>
    <PageHeader
      title="设置"
      subtitle="个人资料与工作空间偏好"
    />

    <q-card class="neon-card q-pa-md" style="max-width: 600px">
      <q-card-section>
        <div class="text-h6">个人设置</div>
      </q-card-section>
      <q-card-section class="q-gutter-y-md">
        <q-input v-model="form.displayName" label="昵称" outlined dark dense />
        <q-input v-model="form.email" label="邮箱" type="email" outlined dark dense />
        <div v-if="auth.user" class="text-caption text-grey-5">
          Workspace ID: {{ auth.user.id }}
        </div>
      </q-card-section>
      <q-card-actions>
        <q-btn label="保存" color="primary" @click="handleSave" :loading="saving" unelevated />
      </q-card-actions>
    </q-card>
  </PageShell>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useAuthStore } from 'src/stores/auth'
import { api } from 'src/api/client'
import PageShell from 'src/components/page/PageShell.vue'
import PageHeader from 'src/components/page/PageHeader.vue'

const auth = useAuthStore()
const saving = ref(false)
const form = reactive({ displayName: '', email: '' })

onMounted(() => {
  if (auth.user) {
    form.displayName = auth.user.username || ''
    form.email = auth.user.email || ''
  }
})

async function handleSave() {
  saving.value = true
  try {
    await api.updateMe({ displayName: form.displayName, email: form.email })
    await auth.fetchMe()
    alert('保存成功')
  } finally { saving.value = false }
}
</script>
