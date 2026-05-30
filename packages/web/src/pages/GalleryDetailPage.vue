<template>
  <div
    ref="viewerRef"
    class="gallery-detail"
    tabindex="0"
    @keydown="handleKeyboard"
    @touchstart="onTouchStart"
    @touchend="onTouchEnd"
  >
    <!-- ── Top bar ── -->
    <div class="gallery-detail__topbar">
      <q-btn flat round dense icon="arrow_back" class="gallery-detail__back" @click="router.push('/')" />
      <div class="gallery-detail__topbar-info">
        <h2 class="gallery-detail__title">{{ item?.title ?? '...' }}</h2>
        <div v-if="item?.tags?.length" class="gallery-detail__tags">
          <span v-for="tag in item.tags" :key="tag" class="gallery-detail__tag">{{ tag }}</span>
        </div>
      </div>
      <q-btn
        flat
        round
        dense
        icon="info"
        class="gallery-detail__prompt-btn"
        @click="togglePrompt"
      >
        <q-tooltip>{{ t('gallery.viewPrompt') }}</q-tooltip>
      </q-btn>
    </div>

    <!-- ── Image area ── -->
    <div class="gallery-detail__image-area">
      <img
        v-if="item?.imageUrl"
        :src="item.imageUrl"
        :alt="item.title"
        class="gallery-detail__image"
      >
      <div v-else class="gallery-detail__image gallery-detail__image--placeholder">
        <span>{{ t('gallery.empty') }}</span>
      </div>

      <!-- Nav arrows -->
      <q-btn
        v-if="item?.navigation.prevSlug"
        flat
        round
        icon="chevron_left"
        class="gallery-detail__arrow gallery-detail__arrow--left"
        @click="goPrev"
      />
      <q-btn
        v-if="item?.navigation.nextSlug"
        flat
        round
        icon="chevron_right"
        class="gallery-detail__arrow gallery-detail__arrow--right"
        @click="goNext"
      />
    </div>

    <!-- ── Bottom bar ── -->
    <div class="gallery-detail__bottombar">
      <span v-if="item" class="gallery-detail__position">
        {{ works.length > 0 ? `${works.findIndex(w => w === item?.slug) + 1} / ${works.length}` : '' }}
      </span>
      <div class="gallery-detail__bottombar-spacer" />
      <q-btn
        round
        unelevated
        icon="edit"
        class="gallery-detail__fab"
        @click="showComposer = true"
      >
        <q-tooltip>{{ t('gallery.createFromThis') }}</q-tooltip>
      </q-btn>
    </div>

    <!-- ── Prompt Popover (desktop) ── -->
    <q-popup-proxy
      v-if="!isMobile"
      v-model="showPromptPopover"
      @click.stop
    >
      <div class="gallery-detail__prompt-card" @click.stop>
        <div class="gallery-detail__prompt-header">
          <span class="gallery-detail__prompt-label">PROMPT</span>
          <q-btn flat round dense size="xs" icon="close" @click="showPromptPopover = false" />
        </div>
        <div
          class="gallery-detail__prompt-body"
          :class="{ 'gallery-detail__prompt-body--expanded': promptExpanded }"
        >
          <p class="gallery-detail__prompt-text">{{ item?.prompt ?? '...' }}</p>
        </div>
        <q-btn
          v-if="(item?.prompt?.length ?? 0) > 200"
          flat
          dense
          no-caps
          size="sm"
          :label="promptExpanded ? t('gallery.collapsePrompt') : t('gallery.expandPrompt')"
          class="gallery-detail__prompt-expand"
          @click="promptExpanded = !promptExpanded"
        />
      </div>
    </q-popup-proxy>

    <!-- ── Prompt Bottom Sheet (mobile) ── -->
    <q-bottom-sheet v-if="isMobile" v-model="showPromptSheet">
      <div class="gallery-detail__prompt-card">
        <div class="gallery-detail__prompt-header">
          <span class="gallery-detail__prompt-label">PROMPT</span>
          <q-btn flat round dense size="xs" icon="close" @click="showPromptSheet = false" />
        </div>
        <div
          class="gallery-detail__prompt-body"
          :class="{ 'gallery-detail__prompt-body--expanded': promptExpanded }"
        >
          <p class="gallery-detail__prompt-text">{{ item?.prompt ?? '...' }}</p>
        </div>
        <q-btn
          v-if="(item?.prompt?.length ?? 0) > 200"
          flat
          dense
          no-caps
          size="sm"
          :label="promptExpanded ? t('gallery.collapsePrompt') : t('gallery.expandPrompt')"
          class="gallery-detail__prompt-expand"
          @click="promptExpanded = !promptExpanded"
        />
      </div>
    </q-bottom-sheet>

    <!-- ── Composer Dialog ── -->
    <q-dialog v-model="showComposer">
      <q-card class="gallery-detail__composer-card">
        <q-card-section class="gallery-detail__composer-header">
          <span class="gallery-detail__composer-title">{{ t('gallery.createFromThis') }}</span>
          <q-btn flat round dense icon="close" v-close-popup size="sm" />
        </q-card-section>

        <q-card-section class="gallery-detail__composer-ref">
          <span class="gallery-detail__composer-ref-label">{{ t('gallery.referenceWork') }}</span>
          <span class="gallery-detail__composer-ref-value">{{ item?.title }}</span>
        </q-card-section>

        <q-card-section>
          <q-input
            v-model="composerText"
            type="textarea"
            :placeholder="t('gallery.composerPlaceholder')"
            filled
            dark
            autogrow
            :rules="[val => !!val?.trim() || 'Required']"
          />
        </q-card-section>

        <q-card-section class="gallery-detail__composer-chips">
          <span class="gallery-detail__composer-chips-label">Quick fill:</span>
          <q-chip
            v-for="chip in quickChips"
            :key="chip.key"
            outline
            clickable
            size="sm"
            color="cyan"
            @click="composerText += (composerText.trim() ? '，' : '') + t(chip.key)"
          >
            {{ t(chip.key) }}
          </q-chip>
        </q-card-section>

        <q-card-actions align="right" class="gallery-detail__composer-actions">
          <q-btn flat :label="t('common.cancel')" color="grey" v-close-popup />
          <q-btn
            unelevated
            :label="t('gallery.submitCreate')"
            color="cyan"
            :disable="!composerText.trim()"
            @click="handleComposerSubmit"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'
import { api, type GalleryDetail } from 'src/api/client'

const route = useRoute()
const router = useRouter()
const $q = useQuasar()
const { t } = useI18n()

// ── State ──────────────────────────────────────────────────────────────────

const item = ref<GalleryDetail | null>(null)
const works = ref<string[]>([])
const viewerRef = ref<HTMLElement | null>(null)
const loading = ref(false)
const showPromptPopover = ref(false)
const showPromptSheet = ref(false)
const promptExpanded = ref(false)
const showComposer = ref(false)
const composerText = ref('')
const submitting = ref(false)

let touchStartX = 0

// ── Computed ───────────────────────────────────────────────────────────────

const isMobile = computed(() => $q.screen.lt.md)

const quickChips = [
  { key: 'gallery.quickChips.useStyle' },
  { key: 'gallery.quickChips.similarComposition' },
  { key: 'gallery.quickChips.tryPalette' },
  { key: 'gallery.quickChips.changeScheme' },
  { key: 'gallery.quickChips.addDetails' },
]

// ── Load ───────────────────────────────────────────────────────────────────

async function loadItem(slug: string) {
  loading.value = true
  try {
    const detail = await api.getGalleryItem(slug)
    item.value = detail
    // Build works list if not loaded
    if (works.value.length === 0) {
      // Load all slugs for position indicator
      const all = await api.listGallery({ limit: 50 })
      works.value = all.items.map((w) => w.slug)
    }
  } catch {
    item.value = null
  } finally {
    loading.value = false
  }
}

// ── Navigation ─────────────────────────────────────────────────────────────

function goNext() {
  if (item.value?.navigation.nextSlug) {
    void router.replace(`/gallery/${item.value.navigation.nextSlug}`)
  }
}

function goPrev() {
  if (item.value?.navigation.prevSlug) {
    void router.replace(`/gallery/${item.value.navigation.prevSlug}`)
  }
}

// ── Prompt ─────────────────────────────────────────────────────────────────

function togglePrompt() {
  promptExpanded.value = false
  if (isMobile.value) {
    showPromptSheet.value = !showPromptSheet.value
  } else {
    showPromptPopover.value = !showPromptPopover.value
  }
}

// ── Composer Submit ────────────────────────────────────────────────────────

async function handleComposerSubmit() {
  if (!composerText.value.trim() || !item.value) return
  submitting.value = true
  try {
    const session = await api.createSession({})
    await api.sendPrompt(session.id, composerText.value.trim(), {
      source: 'gallery',
      referenceWorkSlug: item.value.slug,
    })
    showComposer.value = false
    composerText.value = ''
    await router.push(`/sessions/${session.id}`)
  } catch (e) {
    $q.notify({
      color: 'negative',
      message: (e instanceof Error ? e.message : null) ?? 'Submit failed',
      icon: 'error',
    })
  } finally {
    submitting.value = false
  }
}

// ── Keyboard ───────────────────────────────────────────────────────────────

function handleKeyboard(event: KeyboardEvent) {
  if (showComposer.value) return
  switch (event.key) {
    case 'ArrowLeft': case 'a': case 'A': goPrev(); break
    case 'ArrowRight': case 'd': case 'D': goNext(); break
    case 'Escape': void router.push('/'); break
  }
}

// ── Touch ──────────────────────────────────────────────────────────────────

function onTouchStart(event: TouchEvent) {
  touchStartX = event.touches[0]?.clientX ?? 0
}

function onTouchEnd(event: TouchEvent) {
  const deltaX = (event.changedTouches[0]?.clientX ?? 0) - touchStartX
  if (Math.abs(deltaX) < 60) return
  if (deltaX < 0) { goNext() } else { goPrev() }
}

// ── Route watch ────────────────────────────────────────────────────────────

watch(() => route.params.slug, (slug) => {
  if (typeof slug === 'string') {
    promptExpanded.value = false
    void loadItem(slug)
  }
})

// ── Lifecycle ──────────────────────────────────────────────────────────────

onMounted(() => {
  const slug = route.params.slug as string
  void loadItem(slug)
  void nextTick(() => viewerRef.value?.focus())
})

onUnmounted(() => {
  // cleanup — none needed
})
</script>

<style scoped>
.gallery-detail {
  position: fixed;
  inset: 0;
  background: #030713;
  display: flex;
  flex-direction: column;
  outline: none;
}

/* ── Top bar ─────────────────────────────────────────────────────────────── */
.gallery-detail__topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: rgba(3, 7, 19, 0.92);
  backdrop-filter: blur(12px);
  z-index: 10;
  flex-shrink: 0;
}

.gallery-detail__back { color: var(--imago-text-muted, #888); }
.gallery-detail__topbar-info { flex: 1; min-width: 0; }

.gallery-detail__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--imago-text-primary, #e0e0e0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gallery-detail__tags { display: flex; gap: 4px; margin-top: 2px; }

.gallery-detail__tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(0, 229, 255, 0.08);
  color: rgba(0, 229, 255, 0.6);
  border: 1px solid rgba(0, 229, 255, 0.1);
}

.gallery-detail__prompt-btn { color: var(--imago-text-muted, #888); }

/* ── Image area ──────────────────────────────────────────────────────────── */
.gallery-detail__image-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  min-height: 0;
}

.gallery-detail__image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.gallery-detail__image--placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--imago-text-dim, #666);
  font-size: 14px;
}

.gallery-detail__arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  color: rgba(255, 255, 255, 0.5);
  background: rgba(0, 0, 0, 0.35) !important;
  backdrop-filter: blur(4px);
  z-index: 5;
}

.gallery-detail__arrow:hover {
  color: #fff;
  background: rgba(0, 0, 0, 0.55) !important;
}

.gallery-detail__arrow--left { left: 12px; }
.gallery-detail__arrow--right { right: 12px; }

/* ── Bottom bar ──────────────────────────────────────────────────────────── */
.gallery-detail__bottombar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  padding-bottom: max(8px, env(safe-area-inset-bottom));
  background: rgba(3, 7, 19, 0.92);
  backdrop-filter: blur(12px);
  z-index: 10;
  flex-shrink: 0;
}

.gallery-detail__position {
  font-size: 12px;
  color: var(--imago-text-dim, #666);
  font-variant-numeric: tabular-nums;
}

.gallery-detail__bottombar-spacer { flex: 1; }

.gallery-detail__fab {
  background: linear-gradient(135deg, #00e5ff, #007bff) !important;
  color: #fff !important;
  box-shadow: 0 4px 16px rgba(0, 229, 255, 0.35);
}

/* ── Prompt card ─────────────────────────────────────────────────────────── */
.gallery-detail__prompt-card {
  background: #0f1119;
  border: 1px solid rgba(0, 229, 255, 0.2);
  border-radius: var(--imago-radius-md, 8px);
  padding: 16px;
  max-height: 60vh;
  overflow-y: auto;
  max-width: 480px;
}

.gallery-detail__prompt-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.gallery-detail__prompt-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #00e5ff;
  font-family: monospace;
}

.gallery-detail__prompt-body {
  max-height: 120px;
  overflow: hidden;
  transition: max-height 0.25s ease;
}

.gallery-detail__prompt-body--expanded { max-height: 600px; }

.gallery-detail__prompt-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--imago-text-secondary, #aaa);
  white-space: pre-wrap;
}

.gallery-detail__prompt-expand {
  margin-top: 6px;
  color: rgba(0, 229, 255, 0.6);
  font-size: 11px;
}

/* ── Composer dialog ─────────────────────────────────────────────────────── */
.gallery-detail__composer-card {
  background: #0f1119 !important;
  border: 1px solid rgba(0, 229, 255, 0.2);
  max-width: 520px;
  width: 92vw;
}

.gallery-detail__composer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.gallery-detail__composer-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--imago-text-primary, #e0e0e0);
}

.gallery-detail__composer-ref {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 0 !important;
}

.gallery-detail__composer-ref-label {
  font-size: 11px;
  color: var(--imago-text-dim, #666);
}

.gallery-detail__composer-ref-value {
  font-size: 13px;
  color: #00e5ff;
  font-weight: 500;
}

.gallery-detail__composer-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  padding-top: 0 !important;
}

.gallery-detail__composer-chips-label {
  font-size: 11px;
  color: var(--imago-text-dim, #666);
}

.gallery-detail__composer-actions {
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}
</style>
