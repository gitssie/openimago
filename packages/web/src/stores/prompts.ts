import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from 'src/api/client'
import type { PromptTemplate } from 'src/api/client'

export const usePromptsStore = defineStore('prompts', () => {
  const templates = ref<PromptTemplate[]>([])
  const loading = ref(false)

  async function fetchAll() {
    loading.value = true
    try { templates.value = await api.listPrompts() } finally { loading.value = false }
  }
  async function create(data: { title: string; content: string; tags?: string[] }) {
    const p = await api.createPrompt(data)
    templates.value.unshift(p)
    return p
  }
  async function update(id: string, data: Partial<PromptTemplate>) {
    await api.updatePrompt(id, data)
    await fetchAll()
  }
  async function remove(id: string) {
    await api.deletePrompt(id)
    templates.value = templates.value.filter((t) => t.id !== id)
  }
  return { templates, loading, fetchAll, create, update, remove }
})
