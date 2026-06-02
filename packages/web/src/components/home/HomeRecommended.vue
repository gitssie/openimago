<template>
  <section class="home-recommended">
    <header class="home-recommended__head">
      <h2 class="home-recommended__title">{{ t('gallery.recommendedTitle') }}</h2>
      <RouterLink to="/gallery" class="home-recommended__more">
        <span>{{ t('gallery.more') }}</span>
        <q-icon name="chevron_right" size="14px" />
      </RouterLink>
    </header>

    <div v-if="loading" class="home-recommended__grid">
      <div v-for="n in 6" :key="n" class="home-recommended__skeleton">
        <div class="home-recommended__skeleton-media" />
        <div class="home-recommended__skeleton-line" />
      </div>
    </div>

    <div v-else class="home-recommended__grid">
      <HomeWorkCard
        v-for="work in works"
        :key="work.slug"
        :work="work"
        size="md"
        @click="open(work)"
        @play="emit('play', work)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter, RouterLink } from 'vue-router'
import type { GalleryCard } from 'src/api/client'
import HomeWorkCard from './HomeWorkCard.vue'

const { t } = useI18n()
const router = useRouter()

defineProps<{
  works: GalleryCard[]
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'play', work: GalleryCard): void
}>()

function open(work: GalleryCard) {
  void router.push(`/gallery/${work.slug}`)
}
</script>

<style lang="scss" scoped>
.home-recommended {
  position: relative;
  z-index: 1;
  margin: 56px auto 0;
  max-width: 1200px;
  padding: 0 8px;
}

.home-recommended__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}

.home-recommended__title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--imago-text-primary);
  letter-spacing: -0.01em;
}

.home-recommended__more {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 6px 10px;
  border-radius: 6px;
  color: var(--imago-text-muted);
  font-size: 13px;
  text-decoration: none;
  transition:
    color var(--imago-ease-fast),
    background var(--imago-ease-fast);
}

.home-recommended__more:hover {
  color: var(--imago-text-primary);
  background: var(--imago-bg-raised);
}

.home-recommended__grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 14px;
}

.home-recommended__skeleton {
  border-radius: var(--imago-radius-lg);
  overflow: hidden;
  background: var(--imago-bg-surface);
  border: 1px solid var(--imago-border-subtle);
}

.home-recommended__skeleton-media {
  aspect-ratio: 4 / 3;
  background: linear-gradient(90deg, rgba(255,255,255,0.02), rgba(0,240,255,0.06), rgba(255,255,255,0.02));
  background-size: 200% 100%;
  animation: rec-shimmer 1.6s ease-in-out infinite;
}

.home-recommended__skeleton-line {
  height: 10px;
  margin: 12px 12px 16px;
  border-radius: 3px;
  background: rgba(255,255,255,0.04);
}

@keyframes rec-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}

@media (max-width: 1200px) {
  .home-recommended__grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (max-width: 768px) {
  .home-recommended__grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
