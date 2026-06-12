<template>
  <template v-for="segment in segments" :key="segment.id">
    <MarkdownRender
      v-if="segment.type === 'markdown'"
      :content="segment.content"
      :final="final"
    />
    <AgentMermaidDiagram
      v-else
      :code="segment.content"
      :final="final"
    />
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { MarkdownRender } from 'markstream-vue'
import AgentMermaidDiagram from './AgentMermaidDiagram.vue'

type MarkdownSegment = {
  id: string
  type: 'markdown'
  content: string
}

type MermaidSegment = {
  id: string
  type: 'mermaid'
  content: string
}

type RenderSegment = MarkdownSegment | MermaidSegment

const props = defineProps<{
  content: string
  final: boolean
}>()

const completeMermaidFence = /^```mermaid[ \t]*\n([\s\S]*?)\n```[ \t]*$/im

function splitMarkdownForMermaid(content: string, final: boolean): RenderSegment[] {
  if (!final) {
    return [{ id: 'markdown-0', type: 'markdown', content }]
  }

  const segments: RenderSegment[] = []
  let remaining = content
  let cursor = 0
  let index = 0

  while (remaining.length > 0) {
    const match = completeMermaidFence.exec(remaining)
    if (!match || match.index < 0) break

    const before = remaining.slice(0, match.index)
    if (before) {
      segments.push({ id: `markdown-${index}`, type: 'markdown', content: before })
      index += 1
    }

    segments.push({ id: `mermaid-${index}`, type: 'mermaid', content: match[1] ?? '' })
    index += 1

    cursor += match.index + match[0].length
    remaining = content.slice(cursor)
  }

  if (remaining) {
    segments.push({ id: `markdown-${index}`, type: 'markdown', content: remaining })
  }

  return segments.length > 0 ? segments : [{ id: 'markdown-0', type: 'markdown', content }]
}

const segments = computed(() => splitMarkdownForMermaid(props.content, props.final))
</script>
