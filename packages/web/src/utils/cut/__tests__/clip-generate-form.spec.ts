import { describe, it, expect } from 'vitest'
import {
  buildClipGenerateForm,
  clipFormToParams,
  DEFAULT_CLIP_MODEL,
  DEFAULT_CLIP_ASPECT_RATIO,
  DEFAULT_CLIP_DURATION_SECONDS,
  DEFAULT_GENERATION_MODE,
  supportedGenerationModes,
  resolveGenerationMode,
  type ClipGenerateFormSource,
} from '../clip-generate-form'

const bareShot: ClipGenerateFormSource = {
  description: 'Kai slams the wheel in the rain',
  visualPrompt: '',
  generationParams: null,
}

describe('buildClipGenerateForm', () => {
  it('falls back to the shot description + defaults when nothing was generated yet', () => {
    const form = buildClipGenerateForm(bareShot, null)
    expect(form).toEqual({
      prompt: 'Kai slams the wheel in the rain',
      model: DEFAULT_CLIP_MODEL,
      aspectRatio: DEFAULT_CLIP_ASPECT_RATIO,
      durationSeconds: DEFAULT_CLIP_DURATION_SECONDS,
      referenceImages: [],
      generationMode: DEFAULT_GENERATION_MODE,
    })
  })

  it('prefers the visual prompt over the plain description', () => {
    const form = buildClipGenerateForm(
      { ...bareShot, visualPrompt: 'cinematic neon close-up' },
      null,
    )
    expect(form.prompt).toBe('cinematic neon close-up')
  })

  it('pre-fills from the persisted generationParams (last-used wins)', () => {
    const form = buildClipGenerateForm(
      {
        description: 'desc',
        visualPrompt: 'visual',
        generationParams: {
          prompt: 'a neon alley street race',
          model: 'seedance-2.0',
          aspectRatio: '16:9',
          durationSeconds: 12,
        },
      },
      { model: 'mock-video-model', prompt: 'old' },
    )
    expect(form).toEqual({
      prompt: 'a neon alley street race',
      model: 'seedance-2.0',
      aspectRatio: '16:9',
      durationSeconds: 12,
      referenceImages: [],
      generationMode: DEFAULT_GENERATION_MODE,
    })
  })

  it('uses the latest run model when the shot has no persisted model', () => {
    const form = buildClipGenerateForm(bareShot, { model: 'seedance-1.0', prompt: 'p' })
    expect(form.model).toBe('seedance-1.0')
  })

  it('defaults referenceImages to an empty array when the shot has none', () => {
    const form = buildClipGenerateForm(bareShot, null)
    expect(form.referenceImages).toEqual([])
  })

  it('pre-fills referenceImages from the persisted generationParams', () => {
    const form = buildClipGenerateForm(
      {
        description: 'desc',
        visualPrompt: 'visual',
        generationParams: {
          prompt: 'a neon alley street race',
          model: 'seedance-2.0',
          referenceImages: ['asset_a', 'asset_b'],
        },
      },
      null,
    )
    expect(form.referenceImages).toEqual(['asset_a', 'asset_b'])
  })

  it('keeps a persisted generationMode the model still supports', () => {
    const form = buildClipGenerateForm(
      {
        description: 'd',
        generationParams: { model: 'seedance-2.0', generationMode: '对口型数字人' },
      },
      null,
    )
    expect(form.generationMode).toBe('对口型数字人')
  })

  it('resets a persisted generationMode the (persisted) model no longer supports', () => {
    const form = buildClipGenerateForm(
      {
        description: 'd',
        // 对口型数字人 is a seedance-2.0-only mode; seedance-1.0 does not support it.
        generationParams: { model: 'seedance-1.0', generationMode: '对口型数字人' },
      },
      null,
    )
    expect(form.generationMode).toBe('全能参考')
  })
})

describe('supportedGenerationModes', () => {
  it('returns the full set for seedance-2.0', () => {
    expect(supportedGenerationModes('seedance-2.0')).toEqual([
      '全能参考',
      '图生视频',
      '首尾帧生视频',
      '对口型数字人',
    ])
  })

  it('falls back to [全能参考] for an unknown model', () => {
    expect(supportedGenerationModes('some-future-model')).toEqual([DEFAULT_GENERATION_MODE])
  })
})

describe('resolveGenerationMode', () => {
  it('keeps a supported mode', () => {
    expect(resolveGenerationMode('seedance-2.0', '图生视频')).toBe('图生视频')
  })

  it('falls back to the model first mode when unsupported', () => {
    expect(resolveGenerationMode('seedance-1.0', '对口型数字人')).toBe('全能参考')
  })

  it('falls back to the first mode when none is given', () => {
    expect(resolveGenerationMode('seedance-2.0', undefined)).toBe('全能参考')
  })
})

describe('clipFormToParams', () => {
  it('trims the prompt and carries all params through', () => {
    expect(
      clipFormToParams({
        prompt: '  windy night  ',
        model: 'seedance-2.0',
        aspectRatio: '9:16',
        durationSeconds: 8,
        referenceImages: [],
        generationMode: '图生视频',
      }),
    ).toEqual({
      prompt: 'windy night',
      model: 'seedance-2.0',
      aspectRatio: '9:16',
      durationSeconds: 8,
      generationMode: '图生视频',
    })
  })

  it('carries referenceImages through when present', () => {
    expect(
      clipFormToParams({
        prompt: 'p',
        model: 'seedance-2.0',
        aspectRatio: '9:16',
        durationSeconds: 8,
        referenceImages: ['asset_a', 'asset_b'],
        generationMode: '全能参考',
      }).referenceImages,
    ).toEqual(['asset_a', 'asset_b'])
  })

  it('omits referenceImages when empty (stays optional)', () => {
    const params = clipFormToParams({
      prompt: 'p',
      model: 'seedance-2.0',
      aspectRatio: '9:16',
      durationSeconds: 8,
      referenceImages: [],
      generationMode: '全能参考',
    })
    expect('referenceImages' in params).toBe(false)
  })

  it('carries generationMode through', () => {
    expect(
      clipFormToParams({
        prompt: 'p',
        model: 'seedance-2.0',
        aspectRatio: '9:16',
        durationSeconds: 8,
        referenceImages: [],
        generationMode: '首尾帧生视频',
      }).generationMode,
    ).toBe('首尾帧生视频')
  })
})
