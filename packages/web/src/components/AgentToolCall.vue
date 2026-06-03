<template>
  <div
    class="tool-call-item"
    :class="[
      {
        'tool-call-item--attention': isAttention,
        'tool-call-item--task': isTaskTool,
        'tool-call-item--clickable': isTaskTool && !!childSessionId,
      },
      `status-${part.state.status}`,
    ]"
  >
    <!-- Header row -->
    <div class="tool-call-header row items-center no-wrap" :class="{ 'tool-call-header--task': isTaskTool }" @click="handleHeaderClick">

      <!-- Status indicator -->
      <div class="status-dot-wrap q-mr-sm flex-shrink-0">
        <q-spinner-dots v-if="part.state.status === 'running'" size="14px" color="blue-4" />
        <q-icon v-else-if="part.state.status === 'completed'" name="check_circle" size="14px" color="grey-5" />
        <q-icon v-else-if="part.state.status === 'error'" name="cancel" size="14px" color="negative" />
        <q-icon v-else :name="toolIcon" size="14px" color="grey-6" />
      </div>

      <!-- Tool name badge -->
      <span v-if="!isTaskTool" class="tool-badge imago-badge-mono q-mr-sm flex-shrink-0">{{ part.tool }}</span>

      <q-icon v-else name="account_tree" size="16px" color="grey-5" class="q-mr-sm flex-shrink-0" />

      <!-- Title text (truncated, takes remaining space) -->
      <div class="col min-width-0">
        <div v-if="taskLabel" class="tool-title tool-title--task ellipsis">{{ taskLabel }}</div>
        <span v-if="titleText" class="tool-title" :class="{ 'tool-title--task-subtitle': isTaskTool }">{{ titleText }}</span>
      </div>

      <!-- Duration badge when completed -->
      <span v-if="part.state.status === 'completed' && durationText" class="duration-badge imago-badge-meta q-mr-sm flex-shrink-0">
        {{ durationText }}
      </span>

      <q-icon
        v-if="isTaskTool && childSessionId"
        name="open_in_new"
        size="15px"
        color="grey-5"
        class="flex-shrink-0"
      />

      <!-- Expand/collapse chevron -->
      <q-icon
        v-if="!isTaskTool"
        :name="open ? 'keyboard_arrow_up' : 'keyboard_arrow_down'"
        size="16px"
        color="grey-5"
        class="flex-shrink-0 chevron"
        :class="{ 'chevron--open': open }"
      />
    </div>

    <!-- Expanded detail -->
    <transition name="slide-down">
      <div v-if="open && !isTaskTool" class="tool-call-detail">
        <!-- Input -->
        <div class="detail-block">
          <div class="detail-label">
            <q-icon name="input" size="11px" class="q-mr-xs" />{{ t('agentTool.input') }}
          </div>
          <pre class="tool-json">{{ formatJson(part.state.input) }}</pre>
        </div>

        <!-- Output -->
        <div v-if="part.state.status === 'completed'" class="detail-block">
          <div class="detail-label detail-label--output">
            <q-icon name="output" size="11px" class="q-mr-xs" />{{ t('agentTool.output') }}
          </div>
          <pre class="tool-json tool-json--output">{{ part.state.output }}</pre>
        </div>

        <!-- Attachments -->
        <div v-if="part.state.status === 'completed' && part.state.attachments?.length" class="detail-block">
          <div class="detail-label">
            <q-icon name="attach_file" size="11px" class="q-mr-xs" />{{ t('agentTool.attachments') }}
          </div>
          <div class="attachment-list">
            <div v-for="file in part.state.attachments" :key="file.id" class="attachment-item row items-center no-wrap">
              <q-icon name="description" size="12px" color="grey-6" class="q-mr-xs" />
              <span class="text-caption col">{{ file.filename || file.url }}</span>
            </div>
          </div>
        </div>

        <!-- Error -->
        <div v-if="part.state.status === 'error'" class="detail-block">
          <div class="detail-label detail-label--error">
            <q-icon name="error_outline" size="11px" class="q-mr-xs" />{{ t('agentTool.error') }}
          </div>
          <pre class="tool-json tool-json--error">{{ part.state.error }}</pre>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ToolPart } from '@opencode-ai/sdk/v2';

interface Props {
  part: ToolPart;
  attentionCallId?: string | null;
  childSessionLabel?: string | null;
}

const emit = defineEmits<{
  (e: 'open-child-session', sessionId: string): void;
}>();

const props = defineProps<Props>();
const open = ref(false);
const { t } = useI18n();

const isTaskTool = computed(() => props.part.tool === 'task');

const childSessionId = computed(() => {
  const metadata = (props.part.state as { metadata?: Record<string, unknown> }).metadata;
  const value = metadata?.sessionId;
  return typeof value === 'string' && value ? value : '';
});

const taskLabel = computed(() => {
  if (!isTaskTool.value) return '';

  const input = props.part.state.input ?? {};
  const subagent = typeof input.subagent_type === 'string' ? input.subagent_type : '';
  return props.childSessionLabel?.trim() || subagent || t('agent.subsession');
});

const toolIcon = computed(() => {
  const tool = props.part.tool.toLowerCase();
  if (tool.includes('read') || tool.includes('file')) return 'description';
  if (tool.includes('write') || tool.includes('edit')) return 'edit';
  if (tool.includes('bash') || tool.includes('shell') || tool.includes('exec')) return 'terminal';
  if (tool.includes('search') || tool.includes('grep') || tool.includes('glob')) return 'search';
  if (tool.includes('memory') || tool.includes('cognee') || tool.includes('cognify')) return 'psychology';
  if (tool.includes('web') || tool.includes('fetch') || tool.includes('http')) return 'language';
  if (tool.includes('list') || tool.includes('dir')) return 'folder_open';
  return 'build';
});

const titleText = computed(() => {
  const state = props.part.state;
  const input = state.input ?? {};

  if (isTaskTool.value) {
    if (typeof input.description === 'string' && input.description) return input.description;
    return childSessionId.value;
  }

  if (props.part.tool === 'read' && typeof input.filePath === 'string') return input.filePath.split('/').at(-1) ?? input.filePath;
  if (props.part.tool === 'list' && typeof input.path === 'string') return input.path.split('/').at(-1) ?? input.path;
  if ((props.part.tool === 'glob' || props.part.tool === 'grep') && typeof input.pattern === 'string') return input.pattern;
  if ((props.part.tool === 'webfetch' || props.part.tool === 'websearch' || props.part.tool === 'codesearch') && typeof input.query === 'string') return input.query;
  if (props.part.tool === 'webfetch' && typeof input.url === 'string') return input.url;
  if ((props.part.tool === 'task' || props.part.tool === 'bash') && typeof input.description === 'string') return input.description;
  if ((props.part.tool === 'edit' || props.part.tool === 'write') && typeof input.filePath === 'string') return input.filePath.split('/').at(-1) ?? input.filePath;
  if (props.part.tool === 'apply_patch' && Array.isArray(input.files) && input.files.length > 0) {
    return `${input.files.length} file${input.files.length > 1 ? 's' : ''}`;
  }
  if (props.part.tool === 'question' || props.part.tool === 'ask_question') {
    if (state.status === 'running') return '运行中 (等待用户回复)';
    if (state.status === 'completed') return '已回复';
  }
  if ((state.status === 'running' || state.status === 'completed') && state.title) return state.title;
  return '';
});

const isAttention = computed(() => props.attentionCallId === props.part.callID);

watch(isAttention, (next) => {
  if (next) {
    open.value = true;
  }
}, { immediate: true });

const durationText = computed(() => {
  const state = props.part.state;
  if (state.status !== 'completed') return '';
  const start = (state as { time?: { start?: number } }).time?.start;
  const end = (state as { time?: { end?: number } }).time?.end;
  if (!start || !end) return '';
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
});

function handleHeaderClick() {
  if (isTaskTool.value) {
    if (childSessionId.value) emit('open-child-session', childSessionId.value);
    return;
  }
  open.value = !open.value;
}

function formatJson(obj: Record<string, unknown>): string {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return t('agentTool.unserializable');
  }
}
</script>

<style lang="scss" scoped>
// ── Container ─────────────────────────────────────────────────────────────────
.tool-call-item {
  margin: 4px 0;
  border-radius: var(--imago-radius-md);
  overflow: hidden;
  border: 1px solid var(--imago-border-light);
  background: var(--imago-bg-raised);
  transition: border-color var(--imago-ease-fast), background var(--imago-ease-fast);

  &.status-running {
    border-color: rgba(96 165 250 / 0.15);
    background: rgba(96 165 250 / 0.03);
  }
  &.status-completed {
    // default subtle border — no colour signal
  }
  &.status-error {
    border-color: rgba(239 68 68 / 0.18);
    background: rgba(239 68 68 / 0.03);
  }
}

.tool-call-item--attention {
  border-color: var(--imago-warning-border);
  background: var(--imago-warning-bg);
}

.tool-call-item--task {
  border-color: var(--imago-border-soft);
}

.tool-call-item--clickable {
  cursor: pointer;
}

// ── Header ────────────────────────────────────────────────────────────────────
.tool-call-header {
  padding: 6px 10px;
  cursor: pointer;
  min-height: 32px;
  user-select: none;
  border-radius: var(--imago-radius-md);
  transition: background 0.1s;

  &:hover {
    background: var(--imago-bg-raised);
  }
}

.tool-call-header--task {
  cursor: inherit;
}

.status-dot-wrap {
  width: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

// Tool name — status-specific overrides on top of global imago-badge-mono
.status-running .tool-badge  { background: rgba(96 165 250 / 0.14); color: rgba(147 197 253 / 0.9); }
.status-completed .tool-badge {
  background: var(--imago-bg-raised);
  color: var(--imago-text-muted);
}
.status-error .tool-badge    { background: rgba(239 68 68 / 0.14); color: rgba(252 165 165 / 0.9); }

// Title — secondary description
.tool-title {
  font-size: 11.5px;
  color: var(--imago-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.tool-title--task {
  font-size: 12px;
  font-weight: 600;
  color: var(--imago-text-secondary);
}

.tool-title--task-subtitle {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--imago-text-dim);
}

// Duration badge — uses global imago-badge-meta in template; only need positioning overrides here

// Chevron with smooth rotation
.chevron {
  transition: transform 0.18s ease;
  &--open { transform: rotate(180deg); }
}

// ── Expanded detail ───────────────────────────────────────────────────────────
.tool-call-detail {
  border-top: 1px solid var(--imago-border-light);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(255 255 255 / 0.015);
}

.detail-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-label {
  display: flex;
  align-items: center;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--imago-text-dim);
}

.detail-label--output {
  color: rgba(74 222 128 / 0.7);
}

.detail-label--error {
  color: rgba(252 165 165 / 0.8);
}

.attachment-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.attachment-item {
  padding: 6px 8px;
  border-radius: var(--imago-radius-sm);
  background: var(--imago-border-subtle);
}

.tool-json {
  font-family: 'JetBrains Mono', 'Fira Code', 'Menlo', monospace;
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  max-height: 220px;
  overflow-y: auto;
  background: var(--imago-bg-code);
  border: 1px solid var(--imago-border-light);
  padding: 7px 10px;
  border-radius: var(--imago-radius-sm);
  color: var(--imago-text-muted);

  &--output { border-color: rgba(74 222 128 / 0.18); }
  &--error  { border-color: rgba(239 68 68 / 0.18);  }
}

// ── Slide transition ──────────────────────────────────────────────────────────
.slide-down-enter-active,
.slide-down-leave-active {
  transition: max-height 0.2s ease, opacity 0.18s ease;
  overflow: hidden;
  max-height: 600px;
}
.slide-down-enter-from,
.slide-down-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
