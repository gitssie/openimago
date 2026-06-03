<template>
  <div class="prompt-input">
    <input
      ref="fileInputRef"
      type="file"
      class="hidden-file-input"
      multiple
      @change="onFileSelected"
    >

    <div class="input-card">
      <q-input
        ref="inputRef"
        :model-value="localDraft"
        :placeholder="resolvedPlaceholder"
        borderless
        autogrow
        :maxlength="4000"
        :disable="disabled"
        class="chat-input"
        dark
        @update:model-value="onInputUpdate"
        @keydown="handleKeydown"
      />

      <div class="input-actions">
        <div class="prompt-input__bar-left">
          <slot name="leading">
            <q-btn
              flat
              dense
              round
              icon="attach_file"
              size="sm"
              class="attach-btn"
              :disable="disabled"
              @click="() => openFilePicker()"
            >
              <q-tooltip>{{ t('agent.attachFile') }}</q-tooltip>
            </q-btn>
          </slot>

          <TransitionGroup
            v-if="attachments && attachments.length > 0"
            name="list-chip"
            tag="div"
            class="attachment-chip-row"
          >
            <div
              v-for="attachment in attachments"
              :key="attachment.id"
              class="imago-attachment-chip"
              :class="[
                `imago-attachment-chip--${attachment.status || 'uploaded'}`,
                { 'is-image': attachment.mime?.startsWith('image/') }
              ]"
            >
              <!-- Progress Bar Background (when uploading) -->
              <div
                v-if="attachment.status === 'uploading'"
                class="imago-attachment-chip__progress-bg"
                :style="{ width: `${attachment.progress || 0}%` }"
              />
              
              <!-- Thumbnail / Icon -->
              <div class="imago-attachment-chip__icon-wrap">
                <q-spinner-puff v-if="attachment.status === 'uploading'" size="14px" :style="{ color: 'var(--imago-neon-cyan)' }" />
                <q-icon v-else-if="attachment.status === 'error'" name="error" color="negative" size="14px" />
                <q-icon v-else-if="attachment.mime?.startsWith('image/')" name="image" size="14px" :style="{ color: 'var(--imago-neon-cyan)' }" />
                <q-icon v-else-if="attachment.mime?.startsWith('audio/')" name="graphic_eq" size="14px" :style="{ color: 'var(--imago-neon-purple)' }" />
                <q-icon v-else-if="attachment.mime?.startsWith('video/')" name="videocam" size="14px" :style="{ color: 'var(--imago-neon-pink)' }" />
                <q-icon v-else name="description" size="14px" color="grey-4" />
              </div>

              <!-- Name & Status -->
              <div class="imago-attachment-chip__info">
                <div class="imago-attachment-chip__name ellipsis">{{ attachment.name }}</div>
                <div v-if="attachment.status === 'error'" class="imago-attachment-chip__error-text ellipsis">
                  {{ attachment.errorMsg || 'Upload failed' }}
                </div>
                <div v-else-if="attachment.status === 'uploading'" class="imago-attachment-chip__status-text">
                  {{ attachment.progress || 0 }}%
                </div>
              </div>

              <!-- Remove Action -->
              <button
                type="button"
                class="imago-attachment-chip__remove"
                @click.stop="emit('remove-attachment', attachment.id)"
              >
                <q-icon name="close" size="12px" />
              </button>

              <!-- Retry Action (error only) -->
              <button
                v-if="attachment.status === 'error'"
                type="button"
                class="imago-attachment-chip__retry"
                @click.stop="emit('retry-attachment', attachment.id)"
              >
                <q-icon name="refresh" size="12px" />
              </button>
            </div>
          </TransitionGroup>
        </div>

        <q-space />

        <q-icon
          v-if="showConnectionDot"
          name="circle"
          size="8px"
          class="connection-dot"
          :class="{ 'is-live': connected === true }"
        >
          <q-tooltip>{{ connected ? t('agent.connected') : t('agent.connecting') }}</q-tooltip>
        </q-icon>

        <q-btn
          round
          unelevated
          :icon="actionIcon"
          size="sm"
          class="send-btn"
          :class="{ 'send-btn--active': hasAction }"
          :disable="disabled || !hasAction"
          :aria-label="actionTooltip"
          @click="handlePrimaryAction"
        >
          <q-tooltip>{{ actionTooltip }}</q-tooltip>
        </q-btn>
      </div>
    </div>

    <div
      v-if="hintToShow !== null"
      class="composer-hint"
    >
      <slot name="hint">{{ hintToShow }}</slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { QInput } from 'quasar'
import { useI18n } from 'vue-i18n'

/** Lightweight attachment descriptor used for chip rendering.
 *  Structurally compatible with PendingAttachment from useAgentSession. */
export interface ComposerAttachment {
  id: string
  name: string
  status: 'uploading' | 'uploaded' | 'error'
  progress: number
  errorMsg?: string
  assetId?: string
  mime?: string
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    loading?: boolean
    connected?: boolean
    disabled?: boolean
    attachments?: ComposerAttachment[]
    placeholder?: string
    hint?: string | null
  }>(),
  {
    loading: false,
    disabled: false,
    attachments: () => [],
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'submit', value: string): void
  (e: 'abort'): void
  (e: 'remove-attachment', id: string): void
  (e: 'retry-attachment', id: string): void
  (e: 'attach-files', files: File[]): void
}>()

const { t } = useI18n()
const inputRef = ref<QInput | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const localDraft = ref(props.modelValue)

watch(
  () => props.modelValue,
  (value) => {
    if (value !== localDraft.value) {
      localDraft.value = value
    }
  },
)

const hasDraft = computed(
  () => localDraft.value.trim().length > 0 || props.attachments.length > 0,
)
const hasAction = computed(() => hasDraft.value || props.loading)
const actionIcon = computed(() =>
  props.loading && !hasDraft.value ? 'stop' : 'arrow_upward',
)
const actionTooltip = computed(() => {
  if (props.loading && !hasDraft.value) return t('agent.stop')
  if (props.loading) return t('agent.queueFollowup')
  return t('agent.send')
})

const resolvedPlaceholder = computed(() =>
  props.placeholder !== undefined ? props.placeholder : t('gallery.composerPlaceholder'),
)

const showConnectionDot = computed(() => props.connected !== undefined)

const hintToShow = computed<string | null>(() => {
  if (props.hint === null) return null
  if (props.hint !== undefined) return props.hint
  return t('agent.inputHint')
})

function onInputUpdate(value: string | number | null) {
  const next = typeof value === 'string' ? value : String(value ?? '')
  localDraft.value = next
  emit('update:modelValue', next)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    if (hasDraft.value) emit('submit', localDraft.value)
  }
}

function handlePrimaryAction() {
  if (hasDraft.value) {
    emit('submit', localDraft.value)
    return
  }
  if (props.loading) emit('abort')
}

function openFilePicker(acceptType?: string) {
  if (fileInputRef.value) {
    if (acceptType === 'image') fileInputRef.value.accept = 'image/*';
    else if (acceptType === 'audio') fileInputRef.value.accept = 'audio/*';
    else if (acceptType === 'video') fileInputRef.value.accept = 'video/*';
    else if (acceptType === 'text') fileInputRef.value.accept = 'text/plain,application/pdf,.md,.csv,.json';
    else fileInputRef.value.accept = '';
    
    fileInputRef.value.click()
  }
}

function onFileSelected(event: Event) {
  const target = event.target as HTMLInputElement | null
  const files = Array.from(target?.files ?? [])
  if (files.length > 0) {
    emit('attach-files', files)
  }
  if (target) target.value = ''
}

defineExpose({
  focus: () => inputRef.value?.focus(),
  setDraft: (value: string) => {
    localDraft.value = value
  },
  openFilePicker,
})
</script>

<style lang="scss" scoped>
.prompt-input {
  position: relative;
  width: 100%;
  max-width: 920px;
  margin: 0 auto;
  border: 1px solid transparent;
  border-radius: 20px;
  background:
    radial-gradient(ellipse 60% 80% at 50% 0%, rgba(168, 85, 247, 0.08), transparent 70%),
    radial-gradient(ellipse 80% 60% at 100% 100%, rgba(217, 70, 239, 0.06), transparent 70%),
    rgba(6, 6, 12, 0.92);
  backdrop-filter: var(--imago-blur-panel);
  -webkit-backdrop-filter: var(--imago-blur-panel);
  box-shadow:
    0 0 32px rgba(168, 85, 247, 0.12),
    inset 0 0 32px rgba(168, 85, 247, 0.04);
  transition: all var(--imago-ease-smooth);

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 1.2px;
    background: linear-gradient(
      135deg,
      rgba(168, 85, 247, 0.45) 0%,
      rgba(217, 70, 239, 0.55) 30%,
      rgba(168, 85, 247, 0.35) 70%,
      rgba(124, 58, 237, 0.45) 100%
    );
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
      0 0 44px rgba(168, 85, 247, 0.22),
      0 0 24px rgba(217, 70, 239, 0.14),
      inset 0 0 36px rgba(168, 85, 247, 0.06);

    &::before {
      background: linear-gradient(
        135deg,
        rgba(168, 85, 247, 0.8) 0%,
        rgba(217, 70, 239, 0.85) 30%,
        rgba(168, 85, 247, 0.6) 70%,
        rgba(124, 58, 237, 0.8) 100%
      );
    }
  }
}

.hidden-file-input {
  display: none;
}

.input-card {
  display: flex;
  flex-direction: column;
  position: relative;
}

.attachment-chip-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  max-width: 100%;
}

.imago-attachment-chip {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px 0 6px;
  border-radius: var(--imago-radius-md);
  background: var(--imago-bg-raised);
  border: 1px solid var(--imago-border-light);
  overflow: hidden;
  transition: all var(--imago-ease-fast);

  &:hover:not(&--uploading):not(&--error) {
    border-color: var(--imago-border-cyan);
    background: rgba(255, 255, 255, 0.06);
    box-shadow: var(--imago-glow-cyan-soft);
  }

  &--uploading {
    border-color: rgba(0, 240, 255, 0.25);
    box-shadow: 
      inset 0 0 10px rgba(0, 240, 255, 0.05),
      0 0 8px rgba(0, 240, 255, 0.1);
    animation: chip-pulse 2s infinite ease-in-out;
  }

  &--error {
    border-color: rgba(239, 68, 68, 0.4);
    background: rgba(239, 68, 68, 0.05);
    box-shadow: 0 0 8px rgba(239, 68, 68, 0.1);

    &:hover {
      border-color: rgba(239, 68, 68, 0.6);
      background: rgba(239, 68, 68, 0.08);
      box-shadow: 0 0 12px rgba(239, 68, 68, 0.15);
    }
  }

  &__progress-bg {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: linear-gradient(90deg, rgba(0, 240, 255, 0.05), rgba(0, 240, 255, 0.15));
    border-right: 1px solid var(--imago-neon-cyan);
    box-shadow: 0 0 8px rgba(0, 240, 255, 0.4);
    z-index: 0;
    transition: width 0.2s ease-out;
  }

  &__icon-wrap {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
  }

  &__info {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    max-width: 140px;
  }

  &__name {
    font-size: 11px;
    font-weight: 500;
    color: var(--imago-text-primary);
    line-height: 1.2;
  }

  &__status-text {
    font-size: 9px;
    color: var(--imago-neon-cyan);
    font-weight: 600;
    line-height: 1;
    margin-top: 1px;
  }

  &__error-text {
    font-size: 9px;
    color: #fca5a5;
    line-height: 1;
    margin-top: 1px;
  }

  &__remove {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    margin-left: 2px;
    border: none;
    background: transparent;
    color: var(--imago-text-muted);
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
      color: var(--imago-text-primary);
    }
  }

  &__retry {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    margin-left: 2px;
    border: none;
    background: transparent;
    color: var(--imago-text-muted);
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
      background: rgba(239, 68, 68, 0.15);
      color: #fca5a5;
    }
  }
}

@keyframes chip-pulse {
  0%, 100% {
    border-color: rgba(0, 240, 255, 0.25);
  }
  50% {
    border-color: rgba(0, 240, 255, 0.5);
    box-shadow: 
      inset 0 0 12px rgba(0, 240, 255, 0.08),
      0 0 12px rgba(0, 240, 255, 0.2);
  }
}

/* Transitions */
.list-chip-enter-active,
.list-chip-leave-active {
  transition: all var(--imago-ease-default);
}
.list-chip-enter-from,
.list-chip-leave-to {
  opacity: 0;
  transform: scale(0.9) translateY(4px);
}
.list-chip-leave-active {
  position: absolute;
}


.chat-input {
  :deep(.q-field__control) {
    padding: 0;
    min-height: unset;
  }

  :deep(textarea) {
    font-size: 15px;
    min-height: 56px;
    max-height: 180px;
    padding: 18px 22px 8px;
    line-height: 1.6;
    color: var(--imago-text-primary);
    font-family: inherit;
    caret-color: var(--imago-neon-cyan);
    resize: none;

    &::placeholder {
      color: var(--imago-text-faint);
    }
  }

  :deep(.q-field__native) {
    color: var(--imago-text-primary);
  }

  :deep(.q-field--disabled .q-field__control) {
    opacity: 0.5;
  }
}

.input-actions {
  display: flex;
  align-items: center;
  min-height: 36px;
  padding: 8px 14px 14px;
  gap: 4px;
}

.prompt-input__bar-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.attach-btn {
  :deep(.q-btn__content) {
    color: var(--imago-text-muted);

    &:hover {
      color: var(--imago-text-secondary);
    }
  }

  :deep(.q-icon) {
    color: var(--imago-text-muted);
  }

  &:hover :deep(.q-icon) {
    color: var(--imago-text-secondary);
  }
}

.connection-dot {
  margin-right: 8px;
  color: rgba(255, 255, 255, 0.35);

  &.is-live {
    color: var(--imago-neon-cyan);
    filter: drop-shadow(0 0 4px var(--imago-neon-cyan));
  }
}

.send-btn {
  background: rgba(255, 255, 255, 0.05) !important;
  width: 32px;
  height: 32px;
  min-height: unset;
  transition: all var(--imago-ease-smooth);

  :deep(.q-btn__content) {
    color: rgba(255, 255, 255, 0.25) !important;
  }

  :deep(.q-icon) {
    color: rgba(255, 255, 255, 0.25) !important;
    font-size: 16px;
  }

  &--active {
    background: #00f0ff !important;
    box-shadow: 0 0 16px rgba(0, 240, 255, 0.6);

    :deep(.q-btn__content) {
      color: #030713 !important;
    }

    :deep(.q-icon) {
      color: #030713 !important;
      font-size: 16px;
      font-weight: bold;
    }

    &:hover {
      background: #33f3ff !important;
      box-shadow: 0 0 24px rgba(0, 240, 255, 0.8);
      transform: scale(1.05);
    }
  }
}

.composer-hint {
  font-size: 12px;
  color: var(--imago-text-faint);
  text-align: center;
  margin-top: 4px;
}

/* ── Slotted leading button styles ───────────────────────────────────────────
 * These target content provided via the #leading slot (e.g. HomePage's
 * mode / aspect / duration buttons). Vue's :slotted() pseudo-class lets a
 * scoped <style> reach parent-supplied slot content, which is otherwise
 * unaffected by the child's data-v hash attribute.
 */

:slotted(.prompt-input__icon-btn) {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  font: inherit;
  padding: 0;
  transition: all var(--imago-ease-fast);
}

:slotted(.prompt-input__icon-btn:hover) {
  border-color: rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

:slotted(.prompt-input__select) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border: 1px solid rgba(168, 85, 247, 0.18);
  border-radius: 9999px; // Beautiful capsule pill shape!
  background: rgba(168, 85, 247, 0.04);
  color: rgba(255, 255, 255, 0.65);
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  transition: all var(--imago-ease-fast);
}

:slotted(.prompt-input__select:hover) {
  border-color: rgba(168, 85, 247, 0.4);
  background: rgba(168, 85, 247, 0.08);
  color: #fff;
}

:slotted(.prompt-input__select-caret) {
  margin-left: 2px;
  opacity: 0.6;
}

@media (max-width: 640px) {
  .prompt-input__bar-left {
    gap: 4px;
  }

  :slotted(.prompt-input__select) span {
    display: none;
  }
}
</style>
