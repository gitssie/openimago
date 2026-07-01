<!--
  ClipGenerateDialog (openimago-ciqk → redesigned openimago-816a) — the Cut editor's
  手动编辑 action, rebuilt as an IN-TIMELINE composer.

  Per the user's hard directives this is a Quasar q-menu (an in-timeline popover),
  NOT a q-dialog modal: it pops up near the clicked clip. The page threads the clip's
  on-screen right-click point down as `anchor`, and the menu targets an invisible
  0-size element positioned there (q-menu has no `view` prop — "view=timeline" means
  anchoring within the timeline view context, which this achieves). null anchor →
  the composer centers itself.

  Layout mirrors the reference composer:
    • Top: reference-material strip — thumbnails of `form.referenceImages` (asset ids
      from openimago-v1j0) + a drop zone + an 上传 button (api.uploadAsset).
    • Middle: prompt — a q-input textarea.
    • Bottom: pill toolbar — reference-mode label · model · resolution · aspect ratio
      · duration · @ · 生成. model/aspect/duration are bound q-selects; the rest are
      static placeholders for fields the backend does not model yet.

  Built entirely on Quasar controls (q-menu / q-input / q-select / q-btn) per the
  project convention (CONTEXT.md「UI 组件遵循 Quasar 规范」). Bindings + behavior are
  preserved from the original: prompt/model/aspectRatio/durationSeconds (durationSeconds
  is a NUMBER), prefill from shot.generationParams, generating/disabled states, and it
  emits `generate(params)` — now carrying `referenceImages`.
-->
<template>
  <!-- Invisible anchor positioned at the clicked clip; q-menu uses it as its target. -->
  <div
    ref="anchorEl"
    class="clip-gen-anchor"
    :style="anchorStyle"
    aria-hidden="true"
  >
    <q-menu
      :model-value="open"
      no-parent-event
      :persistent="generating"
      anchor="bottom middle"
      self="top middle"
      :offset="[0, 10]"
      dark
      class="clip-gen-menu"
      @update:model-value="onMenuToggle"
    >
      <section
        class="clip-gen"
        role="dialog"
        aria-label="重新生成镜头"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
      >
        <header class="clip-gen__header">
          <div class="clip-gen__title">重新生成镜头</div>
          <div v-if="shot" class="clip-gen__subtitle">镜头 {{ shot.shotNumber }}</div>
        </header>

        <!-- ── Top: reference-material strip ─────────────────────────────────── -->
        <div
          class="clip-gen__refs"
          :class="{ 'clip-gen__refs--drag': dragOver }"
        >
          <ul v-if="referenceImages.length > 0" class="clip-gen__ref-list" role="list">
            <li
              v-for="refId in referenceImages"
              :key="refId"
              class="clip-gen__ref"
              role="listitem"
            >
              <img
                v-if="refThumb(refId)"
                :src="refThumb(refId)"
                :alt="`参考图 ${refId}`"
                class="clip-gen__ref-img"
              >
              <div v-else class="clip-gen__ref-fallback" :aria-label="`参考素材 ${refId}`">
                <q-icon name="image" size="18px" />
              </div>
              <q-btn
                round
                dense
                flat
                size="xs"
                icon="close"
                class="clip-gen__ref-remove"
                aria-label="移除参考图"
                @click="removeReference(refId)"
              />
            </li>
          </ul>

          <div class="clip-gen__ref-dropzone">
            <q-icon name="add_photo_alternate" size="18px" class="clip-gen__ref-dropicon" />
            <span class="clip-gen__ref-hint">拖拽素材到此处为参考</span>
          </div>

          <q-btn
            unelevated
            dense
            no-caps
            icon="upload"
            label="上传"
            :loading="uploading"
            class="clip-gen__upload-btn"
            @click="onUploadClick"
          />
          <input
            ref="fileInputEl"
            type="file"
            accept="image/*"
            multiple
            class="clip-gen__file-input"
            aria-label="上传参考图"
            @change="onFilesPicked"
          >
        </div>

        <!-- ── Middle: prompt (with inline element-reference chips) ──────────── -->
        <div
          v-if="promptChips.length > 0"
          class="clip-gen__chips"
          role="list"
          aria-label="提示词中的元素引用"
        >
          <q-chip
            v-for="chip in promptChips"
            :key="chip.token"
            dense
            removable
            dark
            square
            color="transparent"
            text-color="cyan-4"
            icon="alternate_email"
            class="clip-gen__chip"
            :label="chip.label"
            role="listitem"
            :aria-label="`元素引用 ${chip.label}`"
            @remove="onRemoveChip(chip.token)"
          />
        </div>

        <q-input
          v-model="form.prompt"
          type="textarea"
          dark
          outlined
          dense
          autogrow
          :input-style="{ minHeight: '84px', maxHeight: '180px' }"
          placeholder="描述这个镜头要生成的画面…"
          aria-label="提示词"
          class="clip-gen__prompt"
        />

        <!-- ── Bottom: pill toolbar ──────────────────────────────────────────── -->
        <div class="clip-gen__toolbar">
          <q-select
            v-model="form.generationMode"
            :options="generationModeOptions"
            dark
            dense
            options-dense
            borderless
            aria-label="生成模式"
            class="clip-gen__pill clip-gen__pill--mode clip-gen__select"
          >
            <template #prepend>
              <q-icon name="auto_awesome" size="14px" />
            </template>
          </q-select>

          <q-select
            v-model="form.model"
            :options="modelOptions"
            dark
            dense
            options-dense
            borderless
            emit-value
            map-options
            aria-label="模型"
            class="clip-gen__pill clip-gen__select"
          >
            <template #prepend>
              <q-icon name="smart_toy" size="14px" />
            </template>
          </q-select>

          <span class="clip-gen__pill clip-gen__pill--static" aria-label="分辨率 720p">
            <q-icon name="hd" size="14px" />
            720p
            <span class="clip-gen__badge">升级</span>
          </span>

          <q-select
            v-model="form.aspectRatio"
            :options="aspectRatioOptions"
            dark
            dense
            options-dense
            borderless
            emit-value
            map-options
            aria-label="画幅比例"
            class="clip-gen__pill clip-gen__select"
          >
            <template #prepend>
              <q-icon name="aspect_ratio" size="14px" />
            </template>
          </q-select>

          <q-select
            v-model="form.durationSeconds"
            :options="durationSelectOptions"
            dark
            dense
            options-dense
            borderless
            emit-value
            map-options
            aria-label="时长"
            class="clip-gen__pill clip-gen__select"
          >
            <template #prepend>
              <q-icon name="schedule" size="14px" />
            </template>
          </q-select>

          <q-btn
            round
            dense
            flat
            size="sm"
            icon="alternate_email"
            class="clip-gen__mention"
            aria-label="提及元素"
          >
            <q-tooltip>提及元素（角色 / 场景）</q-tooltip>
            <q-menu dark anchor="top right" self="bottom right" class="clip-gen__mention-menu">
              <q-list dark dense style="min-width: 220px">
                <q-item-label header>提及元素</q-item-label>
                <template v-if="elements.length > 0">
                  <q-item
                    v-for="el in elements"
                    :key="el.id"
                    v-close-popup
                    clickable
                    :aria-label="`提及 ${el.title}`"
                    @click="onMentionElement(el)"
                  >
                    <q-item-section avatar>
                      <q-avatar size="28px" rounded>
                        <img v-if="elementThumb(el)" :src="elementThumb(el)" :alt="''">
                        <q-icon
                          v-else
                          :name="el.kind === 'scene' ? 'landscape' : 'person'"
                          size="16px"
                        />
                      </q-avatar>
                    </q-item-section>
                    <q-item-section>
                      <q-item-label class="ellipsis">{{ el.title }}</q-item-label>
                      <q-item-label caption>{{ el.kind === 'scene' ? '场景' : '角色' }}</q-item-label>
                    </q-item-section>
                  </q-item>
                </template>
                <q-item v-else>
                  <q-item-section class="text-grey-6">暂无可提及的元素</q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </q-btn>

          <q-space />

          <q-btn
            unelevated
            no-caps
            :loading="generating"
            :disable="generating"
            label="生成"
            icon="movie_creation"
            class="clip-gen__submit"
            @click="onGenerate"
          />
        </div>
      </section>
    </q-menu>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import { api } from 'src/api/client'
import type { StoryRunSummary, StoryShotSummary } from './types'
import type { ElementCardVM } from './left-panel/types'
import {
  buildClipGenerateForm,
  clipFormToParams,
  CLIP_MODEL_OPTIONS,
  CLIP_ASPECT_RATIO_OPTIONS,
  CLIP_DURATION_OPTIONS,
  DEFAULT_GENERATION_MODE,
  supportedGenerationModes,
  resolveGenerationMode,
  type ClipGenerateForm,
  type ShotGenerationParams,
} from 'src/utils/cut/clip-generate-form'
import {
  appendMention,
  removeMention,
  extractElementMentions,
  mentionLabel,
  elementRefToken,
} from 'src/utils/cut/clip-element-mention'

const props = withDefaults(
  defineProps<{
    open: boolean
    shot: StoryShotSummary | null
    latestRun?: StoryRunSummary | null
    generating?: boolean
    /** clip's on-screen right-click point (openimago-816a); null → center. */
    anchor?: { x: number; y: number } | null
    /** Bible elements (characters/scenes) for the @-mention picker (openimago-0f27).
     *  Each carries a concept-art thumbnail used as the mention's reference image. */
    elements?: ElementCardVM[]
  }>(),
  { latestRun: null, generating: false, anchor: null, elements: () => [] },
)

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'generate', params: ShotGenerationParams): void
}>()

const $q = useQuasar()

const modelOptions = CLIP_MODEL_OPTIONS
const aspectRatioOptions = CLIP_ASPECT_RATIO_OPTIONS
/** durationSeconds is a NUMBER on the form — map the string-valued source options to
 *  numeric `value`s so q-select (emit-value + map-options) round-trips the number. */
const durationSelectOptions = computed(() =>
  CLIP_DURATION_OPTIONS.map((opt) => ({ label: opt.label, value: Number(opt.value) })),
)

const form = reactive<ClipGenerateForm>({
  prompt: '',
  model: '',
  aspectRatio: '',
  durationSeconds: 0,
  referenceImages: [],
  generationMode: DEFAULT_GENERATION_MODE,
})

/** Generation modes supported by the currently-selected model (openimago-ggxt). */
const generationModeOptions = computed(() => supportedGenerationModes(form.model))

/** Reference images as a non-null list for the template. */
const referenceImages = computed<string[]>(() => form.referenceImages ?? [])

/** ref value (asset id or url) → thumbnail url, populated on upload or by resolving
 *  bare asset ids (see resolveReferenceThumbnails); refs that already look like urls
 *  are shown directly (see refThumb). */
const refPreviews = reactive<Record<string, string>>({})

/** mention token → the reference-image value it added, so removing the chip also
 *  drops its reference image (unifies @-mention + chip + referenceImages). */
const mentionRefs = reactive<Record<string, string>>({})

/** Element tokens currently present in the prompt, rendered as removable chips. */
const promptChips = computed(() =>
  extractElementMentions(form.prompt).map((token) => ({ token, label: mentionLabel(token) })),
)

const anchorEl = ref<HTMLElement | null>(null)
const fileInputEl = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const dragOver = ref(false)

/** Position the invisible q-menu target at the clip's point, or center it when the
 *  page passed no anchor. */
const anchorStyle = computed(() => {
  const a = props.anchor
  if (a) {
    return { position: 'fixed', left: `${a.x}px`, top: `${a.y}px`, width: '0', height: '0' } as const
  }
  return { position: 'fixed', left: '50%', top: '38%', width: '0', height: '0' } as const
})

/** (Re)seed the form from the shot every time the composer opens for a shot. */
watch(
  () => [props.open, props.shot?.id] as const,
  ([open]) => {
    if (!open || !props.shot) return
    const seeded = buildClipGenerateForm(props.shot, props.latestRun)
    form.prompt = seeded.prompt
    form.model = seeded.model
    form.aspectRatio = seeded.aspectRatio
    form.durationSeconds = seeded.durationSeconds
    form.referenceImages = [...(seeded.referenceImages ?? [])]
    form.generationMode = seeded.generationMode
    clearRecord(refPreviews)
    clearRecord(mentionRefs)
    void resolveReferenceThumbnails()
  },
  { immediate: true },
)

/** When the model changes, keep the selected mode if the new model supports it,
 *  else reset to that model's first supported mode (openimago-ggxt). */
watch(
  () => form.model,
  (model) => {
    form.generationMode = resolveGenerationMode(model, form.generationMode)
  },
)

function clearRecord(record: Record<string, string>): void {
  for (const key of Object.keys(record)) delete record[key]
}

/** Resolve bare asset-id refs (no url) to real thumbnails via api.getAsset so the
 *  reference strip shows previews instead of icon fallbacks (openimago-0f27). */
async function resolveReferenceThumbnails(): Promise<void> {
  const ids = referenceImages.value.filter((r) => refThumb(r) === '')
  await Promise.all(
    ids.map(async (id) => {
      try {
        const asset = await api.getAsset(id)
        const preview = asset.thumbnailUrl || asset.url
        if (preview) refPreviews[id] = preview
      } catch {
        // Leave the icon fallback in place when an id can't be resolved.
      }
    }),
  )
}

function onMenuToggle(value: boolean): void {
  emit('update:open', value)
}

function refThumb(refId: string): string {
  if (refPreviews[refId]) return refPreviews[refId]
  if (/^(https?:\/\/|\/)/.test(refId)) return refId
  return ''
}

function onUploadClick(): void {
  fileInputEl.value?.click()
}

function onFilesPicked(event: Event): void {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  void uploadFiles(files)
}

function onDragOver(event: DragEvent): void {
  event.preventDefault()
  dragOver.value = true
}

function onDragLeave(): void {
  dragOver.value = false
}

function onDrop(event: DragEvent): void {
  event.preventDefault()
  dragOver.value = false
  const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'))
  void uploadFiles(files)
}

async function uploadFiles(files: File[]): Promise<void> {
  if (files.length === 0) return
  uploading.value = true
  try {
    for (const file of files) {
      const { asset } = await api.uploadAsset(file)
      if (!form.referenceImages) form.referenceImages = []
      if (!form.referenceImages.includes(asset.id)) {
        form.referenceImages.push(asset.id)
        const preview = asset.thumbnailUrl || asset.url
        if (preview) refPreviews[asset.id] = preview
      }
    }
  } catch {
    $q.notify({ color: 'negative', message: '参考图上传失败', icon: 'error', timeout: 2000 })
  } finally {
    uploading.value = false
  }
}

function removeReference(refId: string): void {
  form.referenceImages = referenceImages.value.filter((r) => r !== refId)
  delete refPreviews[refId]
}

/** First non-null concept-art thumbnail for an element (its reference image). */
function elementThumb(el: ElementCardVM): string {
  return el.thumbnails.find((t): t is string => !!t) ?? ''
}

/** @-mention an element: insert its chip token into the prompt AND add its concept-art
 *  reference image to form.referenceImages (openimago-0f27). */
function onMentionElement(el: ElementCardVM): void {
  const token = elementRefToken(el.title)
  if (!token) return
  form.prompt = appendMention(form.prompt, token)
  const refImg = elementThumb(el)
  if (refImg) {
    if (!form.referenceImages) form.referenceImages = []
    if (!form.referenceImages.includes(refImg)) form.referenceImages.push(refImg)
    mentionRefs[token] = refImg
  }
}

/** Remove a prompt chip: strip its token AND drop the reference image it added. */
function onRemoveChip(token: string): void {
  form.prompt = removeMention(form.prompt, token)
  const refImg = mentionRefs[token]
  if (refImg) {
    removeReference(refImg)
    delete mentionRefs[token]
  }
}

function onGenerate(): void {
  emit('generate', clipFormToParams({ ...form }))
}
</script>

<style scoped>
/* The anchor is a 0-size positioned point; the menu teleports to body but reads it. */
.clip-gen-anchor {
  pointer-events: none;
}

.clip-gen {
  width: 560px;
  max-width: 92vw;
  padding: 18px 20px 16px;
  background: var(--imago-bg-surface, #15151d);
  color: var(--imago-text-primary, #f2f2f7);
  border: 1px solid var(--imago-border-soft, rgba(255, 255, 255, 0.08));
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.clip-gen__header {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.clip-gen__title {
  font-size: 16px;
  font-weight: 600;
}

.clip-gen__subtitle {
  font-size: 12px;
  opacity: 0.6;
}

/* ── Reference-material strip ─────────────────────────────────────────────── */
.clip-gen__refs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px;
  border: 1px dashed var(--imago-border-soft, rgba(255, 255, 255, 0.14));
  border-radius: 10px;
  background: var(--imago-bg-base, #0e0e14);
  transition: border-color 0.15s ease, background 0.15s ease;
}

.clip-gen__refs--drag {
  border-color: var(--imago-neon-cyan, #00f0ff);
  background: rgba(0, 240, 255, 0.05);
}

.clip-gen__ref-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.clip-gen__ref {
  position: relative;
  width: 52px;
  height: 52px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--imago-border-soft, rgba(255, 255, 255, 0.12));
  background: rgba(255, 255, 255, 0.03);
}

.clip-gen__ref-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.clip-gen__ref-fallback {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--imago-text-dim, rgba(255, 255, 255, 0.5));
}

.clip-gen__ref-remove {
  position: absolute;
  top: 1px;
  right: 1px;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
}

.clip-gen__ref-dropzone {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 120px;
  color: var(--imago-text-dim, rgba(255, 255, 255, 0.5));
  font-size: 12px;
}

.clip-gen__ref-dropicon {
  opacity: 0.7;
}

.clip-gen__upload-btn {
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--imago-text-primary, #f2f2f7);
}

.clip-gen__file-input {
  display: none;
}

/* ── Inline element-reference chips ───────────────────────────────────────── */
.clip-gen__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: -6px;
}

.clip-gen__chip {
  border: 1px solid rgba(0, 240, 255, 0.25);
  background: rgba(0, 240, 255, 0.06);
  border-radius: 8px;
}

/* ── Prompt ───────────────────────────────────────────────────────────────── */
.clip-gen__prompt :deep(.q-field__control) {
  background: var(--imago-bg-base, #0e0e14);
  border-radius: 10px;
}

.clip-gen__prompt.q-field--outlined :deep(.q-field__control)::before {
  border-color: var(--imago-border-soft, rgba(255, 255, 255, 0.12));
}

.clip-gen__prompt.q-field--outlined.q-field--focused :deep(.q-field__control)::after {
  border-color: var(--imago-neon-cyan, #00f0ff);
}

/* ── Pill toolbar ─────────────────────────────────────────────────────────── */
.clip-gen__toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.clip-gen__pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--imago-border-soft, rgba(255, 255, 255, 0.1));
  color: var(--imago-text-primary, #f2f2f7);
  font-size: 12px;
  white-space: nowrap;
}

.clip-gen__pill--mode {
  color: var(--imago-neon-cyan, #00f0ff);
  border-color: rgba(0, 240, 255, 0.25);
  background: rgba(0, 240, 255, 0.06);
}

.clip-gen__pill--mode :deep(.q-field__native),
.clip-gen__pill--mode :deep(.q-field__marginal) {
  color: var(--imago-neon-cyan, #00f0ff);
}

.clip-gen__pill--static {
  cursor: default;
}

.clip-gen__badge {
  padding: 0 5px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
  color: #03161a;
  background: var(--imago-neon-cyan, #00f0ff);
}

/* q-select styled as a pill: drop its default min-height/border chrome. */
.clip-gen__select {
  padding: 0 10px;
  min-width: 96px;
}

.clip-gen__select :deep(.q-field__control),
.clip-gen__select :deep(.q-field__control)::before,
.clip-gen__select :deep(.q-field__control)::after {
  min-height: 30px;
  border: none;
}

.clip-gen__select :deep(.q-field__marginal) {
  height: 30px;
  color: var(--imago-text-dim, rgba(255, 255, 255, 0.55));
}

.clip-gen__select :deep(.q-field__native) {
  padding: 0;
  min-height: 30px;
  color: var(--imago-text-primary, #f2f2f7);
  font-size: 12px;
}

.clip-gen__select :deep(.q-field__prepend) {
  padding-right: 6px;
  height: 30px;
}

.clip-gen__mention {
  color: var(--imago-text-dim, rgba(255, 255, 255, 0.5));
}

.clip-gen__submit {
  border-radius: 999px;
  padding: 0 20px;
  height: 34px;
  background: var(--imago-neon-cyan, #00f0ff);
  color: #03161a;
  font-weight: 600;
}
</style>
