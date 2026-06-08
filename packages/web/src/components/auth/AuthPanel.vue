<template>
  <div class="auth-panel imago-panel--auth" :class="`auth-panel--${variant}`" role="region" aria-label="登录或注册">
    <!-- Optional close button — shown in dialog context -->
    <button
      v-if="dismissible"
      type="button"
      class="auth-panel__close"
      aria-label="关闭登录面板"
      @click="emit('dismiss')"
    >
      <q-icon name="close" />
    </button>

    <!-- Brand: logo + Chinese tagline -->
    <div class="auth-panel__brand text-center">
      <div class="auth-panel__logo imago-brand">openimago</div>
      <p class="auth-panel__tagline-main">释放想象力 · 创造无限可能</p>
      <p class="auth-panel__tagline-sub">新一代 AI 创意平台，激发灵感，生成未来</p>
    </div>

    <!-- Tabs -->
    <q-tabs
      v-model="mode"
      dense
      class="imago-auth-tabs"
      active-class="imago-auth-tab--active"
      indicator-color="transparent"
      align="justify"
      no-caps
    >
      <q-tab name="login" label="登录" class="imago-auth-tab" />
      <q-tab name="register" label="注册" class="imago-auth-tab" />
    </q-tabs>

    <!-- Login -->
    <q-form v-if="mode === 'login'" class="auth-panel__form" @submit.prevent="onLoginSubmit">
      <q-input
        v-model="loginForm.email"
        label="邮箱地址"
        outlined
        dark
        hide-bottom-space
        class="imago-input-panel"
        color="cyan-4"
        :rules="[(v: string) => !!v || '请输入邮箱地址']"
        lazy-rules
      >
        <template #prepend><q-icon name="mail_outline" class="imago-input-panel__icon" /></template>
      </q-input>
      <q-input
        v-model="loginForm.password"
        label="密码"
        :type="showLoginPassword ? 'text' : 'password'"
        outlined
        dark
        hide-bottom-space
        class="imago-input-panel"
        color="cyan-4"
        :rules="[(v: string) => !!v || '请输入密码']"
        lazy-rules
      >
        <template #prepend><q-icon name="lock_outline" class="imago-input-panel__icon" /></template>
        <template #append>
          <q-icon
            :name="showLoginPassword ? 'visibility_off' : 'visibility'"
            class="imago-input-panel__action"
            @click="showLoginPassword = !showLoginPassword"
          />
        </template>
      </q-input>
      <div v-if="showRememberMe" class="auth-panel__row-options">
        <q-checkbox v-model="rememberMe" label="记住我" color="cyan-4" dark dense class="auth-panel__remember" />
        <a href="#" class="auth-panel__link" @click.prevent="emit('forgot-password')">忘记密码？</a>
      </div>
      <q-btn
        type="submit"
        label="登录"
        class="imago-submit imago-submit--cyan auth-panel__submit"
        :loading="loading"
        unelevated
        no-caps
      />
    </q-form>

    <!-- Register -->
    <q-form v-else class="auth-panel__form" @submit.prevent="onRegisterSubmit">
      <q-input
        v-model="registerForm.username"
        label="用户名"
        outlined
        dark
        hide-bottom-space
        class="imago-input-panel"
        color="purple-4"
        :rules="[(v: string) => !!v || '请输入用户名']"
        lazy-rules
      >
        <template #prepend><q-icon name="person_outline" class="imago-input-panel__icon" /></template>
      </q-input>
      <q-input
        ref="registerEmailRef"
        v-model="registerForm.email"
        label="邮箱地址"
        type="email"
        outlined
        dark
        hide-bottom-space
        class="imago-input-panel"
        color="purple-4"
        :rules="[(v: string) => !!v || '请输入邮箱地址']"
        lazy-rules
      >
        <template #prepend><q-icon name="mail_outline" class="imago-input-panel__icon" /></template>
      </q-input>
      <div class="auth-panel__verify-row">
        <q-input
          v-model="registerForm.verificationCode"
          label="验证码"
          type="text"
          outlined
          dark
          hide-bottom-space
          class="imago-input-panel auth-panel__verify-input"
          color="purple-4"
          :rules="[(v: string) => !!v || '请输入验证码']"
          lazy-rules
        >
          <template #prepend><q-icon name="pin" class="imago-input-panel__icon" /></template>
        </q-input>
        <q-btn
          type="button"
          class="auth-panel__send-code-btn"
          :loading="sendingCode"
          :disable="sendingCode || cooldownRemaining > 0"
          unelevated
          no-caps
          @click="onSendVerificationCode"
        >
          <template v-if="cooldownRemaining > 0">{{ cooldownRemaining }}s 后重发</template>
          <template v-else-if="codeSent">重新发送</template>
          <template v-else>发送验证码</template>
        </q-btn>
      </div>
      <div v-if="sendError" class="auth-panel__send-error" role="alert">
        {{ sendError }}
      </div>
      <q-input
        v-model="registerForm.password"
        label="密码"
        :type="showRegisterPassword ? 'text' : 'password'"
        outlined
        dark
        hide-bottom-space
        class="imago-input-panel"
        color="purple-4"
        :rules="[(v: string) => v.length >= 6 || '密码至少 6 位']"
        lazy-rules
      >
        <template #prepend><q-icon name="lock_outline" class="imago-input-panel__icon" /></template>
        <template #append>
          <q-icon
            :name="showRegisterPassword ? 'visibility_off' : 'visibility'"
            class="imago-input-panel__action"
            @click="showRegisterPassword = !showRegisterPassword"
          />
        </template>
      </q-input>
      <q-btn
        type="submit"
        label="注册"
        class="imago-submit imago-submit--violet auth-panel__submit"
        :loading="loading"
        unelevated
        no-caps
      />
    </q-form>

    <!-- Error banner (controlled by parent) -->
    <q-banner v-if="error" dense rounded class="bg-negative text-white q-mt-md" role="alert">
      {{ error }}
    </q-banner>

    <!-- OAuth -->
    <div class="auth-panel__oauth">
      <div class="imago-auth-divider row items-center">
        <div class="col"><q-separator dark /></div>
        <div class="col-auto imago-auth-divider__text">或<span class="imago-sr-only">第三方登录</span></div>
        <div class="col"><q-separator dark /></div>
      </div>
      <div class="auth-panel__socials">
        <q-btn
          outline
          rounded
          icon="fa-brands fa-github"
          label="使用 GitHub 继续"
          class="imago-btn-auth-social"
          no-caps
          @click="emit('oauth', 'github')"
        />
        <q-btn
          outline
          rounded
          icon="fa-brands fa-google"
          label="使用 Google 继续"
          class="imago-btn-auth-social"
          no-caps
          @click="emit('oauth', 'google')"
        />
      </div>
    </div>

    <!-- Security note -->
    <div v-if="showSecurityNote" class="auth-panel__security-note" role="note">
      <q-icon name="shield" class="auth-panel__security-note-icon" aria-hidden="true" />
      <span>安全加密保护 · 您的数据绝对安全</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { api } from 'src/api/client'

export type AuthMode = 'login' | 'register'
export type OAuthProvider = 'github' | 'google'
export type AuthVariant = 'page' | 'dialog'

export interface LoginPayload {
  email: string
  password: string
  rememberMe: boolean
}

export interface RegisterPayload {
  username: string
  email: string
  password: string
  verificationCode: string
}

interface Props {
  /** Visual variant — 'page' for full-page, 'dialog' for modal context. */
  variant?: AuthVariant
  /** Initial tab to show. Re-mount to reset. */
  initialMode?: AuthMode
  /** Show the "记住我" checkbox + "忘记密码？" link row (login only). */
  showRememberMe?: boolean
  /** Show the security note at the bottom. */
  showSecurityNote?: boolean
  /** Show a close button in the top-right corner. */
  dismissible?: boolean
  /** External loading state — shows spinner on submit button. */
  loading?: boolean
  /** External error message — shows banner above OAuth section. */
  error?: string
}

interface Emits {
  /** Fired when login form passes validation and is submitted. */
  (e: 'login', payload: LoginPayload): void
  /** Fired when register form passes validation and is submitted. */
  (e: 'register', payload: RegisterPayload): void
  /** Fired when the close button is clicked (only when dismissible=true). */
  (e: 'dismiss'): void
  /** Fired when "忘记密码？" link is clicked. */
  (e: 'forgot-password'): void
  /** Fired when an OAuth provider button is clicked. */
  (e: 'oauth', provider: OAuthProvider): void
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'page',
  initialMode: 'login',
  showRememberMe: true,
  showSecurityNote: true,
  dismissible: false,
  loading: false,
  error: '',
})

const emit = defineEmits<Emits>()

// ── Internal form state ──────────────────────────────────────────────
const mode = ref<AuthMode>(props.initialMode)
const showLoginPassword = ref(false)
const showRegisterPassword = ref(false)
const rememberMe = ref(false)

const loginForm = reactive({ email: '', password: '' })
const registerForm = reactive({ username: '', email: '', password: '', verificationCode: '' })

// ── Email verification state ─────────────────────────────────────────
const registerEmailRef = ref<{ nativeEl?: HTMLInputElement } | null>(null)
const sendingCode = ref(false)
const cooldownRemaining = ref(0)
const codeSent = ref(false)
const sendError = ref('')
let cooldownTimer: ReturnType<typeof setInterval> | null = null

/** Sync the register email field from the DOM (handles browser autofill). */
function syncEmailFromDom() {
  const input = registerEmailRef.value?.nativeEl
  if (input && input.value) {
    registerForm.email = input.value
  }
}

/** Start cooldown countdown after successful code send. */
function startCooldown(durationMs = 60000) {
  cooldownRemaining.value = Math.ceil(durationMs / 1000)
  if (cooldownTimer) clearInterval(cooldownTimer)
  cooldownTimer = setInterval(() => {
    cooldownRemaining.value--
    if (cooldownRemaining.value <= 0) {
      if (cooldownTimer) clearInterval(cooldownTimer)
      cooldownTimer = null
    }
  }, 1000)
}

async function onSendVerificationCode() {
  syncEmailFromDom()
  const email = registerForm.email.trim()
  sendError.value = ''
  if (!email || !email.includes('@')) {
    sendError.value = '请输入有效的邮箱地址'
    return
  }

  sendingCode.value = true
  try {
    await api.sendEmailVerification(email)
    codeSent.value = true
    startCooldown(60000)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '发送验证码失败'
    sendError.value = msg
    // If rate-limited, start cooldown anyway
    if (msg.includes('wait') || msg.includes('请稍后')) {
      startCooldown(60000)
    }
  } finally {
    sendingCode.value = false
  }
}

// ── Submit handlers — only emit, never call auth store directly ─────
function onLoginSubmit() {
  emit('login', {
    email: loginForm.email,
    password: loginForm.password,
    rememberMe: rememberMe.value,
  })
}

function onRegisterSubmit() {
  syncEmailFromDom()
  emit('register', {
    username: registerForm.username,
    email: registerForm.email,
    password: registerForm.password,
    verificationCode: registerForm.verificationCode,
  })
}
</script>

<style scoped>
/* ── Root shell ────────────────────────────────────────────────────── */
.auth-panel {
  position: relative;
  width: min(420px, 100%);
  padding: 28px 30px 24px;
  box-shadow:
    0 0 0 1px rgb(34 247 255 / 36%),
    0 0 26px rgb(34 247 255 / 32%),
    0 0 70px rgb(34 247 255 / 18%),
    0 0 110px rgb(196 38 255 / 18%),
    inset 0 1px 0 rgb(255 255 255 / 8%),
    inset 0 0 60px rgb(4 187 255 / 6%);
}

/* Dialog variant — slightly narrower and tighter for modal context */
.auth-panel--dialog {
  width: min(400px, 92vw);
  padding: 24px 26px 22px;
}

/* ── Close button (dialog context) ─────────────────────────────────── */
.auth-panel__close {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 1;
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: transparent;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 50%;
  color: rgb(220 235 250 / 60%);
  cursor: pointer;
  transition:
    color var(--imago-ease-fast),
    background var(--imago-ease-fast),
    border-color var(--imago-ease-fast);
}

.auth-panel__close:hover,
.auth-panel__close:focus-visible {
  background: rgb(255 255 255 / 5%);
  border-color: rgb(34 247 255 / 45%);
  color: #fff;
  outline: none;
}

.auth-panel__close .q-icon {
  font-size: 16px;
}

/* ── Brand ─────────────────────────────────────────────────────────── */
.auth-panel__brand {
  position: relative;
  margin-bottom: 18px;
}

.auth-panel__logo {
  font-size: clamp(30px, 3.2vw, 36px);
  line-height: 0.95;
  color: var(--imago-cyan-bright);
  text-shadow:
    0 0 7px var(--imago-cyan-bright),
    0 0 20px rgb(47 247 255 / 88%),
    0 0 44px rgb(47 247 255 / 52%),
    0 0 80px rgb(34 247 255 / 28%);
}

.auth-panel__tagline-main {
  margin: 12px 0 4px;
  font-size: 18px;
  font-weight: 700;
  color: #eaf6ff;
  letter-spacing: 0.08em;
  text-shadow:
    0 0 14px rgb(34 247 255 / 32%),
    0 0 32px rgb(34 247 255 / 14%);
}

.auth-panel__tagline-sub {
  margin: 0 0 2px;
  font-size: 12px;
  color: rgb(196 215 235 / 62%);
  letter-spacing: 0.06em;
  text-shadow: 0 0 10px rgb(34 247 255 / 14%);
}

/* ── Form ──────────────────────────────────────────────────────────── */
.auth-panel__form {
  display: grid;
  gap: 13px;
}

/* ── Verification code row ──────────────────────────────────────────── */
.auth-panel__verify-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.auth-panel__verify-input {
  flex: 1;
}

.auth-panel__send-code-btn {
  flex-shrink: 0;
  height: 50px;
  padding: 0 14px;
  font-size: 13px;
  white-space: nowrap;
  background: linear-gradient(135deg, rgb(196 38 255 / 18%), rgb(168 85 247 / 10%)) !important;
  border: 1px solid rgb(196 38 255 / 36%) !important;
  border-radius: var(--imago-radius-md);
  color: rgb(226 200 255 / 90%);
  text-shadow: 0 0 10px rgb(196 38 255 / 32%);
  transition:
    opacity var(--imago-ease-fast),
    border-color var(--imago-ease-fast),
    box-shadow var(--imago-ease-fast);
}

.auth-panel__send-code-btn:hover:not(:disabled) {
  border-color: rgb(196 38 255 / 70%) !important;
  box-shadow: 0 0 16px rgb(196 38 255 / 30%);
  color: #fff;
}

.auth-panel__send-code-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.auth-panel__send-error {
  font-size: 12px;
  color: #ff5252;
  margin-top: -6px;
  padding: 0 2px;
  text-shadow: 0 0 8px rgb(255 82 82 / 40%);
}

:deep(.imago-input-panel .q-field__control) {
  height: 50px;
  padding: 0 14px;
}

:deep(.imago-input-panel .q-field__native),
:deep(.imago-input-panel .q-field__label) {
  font-size: 15px;
}

:deep(.imago-input-panel__icon) {
  font-size: 21px;
}

:deep(.imago-input-panel__action) {
  font-size: 20px;
}

/* ── Remember row (login only) ─────────────────────────────────────── */
.auth-panel__row-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 2px 2px 0;
  font-size: 13px;
}

.auth-panel__link {
  color: var(--imago-cyan-bright);
  text-decoration: none;
  font-size: 13px;
  letter-spacing: 0.02em;
  text-shadow: 0 0 10px rgb(34 247 255 / 32%);
  transition:
    color var(--imago-ease-fast),
    text-shadow var(--imago-ease-fast);
}

.auth-panel__link:hover,
.auth-panel__link:focus-visible {
  color: #9cfcff;
  text-decoration: underline;
  text-shadow:
    0 0 10px rgb(34 247 255 / 65%),
    0 0 24px rgb(34 247 255 / 32%);
}

:deep(.auth-panel__remember) {
  color: rgb(196 220 240 / 78%);
  font-size: 13px;
  text-shadow: 0 0 10px rgb(34 247 255 / 14%);
}

:deep(.auth-panel__remember .q-checkbox__inner) {
  color: var(--imago-cyan-bright);
  font-size: 16px;
  filter: drop-shadow(0 0 4px rgb(34 247 255 / 55%));
}

:deep(.auth-panel__remember .q-checkbox__label) {
  padding-left: 6px;
}

/* ── Submit button ─────────────────────────────────────────────────── */
.auth-panel__submit {
  width: 100%;
  height: 48px;
  font-size: 15px !important;
  background: linear-gradient(95deg, #42f6ff 0%, #28a3ff 60%, #2a7bff 100%) !important;
  box-shadow:
    0 0 22px rgb(34 247 255 / 55%),
    0 0 56px rgb(42 123 255 / 32%),
    0 0 110px rgb(42 123 255 / 18%),
    inset 0 1px 0 rgb(255 255 255 / 42%),
    inset 0 -1px 0 rgb(0 0 0 / 18%) !important;
  letter-spacing: 0.1em;
}

.auth-panel__submit::before {
  content: '';
  position: absolute;
  inset: 1px;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(180deg, rgb(255 255 255 / 22%) 0%, transparent 38%, transparent 100%);
}

.auth-panel__submit:disabled {
  opacity: 0.7;
  box-shadow: none !important;
}

/* ── OAuth ─────────────────────────────────────────────────────────── */
.auth-panel__oauth {
  margin-top: 18px;
}

.auth-panel__socials {
  display: grid;
  gap: 7px;
}

:deep(.imago-btn-auth-social) {
  position: relative;
  height: 44px;
  font-size: 14px !important;
  background: linear-gradient(135deg, rgb(34 247 255 / 8%), rgb(196 38 255 / 6%)) !important;
  border: 1px solid transparent !important;
  background-clip: padding-box !important;
  box-shadow:
    inset 0 0 0 1px rgb(34 247 255 / 38%),
    inset 0 0 0 2px rgb(196 38 255 / 30%),
    0 0 18px rgb(34 247 255 / 12%);
  transition:
    box-shadow var(--imago-ease-smooth),
    background var(--imago-ease-smooth);
}

:deep(.imago-btn-auth-social .q-icon) {
  left: 38px;
  font-size: 21px;
}

:deep(.imago-btn-auth-social:hover),
:deep(.imago-btn-auth-social:focus-visible) {
  background: linear-gradient(135deg, rgb(34 247 255 / 14%), rgb(196 38 255 / 12%)) !important;
  box-shadow:
    inset 0 0 0 1px rgb(34 247 255 / 60%),
    inset 0 0 0 2px rgb(196 38 255 / 48%),
    0 0 26px rgb(34 247 255 / 24%);
}

/* ── Security note ─────────────────────────────────────────────────── */
.auth-panel__security-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 16px;
  font-size: 12px;
  color: rgb(190 220 250 / 60%);
  letter-spacing: 0.04em;
  text-align: center;
  text-shadow: 0 0 10px rgb(34 247 255 / 14%);
}

.auth-panel__security-note-icon {
  color: #42d8ff;
  font-size: 15px;
  filter:
    drop-shadow(0 0 4px rgb(66 216 255 / 80%))
    drop-shadow(0 0 12px rgb(34 247 255 / 36%));
}

/* ── Mobile ────────────────────────────────────────────────────────── */
@media (max-width: 600px) {
  .auth-panel {
    padding: 22px 20px 20px;
    border-radius: 20px;
  }

  .auth-panel__tagline-main {
    font-size: 16px;
  }

  .auth-panel__tagline-sub {
    font-size: 11px;
  }

  :deep(.imago-input-panel .q-field__control) {
    height: 46px;
  }

  :deep(.imago-input-panel .q-field__native),
  :deep(.imago-input-panel .q-field__label) {
    font-size: 14px;
  }

  :deep(.imago-btn-auth-social .q-icon) {
    left: 26px;
  }

  .auth-panel__submit {
    height: 44px;
    font-size: 14px !important;
  }

  :deep(.imago-btn-auth-social) {
    height: 42px;
    font-size: 13px !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .auth-panel__link,
  .auth-panel__link:hover,
  .auth-panel__link:focus-visible,
  .auth-panel__close,
  .auth-panel__close:hover,
  .auth-panel__close:focus-visible {
    transition: none;
    text-shadow: none;
  }
}
</style>
