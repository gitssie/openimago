import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from 'src/api/client'
import type { OpenimagoUser } from 'src/api/client'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'))
  const user = ref<OpenimagoUser | null>(
    JSON.parse(localStorage.getItem('user') || 'null'),
  )
  const verified = ref(false)

  // ── Global reauth dialog state ──────────────────────────────────────
  const showReauthDialog = ref(false)
  const wasPreviouslyAuthenticated = ref(false)

  const isAuthenticated = computed(() => !!token.value)
  const isAdmin = computed(() => user.value?.role === 'admin')

  async function login(email: string, password: string) {
    const res = await api.login({ email, password })
    setAuth(res.token, res.user)
  }

  async function register(username: string, email: string, password: string, verificationCode: string) {
    const res = await api.register({ username, email, password, verificationCode })
    setAuth(res.token, res.user)
  }

  async function fetchMe() {
    if (!token.value) {
      verified.value = false
      return
    }
    try {
      const u = await api.me()
      user.value = u
      localStorage.setItem('user', JSON.stringify(u))
      verified.value = true
    } catch {
      clearAuth()
    }
  }

  function setAuth(t: string, u: OpenimagoUser) {
    token.value = t
    user.value = u
    verified.value = true
    wasPreviouslyAuthenticated.value = false
    showReauthDialog.value = false
    localStorage.setItem('token', t)
    localStorage.setItem('user', JSON.stringify(u))
  }

  function clearAuth() {
    if (token.value) {
      wasPreviouslyAuthenticated.value = true
    }
    token.value = null
    user.value = null
    verified.value = false
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  function requestReauth() {
    showReauthDialog.value = true
  }

  function dismissReauth() {
    showReauthDialog.value = false
  }

  return {
    token, user, verified, isAuthenticated, isAdmin,
    showReauthDialog, wasPreviouslyAuthenticated,
    login, register, fetchMe, setAuth, clearAuth,
    requestReauth, dismissReauth,
  }
})
