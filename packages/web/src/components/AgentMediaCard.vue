<template>
  <div v-if="media" class="media-card" :class="`media-card--${media.kind}`">
    <!-- Kind badge -->
    <div class="media-card__kind-badge">
      <q-icon :name="kindIcon" size="12px" />
      <span>{{ kindLabel }}</span>
    </div>

    <!-- Image -->
    <div v-if="media.kind === 'image'" class="media-card__image-wrap">
      <img
        :src="media.result.access.preview.href"
        :alt="media.result.filename ?? 'Generated image'"
        :width="media.result.width"
        :height="media.result.height"
        class="media-card__image"
        loading="lazy"
        @error="onMediaError"
      />
    </div>

    <!-- Video -->
    <div v-else-if="media.kind === 'video'" class="media-card__video-wrap">
      <video
        controls
        :poster="media.result.access.poster?.href ?? undefined"
        class="media-card__video"
      >
        <source :src="media.result.access.preview.href" :type="media.result.mime" />
      </video>
    </div>

    <!-- Audio -->
    <div v-else-if="media.kind === 'audio'" class="media-card__audio-wrap">
      <audio controls class="media-card__audio">
        <source :src="media.result.access.preview.href" :type="media.result.mime" />
      </audio>
    </div>

    <!-- Filename caption -->
    <div v-if="media.result.filename" class="media-card__caption">
      <q-icon name="description" size="11px" />
      <span class="ellipsis">{{ media.result.filename }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { MediaToolOutputV1 } from 'src/services/media'

interface Props {
  media: MediaToolOutputV1 | null
}

const props = defineProps<Props>()

const media = computed(() => props.media)

const kindIcon = computed(() => {
  if (!media.value) return 'insert_drive_file'
  switch (media.value.kind) {
    case 'image': return 'image'
    case 'video': return 'play_circle'
    case 'audio': return 'audiotrack'
    default: return 'insert_drive_file'
  }
})

const kindLabel = computed(() => {
  if (!media.value) return 'Media'
  switch (media.value.kind) {
    case 'image': return 'Image'
    case 'video': return 'Video'
    case 'audio': return 'Audio'
    default: return 'Media'
  }
})

function onMediaError(event: Event) {
  // Dev console warning is acceptable per ADR 0002
  const kind = media.value?.kind ?? 'unknown'
  console.warn('[AgentMediaCard] Media load error:', kind)
  const target = event.target as HTMLElement | null
  if (target) {
    target.style.display = 'none'
  }
}
</script>

<style lang="scss" scoped>
// ── Container ─────────────────────────────────────────────────────────────────
.media-card {
  margin: 8px 0 8px 0;
  border-radius: var(--imago-radius-lg);
  overflow: hidden;
  border: 1px solid var(--imago-border-light);
  background: var(--imago-bg-raised);
  max-width: 480px;

  &--image {
    // image-specific: no extra styling needed
  }

  &--video {
    border-color: var(--imago-border-soft);
  }

  &--audio {
    border-color: var(--imago-border-soft);
    max-width: 360px;
  }
}

// ── Kind badge ────────────────────────────────────────────────────────────────
.media-card__kind-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  margin: 8px 10px 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--imago-text-dim);
  background: rgba(255, 255, 255, 0.05);
  border-radius: var(--imago-radius-xs);
}

// ── Image ─────────────────────────────────────────────────────────────────────
.media-card__image-wrap {
  padding: 8px 10px 10px;
}

.media-card__image {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: var(--imago-radius-md);
  border: 1px solid var(--imago-border-light);
  background: var(--imago-bg-code);
}

// ── Video ─────────────────────────────────────────────────────────────────────
.media-card__video-wrap {
  padding: 8px 10px 10px;
}

.media-card__video {
  display: block;
  width: 100%;
  border-radius: var(--imago-radius-md);
  outline: none;
  background: var(--imago-bg-code);
}

// ── Audio ─────────────────────────────────────────────────────────────────────
.media-card__audio-wrap {
  padding: 8px 10px;
}

.media-card__audio {
  display: block;
  width: 100%;
  height: 40px;
  outline: none;
}

// ── Caption ───────────────────────────────────────────────────────────────────
.media-card__caption {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border-top: 1px solid var(--imago-border-subtle);
  font-size: 11px;
  color: var(--imago-text-dim);
}
</style>
