import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from 'src/api/client'
import type { Skill } from 'src/api/client'

// User-level skill library (openimago-680i, USER-scoped /api/platform/skills).
// Mirrors usePromptsStore, but skills are keyed by `name` (the backend's
// unique (userId, name)), so update/remove take a name rather than an id.
export const useSkillsStore = defineStore('skills', () => {
  const skills = ref<Skill[]>([])
  const loading = ref(false)

  async function fetchAll() {
    loading.value = true
    try { skills.value = await api.listSkills() } finally { loading.value = false }
  }
  async function create(data: { name: string; description: string; content: string }) {
    const s = await api.createSkill(data)
    skills.value.unshift(s)
    return s
  }
  async function update(name: string, data: { description?: string; content?: string }) {
    await api.updateSkill(name, data)
    await fetchAll()
  }
  async function remove(name: string) {
    await api.deleteSkill(name)
    skills.value = skills.value.filter((s) => s.name !== name)
  }
  return { skills, loading, fetchAll, create, update, remove }
})
