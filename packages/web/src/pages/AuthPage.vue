<template>
  <q-layout view="lHh Lpr lFf" class="auth-layout">
    <q-page-container>
      <q-page class="flex flex-center" style="min-height: 100vh">
        <div class="auth-card q-pa-xl" style="width: 420px">
          <!-- Logo -->
          <div class="text-center q-mb-lg">
            <div class="text-h3 text-weight-bold neon-text-cyan">openimago</div>
            <p class="text-grey-5 q-mt-xs q-mb-none">AI 图片 / 视频创作平台</p>
          </div>

          <!-- Tabs -->
          <q-tabs v-model="tab" dense class="q-mb-lg" active-color="cyan-4" indicator-color="cyan-4" align="justify" no-caps>
            <q-tab name="login" label="登录" class="text-grey-4" />
            <q-tab name="register" label="注册" class="text-grey-4" />
          </q-tabs>

          <!-- Login -->
          <q-form v-if="tab === 'login'" @submit.prevent="handleLogin" class="q-gutter-y-md">
            <q-input v-model="loginForm.email" label="邮箱" outlined dark dense bg-color="dark" color="cyan-4" :rules="[(v: string) => !!v || '请输入邮箱']" lazy-rules>
              <template #prepend><q-icon name="email" color="cyan-4" /></template>
            </q-input>
            <q-input v-model="loginForm.password" label="密码" type="password" outlined dark dense bg-color="dark" color="cyan-4" :rules="[(v: string) => !!v || '请输入密码']" lazy-rules>
              <template #prepend><q-icon name="lock" color="cyan-4" /></template>
            </q-input>
            <q-btn type="submit" label="登录" color="primary" class="full-width q-mt-sm" :loading="loading" unelevated rounded size="md" />
          </q-form>

          <!-- Register -->
          <q-form v-else @submit.prevent="handleRegister" class="q-gutter-y-md">
            <q-input v-model="registerForm.username" label="用户名" outlined dark dense bg-color="dark" color="purple-4" :rules="[(v: string) => !!v || '请输入用户名']" lazy-rules>
              <template #prepend><q-icon name="person" color="purple-4" /></template>
            </q-input>
            <q-input v-model="registerForm.email" label="邮箱" type="email" outlined dark dense bg-color="dark" color="purple-4" :rules="[(v: string) => !!v || '请输入邮箱']" lazy-rules>
              <template #prepend><q-icon name="email" color="purple-4" /></template>
            </q-input>
            <q-input v-model="registerForm.password" label="密码" type="password" outlined dark dense bg-color="dark" color="purple-4" :rules="[(v: string) => v.length >= 6 || '密码至少 6 位']" lazy-rules>
              <template #prepend><q-icon name="lock" color="purple-4" /></template>
            </q-input>
            <q-btn type="submit" label="注册" color="secondary" class="full-width q-mt-sm" :loading="loading" unelevated rounded size="md" />
          </q-form>

          <!-- Error -->
          <q-banner v-if="error" dense rounded class="bg-negative text-white q-mt-md">
            {{ error }}
          </q-banner>

          <!-- OAuth -->
          <div class="q-mt-lg">
            <div class="row items-center q-mb-sm">
              <div class="col"><q-separator dark /></div>
              <div class="col-auto q-px-md text-grey-5 text-caption">第三方登录</div>
              <div class="col"><q-separator dark /></div>
            </div>
            <div class="row q-gutter-sm justify-center">
              <q-btn outline rounded icon="fa-brands fa-github" label="GitHub" color="grey-4" @click="oauthLogin('github')" />
              <q-btn outline rounded icon="fa-brands fa-google" label="Google" color="grey-4" @click="oauthLogin('google')" />
            </div>
          </div>
        </div>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from 'src/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const tab = ref<'login' | 'register'>('login')
const loading = ref(false)
const error = ref('')

const loginForm = reactive({ email: '', password: '' })
const registerForm = reactive({ username: '', email: '', password: '' })

async function handleLogin() {
  loading.value = true
  error.value = ''
  try {
    await auth.login(loginForm.email, loginForm.password)
    void router.push('/projects')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '登录失败'
  } finally {
    loading.value = false
  }
}

async function handleRegister() {
  loading.value = true
  error.value = ''
  try {
    await auth.register(registerForm.username, registerForm.email, registerForm.password)
    void router.push('/projects')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '注册失败'
  } finally {
    loading.value = false
  }
}

function oauthLogin(provider: string) {
  window.location.href = `/auth/oauth/${provider}`
}
</script>

<style scoped>
.auth-layout {
  background: radial-gradient(ellipse at 50% 30%, #141420 0%, #08080d 70%);
}
</style>
