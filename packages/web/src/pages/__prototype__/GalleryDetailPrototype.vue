<!-- ═══════════════════════════════════════════════════════════════════════════
 PROTOTYPE — Gallery 详情沉浸 viewer
 Throwaway: validates immersive viewer + prompt popover + composer FAB UX.
 ═══════════════════════════════════════════════════════════════════════════ -->
<template>
  <div class="proto-viewer" @keydown="handleKeyboard">
    <!-- ── Top bar: back + work info ── -->
    <div class="proto-viewer__topbar">
      <q-btn flat round dense icon="arrow_back" class="proto-viewer__back" @click="goHome" />
      <div class="proto-viewer__topbar-info">
        <h2 class="proto-viewer__title">{{ work?.title ?? '...' }}</h2>
        <div class="proto-viewer__tags">
          <span v-for="tag in work?.tags ?? []" :key="tag" class="proto-viewer__tag">{{ tag }}</span>
        </div>
      </div>

      <!-- Prompt icon button -->
      <q-btn flat round dense icon="info" class="proto-viewer__prompt-btn" @click="togglePrompt">
        <q-tooltip anchor="bottom middle" self="top middle">查看 Prompt</q-tooltip>
      </q-btn>
    </div>

    <!-- ── Image area ── -->
    <div
      ref="imageAreaRef"
      class="proto-viewer__image-area"
      @touchstart="onTouchStart"
      @touchend="onTouchEnd"
    >
      <div
        class="proto-viewer__image"
        :style="{ background: imageGradient }"
      >
        <div class="proto-viewer__image-overlay">
          <span class="proto-viewer__image-label">PROTOTYPE</span>
          <span class="proto-viewer__image-slug">{{ work?.slug }}</span>
        </div>
      </div>

      <!-- Left arrow -->
      <q-btn
        v-if="hasPrev"
        flat
        round
        icon="chevron_left"
        class="proto-viewer__arrow proto-viewer__arrow--left"
        @click="goPrev"
      />

      <!-- Right arrow -->
      <q-btn
        v-if="hasNext"
        flat
        round
        icon="chevron_right"
        class="proto-viewer__arrow proto-viewer__arrow--right"
        @click="goNext"
      />
    </div>

    <!-- ── Bottom bar: position indicator + fab trigger ── -->
    <div class="proto-viewer__bottombar">
      <span class="proto-viewer__position">{{ currentIndex + 1 }} / {{ allWorks.length }}</span>

      <q-btn
        round
        unelevated
        icon="edit"
        class="proto-viewer__fab"
        @click="showComposer = true"
      >
        <q-tooltip anchor="top middle" self="bottom middle">基于此创作</q-tooltip>
      </q-btn>
    </div>

    <!-- ── Prompt Popover (desktop) ── -->
    <q-popup-proxy
      v-if="!isMobile"
      v-model="showPromptPopover"
      class="proto-viewer__popover"
      no-parent-event
      @click.stop
    >
      <div class="proto-viewer__prompt-card" @click.stop>
        <div class="proto-viewer__prompt-header">
          <span class="proto-viewer__prompt-label">PROMPT</span>
          <q-btn
            flat
            round
            dense
            size="xs"
            icon="close"
            @click="showPromptPopover = false"
          />
        </div>
        <div class="proto-viewer__prompt-body" :class="{ 'proto-viewer__prompt-body--expanded': promptExpanded }">
          <p class="proto-viewer__prompt-text">{{ work?.prompt ?? '...' }}</p>
        </div>
        <q-btn
          v-if="promptNeedsExpand"
          flat
          dense
          no-caps
          size="sm"
          :label="promptExpanded ? '收起' : '展开完整 Prompt'"
          class="proto-viewer__prompt-expand"
          @click="promptExpanded = !promptExpanded"
        />
      </div>
    </q-popup-proxy>

    <!-- ── Prompt Bottom Sheet (mobile) ── -->
    <q-bottom-sheet
      v-if="isMobile"
      v-model="showPromptSheet"
      class="proto-viewer__bottomsheet"
    >
      <div class="proto-viewer__prompt-card">
        <div class="proto-viewer__prompt-header">
          <span class="proto-viewer__prompt-label">PROMPT</span>
          <q-btn
            flat
            round
            dense
            size="xs"
            icon="close"
            @click="showPromptSheet = false"
          />
        </div>
        <div class="proto-viewer__prompt-body" :class="{ 'proto-viewer__prompt-body--expanded': promptExpanded }">
          <p class="proto-viewer__prompt-text">{{ work?.prompt ?? '...' }}</p>
        </div>
        <q-btn
          v-if="promptNeedsExpand"
          flat
          dense
          no-caps
          size="sm"
          :label="promptExpanded ? '收起' : '展开完整 Prompt'"
          class="proto-viewer__prompt-expand"
          @click="promptExpanded = !promptExpanded"
        />
      </div>
    </q-bottom-sheet>

    <!-- ── Composer Dialog ── -->
    <q-dialog v-model="showComposer" class="proto-viewer__composer-dialog">
      <q-card class="proto-composer-card">
        <q-card-section class="proto-composer-card__header">
          <div class="proto-composer-card__header-left">
            <span class="proto-composer-card__proto-badge">PROTOTYPE</span>
            <span class="proto-composer-card__title">基于此创作</span>
          </div>
          <q-btn flat round dense icon="close" v-close-popup size="sm" />
        </q-card-section>

        <q-card-section class="proto-composer-card__ref">
          <span class="proto-composer-card__ref-label">参考作品</span>
          <span class="proto-composer-card__ref-value">{{ work?.title }}</span>
        </q-card-section>

        <!-- Composer text area -->
        <q-card-section>
          <q-input
            v-model="composerText"
            type="textarea"
            placeholder="描述你想要的效果，必须填写文字..."
            filled
            dark
            autogrow
            class="proto-composer-card__input"
            :rules="[val => !!val?.trim() || '必须输入文字']"
          />
        </q-card-section>

        <!-- Quick chips -->
        <q-card-section class="proto-composer-card__chips">
          <span class="proto-composer-card__chips-label">快捷填充：</span>
          <q-chip
            v-for="chip in quickChips"
            :key="chip"
            outline
            clickable
            size="sm"
            color="cyan"
            @click="fillChip(chip)"
          >
            {{ chip }}
          </q-chip>
        </q-card-section>

        <!-- Attach files (mock) -->
        <q-card-section class="proto-composer-card__attach">
          <q-btn flat dense no-caps icon="attach_file" label="添加附件 (Mock)" size="sm" color="grey-6" @click="addMockAttachment" />
          <div v-if="composerAttachments.length > 0" class="proto-composer-card__attach-list">
            <q-chip
              v-for="a in composerAttachments"
              :key="a.id"
              dense
              removable
              size="sm"
              @remove="composerAttachments = composerAttachments.filter(x => x.id !== a.id)"
            >
              {{ a.name }}
            </q-chip>
          </div>
        </q-card-section>

        <!-- Actions -->
        <q-card-actions align="right" class="proto-composer-card__actions">
          <q-btn flat label="取消" color="grey" v-close-popup />
          <q-btn
            unelevated
            label="提交创作"
            color="cyan"
            :disable="!composerText.trim()"
            @click="handleComposerSubmit"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ── Submit feedback dialog ── -->
    <q-dialog v-model="showSubmitFeedback">
      <q-card class="proto-feedback-card">
        <q-card-section class="proto-feedback-card__header">
          <div class="proto-feedback-card__title">WOULD SUBMIT</div>
          <q-badge color="cyan" :label="lastSubmitMeta?.source ?? 'gallery'" />
        </q-card-section>
        <q-card-section>
          <pre class="proto-feedback-card__json">{{ JSON.stringify(lastSubmitState, null, 2) }}</pre>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="关闭" color="grey" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { generateWorks, getGradient, type GalleryWork } from './mock-gallery'

/* ═══════════════════════ PROTO LABEL ═══════════════════════════════════════ */
console.log('%c[PROTOTYPE] GalleryDetailPrototype %c— throwaway, not production',
  'color:#ff2d55;font-weight:bold', 'color:#999')

/* ═══════════════════════ REPLACE ME IN REAL IMPL ══════════════════════════ */
console.warn('👉 REPLACE: mock data loaded from mock-gallery.ts — real impl uses GET /api/gallery/:slug with prevSlug/nextSlug')

/* ═══════════════════════ STATE ════════════════════════════════════════════ */

const route = useRoute()
const router = useRouter()
const $q = useQuasar()

const allWorks = ref<GalleryWork[]>([])
const work = ref<GalleryWork | null>(null)
const imageAreaRef = ref<HTMLElement | null>(null)

const showPromptPopover = ref(false)
const showPromptSheet = ref(false)
const promptExpanded = ref(false)
const showComposer = ref(false)
const composerText = ref('')
const composerAttachments = ref<{ id: string; name: string }[]>([])
const showSubmitFeedback = ref(false)
const lastSubmitState = ref<Record<string, unknown>>({})
const lastSubmitMeta = ref<{ source: string; referenceWorkSlug?: string }>()

// Touch state
let touchStartX = 0

/* ═══════════════════════ COMPUTED ═════════════════════════════════════════ */

const isMobile = computed(() => $q.screen.lt.md)

const currentIndex = computed(() => {
  if (!work.value) return -1
  return allWorks.value.findIndex(w => w.slug === work.value!.slug)
})

const hasPrev = computed(() => currentIndex.value > 0)
const hasNext = computed(() => currentIndex.value < allWorks.value.length - 1)

const imageGradient = computed(() => {
  if (!work.value) return '#111'
  return getGradient(work.value.category, currentIndex.value)
})

const promptNeedsExpand = computed(() => {
  return (work.value?.prompt?.length ?? 0) > 200
})

const quickChips = [
  '用这个风格',
  '生成类似构图',
  '尝试这个色调',
  '换个配色方案',
  '增加细节',
]

/* ═══════════════════════ METHODS ══════════════════════════════════════════ */

function loadWorks() {
  allWorks.value = generateWorks(24)
}

function updateFromSlug(slug: string) {
  const found = allWorks.value.find(w => w.slug === slug) ?? null
  work.value = found
  // Reset state on navigation
  promptExpanded.value = false
}

function goNext() {
  if (hasNext.value) {
    const next = allWorks.value[currentIndex.value + 1]
    void router.replace(`/__proto__/gallery/${next!.slug}`)
  }
}

function goPrev() {
  if (hasPrev.value) {
    const prev = allWorks.value[currentIndex.value - 1]
    void router.replace(`/__proto__/gallery/${prev!.slug}`)
  }
}

function goHome() {
  void router.push('/__proto__/gallery-home')
}

function togglePrompt() {
  if (isMobile.value) {
    showPromptSheet.value = !showPromptSheet.value
  } else {
    showPromptPopover.value = !showPromptPopover.value
  }
}

function fillChip(chip: string) {
  const prefix = composerText.value.trim() ? '，' : ''
  composerText.value += `${prefix}${chip}`
}

function addMockAttachment() {
  const id = `proto-img-${Date.now()}`
  composerAttachments.value.push({ id, name: `sample-${composerAttachments.value.length + 1}.png` })
}

function handleComposerSubmit() {
  if (!composerText.value.trim()) return

  lastSubmitState.value = {
    action: 'createSession → upload attachments → sendMessage',
    text: composerText.value.trim(),
    attachments: composerAttachments.value.map(a => ({ id: a.id, name: a.name })),
    metadata: {
      source: 'gallery',
      ...(work.value?.slug ? { referenceWorkSlug: work.value.slug } : {}),
    },
    then: 'router.push(`/sessions/:id`)',
  }
  lastSubmitMeta.value = {
    source: 'gallery',
    ...(work.value?.slug ? { referenceWorkSlug: work.value.slug } : {}),
  }
  showComposer.value = false
  showSubmitFeedback.value = true

  console.log('[PROTOTYPE] Gallery composer submit:', lastSubmitState.value)

  // Reset
  composerText.value = ''
  composerAttachments.value = []
}

/* ═══════════════════════ KEYBOARD ════════════════════════════════════════ */

function handleKeyboard(event: KeyboardEvent) {
  if (showComposer.value || showSubmitFeedback.value) return

  switch (event.key) {
    case 'ArrowLeft':
    case 'a':
    case 'A':
      goPrev()
      break
    case 'ArrowRight':
    case 'd':
    case 'D':
      goNext()
      break
    case 'Escape':
      goHome()
      break
  }
}

/* ═══════════════════════ TOUCH ════════════════════════════════════════════ */

function onTouchStart(event: TouchEvent) {
  touchStartX = event.touches[0]?.clientX ?? 0
}

function onTouchEnd(event: TouchEvent) {
  const touchEndX = event.changedTouches[0]?.clientX ?? 0
  const deltaX = touchEndX - touchStartX
  const threshold = 60

  if (Math.abs(deltaX) < threshold) return

  if (deltaX < 0 && hasNext.value) {
    goNext()
  } else if (deltaX > 0 && hasPrev.value) {
    goPrev()
  }
}

/* ═══════════════════════ LIFECYCLE ════════════════════════════════════════ */

onMounted(() => {
  loadWorks()
  updateFromSlug(route.params.slug as string)
  // Ensure element can receive keyboard events
  void nextTick(() => imageAreaRef.value?.focus())
})

watch(() => route.params.slug, (slug) => {
  if (typeof slug === 'string') {
    updateFromSlug(slug)
    promptExpanded.value = false
    // Re-focus for keyboard
    void nextTick(() => imageAreaRef.value?.focus())
  }
}, { immediate: false })
</script>

<style scoped>
/* ── Shell ───────────────────────────────────────────────────────────────── */
.proto-viewer {
  position: fixed;
  inset: 0;
  background: #030713;
  display: flex;
  flex-direction: column;
  outline: none;
  -webkit-user-select: none;
  user-select: none;
}

/* ── Top bar ─────────────────────────────────────────────────────────────── */
.proto-viewer__topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: rgba(3, 7, 19, 0.92);
  backdrop-filter: blur(12px);
  z-index: 10;
  flex-shrink: 0;
}

.proto-viewer__back {
  color: var(--imago-text-muted, #888);
}

.proto-viewer__topbar-info {
  flex: 1;
  min-width: 0;
}

.proto-viewer__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--imago-text-primary, #e0e0e0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.proto-viewer__tags {
  display: flex;
  gap: 4px;
  margin-top: 2px;
}

.proto-viewer__tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(0, 229, 255, 0.08);
  color: rgba(0, 229, 255, 0.6);
  border: 1px solid rgba(0, 229, 255, 0.1);
}

.proto-viewer__prompt-btn {
  color: var(--imago-text-muted, #888);
}

/* ── Image area ──────────────────────────────────────────────────────────── */
.proto-viewer__image-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  min-height: 0;
}

.proto-viewer__image {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.3s ease;
}

.proto-viewer__image-overlay {
  text-align: center;
}

.proto-viewer__image-label {
  display: block;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 3px;
  color: rgba(255, 255, 255, 0.3);
  font-family: monospace;
  text-transform: uppercase;
}

.proto-viewer__image-slug {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.15);
  font-family: monospace;
}

/* ── Nav arrows ──────────────────────────────────────────────────────────── */
.proto-viewer__arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  color: rgba(255, 255, 255, 0.5);
  background: rgba(0, 0, 0, 0.35) !important;
  backdrop-filter: blur(4px);
  z-index: 5;
  transition: color 0.15s ease, background 0.15s ease;
}

.proto-viewer__arrow:hover {
  color: #fff;
  background: rgba(0, 0, 0, 0.55) !important;
}

.proto-viewer__arrow--left {
  left: 12px;
}

.proto-viewer__arrow--right {
  right: 12px;
}

/* ── Bottom bar ──────────────────────────────────────────────────────────── */
.proto-viewer__bottombar {
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

.proto-viewer__position {
  font-size: 12px;
  color: var(--imago-text-dim, #666);
  font-variant-numeric: tabular-nums;
}

.proto-viewer__fab {
  background: linear-gradient(135deg, #00e5ff, #007bff) !important;
  color: #fff !important;
  box-shadow: 0 4px 16px rgba(0, 229, 255, 0.35);
}

/* ── Prompt popover ──────────────────────────────────────────────────────── */
.proto-viewer__popover {
  max-width: 480px;
  width: 90vw;
}

.proto-viewer__prompt-card {
  background: #0f1119;
  border: 1px solid rgba(0, 229, 255, 0.2);
  border-radius: var(--imago-radius-md, 8px);
  padding: 16px;
  max-height: 60vh;
  overflow-y: auto;
}

.proto-viewer__prompt-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.proto-viewer__prompt-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #00e5ff;
  font-family: monospace;
}

.proto-viewer__prompt-body {
  max-height: 120px;
  overflow: hidden;
  transition: max-height 0.25s ease;
}

.proto-viewer__prompt-body--expanded {
  max-height: 600px;
}

.proto-viewer__prompt-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--imago-text-secondary, #aaa);
  white-space: pre-wrap;
}

.proto-viewer__prompt-expand {
  margin-top: 6px;
  color: rgba(0, 229, 255, 0.6);
  font-size: 11px;
}

/* ── Bottom sheet prompt (mobile) ────────────────────────────────────────── */
.proto-viewer__bottomsheet :deep(.q-bottom-sheet) {
  border-radius: 16px 16px 0 0;
}

/* ── Composer dialog ─────────────────────────────────────────────────────── */
.proto-composer-card {
  background: #0f1119 !important;
  border: 1px solid rgba(0, 229, 255, 0.2);
  max-width: 520px;
  width: 92vw;
}

.proto-composer-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.proto-composer-card__header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.proto-composer-card__proto-badge {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #ff2d55;
  font-family: monospace;
}

.proto-composer-card__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--imago-text-primary, #e0e0e0);
}

.proto-composer-card__ref {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 0 !important;
}

.proto-composer-card__ref-label {
  font-size: 11px;
  color: var(--imago-text-dim, #666);
}

.proto-composer-card__ref-value {
  font-size: 13px;
  color: var(--q-color-cyan, #00e5ff);
  font-weight: 500;
}

.proto-composer-card__input :deep(.q-field__control) {
  background: rgba(255, 255, 255, 0.03);
}

.proto-composer-card__input :deep(textarea) {
  color: var(--imago-text-secondary, #aaa);
  font-size: 14px;
}

.proto-composer-card__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  padding-top: 0 !important;
}

.proto-composer-card__chips-label {
  font-size: 11px;
  color: var(--imago-text-dim, #666);
  margin-right: 2px;
}

.proto-composer-card__attach {
  padding-top: 0 !important;
}

.proto-composer-card__attach-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.proto-composer-card__actions {
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

/* ── Submit feedback dialog ──────────────────────────────────────────────── */
.proto-feedback-card {
  background: #0f1119 !important;
  border: 1px solid rgba(0, 229, 255, 0.25);
  max-width: 480px;
  width: 90vw;
}

.proto-feedback-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.proto-feedback-card__title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #ff2d55;
  font-family: monospace;
}

.proto-feedback-card__json {
  font-size: 11px;
  font-family: monospace;
  color: var(--imago-text-secondary, #aaa);
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  padding: 12px;
  overflow-x: auto;
  max-height: 300px;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}
</style>
