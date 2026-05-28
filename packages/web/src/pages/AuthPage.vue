<template>
  <q-layout view="lHh Lpr lFf" class="auth-layout">
    <div class="auth-aurora auth-aurora--cyan" />
    <div class="auth-aurora auth-aurora--violet" />
    <div class="auth-prism auth-prism--left" />
    <div class="auth-prism auth-prism--right" />
    <div class="auth-floor" />

    <q-page-container>
      <q-page class="auth-page flex flex-center">
        <div class="auth-card imago-panel--auth">
          <!-- Logo -->
          <div class="auth-brand text-center">
            <div class="auth-logo imago-brand">openimago</div>
            <p class="auth-tagline">AI 图片 / 视频创作平台</p>
          </div>

          <!-- Tabs -->
          <q-tabs v-model="tab" dense class="imago-auth-tabs" active-class="imago-auth-tab--active" indicator-color="transparent" align="justify" no-caps>
            <q-tab name="login" label="Login" class="imago-auth-tab" />
            <q-tab name="register" label="Register" class="imago-auth-tab" />
          </q-tabs>

          <!-- Login -->
          <q-form v-if="tab === 'login'" @submit.prevent="handleLogin" class="auth-form">
            <q-input v-model="loginForm.email" label="Email address" outlined dark hide-bottom-space class="imago-input-panel" color="cyan-4" :rules="[(v: string) => !!v || '请输入邮箱']" lazy-rules>
              <template #prepend><q-icon name="mail_outline" class="imago-input-panel__icon" /></template>
            </q-input>
            <q-input v-model="loginForm.password" label="Password" :type="showLoginPassword ? 'text' : 'password'" outlined dark hide-bottom-space class="imago-input-panel" color="cyan-4" :rules="[(v: string) => !!v || '请输入密码']" lazy-rules>
              <template #prepend><q-icon name="lock_outline" class="imago-input-panel__icon" /></template>
              <template #append>
                <q-icon :name="showLoginPassword ? 'visibility_off' : 'visibility'" class="imago-input-panel__action" @click="showLoginPassword = !showLoginPassword" />
              </template>
            </q-input>
            <q-btn type="submit" label="Login" class="imago-submit imago-submit--cyan" :loading="loading" unelevated no-caps />
          </q-form>

          <!-- Register -->
          <q-form v-else @submit.prevent="handleRegister" class="auth-form">
            <q-input v-model="registerForm.username" label="Username" outlined dark hide-bottom-space class="imago-input-panel" color="purple-4" :rules="[(v: string) => !!v || '请输入用户名']" lazy-rules>
              <template #prepend><q-icon name="person_outline" class="imago-input-panel__icon" /></template>
            </q-input>
            <q-input v-model="registerForm.email" label="Email address" type="email" outlined dark hide-bottom-space class="imago-input-panel" color="purple-4" :rules="[(v: string) => !!v || '请输入邮箱']" lazy-rules>
              <template #prepend><q-icon name="mail_outline" class="imago-input-panel__icon" /></template>
            </q-input>
            <q-input v-model="registerForm.password" label="Password" :type="showRegisterPassword ? 'text' : 'password'" outlined dark hide-bottom-space class="imago-input-panel" color="purple-4" :rules="[(v: string) => v.length >= 6 || '密码至少 6 位']" lazy-rules>
              <template #prepend><q-icon name="lock_outline" class="imago-input-panel__icon" /></template>
              <template #append>
                <q-icon :name="showRegisterPassword ? 'visibility_off' : 'visibility'" class="imago-input-panel__action" @click="showRegisterPassword = !showRegisterPassword" />
              </template>
            </q-input>
            <q-btn type="submit" label="Register" class="imago-submit imago-submit--violet" :loading="loading" unelevated no-caps />
          </q-form>

          <!-- Error -->
          <q-banner v-if="error" dense rounded class="bg-negative text-white q-mt-md">
            {{ error }}
          </q-banner>

          <!-- OAuth -->
          <div class="auth-oauth">
            <div class="imago-auth-divider row items-center">
              <div class="col"><q-separator dark /></div>
              <div class="col-auto imago-auth-divider__text">or<span class="imago-sr-only">第三方登录</span></div>
              <div class="col"><q-separator dark /></div>
            </div>
            <div class="auth-socials">
              <q-btn outline rounded icon="fa-brands fa-github" label="Continue with GitHub" class="imago-btn-auth-social" no-caps @click="oauthLogin('github')" />
              <q-btn outline rounded icon="fa-brands fa-google" label="Continue with Google" class="imago-btn-auth-social" no-caps @click="oauthLogin('google')" />
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
const showLoginPassword = ref(false)
const showRegisterPassword = ref(false)

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
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(circle at 12% 4%, rgb(13 218 255 / 42%), transparent 26%),
    radial-gradient(circle at 88% 11%, rgb(196 38 255 / 42%), transparent 28%),
    linear-gradient(115deg, #010713 0%, #061122 48%, #0c0415 100%);
  color: #eafcff;
}

.auth-layout::before {
  position: absolute;
  inset: 0;
  pointer-events: none;
  content: '';
  background:
    linear-gradient(118deg, transparent 0 16%, rgb(21 232 255 / 32%) 16.2%, transparent 16.6%),
    linear-gradient(143deg, transparent 68%, rgb(209 42 255 / 34%) 68.3%, transparent 69%),
    radial-gradient(circle at 21% 19%, rgb(0 215 255 / 12%) 0 1px, transparent 3px),
    radial-gradient(circle at 79% 35%, rgb(231 0 255 / 14%) 0 2px, transparent 4px);
  background-size: 100% 100%, 100% 100%, 92px 92px, 118px 118px;
  filter: blur(0.2px);
}

.auth-layout::after {
  position: absolute;
  inset: 0;
  pointer-events: none;
  content: '';
  background-image: linear-gradient(rgb(255 255 255 / 4%) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 3%) 1px, transparent 1px);
  background-size: 54px 54px;
  mask-image: linear-gradient(to top, #000 0%, transparent 34%);
  transform: perspective(520px) rotateX(68deg) translateY(18%);
  transform-origin: bottom;
}

.auth-page {
  position: relative;
  z-index: 2;
  min-height: 100vh;
  padding: 24px 18px;
}

.auth-card {
  width: min(464px, 100%);
  padding: 32px 34px 30px;
}

.auth-brand {
  position: relative;
  margin-bottom: 22px;
}

.auth-logo {
  font-size: clamp(40px, 4.6vw, 52px);
  line-height: 0.95;
  color: var(--imago-cyan-bright);
  text-shadow: 0 0 7px var(--imago-cyan-bright), 0 0 20px rgb(47 247 255 / 82%), 0 0 40px rgb(47 247 255 / 42%);
}

.auth-tagline {
  height: 1px;
  margin: 0;
  overflow: hidden;
  opacity: 0;
}

.auth-form {
  display: grid;
  gap: 16px;
}

.auth-oauth {
  margin-top: 24px;
}

.auth-socials {
  display: grid;
  gap: 9px;
}

.auth-aurora,
.auth-prism,
.auth-floor {
  position: absolute;
  pointer-events: none;
}

.auth-aurora {
  width: 42vw;
  height: 42vw;
  filter: blur(62px);
  opacity: 0.42;
}

.auth-aurora--cyan {
  top: -14vw;
  left: -12vw;
  background: var(--imago-neon-cyan);
}

.auth-aurora--violet {
  top: -10vw;
  right: -10vw;
  background: var(--imago-neon-purple);
}

.auth-prism {
  width: 210px;
  aspect-ratio: 1;
  border: 2px solid rgb(22 225 255 / 55%);
  filter: drop-shadow(0 0 18px rgb(0 229 255 / 42%));
  opacity: 0.55;
  transform: rotate(42deg) skew(-10deg, -8deg);
}

.auth-prism::before,
.auth-prism::after {
  position: absolute;
  inset: 18%;
  content: '';
  border: 2px solid rgb(196 38 255 / 48%);
}

.auth-prism--left {
  bottom: 18%;
  left: 5%;
}

.auth-prism--right {
  right: 6%;
  bottom: 23%;
}

.auth-floor {
  right: -10%;
  bottom: -20%;
  left: -10%;
  height: 44%;
  background: radial-gradient(ellipse at 28% 72%, rgb(0 225 255 / 30%), transparent 28%), radial-gradient(ellipse at 78% 78%, rgb(214 36 255 / 32%), transparent 32%);
  filter: blur(18px);
}

@media (max-width: 600px) {
  .auth-card {
    padding: 28px 18px 24px;
    border-radius: 22px;
  }

  :deep(.imago-input-panel .q-field__control) {
    height: 54px;
  }

  :deep(.imago-btn-auth-social .q-icon) {
    left: 26px;
  }

  .auth-prism {
    display: none;
  }
}
</style>
