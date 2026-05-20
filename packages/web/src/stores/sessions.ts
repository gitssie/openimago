import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, type SessionInfo } from 'src/api/client'

export const useSessionsStore = defineStore('sessions', () => {
  const sessions = ref<SessionInfo[]>([])
  const loading = ref(false)

  async function fetchAll() {
    loading.value = true
    try { sessions.value = await api.listSessions() } finally { loading.value = false }
  }

  async function create() {
    const s = await api.createSession({})
    if (s) sessions.value.unshift(s)
    return s
  }

  return { sessions, loading, fetchAll, create }
})
