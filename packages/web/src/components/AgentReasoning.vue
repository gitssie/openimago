<template>
  <div class="reasoning-container">
    <button
      class="reasoning-header"
      type="button"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <span class="reasoning-header-label">
        <template v-if="heading">Thought · {{ heading }}</template>
        <template v-else>Thought</template>
      </span>
      <span v-if="durationDisplay" class="reasoning-header-duration"> · {{ durationDisplay }}</span>
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
import { computed, ref, watch } from 'vue';
import { MarkdownRender } from 'markstream-vue';
import type { ReasoningPart } from '@opencode-ai/sdk/v2';

interface Props {
  part: ReasoningPart;
  text?: string;
  turnDurationMs?: number | undefined;
}

const props = defineProps<Props>();
const displayText = computed(() => (props.text ?? props.part.text ?? '').trim());
// streaming = reasoning still in progress (time.end not yet set)
const streaming = computed(() => !props.part.time?.end);

// ── Heading extraction ────────────────────────────────────────────────────

function cleanHeadingText(value: string): string {
  return value
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~]+/g, '')
    .trim();
}

function extractHeading(text: string): string {
  const markdown = text.replace(/\r\n?/g, '\n');

  const html = markdown.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
  if (html?.[1]) {
    const value = cleanHeadingText(html[1].replace(/<[^>]+>/g, ' '));
    if (value) return value;
  }

  const atx = markdown.match(/^\s{0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+[ \t]*)?$/m);
  if (atx?.[1]) {
    const value = cleanHeadingText(atx[1]);
    if (value) return value;
  }

  const setext = markdown.match(/^([^\n]+)\n(?:=+|-+)\s*$/m);
  if (setext?.[1]) {
    const value = cleanHeadingText(setext[1]);
    if (value) return value;
  }

  const strong = markdown.match(/^\s*(?:\*\*|__)(.+?)(?:\*\*|__)\s*$/m);
  if (strong?.[1]) {
    const value = cleanHeadingText(strong[1]);
    if (value) return value;
  }

  return '';
}

const heading = computed(() => extractHeading(displayText.value));

// ── Duration display ──────────────────────────────────────────────────────

const durationDisplay = computed(() => {
  const ms = props.turnDurationMs;
  if (typeof ms !== 'number' || ms < 0) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
});

// ── Collapsible state ─────────────────────────────────────────────────────

const expanded = ref(streaming.value);

watch(streaming, (isStreaming) => {
  if (!isStreaming) {
    expanded.value = false;
  }
});
</script>

<style lang="scss" scoped>
.reasoning-container {
  width: 100%;
}

.reasoning-header {
  display: inline-flex;
  align-items: center;
  gap: 2px;
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

.reasoning-header-label {
  font-weight: 500;
}

.reasoning-header-duration {
  font-weight: 400;
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
