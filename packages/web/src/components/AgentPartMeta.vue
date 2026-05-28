<template>
  <div class="part-meta-item imago-part">
    <div class="imago-part__header" @click="open = !open">
      <q-icon :name="icon" size="14px" color="grey-6" class="q-mr-xs" />
      <span class="imago-part__title col">{{ title }}</span>
      <q-icon :name="open ? 'expand_less' : 'expand_more'" size="14px" color="grey-5" />
    </div>

    <div v-if="open" class="imago-part__body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = withDefaults(defineProps<{
  title: string;
  icon: string;
  defaultOpen?: boolean;
}>(), {
  defaultOpen: false,
});

const open = ref(props.defaultOpen);
// No scoped style — visual rules from global .imago-part
</script>
