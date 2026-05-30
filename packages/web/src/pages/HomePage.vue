<template>
  <UILayout view="hHh Lpr fFf" class="home-page">
    <!-- ── Fixed Header: Composer + Category Chips ── -->
    <UILayoutHeader bordered class="home-page__header">
      <div class="home-page__header-inner">
        <AgentPromptInput
          :draft="draft"
          :loading="submitting"
          :connected="true"
          :disabled="false"
          :attachments="attachmentChips"
          :placeholder="t('gallery.homePlaceholder')"
          :hint="t('gallery.homeHint')"
          class="home-page__composer"
          @update:draft="draft = $event"
          @submit="handleSubmit"
          @remove-attachment="removeAttachment"
          @attach-files="handleAttachFiles"
        />

        <div class="home-page__chips">
          <q-chip
            v-for="cat in CATEGORIES"
            :key="cat.value"
            :outline="activeCategory !== cat.value"
            :color="activeCategory === cat.value ? 'cyan' : 'grey-6'"
            :clickable="true"
            :class="{ 'home-page__chip--active': activeCategory === cat.value }"
            size="sm"
            @click="switchCategory(cat.value)"
          >
            {{ cat.label }}
          </q-chip>
        </div>
      </div>
    </UILayoutHeader>

    <!-- ── Scrollable Page: Hero + Waterfall ── -->
    <UILayoutPageContainer>
      <UILayoutPage class="home-page__page" @scroll="onPageScroll">
        <!-- Hero -->
        <div v-if="heroVisible" class="home-page__hero">
          <h1 class="home-page__hero-title">{{ t('gallery.heroTitle') }}</h1>
          <p class="home-page__hero-subtitle">{{ t('gallery.heroSubtitle') }}</p>
        </div>

        <!-- Loading state -->
        <div v-if="loading && works.length === 0" class="home-page__grid">
          <div v-for="n in 6" :key="n" class="home-page__skeleton-card">
            <div class="home-page__skeleton-img" />
            <div class="home-page__skeleton-line" />
          </div>
        </div>

        <!-- Waterfall grid -->
        <div v-else class="home-page__grid">
          <div
            v-for="work in works"
            :key="work.slug"
            class="home-page__card"
            @click="router.push(`/gallery/${work.slug}`)"
          >
            <img
              v-if="work.thumbnailUrl"
              :src="work.thumbnailUrl"
              :alt="work.title"
              class="home-page__card-img"
              loading="lazy"
            >
            <div v-else class="home-page__card-img home-page__card-img--placeholder" />
            <div class="home-page__card-body">
              <h3 class="home-page__card-title">{{ work.title }}</h3>
              <div v-if="work.tags?.length" class="home-page__card-tags">
                <span v-for="tag in work.tags.slice(0, 2)" :key="tag" class="home-page__card-tag">{{ tag }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Loading more -->
        <div v-if="loadingMore" class="home-page__loading-more">
          <q-spinner color="cyan" size="20px" />
        </div>

        <!-- End indicator -->
        <div v-if="!hasMore && works.length > 0" class="home-page__end">
          {{ t('gallery.allLoaded') }}
        </div>

        <!-- Empty state -->
        <div v-if="!loading && works.length === 0" class="home-page__empty">
          <div class="home-page__empty-icon">🖼️</div>
          <p>{{ t('gallery.empty') }}</p>
        </div>

        <!-- Error state -->
        <div v-if="error" class="home-page__error">
          <p>{{ error }}</p>
          <q-btn flat no-caps color="cyan" :label="t('gallery.retry')" @click="loadInitial" />
        </div>
      </UILayoutPage>
    </UILayoutPageContainer>
  </UILayout>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'
import { api, type GalleryCard } from 'src/api/client'
import AgentPromptInput from 'src/components/AgentPromptInput.vue'
import type { ComposerAttachment } from 'src/components/AgentPromptInput.vue'
import { UILayout, UILayoutHeader, UILayoutPageContainer, UILayoutPage } from 'src/components/ui/layout'

const router = useRouter()
const $q = useQuasar()
const { t } = useI18n()

const CATEGORIES = [
  { value: 'all', label: '全部' },
  { value: 'poster', label: '海报' },
  { value: 'product', label: '产品' },
  { value: 'character', label: '角色' },
  { value: 'scene', label: '场景' },
  { value: 'brand', label: '品牌' },
  { value: 'storyboard', label: '分镜' },
]

// ── State ──────────────────────────────────────────────────────────────────

const draft = ref('')
const activeCategory = ref<string>('all')
const works = ref<GalleryCard[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const hasMore = ref(true)
const heroVisible = ref(true)
const error = ref<string | null>(null)
const submitting = ref(false)
const attachmentChips = ref<ComposerAttachment[]>([])
let nextCursor: string | null = null

// ── Load ───────────────────────────────────────────────────────────────────

async function loadInitial() {
  loading.value = true
  error.value = null
  try {
    const params: { category?: string; limit?: number } = {}
    if (activeCategory.value !== 'all') params.category = activeCategory.value
    const res = await api.listGallery(params)
    works.value = res.items
    nextCursor = res.nextCursor
    hasMore.value = res.hasMore
  } catch (e) {
    error.value = (e instanceof Error ? e.message : null) ?? '加载失败'
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (!hasMore.value || loadingMore.value || loading.value) return
  loadingMore.value = true
  try {
    const params: { category?: string; cursor?: string; limit?: number } = {}
    if (activeCategory.value !== 'all') params.category = activeCategory.value
    if (nextCursor) params.cursor = nextCursor
    const res = await api.listGallery(params)
    works.value = [...works.value, ...res.items]
    nextCursor = res.nextCursor
    hasMore.value = res.hasMore
  } catch {
    // Silently ignore load-more failures
  } finally {
    loadingMore.value = false
  }
}

async function switchCategory(cat: string) {
  if (activeCategory.value === cat) return
  activeCategory.value = cat
  works.value = []
  nextCursor = null
  hasMore.value = true
  await loadInitial()
}

// ── Scroll ─────────────────────────────────────────────────────────────────

function onPageScroll(event: Event) {
  const el = event.target as HTMLElement
  if (!el) return
  heroVisible.value = el.scrollTop < 200

  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 400
  if (nearBottom) void loadMore()
}

// ── Submit ─────────────────────────────────────────────────────────────────

async function handleSubmit(text: string) {
  if (!text.trim() && attachmentChips.value.length === 0) return
  if (!text.trim()) return // Home requires text

  submitting.value = true
  try {
    const session = await api.createSession({})
    // NOTE: attachment upload omitted for simplicity — real impl uploads files first
    await api.sendPrompt(session.id, text.trim(), { source: 'home' })
    await router.push(`/sessions/${session.id}`)
  } catch (e) {
    $q.notify({
      color: 'negative',
      message: (e instanceof Error ? e.message : null) ?? '提交失败',
      icon: 'error',
    })
  } finally {
    submitting.value = false
  }
}

function handleAttachFiles(files: File[]) {
  files.forEach((f) => {
    attachmentChips.value.push({
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: f.name,
    })
  })
}

function removeAttachment(id: string) {
  attachmentChips.value = attachmentChips.value.filter((a) => a.id !== id)
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

onMounted(() => {
  void loadInitial()
})
</script>

<style scoped>
.home-page {
  background: #030713;
}

.home-page__header {
  background: rgba(3, 7, 19, 0.92) !important;
  backdrop-filter: blur(12px);
}

.home-page__header-inner {
  padding: 8px 16px 6px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
}

.home-page__composer {
  max-width: 640px;
  margin: 0 auto;
}

.home-page__chips {
  display: flex;
  gap: 4px;
  flex-wrap: nowrap;
  overflow-x: auto;
  padding: 8px 0 2px;
  justify-content: center;
}

.home-page__chips::-webkit-scrollbar { height: 0; }

.home-page__chips :deep(.q-chip) {
  flex-shrink: 0;
  font-size: 12px;
  padding: 0 10px;
  border-radius: 20px;
}

.home-page__chip--active :deep(.q-chip) {
  background: rgba(0, 229, 255, 0.12) !important;
  border-color: rgba(0, 229, 255, 0.35) !important;
  color: #00e5ff !important;
  font-weight: 600;
}

/* ── Page ────────────────────────────────────────────────────────────────── */

.home-page__page {
  padding: 0 16px 80px;
  overflow-y: auto;
}

/* ── Hero ────────────────────────────────────────────────────────────────── */

.home-page__hero {
  text-align: center;
  padding: 48px 16px 36px;
  transition: opacity 0.3s ease;
}

.home-page__hero-title {
  margin: 0;
  font-size: clamp(22px, 3.5vw, 28px);
  font-weight: 700;
  color: #00e5ff;
  text-shadow: 0 0 40px rgba(0, 229, 255, 0.2);
}

.home-page__hero-subtitle {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--imago-text-muted, #777);
}

/* ── Grid ────────────────────────────────────────────────────────────────── */

.home-page__grid {
  columns: 3;
  column-gap: 12px;
}

.home-page__card {
  break-inside: avoid;
  margin-bottom: 12px;
  border-radius: var(--imago-radius-md, 8px);
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.home-page__card:hover {
  transform: scale(1.015);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
  border-color: rgba(255, 255, 255, 0.1);
}

.home-page__card-img {
  width: 100%;
  display: block;
  object-fit: cover;
}

.home-page__card-img--placeholder {
  height: 160px;
  background: linear-gradient(135deg, rgba(0, 229, 255, 0.08), rgba(0, 229, 255, 0.02));
}

.home-page__card-body {
  padding: 10px 12px 12px;
}

.home-page__card-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--imago-text-primary, #e0e0e0);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.home-page__card-tags {
  display: flex;
  gap: 4px;
  margin-top: 6px;
}

.home-page__card-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(0, 229, 255, 0.08);
  color: rgba(0, 229, 255, 0.6);
  border: 1px solid rgba(0, 229, 255, 0.1);
}

/* ── Skeleton ────────────────────────────────────────────────────────────── */

.home-page__skeleton-card {
  break-inside: avoid;
  margin-bottom: 12px;
  border-radius: var(--imago-radius-md, 8px);
  overflow: hidden;
  background: rgba(255, 255, 255, 0.03);
}

.home-page__skeleton-img {
  height: 160px;
  background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 100%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

.home-page__skeleton-line {
  height: 14px;
  margin: 10px 10px 14px;
  background: rgba(255,255,255,0.04);
  border-radius: 4px;
  width: 70%;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* ── States ──────────────────────────────────────────────────────────────── */

.home-page__loading-more {
  display: flex;
  justify-content: center;
  padding: 20px 0;
}

.home-page__end,
.home-page__empty,
.home-page__error {
  text-align: center;
  padding: 40px 0;
  font-size: 13px;
  color: var(--imago-text-dim, #666);
}

.home-page__empty-icon {
  font-size: 40px;
  margin-bottom: 8px;
  opacity: 0.5;
}

/* ── Responsive ──────────────────────────────────────────────────────────── */

@media (max-width: 768px) {
  .home-page__grid { columns: 2; }
}

@media (max-width: 480px) {
  .home-page__grid { columns: 1; }
  .home-page__hero { padding: 32px 12px 24px; }
}
</style>
