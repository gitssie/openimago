<template>
  <header class="page-header">
    <div class="page-header__title-block">
      <h1 v-if="title" class="page-header__title">{{ title }}</h1>
      <p v-if="subtitle" class="page-header__subtitle">{{ subtitle }}</p>
    </div>

    <q-space />

    <slot name="actions">
      <q-btn
        v-if="search !== undefined"
        flat
        dense
        no-caps
        class="page-header__search"
        :aria-label="searchPlaceholder"
      >
        <q-icon name="search" size="16px" class="page-header__search-icon" />
        <input
          :value="search"
          type="text"
          :placeholder="searchPlaceholder"
          class="page-header__search-input"
          @input="$emit('update:search', ($event.target as HTMLInputElement).value)"
        >
      </q-btn>

      <q-btn
        v-if="createLabel"
        unelevated
        no-caps
        class="page-header__create"
        :aria-label="createLabel"
        @click="$emit('create')"
      >
        <q-icon name="add" size="16px" class="page-header__create-icon" />
        <span>{{ createLabel }}</span>
      </q-btn>
    </slot>
  </header>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  /** Main heading text (e.g. "我的项目") */
  title?: string
  /** Optional subtitle/description below the title */
  subtitle?: string
  /** v-model:search value. Omit to hide the search box. */
  search?: string
  /** Placeholder for the search input */
  searchPlaceholder?: string
  /** Label for the primary action button. Omit to hide. */
  createLabel?: string
}>(), {
  searchPlaceholder: '搜索...',
})

defineEmits<{
  (e: 'update:search', value: string): void
  (e: 'create'): void
}>()
</script>

<style lang="scss" scoped>
.page-header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  margin: 0 0 24px;
}

.page-header__title-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.page-header__title {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--imago-text-primary);
  line-height: 1.15;
}

.page-header__subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--imago-text-muted);
  line-height: 1.5;
}

// ── Search box ───────────────────────────────────────────────────────
.page-header__search {
  height: 40px;
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--imago-border-light);
  border-radius: 10px;
  background: var(--imago-bg-raised);
  color: var(--imago-text-secondary);
  transition:
    border-color var(--imago-ease-fast),
    background var(--imago-ease-fast);
}

.page-header__search:hover {
  border-color: var(--imago-border-cyan);
}

.page-header__search:focus-within {
  border-color: var(--imago-border-cyan-active);
  background: rgba(0, 240, 255, 0.04);
}

.page-header__search-icon {
  color: var(--imago-text-dim);
  margin-right: 8px;
}

.page-header__search-input {
  flex: 1;
  min-width: 180px;
  background: transparent;
  border: 0;
  outline: 0;
  color: var(--imago-text-primary);
  font-family: inherit;
  font-size: 13px;

  &::placeholder {
    color: var(--imago-text-faint);
  }
}

// ── Create button (neon cyan) ────────────────────────────────────────
.page-header__create {
  height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  color: #030713;
  background: linear-gradient(90deg, #00f0ff 0%, #5cc6ff 100%);
  box-shadow:
    0 0 18px rgba(0, 240, 255, 0.30),
    inset 0 0 0 1px rgba(255, 255, 255, 0.18);
  transition:
    box-shadow var(--imago-ease-fast),
    filter var(--imago-ease-fast);
}

.page-header__create:hover {
  filter: brightness(1.08);
  box-shadow:
    0 0 26px rgba(0, 240, 255, 0.45),
    inset 0 0 0 1px rgba(255, 255, 255, 0.25);
}

.page-header__create-icon {
  margin-right: 4px;
  color: #030713;
}
</style>
