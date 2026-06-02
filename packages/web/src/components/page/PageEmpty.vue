<template>
  <div class="page-empty">
    <div class="page-empty__icon" aria-hidden="true">
      <q-icon :name="icon" size="44px" />
    </div>
    <h3 class="page-empty__title">{{ title }}</h3>
    <p v-if="description" class="page-empty__desc">{{ description }}</p>
    <q-btn
      v-if="actionLabel"
      unelevated
      no-caps
      class="page-empty__cta"
      :label="actionLabel"
      @click="$emit('action')"
    />
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  icon?: string
  title: string
  description?: string
  actionLabel?: string
}>(), {
  icon: 'inbox',
})

defineEmits<{
  (e: 'action'): void
}>()
</script>

<style lang="scss" scoped>
.page-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 64px 0 32px;
  text-align: center;
}

.page-empty__icon {
  width: 88px;
  height: 88px;
  display: grid;
  place-items: center;
  border-radius: 24px;
  background:
    radial-gradient(circle, rgba(0, 240, 255, 0.10), transparent 70%),
    var(--imago-bg-glass);
  border: 1px solid var(--imago-border-cyan);
  color: var(--imago-neon-cyan);
  box-shadow:
    0 0 32px rgba(0, 240, 255, 0.10),
    inset 0 0 24px rgba(0, 240, 255, 0.06);
  margin-bottom: 18px;
}

.page-empty__title {
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 600;
  color: var(--imago-text-primary);
}

.page-empty__desc {
  margin: 0 0 18px;
  max-width: 360px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--imago-text-muted);
}

.page-empty__cta {
  height: 36px;
  padding: 0 18px;
  font-size: 13px;
  font-weight: 600;
  color: #030713;
  background: linear-gradient(90deg, #00f0ff 0%, #5cc6ff 100%);
  box-shadow: 0 0 18px rgba(0, 240, 255, 0.30);
}
</style>
