<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <span class="oi-icon" :style="sizeStyle" v-html="svg" aria-hidden="true" />
</template>

<script setup lang="ts">
import { computed } from 'vue'

import assetCube from 'src/assets/icons/asset-cube.svg?raw'
import bell from 'src/assets/icons/bell.svg?raw'
import bellRing from 'src/assets/icons/bell-ring.svg?raw'
import briefcase from 'src/assets/icons/briefcase.svg?raw'
import calendar from 'src/assets/icons/calendar.svg?raw'
import canvas from 'src/assets/icons/canvas.svg?raw'
import chat from 'src/assets/icons/chat.svg?raw'
import chatBubble from 'src/assets/icons/chat-bubble.svg?raw'
import check from 'src/assets/icons/check.svg?raw'
import chevronDown from 'src/assets/icons/chevron-down.svg?raw'
import clock from 'src/assets/icons/clock.svg?raw'
import clockOutline from 'src/assets/icons/clock-outline.svg?raw'
import commandSlash from 'src/assets/icons/command-slash.svg?raw'
import copy from 'src/assets/icons/copy.svg?raw'
import crown from 'src/assets/icons/crown.svg?raw'
import cube from 'src/assets/icons/cube.svg?raw'
import document from 'src/assets/icons/document.svg?raw'
import download from 'src/assets/icons/download.svg?raw'
import enhanceWave from 'src/assets/icons/enhance-wave.svg?raw'
import filter from 'src/assets/icons/filter.svg?raw'
import grid from 'src/assets/icons/grid.svg?raw'
import grid2x2 from 'src/assets/icons/grid-2x2.svg?raw'
import history from 'src/assets/icons/history.svg?raw'
import imageCard from 'src/assets/icons/image-card.svg?raw'
import imagePlaceholder from 'src/assets/icons/image-placeholder.svg?raw'
import layers from 'src/assets/icons/layers.svg?raw'
import list from 'src/assets/icons/list.svg?raw'
import listBullet from 'src/assets/icons/list-bullet.svg?raw'
import messageSquare from 'src/assets/icons/message-square.svg?raw'
import more from 'src/assets/icons/more.svg?raw'
import oiLogomark from 'src/assets/icons/oi-logomark.svg?raw'
import oiLogo from 'src/assets/icons/openimago-logo.svg?raw'
import oiLogoMonochrome from 'src/assets/icons/openimago-logo-monochrome.svg?raw'
import palette from 'src/assets/icons/palette.svg?raw'
import paperclip from 'src/assets/icons/paperclip.svg?raw'
import people from 'src/assets/icons/people.svg?raw'
import plus from 'src/assets/icons/plus.svg?raw'
import projectFolder from 'src/assets/icons/project-folder.svg?raw'
import promptDoc from 'src/assets/icons/prompt-doc.svg?raw'
import revert from 'src/assets/icons/revert.svg?raw'
import rows from 'src/assets/icons/rows.svg?raw'
import search from 'src/assets/icons/search.svg?raw'
import send from 'src/assets/icons/send.svg?raw'
import settings from 'src/assets/icons/settings.svg?raw'
import share from 'src/assets/icons/share.svg?raw'
import sliders from 'src/assets/icons/sliders.svg?raw'
import sparkFill from 'src/assets/icons/spark-fill.svg?raw'
import sparkle from 'src/assets/icons/sparkle.svg?raw'
import stack from 'src/assets/icons/stack.svg?raw'
import star from 'src/assets/icons/star.svg?raw'
import storyboard from 'src/assets/icons/storyboard.svg?raw'
import templateGrid from 'src/assets/icons/template-grid.svg?raw'
import thinking from 'src/assets/icons/thinking.svg?raw'
import toolCube from 'src/assets/icons/tool-cube.svg?raw'
import trash from 'src/assets/icons/trash.svg?raw'
import trending from 'src/assets/icons/trending.svg?raw'

const ICONS = {
  'asset-cube': assetCube,
  bell,
  'bell-ring': bellRing,
  briefcase,
  calendar,
  canvas,
  chat,
  'chat-bubble': chatBubble,
  check,
  'chevron-down': chevronDown,
  clock,
  'clock-outline': clockOutline,
  'command-slash': commandSlash,
  copy,
  crown,
  cube,
  document,
  download,
  'enhance-wave': enhanceWave,
  filter,
  grid,
  'grid-2x2': grid2x2,
  history,
  'image-card': imageCard,
  'image-placeholder': imagePlaceholder,
  layers,
  list,
  'list-bullet': listBullet,
  'message-square': messageSquare,
  more,
  'oi-logomark': oiLogomark,
  'openimago-logo': oiLogo,
  'openimago-logo-monochrome': oiLogoMonochrome,
  palette,
  paperclip,
  people,
  plus,
  'project-folder': projectFolder,
  'prompt-doc': promptDoc,
  revert,
  rows,
  search,
  send,
  settings,
  share,
  sliders,
  'spark-fill': sparkFill,
  sparkle,
  stack,
  star,
  storyboard,
  'template-grid': templateGrid,
  thinking,
  'tool-cube': toolCube,
  trash,
  trending,
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
