<template>
  <div class="reasoning-container">
    <button
      class="reasoning-header"
      type="button"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <svg
        class="reasoning-toggle-icon"
        width="8"
        height="8"
        viewBox="0 0 8 8"
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
      >
        <line x1="1" y1="4" x2="7" y2="4" />
        <line v-if="!expanded" x1="4" y1="1" x2="4" y2="7" />
      </svg>
      <span class="reasoning-header-label">
        <template v-if="streaming">Thinking...</template>
        <template v-else>Thought</template>
        <template v-if="durationDisplay"> · {{ durationDisplay }}</template>
      </span>
    </button>
    <div v-show="expanded" class="reasoning-content">
      <MarkdownRender
        :content="displayText"
        :final="!streaming"
        class="reasoning-markdown"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { MarkdownRender } from 'markstream-vue';
import type { ReasoningPart } from '@opencode-ai/sdk/v2';

interface Props {
  part: ReasoningPart;
  text?: string;
  /** True when the parent turn is still streaming (overrides part.time.end check) */
  turnActive?: boolean;
}

const props = defineProps<Props>();
const displayText = computed(() => (props.text ?? props.part.text ?? '').trim());
// streaming = reasoning still in progress: either the turn is still active OR time.end not yet set
const streaming = computed(() => props.turnActive || !props.part.time?.end);

// ── Duration display ──────────────────────────────────────────────────────

const durationDisplay = computed(() => {
  const { start, end } = (props.part.time ?? {}) as { start?: number; end?: number };
  if (typeof start !== 'number' || typeof end !== 'number') return '';
  const ms = end - start;
  if (ms < 0) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
});

// ── Collapsible state — default collapsed ─────────────────────────────────

const expanded = ref(false);
</script>

<style lang="scss" scoped>
.reasoning-container {
  width: 100%;
}

.reasoning-header {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0;
  margin: 16px 0 0;
  border: 0;
  background: transparent;
  color: rgba(128, 128, 128, 0.8);
  font-size: 13px;
  cursor: pointer;
  line-height: 1.4;
  user-select: none;

  &:hover {
    color: rgba(180, 180, 180, 0.9);
  }
}

.reasoning-toggle-icon {
  flex-shrink: 0;
}

.reasoning-header-label {
  font-weight: 500;
}

.reasoning-content {
  margin-top: 8px;
}

.reasoning-markdown {
  width: 100%;
  font-size: 13px;
  color: rgba(128, 128, 128, 0.8);
}
</style>
