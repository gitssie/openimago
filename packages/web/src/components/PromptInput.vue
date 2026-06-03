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
      <div
        v-if="attachments.length > 0"
        class="attachment-chip-row"
      >
        <div
          v-for="attachment in attachments"
          :key="attachment.id"
          class="col-auto"
        >
          <q-chip
            dense
            removable
            icon="attach_file"
            class="attachment-chip"
            @remove="emit('remove-attachment', attachment.id)"
          >
            {{ attachment.name }}
          </q-chip>
        </div>
      </div>

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
              @click="openFilePicker"
            >
              <q-tooltip>{{ t('agent.attachFile') }}</q-tooltip>
            </q-btn>
          </slot>
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

function openFilePicker() {
  fileInputRef.value?.click()
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
})
</script>

<style lang="scss" scoped>
.prompt-input {
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
  transition: box-shadow var(--imago-ease-smooth);

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 1px;
    background: linear-gradient(
      135deg,
      rgba(0, 240, 255, 0.55) 0%,
      rgba(0, 240, 255, 0.30) 35%,
      rgba(168, 85, 247, 0.35) 70%,
      rgba(168, 85, 247, 0.55) 100%
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
      0 0 44px rgba(0, 240, 255, 0.22),
      0 0 24px rgba(168, 85, 247, 0.14),
      inset 0 0 36px rgba(0, 240, 255, 0.06);

    &::before {
      background: linear-gradient(
        135deg,
        rgba(0, 240, 255, 0.85) 0%,
        rgba(0, 240, 255, 0.45) 35%,
        rgba(168, 85, 247, 0.55) 70%,
        rgba(168, 85, 247, 0.85) 100%
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
  gap: 4px;
  padding: 8px 8px 0;
  max-width: 100%;
}

.attachment-chip {
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
  :deep(.q-btn__content) {
    color: var(--imago-text-faint);
  }

  :deep(.q-icon) {
    color: var(--imago-text-faint);
  }

  :deep(.q-btn) {
    background: var(--imago-bg-raised);
  }

  &--active {
    :deep(.q-btn__content) {
      color: #030713;
    }

    :deep(.q-icon) {
      color: #030713;
    }

    :deep(.q-btn) {
      background: var(--imago-neon-cyan);
      box-shadow: 0 0 20px rgba(0, 240, 255, 0.55);
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
  width: 28px;
  height: 28px;
  border: 1px solid var(--imago-border-light);
  border-radius: 50%;
  background: var(--imago-bg-raised);
  color: var(--imago-text-muted);
  cursor: pointer;
  font: inherit;
  padding: 0;
  transition:
    border-color var(--imago-ease-fast),
    color var(--imago-ease-fast);
}

:slotted(.prompt-input__icon-btn:hover) {
  border-color: var(--imago-border-cyan);
  color: var(--imago-text-primary);
}

:slotted(.prompt-input__select) {
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
  font-family: inherit;
  transition:
    border-color var(--imago-ease-fast),
    color var(--imago-ease-fast);
}

:slotted(.prompt-input__select:hover) {
  border-color: var(--imago-border-cyan);
  color: var(--imago-text-primary);
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
