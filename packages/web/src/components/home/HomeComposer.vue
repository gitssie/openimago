<template>
  <div class="home-composer">
    <textarea
      ref="textareaRef"
      v-model="text"
      :placeholder="t('gallery.composerPlaceholder')"
      class="home-composer__input"
      rows="1"
      @keydown="handleKeydown"
      @input="autosize"
    />

    <div class="home-composer__bar">
      <div class="home-composer__bar-left">
        <button type="button" class="home-composer__icon-btn" :aria-label="t('gallery.composerAttach')">
          <q-icon name="add" size="20px" />
        </button>
        <button type="button" class="home-composer__select">
          <q-icon name="auto_awesome" size="14px" />
          <span>{{ t('gallery.composerMode') }}</span>
          <q-icon name="expand_more" size="14px" class="home-composer__select-caret" />
        </button>
        <button type="button" class="home-composer__select">
          <q-icon name="crop_landscape" size="14px" />
          <span>{{ t('gallery.composerAspect') }}</span>
        </button>
        <button type="button" class="home-composer__select">
          <q-icon name="timer" size="14px" />
          <span>{{ t('gallery.composerDuration') }}</span>
        </button>
      </div>

      <button
        type="button"
        class="home-composer__send"
        :class="{ 'is-active': hasText }"
        :disabled="!hasText"
        :aria-label="t('gallery.composerSend')"
        @click="handleSend"
      >
        <q-icon name="north" size="20px" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  modelValue: string
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'submit', value: string): void
}>()

const text = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const hasText = computed(() => text.value.trim().length > 0)

function autosize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 180)}px`
}

watch(text, () => {
  void nextTick(autosize)
})

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (hasText.value) emit('submit', text.value)
  }
}

function handleSend() {
  if (!hasText.value) return
  emit('submit', text.value)
}

defineExpose({ focus: () => textareaRef.value?.focus() })
</script>

<style lang="scss" scoped>
.home-composer {
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

  // Gradient border via pseudo-element (matches reference: cyan top-left → violet bottom-right)
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

.home-composer__input {
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

.home-composer__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 14px 14px;
}

.home-composer__bar-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.home-composer__icon-btn {
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
}

.home-composer__icon-btn:hover {
  border-color: var(--imago-border-cyan);
  color: var(--imago-text-primary);
}

.home-composer__select {
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

.home-composer__select:hover {
  border-color: var(--imago-border-cyan);
  color: var(--imago-text-primary);
}

.home-composer__select-caret {
  margin-left: 2px;
  opacity: 0.6;
}

.home-composer__send {
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
}

.home-composer__send.is-active {
  background: var(--imago-neon-cyan);
  color: #030713;
  box-shadow: 0 0 20px rgba(0, 240, 255, 0.55);
}

.home-composer__send.is-active:hover {
  background: var(--imago-cyan-bright);
  box-shadow: 0 0 28px rgba(0, 240, 255, 0.75);
}

@media (max-width: 640px) {
  .home-composer__bar-left {
    gap: 4px;
  }
  .home-composer__select span {
    display: none;
  }
}
</style>
