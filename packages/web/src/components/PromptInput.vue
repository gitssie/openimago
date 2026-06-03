<template>
  <div class="prompt-input">
    <!-- Hidden file input -->
    <input
      ref="fileInputRef"
      type="file"
      class="prompt-input__file-input"
      multiple
      @change="onFileSelected"
    >

    <!-- Main card with gradient border -->
    <div class="prompt-input__card">
      <!-- Attachment chips -->
      <div v-if="attachments.length > 0" class="prompt-input__attachments">
        <q-chip
          v-for="attachment in attachments"
          :key="attachment.id"
          dense
          removable
          icon="attach_file"
          class="prompt-input__chip"
          @remove="emit('remove-attachment', attachment.id)"
        >
          {{ attachment.name }}
        </q-chip>
      </div>

      <!-- Textarea -->
      <textarea
        ref="textareaRef"
        v-model="text"
        :placeholder="placeholder ?? t('gallery.composerPlaceholder')"
        :disabled="disabled"
        class="prompt-input__textarea"
        rows="1"
        @keydown="handleKeydown"
        @input="autosize"
      />

      <!-- Action bar -->
      <div class="prompt-input__bar">
        <div class="prompt-input__bar-left">
          <!-- Attach button -->
          <button
            type="button"
            class="prompt-input__icon-btn"
            :aria-label="t('agent.attachFile')"
            :disabled="disabled"
            @click="fileInputRef?.click()"
          >
            <q-icon name="attach_file" size="14px" />
            <q-tooltip>{{ t('agent.attachFile') }}</q-tooltip>
          </button>

          <!-- Leading slot (Home's mode/aspect/duration buttons) -->
          <slot name="leading" />
        </div>

        <div class="prompt-input__bar-right">
          <!-- Connection status dot -->
          <div
            v-if="showConnectionDot"
            class="prompt-input__connection-dot"
            :class="{ 'is-live': connected }"
          >
            <q-tooltip>{{ connected ? t('agent.connected') : t('agent.connecting') }}</q-tooltip>
          </div>

          <!-- Action button (send / stop) -->
          <button
            type="button"
            class="prompt-input__action"
            :class="{ 'is-active': hasDraft }"
            :disabled="disabled ? true : !hasAction"
            :aria-label="actionTooltip"
            @click="handlePrimaryAction"
          >
            <q-icon :name="actionIcon" size="16px" />
            <q-tooltip>{{ actionTooltip }}</q-tooltip>
          </button>
        </div>
      </div>
    </div>

    <!-- Hint text -->
    <div v-if="showHint" class="prompt-input__hint">
      <slot name="hint">
        {{ hintText }}
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

/** Lightweight attachment type used for display-only chip rendering.
 *  Structurally compatible with PendingAttachment from useAgentSession. */
export interface ComposerAttachment {
  id: string
  name: string
}

const { t } = useI18n()

const props = withDefaults(defineProps<{
  modelValue: string
  loading?: boolean
  connected?: boolean
  disabled?: boolean
  attachments?: ComposerAttachment[]
  placeholder?: string
  hint?: string | null
}>(), {
  loading: false,
  disabled: false,
  attachments: () => [],
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'submit', value: string): void
  (e: 'abort'): void
  (e: 'remove-attachment', id: string): void
  (e: 'attach-files', files: File[]): void
}>()

// ── Refs ────────────────────────────────────────────────────────────────────

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

// ── v-model bridge ──────────────────────────────────────────────────────────

const text = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

// ── State ───────────────────────────────────────────────────────────────────

const hasDraft = computed(() => text.value.trim().length > 0 || props.attachments.length > 0)
const hasAction = computed(() => hasDraft.value || !!props.loading)
const showConnectionDot = computed(() => props.connected !== undefined)
const showHint = computed(() => props.hint !== null)
const hintText = computed(() => props.hint ?? t('agent.inputHint'))

const actionIcon = computed(() =>
  (props.loading && !hasDraft.value) ? 'stop' : 'arrow_upward',
)

const actionTooltip = computed(() => {
  if (props.loading && !hasDraft.value) return t('agent.stop')
  if (props.loading) return t('agent.queueFollowup')
  return t('agent.send')
})

// ── Autosize ────────────────────────────────────────────────────────────────

function autosize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 180)}px`
}

watch(text, () => {
  void nextTick(autosize)
})

// ── Key handling ────────────────────────────────────────────────────────────

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (hasDraft.value) emit('submit', text.value)
  }
}

// ── Primary action ──────────────────────────────────────────────────────────

function handlePrimaryAction() {
  if (hasDraft.value) {
    emit('submit', text.value)
    return
  }
  if (props.loading) emit('abort')
}

// ── File input ──────────────────────────────────────────────────────────────

function onFileSelected(event: Event) {
  const target = event.target as HTMLInputElement | null
  const files = Array.from(target?.files ?? [])
  if (files.length > 0) {
    emit('attach-files', files)
  }
  if (target) target.value = ''
}

// ── Expose ──────────────────────────────────────────────────────────────────

defineExpose({
  focus: () => textareaRef.value?.focus(),
  setDraft: (value: string) => {
    emit('update:modelValue', value)
  },
})
</script>

<style lang="scss" scoped>
/* ── Hidden file input ─────────────────────────────────────────────────── */
.prompt-input__file-input {
  display: none;
}

/* ── Card (gradient border + glass background) ──────────────────────────── */
.prompt-input__card {
  position: relative;
  width: 100%;
  max-width: 920px;
  margin: 0 auto;
  border: 1px solid transparent;
  border-radius: 18px;
  background:
    radial-gradient(ellipse 60% 80% at 50% 0%, rgba(0, 240, 255, 0.06), transparent 70%),
    radial-gradient(ellipse 80% 60% at 100% 100%, rgba(168, 85, 247, 0.08), transparent 70%),
    rgba(8, 8, 15, 0.85);
  backdrop-filter: var(--imago-blur-panel);
  -webkit-backdrop-filter: var(--imago-blur-panel);
  box-shadow:
    0 0 32px rgba(0, 240, 255, 0.12),
    inset 0 0 32px rgba(0, 240, 255, 0.04);
  transition:
    box-shadow var(--imago-ease-smooth);

  // Gradient border via pseudo-element
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 1px;
    background: linear-gradient(135deg,
      rgba(0, 240, 255, 0.55) 0%,
      rgba(0, 240, 255, 0.30) 35%,
      rgba(168, 85, 247, 0.35) 70%,
      rgba(168, 85, 247, 0.55) 100%);
    -webkit-mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
            mask-composite: exclude;
    pointer-events: none;
    transition: background var(--imago-ease-smooth);
  }

  &:focus-within {
    box-shadow:
      0 0 44px rgba(0, 240, 255, 0.22),
      0 0 24px rgba(168, 85, 247, 0.14),
      inset 0 0 36px rgba(0, 240, 255, 0.06);

    &::before {
      background: linear-gradient(135deg,
        rgba(0, 240, 255, 0.85) 0%,
        rgba(0, 240, 255, 0.45) 35%,
        rgba(168, 85, 247, 0.55) 70%,
        rgba(168, 85, 247, 0.85) 100%);
    }
  }
}

/* ── Textarea ───────────────────────────────────────────────────────────── */
.prompt-input__textarea {
  display: block;
  width: 100%;
  min-height: 56px;
  max-height: 180px;
  padding: 18px 22px 8px;
  border: 0;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--imago-text-primary);
  font-family: inherit;
  font-size: 15px;
  line-height: 1.6;
  caret-color: var(--imago-neon-cyan);

  &::placeholder {
    color: var(--imago-text-faint);
  }
}

/* ── Attachments ────────────────────────────────────────────────────────── */
.prompt-input__attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px 18px 0;
}

.prompt-input__chip {
  max-width: 240px;

  :deep(.q-chip) {
    background: var(--imago-border-light) !important;
    color: var(--imago-text-muted);
    border: 1px solid var(--imago-border-light);
    border-radius: var(--imago-radius-md);
  }

  :deep(.q-chip__icon) {
    color: var(--imago-text-muted);
  }

  :deep(.q-chip__content) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
  }

  :deep(.q-chip__icon--remove) {
    color: var(--imago-text-dim);

    &:hover {
      color: var(--imago-text-muted);
    }
  }
}

/* ── Action bar ─────────────────────────────────────────────────────────── */
.prompt-input__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 14px 14px;
}

.prompt-input__bar-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.prompt-input__bar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* ── Icon button (attach) ───────────────────────────────────────────────── */
.prompt-input__icon-btn {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--imago-border-light);
  border-radius: 50%;
  background: var(--imago-bg-raised);
  color: var(--imago-text-muted);
  cursor: pointer;
  transition:
    border-color var(--imago-ease-fast),
    color var(--imago-ease-fast);

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.prompt-input__icon-btn:hover:not(:disabled) {
  border-color: var(--imago-border-cyan);
  color: var(--imago-text-primary);
}

/* ── Select button (used in #leading slot) ──────────────────────────────── */
.prompt-input__select {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--imago-border-light);
  border-radius: 10px;
  background: var(--imago-bg-raised);
  color: var(--imago-text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition:
    border-color var(--imago-ease-fast),
    color var(--imago-ease-fast);
}

.prompt-input__select:hover {
  border-color: var(--imago-border-cyan);
  color: var(--imago-text-primary);
}

.prompt-input__select-caret {
  margin-left: 2px;
  opacity: 0.6;
}

/* ── Action button (send / stop) ────────────────────────────────────────── */
.prompt-input__action {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  background: var(--imago-bg-raised);
  color: var(--imago-text-faint);
  cursor: pointer;
  transition:
    background var(--imago-ease-fast),
    color var(--imago-ease-fast),
    box-shadow var(--imago-ease-fast);
  flex-shrink: 0;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.prompt-input__action.is-active {
  background: var(--imago-neon-cyan);
  color: #030713;
  box-shadow: 0 0 20px rgba(0, 240, 255, 0.55);
}

.prompt-input__action.is-active:hover {
  background: var(--imago-cyan-bright);
  box-shadow: 0 0 28px rgba(0, 240, 255, 0.75);
}

/* ── Connection status dot ──────────────────────────────────────────────── */
.prompt-input__connection-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--imago-text-dim);
  flex-shrink: 0;

  &.is-live {
    background: var(--imago-neon-cyan);
    box-shadow: 0 0 6px rgba(0, 240, 255, 0.6);
  }
}

/* ── Hint ───────────────────────────────────────────────────────────────── */
.prompt-input__hint {
  font-size: 12px;
  color: var(--imago-text-faint);
  text-align: center;
  margin-top: 4px;
}

/* ── Responsive ─────────────────────────────────────────────────────────── */
@media (max-width: 640px) {
  .prompt-input__bar-left {
    gap: 4px;
  }
  .prompt-input__select span {
    display: none;
  }
}
</style>
