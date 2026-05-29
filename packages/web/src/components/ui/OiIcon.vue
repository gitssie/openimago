<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <span class="oi-icon" :style="sizeStyle" v-html="svg" aria-hidden="true" />
</template>

<script setup lang="ts">
import { computed } from 'vue'

import assetCube from 'src/assets/icons/asset-cube.svg?raw'
import canvas from 'src/assets/icons/canvas.svg?raw'
import chat from 'src/assets/icons/chat.svg?raw'
import clock from 'src/assets/icons/clock.svg?raw'
import commandSlash from 'src/assets/icons/command-slash.svg?raw'
import copy from 'src/assets/icons/copy.svg?raw'
import download from 'src/assets/icons/download.svg?raw'
import enhanceWave from 'src/assets/icons/enhance-wave.svg?raw'
import filter from 'src/assets/icons/filter.svg?raw'
import grid from 'src/assets/icons/grid.svg?raw'
import imagePlaceholder from 'src/assets/icons/image-placeholder.svg?raw'
import list from 'src/assets/icons/list.svg?raw'
import more from 'src/assets/icons/more.svg?raw'
import oiLogomark from 'src/assets/icons/oi-logomark.svg?raw'
import oiLogo from 'src/assets/icons/openimago-logo.svg?raw'
import oiLogoMonochrome from 'src/assets/icons/openimago-logo-monochrome.svg?raw'
import palette from 'src/assets/icons/palette.svg?raw'
import paperclip from 'src/assets/icons/paperclip.svg?raw'
import plus from 'src/assets/icons/plus.svg?raw'
import projectFolder from 'src/assets/icons/project-folder.svg?raw'
import promptDoc from 'src/assets/icons/prompt-doc.svg?raw'
import revert from 'src/assets/icons/revert.svg?raw'
import search from 'src/assets/icons/search.svg?raw'
import send from 'src/assets/icons/send.svg?raw'
import settings from 'src/assets/icons/settings.svg?raw'
import share from 'src/assets/icons/share.svg?raw'
import sliders from 'src/assets/icons/sliders.svg?raw'
import star from 'src/assets/icons/star.svg?raw'
import templateGrid from 'src/assets/icons/template-grid.svg?raw'
import thinking from 'src/assets/icons/thinking.svg?raw'
import toolCube from 'src/assets/icons/tool-cube.svg?raw'
import trash from 'src/assets/icons/trash.svg?raw'

const ICONS = {
  'asset-cube': assetCube,
  canvas,
  chat,
  clock,
  'command-slash': commandSlash,
  copy,
  download,
  'enhance-wave': enhanceWave,
  filter,
  grid,
  'image-placeholder': imagePlaceholder,
  list,
  more,
  'oi-logomark': oiLogomark,
  'openimago-logo': oiLogo,
  'openimago-logo-monochrome': oiLogoMonochrome,
  palette,
  paperclip,
  plus,
  'project-folder': projectFolder,
  'prompt-doc': promptDoc,
  revert,
  search,
  send,
  settings,
  share,
  sliders,
  star,
  'template-grid': templateGrid,
  thinking,
  'tool-cube': toolCube,
  trash,
} as const

export type OiIconName = keyof typeof ICONS

const props = withDefaults(defineProps<{
  name: OiIconName
  size?: string | number
}>(), {
  size: '1em',
})

const svg = computed(() => ICONS[props.name] ?? '')

const sizeStyle = computed(() => {
  const s = typeof props.size === 'number'
    ? `${props.size}px`
    : /^\d+(\.\d+)?$/.test(props.size)
      ? `${props.size}px`
      : props.size
  return { width: s, height: s }
})
</script>

<style scoped>
.oi-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  line-height: 1;
}

.oi-icon :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
}
</style>
