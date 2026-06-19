<!--
  StoryCutPanel — the 时间线 tab's NLE Cut editor (ADR 0006/0007, openimago-4eiw).
  Replaces the old workflow-DAG StoryTimelinePanel.

  Mounts the vendored omniclip fork's <construct-editor>, hydrates it from the
  episode's cut.json (canonical, ownership model A), and persists edits through
  the cut write endpoints with the cut's own optimistic-concurrency clock.

  BROWSER NOTE: the omniclip editor needs WebCodecs + SharedArrayBuffer +
  IndexedDB and is loaded via a runtime dynamic import of the vendored fork
  (excluded from repo typecheck). The data orchestration (hydrate mapping,
  media resolution, edit dispatch + 409 retry) lives in tested src/utils/cut
  modules. See src/vendor/omniclip-fork/LOCAL_VALIDATION.md for the manual
  browser checks.
-->
<template>
  <section class="story-cut" aria-label="时间线粗剪">
    <!-- ── Empty state: episode has no Cut yet → offer to assemble ── -->
    <div v-if="isEmptyCut" class="story-cut__empty">
      <div class="story-cut__empty-frame" aria-hidden="true">
        <OiIcon name="canvas" :size="24" />
      </div>
      <p class="story-cut__empty-title">尚未生成粗剪</p>
      <p class="story-cut__empty-hint">
        从本集已完成的镜头自动拼接一个粗剪，然后在时间线上修剪、排序与转场。
      </p>
      <button
        type="button"
        class="story-cut__assemble"
        :disabled="assembling"
        @click="onAssemble"
      >
        <OiIcon name="enhance-wave" :size="15" />
        {{ assembling ? '正在拼接…' : '自动拼接粗剪' }}
      </button>
    </div>

    <!-- ── Cut editor ── -->
    <template v-else>
      <div v-if="orphanCount > 0" class="story-cut__orphan-banner" role="status">
        <OiIcon name="layers" :size="13" />
        {{ orphanCount }} 个片段的源镜头已不存在，已标记为缺失（灰色虚线）。
      </div>

      <!-- omniclip's editor custom element (registered by the fork on load). -->
      <div ref="editorHost" class="story-cut__editor" data-testid="cut-editor-host">
        <construct-editor v-if="editorReady" class="story-cut__construct" />
        <p v-else class="story-cut__loading">
          {{ editorError ? editorError : '正在加载剪辑器…' }}
        </p>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import OiIcon from 'src/components/ui/OiIcon.vue'
import type { StoryRunSummary, StoryShotSummary } from 'src/components/session-workspace/types'
import type { EpisodeCut } from 'src/utils/cut/cut-types'
import { makeShotMediaResolver } from 'src/utils/cut/shot-media-resolver'
import { buildHydrationPayload } from 'src/utils/cut/cut-hydration'
import { dispatchCutEdit, type CutEdit } from 'src/utils/cut/cut-edit-dispatcher'
import { buildClipMenuItems } from 'src/utils/cut/clip-menu-items'
import type { LoadOmniclipFork, OmniclipForkApi } from 'src/utils/cut/fork-contract'
import { api, ApiError } from 'src/api/client'

const props = defineProps<{
  projectId: string
  episodeId: string
  /** canonical cut for the episode (empty clips => never cut). */
  cut: EpisodeCut | null
  shots: StoryShotSummary[]
  runs: StoryRunSummary[]
}>()

const emit = defineEmits<{
  /** ask the page to (re)assemble + refetch the cut. */
  (e: 'request-assemble'): void
  /** a persisted edit changed the cut — page should refetch. */
  (e: 'cut-changed'): void
  /** surface a conflict that lost after one retry. */
  (e: 'cut-conflict'): void
  /** clip menu (openimago-e0n3): regenerate the source shot's media. */
  (e: 'clip-regenerate', sourceShotId: string): void
  /** clip menu: edit the source shot's description. */
  (e: 'clip-manual-edit', sourceShotId: string): void
  /** clip menu: delete the CLIP (not the shot). */
  (e: 'clip-delete', clipId: string): void
  /** clip menu: attach the clip's media to the chat as a reference. */
  (e: 'clip-add-to-chat', sourceShotId: string): void
}>()

const editorHost = ref<HTMLElement | null>(null)
const editorReady = ref(false)
const editorError = ref<string | null>(null)
const assembling = ref(false)

// Local optimistic-concurrency clock for cut writes (ADR 0008 #3). Seeded from
// the canonical cut and advanced by each write's returned updatedAt, so the
// panel does NOT re-hydrate on every edit (which would re-import media). The
// rare cross-actor agent-assemble race is still caught by emit('cut-changed') →
// page refetch + runCutMutation's 409 retry.
const lastUpdatedAt = ref<string | undefined>(props.cut?.updatedAt)

let fork: OmniclipForkApi | null = null
let unregisterClipMenu: (() => void) | null = null
let unsubscribeEdits: (() => void) | null = null

const isEmptyCut = computed(() => !props.cut || props.cut.clips.length === 0)

// Resolve clip media (shot -> latest completed run preview) for hydration.
const mediaResolver = computed(() => makeShotMediaResolver(props.shots, props.runs))

// Orphans: clips whose source shot has no usable media (rendered greyed).
const orphanCount = computed(() => {
  if (!props.cut) return 0
  return props.cut.clips.filter((c) => mediaResolver.value(c.sourceShotId) === null).length
})

/** Assemble the first cut from the episode's shots, then refetch. */
async function onAssemble(): Promise<void> {
  if (assembling.value) return
  assembling.value = true
  try {
    await api.assembleEpisodeCut(props.projectId, props.episodeId, props.cut?.updatedAt)
    emit('request-assemble')
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      emit('cut-conflict')
    } else {
      editorError.value = '拼接失败'
    }
  } finally {
    assembling.value = false
  }
}

/** Persist one editor edit through the cut endpoints (tested dispatcher). */
async function persistEdit(edit: CutEdit): Promise<void> {
  const outcome = await dispatchCutEdit(
    {
      api,
      projectId: props.projectId,
      episodeId: props.episodeId,
      // Read the LOCAL clock (decision 3): structural edits chain off each
      // other's returned updatedAt without a refetch between them.
      currentUpdatedAt: () => lastUpdatedAt.value,
      refetch: async () => {
        const fresh = await api.projectStoryCut(props.projectId, props.episodeId)
        lastUpdatedAt.value = fresh?.updatedAt
        return fresh?.updatedAt
      },
      // Advance the local clock from each write so the next edit's expected
      // updatedAt is current — no re-hydration, no per-edit refetch.
      onWritten: (updatedAt) => {
        lastUpdatedAt.value = updatedAt
      },
    },
    edit,
  )
  if (outcome === 'conflict') emit('cut-conflict')
  else emit('cut-changed')
}

// TODO(ADR 0008 #1b — host transition/BGM controls, out of scope for ssro):
// transitions + BGM are HOST-driven, not derived from the omniclip diff
// (omniclip 1.0.7 has no transition UI; the fork keeps transitions in its own
// per-context store). When host controls are built, they must call the fork
// setter (fork.setTransition / fork.clearTransition) AND persistEdit with the
// matching CutEdit — the set-transition / clear-transition / set-bgm / clear-bgm
// path through persistEdit -> dispatchCutEdit is already wired and correct; only
// the UI controls that originate these edits are missing.

// ── BROWSER-ONLY: load the fork, mount the editor, hydrate from cut.json ──
//
// Guarded behind the runtime loader so the repo typecheck never reaches the
// vendored omniclip code. Hydration imports each clip's media via the fork and
// builds omniclip state from the canonical cut.

async function mountAndHydrate(): Promise<void> {
  if (isEmptyCut.value || !editorHost.value || editorReady.value) return

  // Phase 1 — load the fork module. A failure here is a bundling / module-load
  // problem (e.g. Vite dep-optimizer timeout), NOT a browser-capability issue.
  let loaded: OmniclipForkApi
  let applyImagoTheme: (wrapper: HTMLElement) => HTMLElement
  try {
    // Dynamic import via a runtime-computed path so the repo typecheck never
    // follows into the browser-only vendored fork (excluded from tsconfig).
    // Must be an ABSOLUTE app path (leading slash + extension): with
    // `@vite-ignore` the specifier reaches the browser verbatim, and a bare
    // 'src/vendor/...' would fail as a bare module specifier. (openimago-y90v)
    const forkModulePath = ['', 'src', 'vendor', 'omniclip-fork', 'load.ts'].join('/')
    const mod = (await import(/* @vite-ignore */ forkModulePath)) as unknown as {
      loadOmniclipFork: LoadOmniclipFork
    }
    ;({ fork: loaded, applyImagoTheme } = await mod.loadOmniclipFork())
  } catch (err) {
    editorError.value = '剪辑器模块加载失败（请检查 omniclip 依赖与构建配置）'
    console.error('StoryCutPanel: failed to load omniclip fork module', err)
    return
  }

  // Phase 2 — mount + wire. A failure here is a runtime / browser-API issue
  // (WebCodecs / SharedArrayBuffer / IndexedDB unavailable, or not isolated).
  try {
    fork = loaded
    applyImagoTheme(editorHost.value)

    // Register the per-clip context menu (openimago-e0n3). The menu items +
    // orphan-gating are the unit-tested buildClipMenuItems; each item emits to
    // the page, which runs the real action. isEnabled hides shot-bound items on
    // orphan clips (sourceShotId gone) but keeps 删除.
    unregisterClipMenu = fork.registerClipMenuItems(
      buildClipMenuItems({
        onRegenerate: (sourceShotId) => emit('clip-regenerate', sourceShotId),
        onManualEdit: (sourceShotId) => emit('clip-manual-edit', sourceShotId),
        onDeleteClip: (clipId) => emit('clip-delete', clipId),
        onAddToChat: (sourceShotId) => emit('clip-add-to-chat', sourceShotId),
      }),
    )

    // Resolve a clicked effect id → its sourceShotId for the context menu's
    // orphan-gating (effect id === CutClip.id). (openimago-1mcb)
    fork.setClipContextResolver(
      (effectId) => props.cut?.clips.find((c) => c.id === effectId)?.sourceShotId,
    )

    // Subscribe to committed editor gestures (ADR 0008 #1/#1a). The fork diffs
    // its effects snapshot per settled gesture and hands us ONE semantic CutEdit
    // (reorder / trim / split / delete); persistEdit routes it through the cut
    // endpoints. Transition/BGM are host-driven (decision 1b) and do NOT arrive
    // here. JS's single thread + persistEdit's per-edit await serialise these
    // user-paced gestures without an explicit queue (decision 3).
    unsubscribeEdits = fork.onEdit((edit) => {
      void persistEdit(edit)
    })

    // Render <construct-editor> now that the fork is loaded.
    editorReady.value = true

    // Hydrate from the canonical cut (openimago-addv). buildHydrationPayload is
    // pure + unit-tested: it maps cut.json clips (ordered) + the media resolver
    // → the fork's HydrateClip[] (url + trim) and the transitions in omniclip
    // ms, splitting out orphans (which surface via the data-no-file path). The
    // fork imports each clip's media (importFromUrl) and places it as a trimmed
    // effect, then applies transitions.
    if (props.cut) {
      const { clips, transitions } = buildHydrationPayload(props.cut, mediaResolver.value)
      await fork.hydrateFromCut(clips, transitions)
    }
  } catch (err) {
    editorError.value = '剪辑器初始化失败（需要支持 WebCodecs 的浏览器环境）'
    console.error('StoryCutPanel: failed to initialise omniclip editor', err)
  }
}

/** Reset editor state and (re)mount once the host div is in the DOM. */
function remountEditor(): void {
  editorReady.value = false
  editorError.value = null
  // Re-seed the local clock from the (possibly newly-loaded) cut before the
  // fresh editor starts emitting edits.
  lastUpdatedAt.value = props.cut?.updatedAt
  unsubscribeEdits?.()
  unsubscribeEdits = null
  unregisterClipMenu?.()
  unregisterClipMenu = null
  // nextTick so the editorHost div is bound before mountAndHydrate reads it.
  // (GAP 1, openimago-addv: an immediate watch ran during setup() before the
  // ref existed → early return → the editor never mounted.)
  void nextTick(() => mountAndHydrate())
}

// First mount: the host div exists by onMounted, so this never early-returns.
onMounted(remountEditor)

// Re-mount when the episode changes or the cut transitions empty↔non-empty.
watch(() => [props.episodeId, isEmptyCut.value] as const, remountEditor)

onBeforeUnmount(() => {
  unsubscribeEdits?.()
  unsubscribeEdits = null
  unregisterClipMenu?.()
  unregisterClipMenu = null
  fork = null
})

// Expose persistEdit for the editor event bridge (wired during local validation).
defineExpose({ persistEdit })
</script>

<style lang="scss" scoped>
.story-cut {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: linear-gradient(180deg, var(--imago-bg-deep), var(--imago-bg-void) 40%);
}

.story-cut__editor {
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
  // Map the dark-neon tokens into omniclip's shadow DOM (applyImagoTheme also
  // sets these at runtime; declared here so an un-themed mount still reads them).
  --omni-bg: var(--imago-bg-void);
  --omni-clip-fill: var(--imago-bg-surface);
  --omni-clip-border: var(--imago-border-soft);
  --omni-accent: var(--imago-neon-cyan);
  --omni-playhead: var(--imago-neon-cyan);
  --omni-text: var(--imago-text-primary);
  --omni-orphan: var(--imago-neon-pink);
}

.story-cut__loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  font-size: 12.5px;
  color: var(--imago-text-faint);
}

.story-cut__orphan-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  font-size: 11.5px;
  color: var(--imago-neon-pink);
  background: rgba(255, 45, 149, 0.08);
  border-bottom: 1px solid rgba(255, 45, 149, 0.24);
}

.story-cut__empty {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px 24px;
  text-align: center;
}

.story-cut__empty-frame {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  border-radius: var(--imago-radius-lg);
  background: radial-gradient(circle at center, rgba(0, 240, 255, 0.06), transparent 70%);
  border: 1px solid var(--imago-border-soft);
  color: var(--imago-neon-cyan);
}

.story-cut__empty-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--imago-text-primary);
}

.story-cut__empty-hint {
  margin: 0;
  max-width: 340px;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--imago-text-faint);
}

.story-cut__assemble {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: 6px;
  padding: 9px 18px;
  border-radius: var(--imago-radius-pill);
  border: 1px solid var(--imago-border-cyan-active);
  background: var(--imago-cyan-08);
  color: var(--imago-neon-cyan);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 120ms ease, box-shadow 120ms ease;

  &:hover:not(:disabled) {
    background: var(--imago-cyan-04);
    box-shadow: 0 0 18px rgba(0, 240, 255, 0.12);
  }

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
}
</style>
