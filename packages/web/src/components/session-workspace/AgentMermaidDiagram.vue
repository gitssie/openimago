<template>
  <div class="agent-mermaid" data-testid="agent-mermaid">
    <div v-if="svg" class="agent-mermaid__diagram" v-html="svg" />
    <pre v-else class="agent-mermaid__fallback"><code class="language-mermaid">{{ code }}</code></pre>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import mermaid from 'mermaid'

const props = defineProps<{
  code: string
  final: boolean
}>()

const svg = ref('')
const renderError = ref<Error | null>(null)

let initialized = false
let renderSequence = 0

function ensureMermaidInitialized() {
  if (initialized) return
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'strict',
    fontFamily: 'Inter, system-ui, sans-serif',
  })
  initialized = true
}

async function renderDiagram() {
  if (!props.final) {
    svg.value = ''
    renderError.value = null
    return
  }

  const diagram = props.code.trim()
  if (!diagram) {
    svg.value = ''
    renderError.value = null
    return
  }

  const sequence = renderSequence + 1
  renderSequence = sequence

  try {
    ensureMermaidInitialized()
    await nextTick()
    const result = await mermaid.render(`agent-mermaid-${sequence}`, diagram)
    if (sequence !== renderSequence) return
    svg.value = typeof result === 'string' ? result : result.svg
    renderError.value = null
  } catch (error) {
    if (sequence !== renderSequence) return
    svg.value = ''
    renderError.value = error instanceof Error ? error : new Error(String(error))
  }
}

watch(() => [props.code, props.final] as const, () => { void renderDiagram() })

onMounted(() => { void renderDiagram() })
</script>

<style scoped>
.agent-mermaid {
  margin: 12px 0;
  overflow-x: auto;
  border: 1px solid rgba(0 240 255 / 0.16);
  border-radius: var(--imago-radius-md);
  background: linear-gradient(145deg, rgba(255 255 255 / 0.035), rgba(0 240 255 / 0.025));
}

.agent-mermaid__diagram {
  display: flex;
  justify-content: center;
  min-width: 0;
  padding: 16px;
}

.agent-mermaid__diagram :deep(svg) {
  max-width: 100%;
  height: auto;
}

.agent-mermaid__fallback {
  margin: 0;
  background: var(--imago-bg-code);
  padding: 12px 16px;
  overflow-x: auto;
}
</style>
