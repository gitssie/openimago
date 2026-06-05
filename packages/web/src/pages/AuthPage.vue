<template>
  <q-layout view="lHh Lpr lFf" class="auth-layout">
    <div class="auth-aurora auth-aurora--cyan" />
    <div class="auth-aurora auth-aurora--violet" />
    <div class="auth-prism auth-prism--left">
      <span class="auth-prism__star auth-prism__star--cyan" aria-hidden="true" />
    </div>
    <div class="auth-prism auth-prism--right">
      <span class="auth-prism__star auth-prism__star--violet" aria-hidden="true" />
    </div>
    <div class="auth-floor" />

    <q-page-container>
      <q-page class="auth-page flex flex-center">
        <AuthPanel
          variant="page"
          :loading="loading"
          :error="error"
          @login="handleLogin"
          @register="handleRegister"
          @forgot-password="handleForgotPassword"
          @oauth="oauthLogin"
        />
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from 'src/stores/auth'
import AuthPanel, { type LoginPayload, type OAuthProvider, type RegisterPayload } from 'components/auth/AuthPanel.vue'

const router = useRouter()
const auth = useAuthStore()

const loading = ref(false)
const error = ref('')

async function handleLogin(payload: LoginPayload) {
  loading.value = true
  error.value = ''
  try {
    await auth.login(payload.email, payload.password)
    void router.push('/projects')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '登录失败'
  } finally {
    loading.value = false
  }
}

async function handleRegister(payload: RegisterPayload) {
  loading.value = true
  error.value = ''
  try {
    await auth.register(payload.username, payload.email, payload.password)
    void router.push('/projects')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '注册失败'
  } finally {
    loading.value = false
  }
}

function oauthLogin(provider: OAuthProvider) {
  window.location.href = `/auth/oauth/${provider}`
}

function handleForgotPassword() {
  // TODO: implement forgot password flow (route or modal)
  void router.push('/forgot-password')
}
</script>

<style scoped>
/* ── Page-level layout: auroras, prisms, floor, background ────────── */
.auth-layout {
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(circle at 10% -2%, rgb(34 247 255 / 58%) 0%, transparent 30%),
    radial-gradient(circle at 92% 8%, rgb(196 38 255 / 60%) 0%, transparent 32%),
    radial-gradient(circle at 8% 78%, rgb(0 215 255 / 26%) 0%, transparent 38%),
    radial-gradient(circle at 94% 74%, rgb(214 36 255 / 28%) 0%, transparent 40%),
    linear-gradient(115deg, #01060f 0%, #061122 48%, #0c0415 100%);
  color: #eafcff;
}

.auth-layout::before {
  position: absolute;
  inset: 0;
  pointer-events: none;
  content: '';
  background:
    linear-gradient(118deg, transparent 0 14.5%, rgb(34 247 255 / 56%) 15.4%, transparent 16.2%),
    linear-gradient(143deg, transparent 66.5%, rgb(209 42 255 / 58%) 67.4%, transparent 68.4%),
    radial-gradient(circle at 21% 19%, rgb(0 215 255 / 22%) 0 1.2px, transparent 3px),
    radial-gradient(circle at 79% 35%, rgb(231 0 255 / 22%) 0 1.6px, transparent 4px),
    radial-gradient(circle at 42% 62%, rgb(255 255 255 / 14%) 0 1px, transparent 2.5px),
    radial-gradient(circle at 64% 78%, rgb(255 255 255 / 12%) 0 1px, transparent 2.5px);
  background-size:
    100% 100%,
    100% 100%,
    92px 92px,
    118px 118px,
    144px 144px,
    168px 168px;
  filter: blur(0.25px);
}

.auth-layout::after {
  position: absolute;
  inset: 0;
  pointer-events: none;
  content: '';
  background-image:
    linear-gradient(rgb(255 255 255 / 5%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(255 255 255 / 4%) 1px, transparent 1px);
  background-size: 54px 54px;
  mask-image: linear-gradient(to top, #000 0%, transparent 36%);
  transform: perspective(520px) rotateX(68deg) translateY(18%);
  transform-origin: bottom;
}

.auth-page {
  position: relative;
  z-index: 2;
  min-height: 100vh;
  padding: 24px 18px;
}

/* ── Decorative prisms + auroras + floor (page-only) ──────────────── */
.auth-aurora,
.auth-prism,
.auth-floor {
  position: absolute;
  pointer-events: none;
}

.auth-aurora {
  width: 52vw;
  height: 52vw;
  filter: blur(54px);
  opacity: 0.72;
}

.auth-aurora--cyan {
  top: -16vw;
  left: -14vw;
  background: var(--imago-neon-cyan);
}

.auth-aurora--violet {
  top: -12vw;
  right: -12vw;
  background: var(--imago-neon-purple);
}

/* Left: vertical light beam + bright star point with lens-flare X cross */
.auth-prism--left {
  width: 3px;
  height: clamp(440px, 60vh, 640px);
  top: 8%;
  left: 7%;
  border: 0;
  border-radius: 2px;
  background: linear-gradient(
    180deg,
    transparent 0%,
    rgb(34 247 255 / 45%) 14%,
    rgb(120 250 255 / 1) 50%,
    rgb(34 247 255 / 45%) 86%,
    transparent 100%
  );
  filter:
    drop-shadow(0 0 6px rgb(34 247 255 / 95%))
    drop-shadow(0 0 18px rgb(34 247 255 / 55%))
    drop-shadow(0 0 48px rgb(34 247 255 / 28%));
  opacity: 0.95;
}

.auth-prism--left::before,
.auth-prism--left::after {
  content: '';
  position: absolute;
  top: 18%;
  left: 50%;
  width: 320px;
  height: 4px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgb(255 255 255 / 28%) 22%,
    rgb(255 255 255 / 95%) 50%,
    rgb(255 255 255 / 28%) 78%,
    transparent 100%
  );
  filter:
    drop-shadow(0 0 4px rgb(255 255 255 / 90%))
    drop-shadow(0 0 14px rgb(34 247 255 / 75%));
  transform-origin: center;
}

.auth-prism--left::before {
  transform: translate(-50%, -50%) rotate(45deg);
}

.auth-prism--left::after {
  transform: translate(-50%, -50%) rotate(-45deg);
}

/* Right: 3D octahedron — rotated square + X facet lines + top star */
.auth-prism--right {
  width: 240px;
  height: 240px;
  top: 18%;
  right: 5%;
  border: 1.5px solid rgb(196 38 255 / 78%);
  background:
    linear-gradient(0deg, transparent 49.6%, rgb(196 38 255 / 72%) 50%, transparent 50.4%),
    linear-gradient(90deg, transparent 49.6%, rgb(196 38 255 / 72%) 50%, transparent 50.4%),
    linear-gradient(135deg, rgb(196 38 255 / 22%) 0%, rgb(168 85 247 / 6%) 100%);
  transform: rotate(45deg);
  filter:
    drop-shadow(0 0 18px rgb(196 38 255 / 55%))
    drop-shadow(0 0 44px rgb(196 38 255 / 30%));
  opacity: 0.9;
}

.auth-prism__star {
  position: absolute;
  width: 10px;
  height: 10px;
  background: #ffffff;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.auth-prism__star--cyan {
  top: 18%;
  left: 50%;
  box-shadow:
    0 0 6px 3px rgb(255 255 255 / 95%),
    0 0 18px 6px rgb(34 247 255 / 88%),
    0 0 42px 12px rgb(34 247 255 / 48%),
    0 0 80px 20px rgb(34 247 255 / 22%);
}

.auth-prism__star--violet {
  top: 0;
  left: 50%;
  box-shadow:
    0 0 6px 3px rgb(255 255 255 / 95%),
    0 0 18px 6px rgb(196 38 255 / 88%),
    0 0 42px 12px rgb(196 38 255 / 48%),
    0 0 80px 20px rgb(196 38 255 / 22%);
}

/* Horizon floor: cyan + purple light streaks fading upward from the bottom */
.auth-floor {
  right: -12%;
  bottom: -22%;
  left: -12%;
  height: 50%;
  background:
    radial-gradient(ellipse 36% 18% at 26% 84%, rgb(34 247 255 / 0.95) 0%, rgb(34 247 255 / 0.4) 30%, transparent 70%),
    radial-gradient(ellipse 36% 18% at 78% 86%, rgb(196 38 255 / 0.95) 0%, rgb(196 38 255 / 0.4) 30%, transparent 70%),
    radial-gradient(ellipse 70% 50% at 30% 78%, rgb(0 225 255 / 0.5), transparent 70%),
    radial-gradient(ellipse 70% 50% at 76% 80%, rgb(214 36 255 / 0.55), transparent 70%);
  filter: blur(20px);
}

@media (max-width: 600px) {
  .auth-prism {
    display: none;
  }
}
</style>
