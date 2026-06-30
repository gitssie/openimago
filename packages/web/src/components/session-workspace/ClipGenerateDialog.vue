<!--
  ClipGenerateDialog (openimago-ciqk) — the Cut editor's 手动编辑 action.

  An in-timeline q-dialog AI video re-generation editor: prompt + model + aspect
  ratio + duration, pre-filled from the clip's SOURCE shot's last-used params
  (StoryShotSummary.generationParams) → its authored prompt → the latest run. 生成
  re-runs video generation for that shot with the edited params (parent calls
  api.generateShot(…, params)); the clip's media then refreshes.

  Mirrors WorkspaceArtifactsPanel's param-editor pattern (prompt/model/aspect/
  duration) — native <textarea>/<select> controls — rather than reinventing them.
-->
<template>
  <q-dialog
    :model-value="open"
    @update:model-value="(v) => emit('update:open', v)"
  >
    <q-card class="clip-gen-dialog" style="width: 560px; max-width: 92vw;">
      <div class="clip-gen-dialog__header">
        <div class="clip-gen-dialog__title">重新生成镜头</div>
        <div v-if="shot" class="clip-gen-dialog__subtitle">
          镜头 {{ shot.shotNumber }}
        </div>
      </div>

      <div class="clip-gen-dialog__form">
        <label class="clip-gen-field">
          <span class="clip-gen-field__label">提示词</span>
          <textarea
            v-model="form.prompt"
            class="clip-gen-field__textarea"
            rows="4"
            placeholder="描述这个镜头要生成的画面…"
          ></textarea>
        </label>

        <div class="clip-gen-field-row">
          <label class="clip-gen-field">
            <span class="clip-gen-field__label">模型</span>
            <select v-model="form.model" class="clip-gen-field__select">
              <option v-for="opt in modelOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </label>

          <label class="clip-gen-field">
            <span class="clip-gen-field__label">画幅比例</span>
            <select v-model="form.aspectRatio" class="clip-gen-field__select">
              <option v-for="opt in aspectRatioOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </label>

          <label class="clip-gen-field">
            <span class="clip-gen-field__label">时长</span>
            <select v-model.number="form.durationSeconds" class="clip-gen-field__select">
              <option v-for="opt in durationOptions" :key="opt.value" :value="Number(opt.value)">
                {{ opt.label }}
              </option>
            </select>
          </label>
        </div>
      </div>

      <div class="clip-gen-dialog__actions">
        <button
          type="button"
          class="clip-gen-dialog__cancel"
          :disabled="generating"
          @click="emit('update:open', false)"
        >
          取消
        </button>
        <button
          type="button"
          class="clip-gen-dialog__submit"
          :disabled="generating"
          @click="onGenerate"
        >
          {{ generating ? '生成中…' : '生成' }}
        </button>
      </div>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { StoryRunSummary, StoryShotSummary } from './types'
import {
  buildClipGenerateForm,
  clipFormToParams,
  CLIP_MODEL_OPTIONS,
  CLIP_ASPECT_RATIO_OPTIONS,
  CLIP_DURATION_OPTIONS,
  type ClipGenerateForm,
  type ShotGenerationParams,
} from 'src/utils/cut/clip-generate-form'

const props = withDefaults(
  defineProps<{
    open: boolean
    shot: StoryShotSummary | null
    latestRun?: StoryRunSummary | null
    generating?: boolean
  }>(),
  { latestRun: null, generating: false },
)

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'generate', params: ShotGenerationParams): void
}>()

const modelOptions = CLIP_MODEL_OPTIONS
const aspectRatioOptions = CLIP_ASPECT_RATIO_OPTIONS
const durationOptions = CLIP_DURATION_OPTIONS

const form = reactive<ClipGenerateForm>({
  prompt: '',
  model: '',
  aspectRatio: '',
  durationSeconds: 0,
})

/** (Re)seed the form from the shot every time the dialog opens for a shot. */
watch(
  () => [props.open, props.shot?.id] as const,
  ([open]) => {
    if (!open || !props.shot) return
    const seeded = buildClipGenerateForm(props.shot, props.latestRun)
    form.prompt = seeded.prompt
    form.model = seeded.model
    form.aspectRatio = seeded.aspectRatio
    form.durationSeconds = seeded.durationSeconds
  },
  { immediate: true },
)

function onGenerate(): void {
  emit('generate', clipFormToParams({ ...form }))
}
</script>

<style scoped>
.clip-gen-dialog {
  padding: 20px 22px 16px;
  background: var(--imago-bg-surface, #15151d);
  color: var(--imago-text-primary, #f2f2f7);
  border: 1px solid var(--imago-border-soft, rgba(255, 255, 255, 0.08));
  border-radius: 14px;
}

.clip-gen-dialog__header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 16px;
}

.clip-gen-dialog__title {
  font-size: 16px;
  font-weight: 600;
}

.clip-gen-dialog__subtitle {
  font-size: 12px;
  opacity: 0.6;
}

.clip-gen-dialog__form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.clip-gen-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1 1 0;
  min-width: 0;
}

.clip-gen-field__label {
  font-size: 12px;
  opacity: 0.7;
}

.clip-gen-field__textarea,
.clip-gen-field__select {
  width: 100%;
  padding: 8px 10px;
  background: var(--imago-bg-base, #0e0e14);
  color: inherit;
  border: 1px solid var(--imago-border-soft, rgba(255, 255, 255, 0.12));
  border-radius: 8px;
  font: inherit;
  outline: none;
}

.clip-gen-field__textarea {
  resize: vertical;
  min-height: 92px;
}

.clip-gen-field__textarea:focus,
.clip-gen-field__select:focus {
  border-color: var(--imago-neon-cyan, #00f0ff);
}

.clip-gen-field-row {
  display: flex;
  gap: 12px;
}

.clip-gen-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.clip-gen-dialog__cancel,
.clip-gen-dialog__submit {
  padding: 8px 18px;
  border-radius: 8px;
  font: inherit;
  cursor: pointer;
  border: 1px solid transparent;
}

.clip-gen-dialog__cancel {
  background: transparent;
  color: inherit;
  border-color: var(--imago-border-soft, rgba(255, 255, 255, 0.16));
}

.clip-gen-dialog__submit {
  background: var(--imago-neon-cyan, #00f0ff);
  color: #03161a;
  font-weight: 600;
}

.clip-gen-dialog__cancel:disabled,
.clip-gen-dialog__submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
