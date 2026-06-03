<template>
  <q-page class="home-page">
    <!-- Ambient backdrop layers (decorative) -->
    <div class="home-page__ambient" aria-hidden="true">
      <div class="home-page__ambient-orb home-page__ambient-orb--cyan" />
      <div class="home-page__ambient-orb home-page__ambient-orb--violet" />
      <div class="home-page__ambient-grid" />
    </div>

    <!-- Hero -->
    <HomeHero />

    <!-- Composer -->
    <section class="home-page__composer-wrap">
      <PromptInput
        v-model="draft"
        :loading="submitting"
        @submit="handleSubmit"
      >
        <template #leading>
          <button
            type="button"
            class="prompt-input__icon-btn"
            :aria-label="t('gallery.composerAttach')"
          >
            <OiIcon name="plus" :size="14" />
          </button>
          <button type="button" class="prompt-input__select">
            <OiIcon name="sliders" :size="14" />
            <span>{{ t('gallery.composerMode') }}</span>
            <q-icon name="expand_more" size="14px" class="prompt-input__select-caret" />
          </button>
          <button type="button" class="prompt-input__select">
            <q-icon name="crop_landscape" size="14px" />
            <span>{{ t('gallery.composerAspect') }}</span>
          </button>
          <button type="button" class="prompt-input__select">
            <OiIcon name="clock" :size="14" />
            <span>{{ t('gallery.composerDuration') }}</span>
          </button>
        </template>
      </PromptInput>
      <p v-if="submitting" class="home-page__composer-status">
        <span class="home-page__composer-pulse" />
        <span>{{ t('gallery.composerHint') }}</span>
      </p>
    </section>

    <!-- Skills -->
    <HomeSkills @select="onSkillSelect" />

    <!-- TV -->
    <HomeTV :works="works" :loading="loading" @play="onPlay" />

    <!-- Recommended -->
    <HomeRecommended :works="recommendedWorks" :loading="loadingRecommended" />

    <!-- Error / empty indicators -->
    <div v-if="error" class="home-page__error">
      <q-icon name="error_outline" size="18px" color="orange" />
      <p>{{ error }}</p>
      <q-btn flat no-caps color="cyan" :label="t('gallery.retry')" @click="loadInitial" />
    </div>

    <div class="home-page__spacer" aria-hidden="true" />
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'
import { api, type GalleryCard } from 'src/api/client'

import HomeHero from 'src/components/home/HomeHero.vue'
import HomeSkills from 'src/components/home/HomeSkills.vue'
import HomeTV from 'src/components/home/HomeTV.vue'
import HomeRecommended from 'src/components/home/HomeRecommended.vue'
import OiIcon from 'src/components/ui/OiIcon.vue'
import PromptInput from 'src/components/PromptInput.vue'

const router = useRouter()
const $q = useQuasar()
const { t } = useI18n()

// ── State ──────────────────────────────────────────────────────────────────

const draft = ref('')
const works = ref<GalleryCard[]>([])
const recommendedWorks = ref<GalleryCard[]>([])
const loading = ref(false)
const loadingRecommended = ref(false)
const error = ref<string | null>(null)
const submitting = ref(false)

// ── Load ───────────────────────────────────────────────────────────────────

async function loadInitial() {
  loading.value = true
  error.value = null
  try {
    const res = await api.listGallery({ limit: 10 })
    works.value = res.items
  } catch (e) {
    error.value = (e instanceof Error ? e.message : null) ?? t('gallery.homeLoadingFailed')
  } finally {
    loading.value = false
  }

  // Recommended is a separate (mocked) slice — fill with the same items
  // shifted by 4 so the row differs visually from the TV section.
  loadingRecommended.value = true
  try {
    const res = await api.listGallery({ limit: 12 })
    recommendedWorks.value = res.items.slice(4)
  } catch {
    /* non-fatal — TV is the primary feed */
  } finally {
    loadingRecommended.value = false
  }
}

// ── Interactions ───────────────────────────────────────────────────────────

function onSkillSelect(id: string) {
  // Future: pre-fill composer with the selected skill's prompt template.
  // For now, focus the composer so the user can start typing.
  void id
  const composer = document.querySelector<HTMLTextAreaElement>('.home-composer__input')
  composer?.focus()
}

function onPlay(work: GalleryCard) {
  // Future: open inline preview / modal.
  void work
}

// ── Submit (navigate immediately, fire-and-forget the prompt) ─────────────

async function handleSubmit(text: string) {
  const trimmed = text.trim()
  if (!trimmed) {
    $q.notify({ color: 'negative', message: t('gallery.composerRequired'), icon: 'error' })
    return
  }

  submitting.value = true

  let session
  try {
    session = await api.createSession({})
  } catch (e) {
    $q.notify({
      color: 'negative',
      message: (e instanceof Error ? e.message : null) ?? t('gallery.sessionCreateFailed'),
      icon: 'error',
    })
    submitting.value = false
    return
  }

  // Navigate immediately. The user is done with the home canvas the moment
  // a session exists — don't make them stare at the composer while the
  // initial prompt is in flight.
  await router.push(`/sessions/${session.id}`)

  // Fire-and-forget the initial prompt. The session workspace will render
  // the user message when sendPrompt resolves; if it fails, surface a
  // notification (the user may already be on the session page).
  void api
    .sendPrompt(session.id, trimmed, { source: 'home' })
    .catch((e) => {
      $q.notify({
        color: 'negative',
        message: (e instanceof Error ? e.message : null) ?? t('gallery.promptSendFailed'),
        icon: 'error',
      })
    })
    .finally(() => {
      submitting.value = false
    })
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

onMounted(() => {
  void loadInitial()
})
</script>

<style lang="scss" scoped>
.home-page {
  position: relative;
  padding: 16px 20px 80px;
  background: var(--imago-bg-void);
  overflow-x: hidden;
}

// ── Ambient backdrop layers ──────────────────────────────────────────────
.home-page__ambient {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 0;
}

.home-page__ambient-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.5;
  animation: orb-drift 18s ease-in-out infinite;
}

.home-page__ambient-orb--cyan {
  top: -120px;
  left: 50%;
  width: 540px;
  height: 540px;
  margin-left: -270px;
  background: radial-gradient(circle, rgba(0, 240, 255, 0.16), transparent 65%);
}

.home-page__ambient-orb--violet {
  top: 360px;
  right: -160px;
  width: 420px;
  height: 420px;
  background: radial-gradient(circle, rgba(168, 85, 247, 0.14), transparent 65%);
  animation-delay: -6s;
  animation-duration: 22s;
}

.home-page__ambient-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(0, 240, 255, 0.022) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 240, 255, 0.022) 1px, transparent 1px);
  background-size: 56px 56px;
  background-position: -1px -1px;
  mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 80%);
  -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 80%);
}

@keyframes orb-drift {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  33%      { transform: translate3d(40px, -20px, 0) scale(1.08); }
  66%      { transform: translate3d(-30px, 30px, 0) scale(0.95); }
}

// ── Composer wrap ────────────────────────────────────────────────────────
.home-page__composer-wrap {
  position: relative;
  z-index: 1;
  margin-top: 36px;
  margin-bottom: 24px;
  padding: 0 16px;
}

.home-page__composer-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 10px 0 0;
  color: var(--imago-text-dim);
  font-size: 12px;
}

.home-page__composer-pulse {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--imago-neon-cyan);
  box-shadow: 0 0 8px var(--imago-neon-cyan);
  animation: loading-bounce 1.2s ease-in-out infinite;
}

@keyframes loading-bounce {
  0%, 100% { transform: translateY(0);   opacity: 0.6; }
  50%      { transform: translateY(-4px); opacity: 1;   }
}

// ── Error ─────────────────────────────────────────────────────────────────
.home-page__error {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  max-width: 760px;
  margin: 32px auto 0;
  padding: 20px 0;
  color: var(--imago-text-muted);
  font-size: 13px;
}

// ── Spacer pushes the last section off the bottom edge ───────────────────
.home-page__spacer {
  height: 40px;
}

// ── Responsive ───────────────────────────────────────────────────────────
@media (max-width: 768px) {
  .home-page { padding: 12px 14px 60px; }
  .home-page__ambient-orb--cyan { width: 360px; height: 360px; margin-left: -180px; }
  .home-page__ambient-orb--violet { width: 280px; height: 280px; }
}

@media (prefers-reduced-motion: reduce) {
  .home-page__ambient-orb,
  .home-page__composer-pulse {
    animation: none !important;
  }
}
</style>
