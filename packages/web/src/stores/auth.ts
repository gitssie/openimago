import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from 'src/api/client'
import type { OpenimagoUser } from 'src/api/client'

export type UnverifiedEmailPhase = 'notice' | 'sending' | 'input' | 'verifying' | 'success'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'))
  const user = ref<OpenimagoUser | null>(
    JSON.parse(localStorage.getItem('user') || 'null'),
  )
  const verified = ref(false)

  // ── Required email verification dialog state ───────────────────────
  const showUnverifiedEmailDialog = ref(false)
  const unverifiedEmailPhase = ref<UnverifiedEmailPhase>('notice')
  const unverifiedEmailError = ref('')
  const unverifiedEmailCooldownSeconds = ref(0)

  // ── Global reauth dialog state ──────────────────────────────────────
  const showReauthDialog = ref(false)
  const wasPreviouslyAuthenticated = ref(false)

  const isAuthenticated = computed(() => !!token.value)
  const isEmailVerified = computed(() => user.value?.emailVerified === true)
  const canAccessApp = computed(() => isAuthenticated.value && isEmailVerified.value)
  const isAdmin = computed(() => user.value?.role === 'admin')

  async function login(email: string, password: string) {
    const res = await api.login({ email, password })
    setAuth(res.token, res.user)
    if (res.requiresEmailVerification || res.user.emailVerified !== true) {
      requestEmailVerification()
    }
  }

  async function register(email: string, password: string) {
    // UI contract: email + password only at submit. No username, no inline
    // verification code. The dependent task (openimago-cgh) wires the new
    // registration backend flow + triggers UnverifiedEmailDialog when the
    // returned user is unverified.
    const res = await api.register({ email, password })
    setAuth(res.token, res.user)
    if (res.requiresEmailVerification || res.user.emailVerified !== true) {
      requestEmailVerification()
      if (res.verificationCodeSent) {
        unverifiedEmailPhase.value = 'input'
        unverifiedEmailCooldownSeconds.value = 60
      }
    }
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
      if (u.emailVerified !== true) {
        requestEmailVerification()
      }
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
    if (u.emailVerified === true) dismissEmailVerification()
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
    dismissEmailVerification()
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  function requestReauth() {
    showReauthDialog.value = true
  }

  function dismissReauth() {
    showReauthDialog.value = false
  }

  function requestEmailVerification() {
    showUnverifiedEmailDialog.value = true
    unverifiedEmailPhase.value = 'notice'
    unverifiedEmailError.value = ''
    unverifiedEmailCooldownSeconds.value = 0
  }

  function dismissEmailVerification() {
    showUnverifiedEmailDialog.value = false
    unverifiedEmailPhase.value = 'notice'
    unverifiedEmailError.value = ''
    unverifiedEmailCooldownSeconds.value = 0
  }

  function setUnverifiedEmailPhase(phase: UnverifiedEmailPhase) {
    unverifiedEmailPhase.value = phase
  }

  async function sendUnverifiedEmailVerification() {
    if (!user.value?.email) throw new Error('当前账号没有可验证邮箱')
    unverifiedEmailPhase.value = 'sending'
    unverifiedEmailError.value = ''
    try {
      await api.sendEmailVerification(user.value.email)
      unverifiedEmailCooldownSeconds.value = 60
      unverifiedEmailPhase.value = 'input'
    } catch (e: unknown) {
      unverifiedEmailError.value = e instanceof Error ? e.message : '发送验证码失败'
      if (unverifiedEmailError.value.includes('wait') || unverifiedEmailError.value.includes('稍后')) {
        unverifiedEmailCooldownSeconds.value = 60
        unverifiedEmailPhase.value = 'input'
      } else {
        unverifiedEmailPhase.value = 'notice'
      }
      throw e
    }
  }

  async function verifyUnverifiedEmail(code: string) {
    unverifiedEmailPhase.value = 'verifying'
    unverifiedEmailError.value = ''
    try {
      const res = await api.verifyEmail(code)
      user.value = res.user
      localStorage.setItem('user', JSON.stringify(res.user))
      verified.value = true
      unverifiedEmailPhase.value = 'success'
    } catch (e: unknown) {
      unverifiedEmailError.value = e instanceof Error ? e.message : '验证码验证失败'
      unverifiedEmailPhase.value = 'input'
      throw e
    }
  }

  return {
    token, user, verified, isAuthenticated, isEmailVerified, canAccessApp, isAdmin,
    showReauthDialog, wasPreviouslyAuthenticated,
    showUnverifiedEmailDialog, unverifiedEmailPhase, unverifiedEmailError, unverifiedEmailCooldownSeconds,
    login, register, fetchMe, setAuth, clearAuth,
    requestReauth, dismissReauth,
    requestEmailVerification, dismissEmailVerification, setUnverifiedEmailPhase,
    sendUnverifiedEmailVerification, verifyUnverifiedEmail,
  }
})
