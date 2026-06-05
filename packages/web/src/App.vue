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
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from 'stores/auth'
import { appEventBus } from 'src/utils/app-events'
import AuthDialog from 'components/auth/AuthDialog.vue'
import type { LoginPayload, RegisterPayload } from 'components/auth/AuthPanel.vue'

const route = useRoute()
const auth = useAuthStore()

const reauthLoading = ref(false)
const reauthError = ref('')

async function onReauthLogin(payload: LoginPayload) {
  reauthLoading.value = true
  reauthError.value = ''
  try {
    await auth.login(payload.email, payload.password)
    appEventBus.emit('auth:reauthenticated')
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
    await auth.register(payload.username, payload.email, payload.password)
    appEventBus.emit('auth:reauthenticated')
  } catch (e: unknown) {
    reauthError.value = e instanceof Error ? e.message : '注册失败'
  } finally {
    reauthLoading.value = false
  }
}
</script>
