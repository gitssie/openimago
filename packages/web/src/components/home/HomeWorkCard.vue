<template>
  <article
    :class="['home-work-card', `home-work-card--${size}`]"
    @click="emit('click', work)"
  >
    <div class="home-work-card__media">
      <img
        v-if="work.thumbnailUrl"
        :src="work.thumbnailUrl"
        :alt="work.title"
        class="home-work-card__img"
        loading="lazy"
      >
      <div v-else class="home-work-card__placeholder">
        <svg class="home-work-card__placeholder-grid" aria-hidden="true">
          <defs>
            <pattern :id="`ph-${work.slug}`" width="14" height="14" patternUnits="userSpaceOnUse">
              <path d="M 14 0 L 0 0 0 14" fill="none" stroke="rgba(0,240,255,0.10)" stroke-width="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" :fill="`url(#ph-${work.slug})`" />
        </svg>
        <span class="home-work-card__placeholder-glyph">{{ glyph }}</span>
      </div>

      <!-- Gradient bottom veil for legibility -->
      <div class="home-work-card__veil" aria-hidden="true" />

      <!-- Top-left category badge -->
      <span v-if="categoryLabel" class="home-work-card__badge">{{ categoryLabel }}</span>

      <!-- Centered play button — always visible per reference -->
      <button type="button" class="home-work-card__play" @click.stop="emit('play', work)">
        <q-icon name="play_arrow" size="22px" />
      </button>

      <!-- Bottom-right duration pill (if video) -->
      <span v-if="work.duration" class="home-work-card__duration">
        <q-icon name="schedule" size="11px" />
        {{ work.duration }}
      </span>

      <!-- Title block — anchored to bottom-left of media -->
      <div v-if="size !== 'sm'" class="home-work-card__title-block">
        <h3 class="home-work-card__title">{{ work.title }}</h3>
        <p v-if="subtitle" class="home-work-card__subtitle">{{ subtitle }}</p>
      </div>
    </div>

    <!-- Title block for small cards lives below the media -->
    <div v-if="size === 'sm'" class="home-work-card__body">
      <h3 class="home-work-card__title">{{ work.title }}</h3>
      <p v-if="subtitle" class="home-work-card__subtitle">{{ subtitle }}</p>
    </div>

    <!-- Meta row — only for non-sm cards (the sm variant already shows
         duration as an overlay chip; the larger cards get a meta strip
         with resolution/tags/creator). -->
    <div v-if="size !== 'sm' && (work.resolution || displayTags.length || work.creator)" class="home-work-card__meta">
      <span v-if="work.duration" class="home-work-card__meta-item home-work-card__meta-item--accent">
        <q-icon name="schedule" size="11px" />
        <span>{{ work.duration }}</span>
      </span>
      <span v-if="work.resolution" class="home-work-card__meta-item">{{ work.resolution }}</span>
      <span
        v-for="tag in displayTags"
        :key="tag"
        class="home-work-card__meta-item"
      >{{ tag }}</span>
      <span v-if="work.creator" class="home-work-card__creator">{{ work.creator }}</span>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { GalleryCard } from 'src/api/client'

const props = withDefaults(
  defineProps<{
    work: GalleryCard
    size?: 'sm' | 'md' | 'lg'
  }>(),
  { size: 'md' },
)

const emit = defineEmits<{
  (e: 'click', work: GalleryCard): void
  (e: 'play', work: GalleryCard): void
}>()

const glyph = computed(() => props.work.title?.[0] ?? '?')
const categoryLabel = computed(() => props.work.categoryLabel ?? null)
const subtitle = computed(() => props.work.subtitleZh ?? props.work.subtitle ?? '')
const displayTags = computed(() => (props.work.tags ?? []).slice(0, 2))
</script>

<style lang="scss" scoped>
.home-work-card {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--imago-bg-surface);
  border: 1px solid var(--imago-border-subtle);
  border-radius: var(--imago-radius-lg);
  overflow: hidden;
  cursor: pointer;
  transition:
    transform var(--imago-ease-smooth),
    border-color var(--imago-ease-smooth),
    box-shadow var(--imago-ease-smooth);
}

.home-work-card:hover {
  transform: translateY(-2px);
  border-color: var(--imago-border-cyan-active);
  box-shadow: var(--imago-glow-cyan-soft);
}

// ── Media ─────────────────────────────────────────────────────────────
.home-work-card__media {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: linear-gradient(135deg, rgba(0, 240, 255, 0.06), rgba(168, 85, 247, 0.04));
  overflow: hidden;
}

.home-work-card--lg .home-work-card__media {
  aspect-ratio: 16 / 9;
}
.home-work-card--sm .home-work-card__media {
  aspect-ratio: 4 / 3;
}

.home-work-card__img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  transition: transform 0.5s cubic-bezier(0.2, 0.7, 0.2, 1);
}

.home-work-card:hover .home-work-card__img {
  transform: scale(1.05);
}

.home-work-card__placeholder {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(ellipse 70% 70% at 50% 30%, rgba(0, 240, 255, 0.10), transparent 60%),
    linear-gradient(135deg, rgba(0, 240, 255, 0.04), rgba(168, 85, 247, 0.04));
}

.home-work-card__placeholder-glyph {
  position: relative;
  z-index: 1;
  font-size: clamp(36px, 5vw, 64px);
  font-weight: 800;
  color: var(--imago-text-faint);
  text-shadow: 0 0 30px rgba(0, 240, 255, 0.20);
  letter-spacing: -0.04em;
}

.home-work-card__placeholder-grid {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0.6;
}

// ── Veil (gradient at bottom for title legibility) ───────────────────
.home-work-card__veil {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(3, 7, 19, 0.0) 35%, rgba(3, 7, 19, 0.85) 100%);
  pointer-events: none;
}

// ── Top-left badge ────────────────────────────────────────────────────
.home-work-card__badge {
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 3px 9px;
  border-radius: 6px;
  background: rgba(8, 8, 15, 0.55);
  backdrop-filter: var(--imago-blur-light);
  -webkit-backdrop-filter: var(--imago-blur-light);
  color: #d8e8ff;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
  z-index: 2;
}

// ── Centered play button (always visible) ────────────────────────────
.home-work-card__play {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -55%);
  width: 56px;
  height: 56px;
  border: 0;
  border-radius: 50%;
  background: rgba(0, 240, 255, 0.85);
  color: #030713;
  cursor: pointer;
  display: grid;
  place-items: center;
  z-index: 2;
  box-shadow:
    0 0 24px rgba(0, 240, 255, 0.45),
    inset 0 0 12px rgba(255, 255, 255, 0.20);
  transition:
    transform var(--imago-ease-smooth),
    background var(--imago-ease-smooth);
}

.home-work-card--sm .home-work-card__play {
  width: 44px;
  height: 44px;
}

.home-work-card:hover .home-work-card__play {
  transform: translate(-50%, -55%) scale(1.06);
  background: var(--imago-neon-cyan);
}

// ── Bottom-right duration ─────────────────────────────────────────────
.home-work-card__duration {
  position: absolute;
  bottom: 10px;
  right: 10px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(8, 8, 15, 0.65);
  backdrop-filter: var(--imago-blur-light);
  -webkit-backdrop-filter: var(--imago-blur-light);
  color: var(--imago-text-primary);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  z-index: 2;
}

// ── Title block (anchored to media bottom for lg/md) ─────────────────
.home-work-card__title-block {
  position: absolute;
  bottom: 14px;
  left: 16px;
  right: 16px;
  z-index: 2;
}

.home-work-card__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.2;
  color: #fff;
  text-shadow: 0 0 12px rgba(0, 0, 0, 0.45);
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.home-work-card--lg .home-work-card__title {
  font-size: 22px;
  font-weight: 700;
}

.home-work-card__subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

// ── Meta row (lg/md only) ─────────────────────────────────────────────
.home-work-card__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 16px 14px;
  font-size: 11px;
  color: var(--imago-text-dim);
}

.home-work-card__meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--imago-text-muted);
  font-size: 11px;
}

.home-work-card__meta-item--accent {
  color: var(--imago-text-secondary);
}

.home-work-card__creator {
  margin-left: auto;
  font-size: 11px;
  color: var(--imago-text-muted);
}

// ── Body (sm only) ────────────────────────────────────────────────────
.home-work-card__body {
  padding: 12px 14px 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.home-work-card--sm .home-work-card__title {
  font-size: 13.5px;
  text-shadow: none;
  color: var(--imago-text-primary);
}

.home-work-card--sm .home-work-card__subtitle {
  font-size: 11.5px;
  color: var(--imago-text-dim);
}
</style>
