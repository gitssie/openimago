// Pure logic for the Cut editor's 手动编辑 AI re-generation dialog (openimago-ciqk).
//
// The 手动编辑 clip action opens an in-timeline dialog that re-runs video generation
// for the clip's SOURCE shot with an edited prompt + model/aspect/duration. This
// module owns the framework-free pieces — the option lists, the prefill rules, and
// the form→request mapping — so they are unit-tested independently of Vue/Quasar.
// The Vue dialog (ProjectWorkspacePage.vue) is a thin shell over these.

/**
 * AI video generation params sent to `POST .../shots/:id/generate` (openimago-ciqk).
 * The backend records them on the run + persists them on the shot for next prefill.
 * Mirrors the backend `ShotGenerationParams`.
 */
export interface ShotGenerationParams {
  prompt?: string
  model?: string
  aspectRatio?: string
  durationSeconds?: number
  /** Reference images (uploaded asset ids or media urls) the video model
   *  generates FROM. Optional — absent/empty for text-only generation. The
   *  ClipGenerateDialog reference-material strip binds to `form.referenceImages`. */
  referenceImages?: string[]
  /** Video generation mode (openimago-ggxt) — the generation TYPE the chosen model
   *  runs in (e.g. 全能参考 / 图生视频 / 首尾帧生视频 / 对口型数字人). The available
   *  modes depend on `model`; see CLIP_GENERATION_MODE_OPTIONS. Per-mode input
   *  variations are a follow-up. Mirrors the backend `ShotGenerationParams`. */
  generationMode?: string
}

export interface ClipGenerateForm {
  prompt: string
  model: string
  aspectRatio: string
  durationSeconds: number
  /** Reference images bound by the dialog's reference-material strip. Optional on
   *  the form shell (the redesigned ClipGenerateDialog seeds/binds it); treated as
   *  an empty list when absent, and mapped to the optional param field. */
  referenceImages?: string[]
  /** Selected video generation mode (openimago-ggxt); always one of the current
   *  model's supported modes (see resolveGenerationMode). */
  generationMode: string
}

/** Minimal shot shape the prefill needs (a subset of StoryShotSummary). */
export interface ClipGenerateFormSource {
  description?: string
  visualPrompt?: string
  generationParams?: ShotGenerationParams | null
}

/** Minimal latest-run shape the prefill needs (a subset of StoryRunSummary). */
export interface ClipGenerateFormRun {
  model?: string
  prompt?: string
}

export interface SelectOption {
  label: string
  value: string
}

/** Model choices for the re-gen dialog. `mock-video-model` is kept last so legacy
 *  runs still resolve to a known option. */
export const CLIP_MODEL_OPTIONS: SelectOption[] = [
  { label: 'Seedance 2.0', value: 'seedance-2.0' },
  { label: 'Seedance 1.0 Pro', value: 'seedance-1.0-pro' },
  { label: 'Seedance 1.0', value: 'seedance-1.0' },
  { label: 'Mock (dev)', value: 'mock-video-model' },
]

export const CLIP_ASPECT_RATIO_OPTIONS: SelectOption[] = [
  { label: '9:16 (竖屏)', value: '9:16' },
  { label: '16:9 (横屏)', value: '16:9' },
  { label: '1:1 (方形)', value: '1:1' },
  { label: '4:3', value: '4:3' },
  { label: '3:2', value: '3:2' },
]

export const CLIP_DURATION_OPTIONS: SelectOption[] = [
  { label: '5 秒', value: '5' },
  { label: '8 秒', value: '8' },
  { label: '10 秒', value: '10' },
  { label: '12 秒', value: '12' },
]

export const DEFAULT_CLIP_MODEL = 'seedance-2.0'
export const DEFAULT_CLIP_ASPECT_RATIO = '9:16'
export const DEFAULT_CLIP_DURATION_SECONDS = 8

/** Fallback mode present for every model. */
export const DEFAULT_GENERATION_MODE = '全能参考'

/**
 * Video generation modes each model supports (openimago-ggxt). The 全能参考 pill is a
 * generation-TYPE selector whose options change per model. Seedance 2.0 supports the
 * full set; lesser models expose a sensible subset. Every model includes 全能参考.
 */
export const CLIP_GENERATION_MODE_OPTIONS: Record<string, string[]> = {
  'seedance-2.0': ['全能参考', '图生视频', '首尾帧生视频', '对口型数字人'],
  'seedance-1.0-pro': ['全能参考', '图生视频', '首尾帧生视频'],
  'seedance-1.0': ['全能参考', '图生视频'],
  'mock-video-model': ['全能参考'],
}

/** Supported generation modes for a model; falls back to [DEFAULT_GENERATION_MODE]
 *  for unknown models so the selector always has at least one option. */
export function supportedGenerationModes(model: string): string[] {
  const modes = CLIP_GENERATION_MODE_OPTIONS[model]
  return modes && modes.length > 0 ? modes : [DEFAULT_GENERATION_MODE]
}

/** Reconcile a mode against a model: keep it when the model supports it, else fall
 *  back to that model's first supported mode (the default). */
export function resolveGenerationMode(model: string, mode: string | undefined): string {
  const modes = supportedGenerationModes(model)
  if (mode && modes.includes(mode)) return mode
  return modes[0] ?? DEFAULT_GENERATION_MODE
}

/**
 * Pre-fill the re-gen form for a clip's source shot. Priority: the shot's persisted
 * `generationParams` (what was last (re)generated through this dialog) → the shot's
 * authored prompt (visualPrompt → description) and the latest run's model → defaults.
 */
export function buildClipGenerateForm(
  shot: ClipGenerateFormSource,
  latestRun?: ClipGenerateFormRun | null,
): ClipGenerateForm {
  const gp = shot.generationParams ?? undefined
  const authoredPrompt =
    (shot.visualPrompt && shot.visualPrompt.trim()) ||
    (shot.description && shot.description.trim()) ||
    ''
  const prompt = (gp?.prompt && gp.prompt.trim()) || authoredPrompt || (latestRun?.prompt ?? '')
  const model = (gp?.model && gp.model.trim()) || (latestRun?.model && latestRun.model.trim()) || DEFAULT_CLIP_MODEL
  const aspectRatio = (gp?.aspectRatio && gp.aspectRatio.trim()) || DEFAULT_CLIP_ASPECT_RATIO
  const durationSeconds =
    typeof gp?.durationSeconds === 'number' && Number.isFinite(gp.durationSeconds)
      ? gp.durationSeconds
      : DEFAULT_CLIP_DURATION_SECONDS
  const referenceImages = Array.isArray(gp?.referenceImages)
    ? gp.referenceImages.filter((r): r is string => typeof r === 'string')
    : []
  const generationMode = resolveGenerationMode(model, gp?.generationMode)
  return { prompt, model, aspectRatio, durationSeconds, referenceImages, generationMode }
}

/** Map the dialog form to the request body (trim the prompt; carry params through).
 *  `referenceImages` is omitted when empty so it stays an optional param. */
export function clipFormToParams(form: ClipGenerateForm): ShotGenerationParams {
  return {
    prompt: form.prompt.trim(),
    model: form.model,
    aspectRatio: form.aspectRatio,
    durationSeconds: form.durationSeconds,
    generationMode: form.generationMode,
    ...(form.referenceImages && form.referenceImages.length > 0
      ? { referenceImages: [...form.referenceImages] }
      : {}),
  }
}
