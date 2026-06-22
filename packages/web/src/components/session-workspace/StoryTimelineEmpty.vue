<!--
  StoryTimelineEmpty
  ──────────────────
  Empty-state placeholder for the project workspace "时间线" (timeline) tab.
  Rendered in place of StoryTimelinePanel when there is no episode to show.
  Purely presentational — owns no data, fetches nothing. The parent (page)
  decides which variant applies via the `hasEpisodes` prop.

  Two variants:
    1. hasEpisodes = true  → episodes exist but none is selected. Guides the
       user back to the overview to pick one, and offers a primary CTA that
       emits `go-to-overview`.
    2. hasEpisodes = false → the story has no episodes yet. Guides the user to
       create a storyboard first. No CTA (that flow lives elsewhere).

  Visual language is the shared `.section-empty` pattern lifted from
  StoryTimelinePanel.vue (dashed frame + glyph + title + hint), extended with
  one primary action button that uses the project's established cyan accent
  tokens. Nothing here invents new aesthetics.
-->

<template>
  <section class="timeline-empty" aria-label="生成时间线">
    <div class="section-empty">
      <div class="section-empty__frame" aria-hidden="true">
        <OiIcon :name="glyph" :size="22" />
      </div>

      <p class="section-empty__title">{{ title }}</p>
      <p class="section-empty__hint">{{ hint }}</p>

      <button
        v-if="props.hasEpisodes"
        type="button"
        class="section-empty__cta"
        @click="onGoToOverview"
      >
        <OiIcon name="storyboard" :size="14" />
        前往概览选择剧集
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import OiIcon from 'src/components/ui/OiIcon.vue'
import type { OiIconName } from 'src/components/ui/OiIcon.vue'

// ── Props ────────────────────────────────────────────────────────────────────

const props = defineProps<{
  /** Whether the story has any episodes at all. Drives which copy/CTA shows. */
  hasEpisodes: boolean
}>()

const emit = defineEmits<{
  /** User asked to jump to the overview tab to pick an episode (variant 1 only). */
  (e: 'go-to-overview'): void
}>()

// ── Variant-driven copy ────────────────────────────────────────────────────────

// `storyboard` reads as a clapperboard/film strip — fits the timeline subject.
const glyph = computed<OiIconName>(() => 'storyboard')

const title = computed<string>(() =>
  props.hasEpisodes ? '请选择一集开始' : '尚无剧集',
)

const hint = computed<string>(() =>
  props.hasEpisodes
    ? '在概览中选择一集后，这里会显示它的生成工作流与运行历史。'
    : '先在概览中创建分镜剧集，生成时间线会在这里出现。',
)

// ── Handlers ──────────────────────────────────────────────────────────────────

function onGoToOverview(): void {
  emit('go-to-overview')
}
</script>

<style lang="scss" scoped>
.timeline-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 22px;
  background: linear-gradient(180deg, var(--imago-bg-deep), var(--imago-bg-void) 40%);
}

// ── Section empty state (shared pattern, from StoryTimelinePanel) ──────────────

.section-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  max-width: 340px;
  padding: 30px 24px;
  border: 1px dashed var(--imago-border-soft);
  border-radius: var(--imago-radius-lg);
  text-align: center;
}

.section-empty__frame {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: var(--imago-radius-lg);
  background: radial-gradient(circle at center, rgba(0, 240, 255, 0.05), transparent 70%);
  border: 1px solid var(--imago-border-soft);
  color: var(--imago-neon-cyan);
}

.section-empty__title {
  margin: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--imago-text-secondary);
}

.section-empty__hint {
  margin: 0;
  max-width: 280px;
  font-size: 11px;
  line-height: 1.55;
  color: var(--imago-text-faint);
}

// ── Primary CTA (variant 1) — built from the established cyan accent tokens ────

.section-empty__cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 8px 16px;
  border: 1px solid var(--imago-border-cyan-active);
  border-radius: var(--imago-radius-pill);
  background: var(--imago-cyan-08);
  color: var(--imago-neon-cyan);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 120ms ease, box-shadow 120ms ease;
}

.section-empty__cta:hover {
  background: var(--imago-cyan-04);
  box-shadow: 0 0 18px rgba(0, 240, 255, 0.12);
}

.section-empty__cta:focus-visible {
  outline: 2px solid var(--imago-neon-cyan);
  outline-offset: 2px;
}

// ── Responsive ────────────────────────────────────────────────────────────────

@media (max-width: 900px) {
  .timeline-empty {
    padding: 16px 14px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .section-empty__cta {
    transition: none;
  }
}
</style>
