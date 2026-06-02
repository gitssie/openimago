<template>
  <PageShell>
    <PageHeader
      title="用户管理"
      subtitle="查看与调整系统用户的角色权限"
    />

    <q-table :rows="users" :columns="columns" row-key="id" :loading="loading" dark flat bordered
      :pagination="{ rowsPerPage: 20 }">
      <template #body-cell-role="props">
        <q-td :props="props">
          <q-select v-model="props.row.role" :options="['user', 'admin']" outlined dense dark
            @update:model-value="(v: string) => handleRoleChange(props.row.id, v)" />
        </q-td>
      </template>
    </q-table>
  </PageShell>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from 'src/api/client'
import type { OpenimagoUser } from 'src/api/client'
import PageShell from 'src/components/page/PageShell.vue'
import PageHeader from 'src/components/page/PageHeader.vue'

const users = ref<OpenimagoUser[]>([])
const loading = ref(false)
const columns = [
  { name: 'username', label: '用户名', field: 'username', align: 'left' as const },
  { name: 'email', label: '邮箱', field: 'email', align: 'left' as const },
  { name: 'role', label: '角色', field: 'role', align: 'left' as const },
  { name: 'createdAt', label: '注册时间', field: 'createdAt', align: 'left' as const },
]

onMounted(async () => {
  loading.value = true
  try { users.value = await api.listUsers() } finally { loading.value = false }
})

async function handleRoleChange(id: string, role: string) {
  await api.updateUserRole(id, role)
}
</script>
