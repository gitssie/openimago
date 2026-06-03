<template>
  <div class="agent-prompt-input">
    <input
      ref="fileInputRef"
      type="file"
      class="hidden-file-input"
      multiple
      @change="onFileSelected"
    >

    <div class="input-card imago-input-card">
      <div v-if="attachments.length > 0" class="attachment-chip-row row q-col-gutter-xs q-px-xs q-pt-xs">
        <div v-for="attachment in attachments" :key="attachment.id" class="col-auto">
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
        :placeholder="props.placeholder ?? t('agent.askAnythingPlaceholder')"
        borderless
        autogrow
        :maxlength="4000"
        :disable="disabled"
        class="chat-input"
        dark
        @update:model-value="onInputUpdate"
        @keydown="handleKeydown"
      />

      <div class="input-actions row items-center no-wrap q-gutter-xs">
        <q-btn
          flat
          dense
          round
          icon="attach_file"
          size="sm"
          class="attach-btn"
          :disable="disabled"
          @click="fileInputRef?.click()"
        >
          <q-tooltip>{{ t('agent.attachFile') }}</q-tooltip>
        </q-btn>

        <q-space />

        <q-icon
          name="circle"
          size="8px"
          class="connection-dot imago-dot-status"
          :class="{ 'imago-dot-status--live': connected }"
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
          :disable="disabled ? true : !hasAction"
          @click="handlePrimaryAction"
        >
          <q-tooltip>{{ actionTooltip }}</q-tooltip>
        </q-btn>
      </div>
    </div>

    <div v-if="props.hint ?? true" class="composer-hint">
      {{ props.hint ?? t('agent.inputHint') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { QInput } from 'quasar';
import { useI18n } from 'vue-i18n';

/** Lightweight attachment type used for display-only chip rendering.
 *  Structurally compatible with PendingAttachment from useAgentSession. */
export interface ComposerAttachment {
  id: string;
  name: string;
}

const props = defineProps<{
  draft: string;
  loading: boolean;
  connected: boolean;
  disabled: boolean;
  attachments: ComposerAttachment[];
  placeholder?: string;
  hint?: string;
}>();

const emit = defineEmits<{
  (e: 'update:draft', value: string): void;
  (e: 'submit', value: string): void;
  (e: 'abort'): void;
  (e: 'remove-attachment', value: string): void;
  (e: 'attach-files', files: File[]): void;
}>();

const { t } = useI18n();
const inputRef = ref<QInput | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const localDraft = ref(props.draft);

const hasDraft = computed(() => localDraft.value.trim().length > 0 || props.attachments.length > 0);
const hasAction = computed(() => hasDraft.value || props.loading);
const actionIcon = computed(() => (props.loading && !hasDraft.value ? 'stop' : 'arrow_upward'));
const actionTooltip = computed(() => {
  if (props.loading && !hasDraft.value) return t('agent.stop');
  if (props.loading) return t('agent.queueFollowup');
  return t('agent.send');
});

watch(() => props.draft, (value) => {
  if (value !== localDraft.value) {
    localDraft.value = value;
  }
});

function onInputUpdate(value: string | number | null) {
  localDraft.value = typeof value === 'string' ? value : String(value ?? '');
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    if (hasDraft.value) {
      emit('submit', localDraft.value);
    }
  }
}

function handlePrimaryAction() {
  if (hasDraft.value) {
    emit('submit', localDraft.value);
    return;
  }

  if (props.loading) emit('abort');
}

function onFileSelected(event: Event) {
  const target = event.target as HTMLInputElement | null;
  const files = Array.from(target?.files ?? []);
  if (files.length > 0) {
    emit('attach-files', files);
  }
  if (target) target.value = '';
}

defineExpose({
  focus: () => inputRef.value?.focus(),
  setDraft: (value: string) => {
    localDraft.value = value;
  },
});
</script>

<style lang="scss" scoped>
.hidden-file-input {
  display: none;
}

.input-card {
  // layout hook — visual rules in global .imago-input-card
}

.attachment-chip-row {
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
    font-size: 14px;
    min-height: 40px;
    max-height: 180px;
    padding-top: 10px;
    padding-bottom: 4px;
    line-height: 1.5;
    resize: none;
    color: var(--imago-text-secondary);

    &::placeholder {
      color: var(--imago-text-faint);
    }
  }

  :deep(.q-field__native) {
    color: var(--imago-text-secondary);
  }

  :deep(.q-field__control::placeholder) {
    color: var(--imago-text-faint);
  }

  :deep(.q-field--disabled .q-field__control) {
    opacity: 0.5;
  }
}

.input-actions {
  min-height: 36px;
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
      color: var(--imago-text-primary);
    }

    :deep(.q-icon) {
      color: var(--imago-text-primary);
    }

    :deep(.q-btn) {
      background: var(--imago-border-dim);
    }
  }
}

.composer-hint {
  font-size: 12px;
  color: var(--imago-text-faint);
  text-align: center;
  margin-top: 4px;
}
</style>
