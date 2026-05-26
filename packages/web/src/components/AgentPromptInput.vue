<template>
  <div class="agent-prompt-input">
    <input
      ref="fileInputRef"
      type="file"
      class="hidden-file-input"
      multiple
      @change="onFileSelected"
    >

    <div class="input-card">
      <div v-if="attachments.length > 0" class="attachment-chip-row row q-col-gutter-xs q-px-xs q-pt-xs">
        <div v-for="attachment in attachments" :key="attachment.id" class="col-auto">
          <q-chip
            dense
            removable
            color="blue-1"
            text-color="primary"
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
        :placeholder="t('agent.askAnythingPlaceholder')"
        borderless
        autogrow
        :maxlength="4000"
        :disable="disabled"
        class="chat-input"
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
          color="grey-6"
          :disable="disabled"
          @click="fileInputRef?.click()"
        >
          <q-tooltip>{{ t('agent.attachFile') }}</q-tooltip>
        </q-btn>

        <q-space />

        <q-icon
          name="circle"
          :color="connected ? 'positive' : 'grey-4'"
          size="8px"
          class="q-mr-xs"
        >
          <q-tooltip>{{ connected ? t('agent.connected') : t('agent.connecting') }}</q-tooltip>
        </q-icon>

        <q-btn
          round
          unelevated
          :icon="loading ? 'stop' : 'arrow_upward'"
          :color="(localDraft.trim() || attachments.length > 0 || loading) ? 'primary' : 'grey-3'"
          :text-color="(localDraft.trim() || attachments.length > 0 || loading) ? 'white' : 'grey-5'"
          :disable="disabled ? true : (!localDraft.trim() && attachments.length === 0 && !loading)"
          size="sm"
          class="send-btn"
          @click="loading ? emit('abort') : emit('submit', localDraft)"
        >
          <q-tooltip>{{ loading ? t('agent.stop') : t('agent.send') }}</q-tooltip>
        </q-btn>
      </div>
    </div>

    <div class="text-caption text-grey-5 text-center q-mt-xs">
      {{ t('agent.inputHint') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { QInput } from 'quasar';
import { useI18n } from 'vue-i18n';
import type { PendingAttachment } from 'src/composables/useAgentSession';

const props = defineProps<{
  draft: string;
  loading: boolean;
  connected: boolean;
  disabled: boolean;
  attachments: PendingAttachment[];
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
    if (localDraft.value.trim() && !props.loading) {
      emit('submit', localDraft.value);
    }
  }
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
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 4px 12px 8px;
  transition: border-color 0.15s, box-shadow 0.15s;

  &:focus-within {
    border-color: $primary;
    box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.1);
  }
}

.attachment-chip-row {
  max-width: 100%;
}

.attachment-chip {
  max-width: 240px;

  :deep(.q-chip__content) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
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
  }
}

.input-actions {
  min-height: 36px;
}
</style>
