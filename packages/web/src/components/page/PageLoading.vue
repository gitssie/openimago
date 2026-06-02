<template>
  <div class="page-loading">
    <q-spinner-dots size="48px" color="cyan" />
    <p v-if="message" class="page-loading__msg">{{ message }}</p>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  message?: string
}>(), {
  message: '',
})
</script>

<style lang="scss" scoped>
.page-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  min-height: 240px;
  padding: 48px 0;
  color: var(--imago-neon-cyan);
}

.page-loading__msg {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.05em;
  color: var(--imago-text-dim);
}
</style>
