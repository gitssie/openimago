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
  return { prompt, model, aspectRatio, durationSeconds, referenceImages }
}

/** Map the dialog form to the request body (trim the prompt; carry params through).
 *  `referenceImages` is omitted when empty so it stays an optional param. */
export function clipFormToParams(form: ClipGenerateForm): ShotGenerationParams {
  return {
    prompt: form.prompt.trim(),
    model: form.model,
    aspectRatio: form.aspectRatio,
    durationSeconds: form.durationSeconds,
    ...(form.referenceImages && form.referenceImages.length > 0
      ? { referenceImages: [...form.referenceImages] }
      : {}),
  }
}
