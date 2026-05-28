<template>
  <AgentPartMeta :title="part.description" icon="task_alt">
    <div class="text-caption text-grey-7">Agent: {{ part.agent }}</div>
    <div v-if="part.command" class="q-mt-xs text-caption text-grey-7">Command: {{ part.command }}</div>
    <pre class="subtask-prompt q-mt-sm">{{ part.prompt }}</pre>
  </AgentPartMeta>
</template>

<script setup lang="ts">
import type { SubtaskPart } from '@opencode-ai/sdk/v2';
import AgentPartMeta from './AgentPartMeta.vue';

defineProps<{ part: SubtaskPart }>();
</script>

<style lang="scss" scoped>
.subtask-prompt {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--imago-bg-raised);
  border-radius: var(--imago-radius-sm);
  padding: 8px;
  font-size: 12px;
}
</style>
