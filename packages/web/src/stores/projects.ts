import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from 'src/api/client'
import type { OpenimagoProject } from 'src/api/client'

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<OpenimagoProject[]>([])
  const loading = ref(false)

  async function fetchAll() {
    loading.value = true
    try {
      projects.value = await api.listProjects()
    } finally {
      loading.value = false
    }
  }

  async function create(data: { name: string; description?: string }) {
    const p = await api.createProject(data)
    projects.value.unshift(p)
    return p
  }

  async function update(id: string, data: Partial<OpenimagoProject>) {
    await api.updateProject(id, data)
    await fetchAll()
  }

  return { projects, loading, fetchAll, create, update }
})
