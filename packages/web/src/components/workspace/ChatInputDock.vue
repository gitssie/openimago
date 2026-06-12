// ChatInputDock
// ─────────────
// Center-column input dock shared by both redesigned workspace pages. Visually
// mirrors the composer area in the approved mockups: a single glowing input
// card with the controls rendered inside PromptInput's action row.
//
// Behaviour-wise it is a thin wrapper around the existing PromptInput. The
// leading-slot controls inside the textarea card are wired through slots so the page
// can decide which ones to surface for the current context. A status line
// ("Enter 发送, Shift + Enter 换行") is shown beneath the textarea.
//
// The dock is intended to be placed at the bottom of the center chat column,
// NOT as a UILayoutFooter — see the redesigned SessionWorkspacePage and
// ProjectWorkspacePage for the layout wiring.

<template>
  <div class="chat-input-dock" role="region" aria-label="创作输入面板">
    <div class="chat-input-dock__container">
      <!-- Optional context strip (e.g. selected scene / artifact preview) -->
      <div v-if="$slots.context" class="chat-input-dock__context">
        <slot name="context" />
      </div>

      <!-- PromptInput — the existing composer; visually styled to fit the dock -->
      <div class="chat-input-dock__composer">
        <slot
          name="composer"
          :submit="handleSubmit"
          :draft="draft"
          :on-input="handleInput"
        >
          <PromptInput
            ref="inputRef"
            v-model="draft"
            :placeholder="placeholder"
            :loading="loading"
            :connected="connected"
            :disabled="disabled"
            :attachments="attachments"
            @submit="handleSubmit"
            @abort="emit('abort')"
            @remove-attachment="(id) => emit('remove-attachment', id)"
            @attach-files="(files) => emit('attach-files', files)"
          >
            <template v-if="$slots.compose || showDefaultCompose" #leading>
              <slot name="compose">
                <button
                  type="button"
                  class="prompt-input__icon-btn"
                  aria-label="添加附件"
                >
                  <OiIcon name="plus" :size="14" />
                  <ImagePickerPopup @select="handleAttachmentSelect" />
                </button>
                <button
                  type="button"
                  class="prompt-input__select"
                  aria-haspopup="listbox"
                >
                  <OiIcon name="sliders" :size="14" />
                  <span>{{ modelLabel }}</span>
                  <q-icon name="expand_more" size="14px" class="prompt-input__select-caret" />
                </button>
                <button
                  v-if="showSkillPill"
                  type="button"
                  class="prompt-input__select"
                >
                  <OiIcon name="spark-fill" :size="14" />
                  <span>Skill</span>
                </button>
                <button
                  v-if="showElementPill"
                  type="button"
                  class="prompt-input__select"
                >
                  <OiIcon name="cube" :size="14" />
                  <span>元素</span>
                </button>
              </slot>
            </template>
          </PromptInput>
        </slot>
      </div>

      <!-- Status hint line -->
      <div v-if="showHint" class="chat-input-dock__hint">
        {{ hintText }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import ImagePickerPopup from 'src/components/ImagePickerPopup.vue'
import PromptInput from 'src/components/PromptInput.vue'
import type { ComposerAttachment } from 'src/components/PromptInput.vue'
import OiIcon from 'src/components/ui/OiIcon.vue'

type AttachmentType = 'image' | 'audio' | 'video' | 'text'

// ── Props ────────────────────────────────────────────────────────────────────

withDefaults(defineProps<{
  placeholder?: string
  loading?: boolean
  connected?: boolean
  disabled?: boolean
  attachments?: ComposerAttachment[]
  modelLabel?: string
  showSkillPill?: boolean
  showElementPill?: boolean
  showDefaultCompose?: boolean
  showHint?: boolean
  hintText?: string
}>(), {
  placeholder: '输入您的指令或需求…',
  loading: false,
  connected: true,
  disabled: false,
  attachments: () => [],
  modelLabel: 'GPT-4o',
  showSkillPill: true,
  showElementPill: true,
  showDefaultCompose: true,
  showHint: true,
  hintText: 'Enter 发送, Shift + Enter 换行',
})

// ── Emits ────────────────────────────────────────────────────────────────────

const emit = defineEmits<{
  (e: 'submit', value: string): void
  (e: 'abort'): void
  (e: 'attach-files', files: File[]): void
  (e: 'remove-attachment', id: string): void
}>()

// ── Local state (only the dock's own draft) ──────────────────────────────────

const draft = ref('')
const inputRef = ref<InstanceType<typeof PromptInput> | null>(null)

function handleInput(value: string): void {
  draft.value = value
}

function handleSubmit(value: string): void {
  emit('submit', value)
  draft.value = ''
}

function handleAttachmentSelect(type: AttachmentType): void {
  inputRef.value?.openFilePicker?.(type)
}
</script>

<style lang="scss" scoped>
// ── Chat input dock ──────────────────────────────────────────────────────────

.chat-input-dock {
  flex-shrink: 0;
  padding: 10px 20px 16px;
  background: linear-gradient(180deg, transparent, var(--imago-bg-void) 70%);
}

.chat-input-dock__container {
  max-width: 760px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

// ── Context strip slot ───────────────────────────────────────────────────────

.chat-input-dock__context {
  margin-bottom: 4px;
}

// ── Composer card ────────────────────────────────────────────────────────────

.chat-input-dock__composer {
  width: 100%;
}

.chat-input-dock__hint {
  font-size: 11.5px;
  color: var(--imago-text-faint);
  padding: 0 4px;
  letter-spacing: 0.01em;
}

// ── Responsive ───────────────────────────────────────────────────────────────

@media (max-width: 768px) {
  .chat-input-dock { padding: 8px 12px 12px; }
}
</style>
