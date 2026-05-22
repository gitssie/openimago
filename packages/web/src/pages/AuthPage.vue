<template>
  <q-layout view="lHh Lpr lFf" class="auth-layout">
    <div class="auth-aurora auth-aurora--cyan" />
    <div class="auth-aurora auth-aurora--violet" />
    <div class="auth-prism auth-prism--left" />
    <div class="auth-prism auth-prism--right" />
    <div class="auth-floor" />

    <q-page-container>
      <q-page class="auth-page flex flex-center">
        <div class="auth-card">
          <!-- Logo -->
          <div class="auth-brand text-center">
            <div class="auth-logo">openimago</div>
            <p class="auth-tagline">AI 图片 / 视频创作平台</p>
          </div>

          <!-- Tabs -->
          <q-tabs v-model="tab" dense class="auth-tabs" active-class="auth-tab--active" indicator-color="transparent" align="justify" no-caps>
            <q-tab name="login" label="Login" class="auth-tab" />
            <q-tab name="register" label="Register" class="auth-tab" />
          </q-tabs>

          <!-- Login -->
          <q-form v-if="tab === 'login'" @submit.prevent="handleLogin" class="auth-form">
            <q-input v-model="loginForm.email" label="Email address" outlined dark hide-bottom-space class="auth-input" color="cyan-4" :rules="[(v: string) => !!v || '请输入邮箱']" lazy-rules>
              <template #prepend><q-icon name="mail_outline" class="auth-input__icon" /></template>
            </q-input>
            <q-input v-model="loginForm.password" label="Password" :type="showLoginPassword ? 'text' : 'password'" outlined dark hide-bottom-space class="auth-input" color="cyan-4" :rules="[(v: string) => !!v || '请输入密码']" lazy-rules>
              <template #prepend><q-icon name="lock_outline" class="auth-input__icon" /></template>
              <template #append>
                <q-icon :name="showLoginPassword ? 'visibility_off' : 'visibility'" class="auth-input__action" @click="showLoginPassword = !showLoginPassword" />
              </template>
            </q-input>
            <q-btn type="submit" label="Login" class="auth-submit" :loading="loading" unelevated no-caps />
          </q-form>

          <!-- Register -->
          <q-form v-else @submit.prevent="handleRegister" class="auth-form">
            <q-input v-model="registerForm.username" label="Username" outlined dark hide-bottom-space class="auth-input" color="purple-4" :rules="[(v: string) => !!v || '请输入用户名']" lazy-rules>
              <template #prepend><q-icon name="person_outline" class="auth-input__icon" /></template>
            </q-input>
            <q-input v-model="registerForm.email" label="Email address" type="email" outlined dark hide-bottom-space class="auth-input" color="purple-4" :rules="[(v: string) => !!v || '请输入邮箱']" lazy-rules>
              <template #prepend><q-icon name="mail_outline" class="auth-input__icon" /></template>
            </q-input>
            <q-input v-model="registerForm.password" label="Password" :type="showRegisterPassword ? 'text' : 'password'" outlined dark hide-bottom-space class="auth-input" color="purple-4" :rules="[(v: string) => v.length >= 6 || '密码至少 6 位']" lazy-rules>
              <template #prepend><q-icon name="lock_outline" class="auth-input__icon" /></template>
              <template #append>
                <q-icon :name="showRegisterPassword ? 'visibility_off' : 'visibility'" class="auth-input__action" @click="showRegisterPassword = !showRegisterPassword" />
              </template>
            </q-input>
            <q-btn type="submit" label="Register" class="auth-submit auth-submit--violet" :loading="loading" unelevated no-caps />
          </q-form>

          <!-- Error -->
          <q-banner v-if="error" dense rounded class="bg-negative text-white q-mt-md">
            {{ error }}
          </q-banner>

          <!-- OAuth -->
          <div class="auth-oauth">
            <div class="auth-divider row items-center">
              <div class="col"><q-separator dark /></div>
              <div class="col-auto auth-divider__text">or<span class="sr-only">第三方登录</span></div>
              <div class="col"><q-separator dark /></div>
            </div>
            <div class="auth-socials">
              <q-btn outline rounded icon="fa-brands fa-github" label="Continue with GitHub" class="auth-social" no-caps @click="oauthLogin('github')" />
              <q-btn outline rounded icon="fa-brands fa-google" label="Continue with Google" class="auth-social" no-caps @click="oauthLogin('google')" />
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
  position: relative;
  width: min(464px, 100%);
  padding: 32px 34px 30px;
  overflow: hidden;
  background: linear-gradient(145deg, rgb(0 18 34 / 60%), rgb(10 7 24 / 70%));
  border: 1px solid rgb(34 232 255 / 82%);
  border-right-color: rgb(202 76 255 / 76%);
  border-radius: 24px;
  box-shadow: 0 0 34px rgb(0 232 255 / 14%), inset 0 0 48px rgb(4 187 255 / 5%);
  backdrop-filter: blur(18px);
}

.auth-card::before {
  position: absolute;
  inset: 0;
  pointer-events: none;
  content: '';
  background: radial-gradient(circle at 50% 0%, rgb(31 231 255 / 14%), transparent 34%);
}

.auth-brand {
  position: relative;
  margin-bottom: 22px;
}

.auth-logo {
  font-family: 'Trebuchet MS', 'Segoe UI', sans-serif;
  font-size: clamp(40px, 4.6vw, 52px);
  font-weight: 700;
  line-height: 0.95;
  letter-spacing: -0.08em;
  color: #2ff7ff;
  text-shadow: 0 0 7px #2ff7ff, 0 0 20px rgb(47 247 255 / 82%), 0 0 40px rgb(47 247 255 / 42%);
}

.auth-tagline {
  height: 1px;
  margin: 0;
  overflow: hidden;
  opacity: 0;
}

.auth-tabs {
  max-width: 348px;
  margin: 0 auto 24px;
  overflow: hidden;
  border: 1px solid rgb(123 174 234 / 58%);
  border-radius: 14px;
  background: rgb(4 12 29 / 45%);
}

.auth-tab {
  min-height: 40px;
  color: #aeb9c8;
  font-size: 15px;
  font-weight: 500;
}

.auth-tab--active {
  color: #22f7ff !important;
  background: linear-gradient(180deg, rgb(25 233 255 / 28%), rgb(9 68 91 / 40%));
  box-shadow: inset 0 0 18px rgb(39 236 255 / 54%), 0 0 22px rgb(39 236 255 / 22%);
}

.auth-form {
  display: grid;
  gap: 16px;
}

.auth-input :deep(.q-field__control) {
  height: 56px;
  padding: 0 16px;
  background: rgb(3 13 30 / 42%);
  border-radius: 13px;
}

.auth-input :deep(.q-field__native),
.auth-input :deep(.q-field__label) {
  color: #b5c4d8;
  font-size: 16px;
}

.auth-input :deep(.q-field__control::before) {
  border-color: rgb(114 174 231 / 62%);
}

.auth-input :deep(.q-field__control:hover::before),
.auth-input :deep(.q-field--focused .q-field__control::after) {
  border-color: #2ff7ff;
}

.auth-input__icon {
  color: #26efff;
  font-size: 23px;
}

.auth-input__action {
  color: #c8d8ef;
  cursor: pointer;
  font-size: 22px;
}

.auth-submit {
  height: 50px;
  margin-top: 0;
  color: #020910;
  background: linear-gradient(90deg, #21efff, #16dce9);
  border-radius: 13px;
  box-shadow: 0 0 20px rgb(26 236 255 / 58%);
  font-size: 17px;
  font-weight: 700;
}

.auth-submit--violet {
  background: linear-gradient(90deg, #24edff, #bc42ff);
}

.auth-oauth {
  margin-top: 24px;
}

.auth-divider {
  margin-bottom: 18px;
}

.auth-divider__text {
  padding: 0 16px;
  color: #c5d0de;
  font-size: 14px;
}

.auth-divider :deep(.q-separator) {
  background: rgb(156 184 214 / 58%);
}

.auth-socials {
  display: grid;
  gap: 9px;
}

.auth-social {
  height: 46px;
  color: #d6e3f4;
  border: 1px solid rgb(117 169 224 / 62%);
  border-radius: 12px;
  font-size: 16px;
}

.auth-social :deep(.q-icon) {
  left: 46px;
  position: absolute;
  font-size: 24px;
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
  background: #00dfff;
}

.auth-aurora--violet {
  top: -10vw;
  right: -10vw;
  background: #a51cff;
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

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 600px) {
  .auth-card {
    padding: 28px 18px 24px;
    border-radius: 22px;
  }

  .auth-input :deep(.q-field__control) {
    height: 54px;
  }

  .auth-social :deep(.q-icon) {
    left: 26px;
  }

  .auth-prism {
    display: none;
  }
}
</style>
