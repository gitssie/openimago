<!-- ═══════════════════════════════════════════════════════════════════════════
 PROTOTYPE — 首页 Gallery 瀑布流 + 固定 Composer
 Throwaway: validates UILayout composer + infinite waterfall UX.
 ═══════════════════════════════════════════════════════════════════════════ -->
<template>
  <UILayout view="hHh Lpr fFf" class="proto-home">
    <!-- ── Fixed Header: Composer + Category Chips ── -->
    <UILayoutHeader bordered :height-hint="headerHeight" class="proto-home__header">
      <div class="proto-home__header-inner">
        <div class="proto-home__badge">PROTOTYPE</div>

        <!-- Reuse real AgentPromptInput for authentic feel -->
        <AgentPromptInput
          :draft="draft"
          :loading="false"
          :connected="true"
          :disabled="false"
          :attachments="mockAttachments"
          class="proto-home__composer"
          @update:draft="draft = $event"
          @submit="handleHomeSubmit"
          @remove-attachment="removeAttachment"
          @attach-files="handleAttachFiles"
        />

        <!-- Category chips — single select -->
        <div class="proto-home__chips">
          <q-chip
            v-for="cat in ALL_CATEGORIES"
            :key="cat.value"
            :outline="activeCategory !== cat.value"
            :color="activeCategory === cat.value ? 'cyan' : 'grey-6'"
            :clickable="true"
            :class="{ 'proto-home__chip--active': activeCategory === cat.value }"
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
      <UILayoutPage class="proto-home__page" @scroll="onPageScroll">
        <!-- Hero -->
        <div v-if="heroVisible" class="proto-home__hero">
          <h1 class="proto-home__hero-title">从灵感开始创作</h1>
          <p class="proto-home__hero-subtitle">浏览官方精选作品，一键开始你的 AI 创作之旅</p>
        </div>

        <!-- Loading skeleton -->
        <div v-if="loading" class="proto-home__skeleton">
          <div v-for="n in 6" :key="n" class="proto-home__skeleton-card">
            <div class="proto-home__skeleton-img" />
            <div class="proto-home__skeleton-line" />
          </div>
        </div>

        <!-- Waterfall grid -->
        <div v-else class="proto-home__waterfall">
          <div
            v-for="(work, idx) in visibleWorks"
            :key="work.slug"
            class="proto-home__card"
            @click="openDetail(work.slug)"
          >
            <div
              class="proto-home__card-img"
              :style="cardImageStyle(work.category, idx)"
            >
              <span class="proto-home__card-img-label">PROTO</span>
            </div>
            <div class="proto-home__card-body">
              <h3 class="proto-home__card-title">{{ work.title }}</h3>
              <div class="proto-home__card-tags">
                <span v-for="tag in work.tags" :key="tag" class="proto-home__card-tag">{{ tag }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Loading more indicator -->
        <div v-if="!loading && hasMore" class="proto-home__loading-more">
          <q-spinner color="cyan" size="24px" />
          <span class="proto-home__loading-text">加载更多作品...</span>
        </div>

        <!-- End indicator -->
        <div v-if="!hasMore && visibleWorks.length > 0" class="proto-home__end">
          已展示全部作品 ({{ visibleWorks.length }})
        </div>

        <!-- Empty state -->
        <div v-if="!loading && visibleWorks.length === 0" class="proto-home__empty">
          <div class="proto-home__empty-icon">🖼️</div>
          <p>该分类暂无作品</p>
        </div>
      </UILayoutPage>
    </UILayoutPageContainer>
  </UILayout>

  <!-- ── Submit feedback dialog ── -->
  <q-dialog v-model="showSubmitFeedback">
    <q-card class="proto-feedback-card">
      <q-card-section class="proto-feedback-card__header">
        <div class="proto-feedback-card__title">WOULD SUBMIT</div>
        <q-badge color="cyan" :label="lastSubmitMeta?.source ?? 'home'" />
      </q-card-section>
      <q-card-section>
        <pre class="proto-feedback-card__json">{{ JSON.stringify(lastSubmitState, null, 2) }}</pre>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="关闭" color="grey" v-close-popup />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AgentPromptInput from 'src/components/AgentPromptInput.vue'
import { UILayout, UILayoutHeader, UILayoutPageContainer, UILayoutPage } from 'src/components/ui/layout'
import { ALL_CATEGORIES, generateWorks, getGradient, type GalleryWork } from './mock-gallery'

/* ═══════════════════════ PROTO LABEL ═══════════════════════════════════════ */
console.log('%c[PROTOTYPE] GalleryHomePrototype %c— throwaway, not production',
  'color:#ff2d55;font-weight:bold', 'color:#999')

/* ═══════════════════════ REPLACE ME IN REAL IMPL ══════════════════════════ */
console.warn('👉 REPLACE: mock data loaded from mock-gallery.ts — real impl uses GET /api/gallery')

/* ═══════════════════════ STATE ═════════════════════════════════════════════ */

const router = useRouter()
const draft = ref('')
const activeCategory = ref('all')
const loading = ref(true)
const allWorks = ref<GalleryWork[]>([])
const visibleWorks = ref<GalleryWork[]>([])
const hasMore = ref(true)
const heroVisible = ref(true)
const headerHeight = ref(120)
const showSubmitFeedback = ref(false)
const lastSubmitState = ref<Record<string, unknown>>({})
const lastSubmitMeta = ref<{ source: string; referenceWorkSlug?: string }>()

const PAGE_SIZE = 8
let currentCursor = 0

const mockAttachments = ref<{ id: string; name: string; mime: string; url: string }[]>([])

/* ═══════════════════════ COMPUTED ══════════════════════════════════════════ */

function cardImageStyle(category: string, idx: number) {
  // Randomize card height for masonry effect
  const aspectH = 180 + ((idx * 73 + 17) % 120)
  return {
    background: getGradient(category, idx),
    height: `${aspectH}px`,
  }
}

/* ═══════════════════════ METHODS ═══════════════════════════════════════════ */

function loadInitial() {
  loading.value = true
  // Simulate network delay
  setTimeout(() => {
    const all = generateWorks(30)
    allWorks.value = all
    visibleWorks.value = all.slice(0, PAGE_SIZE)
    currentCursor = PAGE_SIZE
    hasMore.value = currentCursor < all.length
    loading.value = false
  }, 600)
}

function loadMore() {
  if (!hasMore.value || loading.value) return
  // Simulate network delay
  setTimeout(() => {
    const next = allWorks.value.slice(currentCursor, currentCursor + PAGE_SIZE)
    visibleWorks.value = [...visibleWorks.value, ...next]
    currentCursor += PAGE_SIZE
    hasMore.value = currentCursor < allWorks.value.length
  }, 400)
}

function switchCategory(cat: string) {
  activeCategory.value = cat
  loading.value = true
  visibleWorks.value = []
  currentCursor = 0

  setTimeout(() => {
    const filtered = cat === 'all'
      ? generateWorks(30)
      : generateWorks(30).filter(w => w.category === cat)
    allWorks.value = filtered
    visibleWorks.value = filtered.slice(0, PAGE_SIZE)
    currentCursor = PAGE_SIZE
    hasMore.value = currentCursor < filtered.length
    loading.value = false
  }, 400)
}

function openDetail(slug: string) {
  void router.push(`/__proto__/gallery/${slug}`)
}

function onPageScroll(event: Event) {
  const el = event.target as HTMLElement
  if (!el) return
  const scrollY = el.scrollTop

  // Hide hero after scrolling past it
  heroVisible.value = scrollY < 200

  // Infinite scroll: load more when near bottom
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 400
  if (nearBottom && hasMore.value && !loading.value) {
    loadMore()
  }
}

/* ═══════════════════════ SUBMIT HANDLERS ══════════════════════════════════ */

function handleHomeSubmit(text: string) {
  if (!text.trim()) return

  lastSubmitState.value = {
    action: 'createSession → upload → sendMessage',
    text: text.trim(),
    attachments: mockAttachments.value.map(a => ({ id: a.id, name: a.name })),
    metadata: { source: 'home' },
    then: 'router.push(`/sessions/:id`)',
  }
  lastSubmitMeta.value = { source: 'home' }
  showSubmitFeedback.value = true

  console.log('[PROTOTYPE] Home submit:', lastSubmitState.value)
}

function handleAttachFiles(files: File[]) {
  files.forEach(f => {
    mockAttachments.value.push({
      id: `proto-attach-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: f.name,
      mime: f.type,
      url: '#',
    })
  })
}

function removeAttachment(id: string) {
  mockAttachments.value = mockAttachments.value.filter(a => a.id !== id)
}

/* ═══════════════════════ LIFECYCLE ════════════════════════════════════════ */

onMounted(() => {
  loadInitial()
})
</script>

<style scoped>
/* ── Page shell ──────────────────────────────────────────────────────────── */
.proto-home {
  position: relative;
}

.proto-home__header {
  background: rgba(3, 7, 19, 0.92) !important;
  backdrop-filter: blur(12px);
}

.proto-home__header-inner {
  padding: 8px 16px 8px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
}

.proto-home__badge {
  text-align: center;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--q-color-cyan, #00e5ff);
  font-family: monospace;
  margin-bottom: 2px;
}

.proto-home__composer {
  max-width: 640px;
  margin: 0 auto;
}

.proto-home__chips {
  display: flex;
  gap: 4px;
  flex-wrap: nowrap;
  overflow-x: auto;
  padding: 10px 0 4px;
  justify-content: center;
  -webkit-overflow-scrolling: touch;
}

.proto-home__chips::-webkit-scrollbar {
  height: 0;
}

.proto-home__chips :deep(.q-chip) {
  flex-shrink: 0;
  font-size: 12px;
  padding: 0 10px;
  border-radius: 20px;
  transition: all 0.15s ease;
}

.proto-home__chip--active :deep(.q-chip) {
  background: rgba(0, 229, 255, 0.12) !important;
  border-color: rgba(0, 229, 255, 0.35) !important;
  color: #00e5ff !important;
  font-weight: 600;
}

/* ── Page content ────────────────────────────────────────────────────────── */

.proto-home__page {
  padding: 0 16px 80px;
  overflow-y: auto;
  overflow-x: hidden;
  scroll-behavior: smooth;
}

/* ── Hero ────────────────────────────────────────────────────────────────── */

.proto-home__hero {
  text-align: center;
  padding: 48px 16px 36px;
  transition: opacity 0.3s ease;
}

.proto-home__hero-title {
  margin: 0;
  font-size: clamp(24px, 4vw, 32px);
  font-weight: 700;
  color: var(--q-color-cyan, #00e5ff);
  letter-spacing: 0.02em;
  text-shadow: 0 0 40px rgba(0, 229, 255, 0.25);
}

.proto-home__hero-subtitle {
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--imago-text-muted, #888);
  font-weight: 400;
}

/* ── Skeleton ────────────────────────────────────────────────────────────── */

.proto-home__skeleton {
  columns: 3;
  column-gap: 12px;
}

.proto-home__skeleton-card {
  break-inside: avoid;
  margin-bottom: 12px;
  border-radius: var(--imago-radius-md, 8px);
  overflow: hidden;
  background: rgba(255, 255, 255, 0.03);
}

.proto-home__skeleton-img {
  height: 180px;
  background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 100%);
  background-size: 200% 100%;
  animation: proto-shimmer 1.5s ease-in-out infinite;
}

.proto-home__skeleton-line {
  height: 14px;
  margin: 10px 10px 14px;
  background: rgba(255,255,255,0.04);
  border-radius: 4px;
  width: 70%;
}

@keyframes proto-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* ── Waterfall ───────────────────────────────────────────────────────────── */

.proto-home__waterfall {
  columns: 3;
  column-gap: 12px;
}

.proto-home__card {
  break-inside: avoid;
  margin-bottom: 12px;
  border-radius: var(--imago-radius-md, 8px);
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.proto-home__card:hover {
  transform: scale(1.015);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
  border-color: rgba(255, 255, 255, 0.1);
}

.proto-home__card-img {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.proto-home__card-img-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  color: rgba(255, 255, 255, 0.4);
  font-family: monospace;
  text-transform: uppercase;
}

.proto-home__card-body {
  padding: 10px 12px 12px;
}

.proto-home__card-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--imago-text-primary, #e0e0e0);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.proto-home__card-tags {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  flex-wrap: wrap;
}

.proto-home__card-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(0, 229, 255, 0.08);
  color: rgba(0, 229, 255, 0.6);
  border: 1px solid rgba(0, 229, 255, 0.1);
  white-space: nowrap;
}

/* ── Loading more ────────────────────────────────────────────────────────── */

.proto-home__loading-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 0;
}

.proto-home__loading-text {
  font-size: 12px;
  color: var(--imago-text-dim, #666);
}

/* ── End / Empty ─────────────────────────────────────────────────────────── */

.proto-home__end,
.proto-home__empty {
  text-align: center;
  padding: 40px 0;
  font-size: 13px;
  color: var(--imago-text-dim, #666);
}

.proto-home__empty-icon {
  font-size: 40px;
  margin-bottom: 8px;
  opacity: 0.5;
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

/* ── Responsive columns ──────────────────────────────────────────────────── */

@media (max-width: 768px) {
  .proto-home__waterfall {
    columns: 2;
  }
  .proto-home__skeleton {
    columns: 2;
  }
}

@media (max-width: 480px) {
  .proto-home__waterfall {
    columns: 1;
  }
  .proto-home__skeleton {
    columns: 1;
  }
  .proto-home__hero {
    padding: 32px 12px 24px;
  }
}
</style>
