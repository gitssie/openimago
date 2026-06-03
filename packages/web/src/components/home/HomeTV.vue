<template>
  <section class="home-tv">
    <header class="home-tv__head">
      <h2 class="home-tv__title">{{ t('gallery.tvTitle') }}</h2>
      <div class="home-tv__tabs" role="tablist">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.value"
          :class="['home-tv__tab', { 'is-active': activeTab === tab.value }]"
          @click="activeTab = tab.value"
        >{{ tab.label }}</button>
      </div>
    </header>

    <div v-if="loading" class="home-tv__grid">
      <div v-for="n in 5" :key="n" class="home-tv__skeleton">
        <div class="home-tv__skeleton-media" />
        <div class="home-tv__skeleton-line" />
      </div>
    </div>

    <div v-else-if="pageWorks.length === 0" class="home-tv__empty">
      <q-icon name="movie_filter" size="22px" />
      <span>{{ t('gallery.homeEmpty') }}</span>
    </div>

    <div v-else class="home-tv__grid">
      <div v-if="pageWorks[0]" class="home-tv__featured">
        <HomeWorkCard
          :work="pageWorks[0]"
          size="lg"
          @click="open(pageWorks[0])"
          @play="play"
        />
        <button
          v-if="pageCount > 1"
          type="button"
          class="home-tv__nav home-tv__nav--prev"
          :aria-label="t('gallery.tvPrev')"
          @click="cycle(-1)"
        >
          <q-icon name="chevron_left" size="20px" />
        </button>
        <button
          v-if="pageCount > 1"
          type="button"
          class="home-tv__nav home-tv__nav--next"
          :aria-label="t('gallery.tvNext')"
          @click="cycle(1)"
        >
          <q-icon name="chevron_right" size="20px" />
        </button>
        <div v-if="pageCount > 1" class="home-tv__dots" role="tablist">
          <button
            v-for="p in pageCount"
            :key="p"
            type="button"
            :aria-selected="p - 1 === pageIndex"
            :class="['home-tv__dot', { 'is-active': p - 1 === pageIndex }]"
            @click="pageIndex = p - 1"
          />
        </div>
      </div>
      <HomeWorkCard
        v-for="work in sideWorks"
        :key="work.slug"
        :work="work"
        size="sm"
        @click="open(work)"
        @play="emit('play', work)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import type { GalleryCard } from 'src/api/client'
import HomeWorkCard from './HomeWorkCard.vue'

const { t } = useI18n()
const router = useRouter()

const props = defineProps<{
  works: GalleryCard[]
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'play', work: GalleryCard): void
}>()

const tabs = [
  { value: 'all',      label: t('gallery.tvTabAll') },
  { value: 'short',    label: t('gallery.tvTabShort') },
  { value: 'tutorial', label: t('gallery.tvTabTutorial') },
  { value: 'case',     label: t('gallery.tvTabCase') },
  { value: 'mv',       label: t('gallery.tvTabMv') },
  { value: 'tvc',      label: t('gallery.tvTabTvc') },
]
const activeTab = ref('all')

const PAGE_SIZE = 5
const pageIndex = ref(0)
const pageCount = computed(() => Math.max(1, Math.ceil(props.works.length / PAGE_SIZE)))

const pageWorks = computed<GalleryCard[]>(() => {
  const start = pageIndex.value * PAGE_SIZE
  return props.works.slice(start, start + PAGE_SIZE)
})

const sideWorks = computed<GalleryCard[]>(() => pageWorks.value.slice(1, 5))

function cycle(delta: number) {
  const next = (pageIndex.value + delta + pageCount.value) % pageCount.value
  pageIndex.value = next
}

function open(work: GalleryCard) {
  void router.push(`/gallery/${work.slug}`)
}

function play(work: GalleryCard) {
  emit('play', work)
}
</script>

<style lang="scss" scoped>
.home-tv {
  position: relative;
  z-index: 1;
  margin: 56px auto 0;
  max-width: 1200px;
  padding: 0 8px;
}

.home-tv__head {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}

.home-tv__title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  background: linear-gradient(90deg, #a855f7 0%, #ec4899 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  letter-spacing: -0.01em;
}

.home-tv__tabs {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.home-tv__tab {
  height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--imago-text-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background var(--imago-ease-fast),
    color var(--imago-ease-fast);
}

.home-tv__tab:hover:not(.is-active) {
  color: var(--imago-text-primary);
  background: var(--imago-bg-raised);
}

.home-tv__tab.is-active {
  color: var(--imago-text-primary);
  background: var(--imago-bg-raised);
  font-weight: 600;
}

.home-tv__grid {
  display: grid;
  grid-template-columns: 1.7fr 1fr 1fr 1fr 1fr;
  gap: 14px;
  align-items: stretch;
}

.home-tv__featured {
  position: relative;
  grid-column: span 1;
}

.home-tv__nav {
  position: absolute;
  top: 50%;
  width: 32px;
  height: 32px;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  border: 1px solid var(--imago-border-cyan-active);
  border-radius: 50%;
  background: rgba(8, 8, 15, 0.65);
  color: var(--imago-text-primary);
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--imago-ease-smooth);
  z-index: 2;
  backdrop-filter: var(--imago-blur-light);
}

.home-tv__featured:hover .home-tv__nav {
  opacity: 1;
}

.home-tv__nav--prev { left: 10px; }
.home-tv__nav--next { right: 10px; }

.home-tv__dots {
  position: absolute;
  bottom: 14px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
  z-index: 2;
}

.home-tv__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: 0;
  padding: 0;
  background: var(--imago-border-dim);
  cursor: pointer;
  transition:
    background var(--imago-ease-fast),
    transform var(--imago-ease-fast);
}

.home-tv__dot.is-active {
  background: var(--imago-neon-purple);
  transform: scale(1.2);
  box-shadow: 0 0 6px rgba(168, 85, 247, 0.6);
}

.home-tv__empty {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 40px 20px;
  border: 1px dashed var(--imago-border-light);
  border-radius: var(--imago-radius-lg);
  color: var(--imago-text-dim);
  font-size: 13px;
}

// Skeleton
.home-tv__skeleton {
  border-radius: var(--imago-radius-lg);
  overflow: hidden;
  background: var(--imago-bg-surface);
  border: 1px solid var(--imago-border-subtle);
}

.home-tv__skeleton-media {
  aspect-ratio: 16 / 9;
  background: linear-gradient(90deg, rgba(255,255,255,0.02), rgba(0,240,255,0.06), rgba(255,255,255,0.02));
  background-size: 200% 100%;
  animation: tv-shimmer 1.6s ease-in-out infinite;
}

.home-tv__skeleton-line {
  height: 12px;
  margin: 12px 14px 16px;
  border-radius: 3px;
  background: rgba(255,255,255,0.04);
}

@keyframes tv-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}

@media (max-width: 1200px) {
  .home-tv__grid {
    grid-template-columns: 1fr 1fr 1fr;
  }
  .home-tv__featured {
    grid-column: span 3;
  }
}

@media (max-width: 768px) {
  .home-tv__grid {
    grid-template-columns: 1fr 1fr;
  }
  .home-tv__featured {
    grid-column: span 2;
  }
}

@media (max-width: 480px) {
  .home-tv__grid {
    grid-template-columns: 1fr;
  }
  .home-tv__featured {
    grid-column: span 1;
  }
}
</style>
