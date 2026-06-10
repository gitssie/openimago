<template>
  <router-view />
  <AuthDialog
    v-if="auth.showReauthDialog && route.path !== '/auth'"
    v-model="auth.showReauthDialog"
    :dismissible="true"
    :loading="reauthLoading"
    :error="reauthError"
    @login="onReauthLogin"
    @register="onReauthRegister"
  />
  <UnverifiedEmailDialog
    v-if="auth.showUnverifiedEmailDialog && auth.user?.email"
    v-model="auth.showUnverifiedEmailDialog"
    :phase="auth.unverifiedEmailPhase"
    :email="auth.user.email"
    :error-message="auth.unverifiedEmailError"
    :resend-cooldown-seconds="auth.unverifiedEmailCooldownSeconds"
    @send-code="onSendUnverifiedEmailCode"
    @resend-code="onSendUnverifiedEmailCode"
    @verify="onVerifyUnverifiedEmail"
    @sign-out="onSignOutUnverifiedEmail"
    @enter-app="onEnterVerifiedApp"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from 'stores/auth'
import { appEventBus } from 'src/utils/app-events'
import AuthDialog from 'components/auth/AuthDialog.vue'
import UnverifiedEmailDialog, { type VerifyEmailPayload } from 'components/auth/UnverifiedEmailDialog.vue'
import type { LoginPayload, RegisterPayload } from 'components/auth/AuthPanel.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const reauthLoading = ref(false)
const reauthError = ref('')

async function onReauthLogin(payload: LoginPayload) {
  reauthLoading.value = true
  reauthError.value = ''
  try {
    await auth.login(payload.email, payload.password)
    if (auth.canAccessApp) appEventBus.emit('auth:reauthenticated')
  } catch (e: unknown) {
    reauthError.value = e instanceof Error ? e.message : '登录失败'
  } finally {
    reauthLoading.value = false
  }
}

async function onReauthRegister(payload: RegisterPayload) {
  reauthLoading.value = true
  reauthError.value = ''
  try {
    await auth.register(payload.username, payload.email, payload.password, payload.verificationCode)
    if (auth.canAccessApp) appEventBus.emit('auth:reauthenticated')
  } catch (e: unknown) {
    reauthError.value = e instanceof Error ? e.message : '注册失败'
  } finally {
    reauthLoading.value = false
  }
}

async function onSendUnverifiedEmailCode() {
  try {
    await auth.sendUnverifiedEmailVerification()
  } catch (e: unknown) {
    void e
    // Store owns user-facing error state for the dialog.
  }
}

async function onVerifyUnverifiedEmail(payload: VerifyEmailPayload) {
  try {
    await auth.verifyUnverifiedEmail(payload.code)
  } catch (e: unknown) {
    void e
    // Store owns user-facing error state for the dialog.
  }
}

function onSignOutUnverifiedEmail() {
  auth.clearAuth()
  void router.push('/auth')
}

function onEnterVerifiedApp() {
  auth.dismissEmailVerification()
  void router.push('/')
}
</script>
