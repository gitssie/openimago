import { describe, it, expect } from 'vitest'
import {
  buildClipGenerateForm,
  clipFormToParams,
  DEFAULT_CLIP_MODEL,
  DEFAULT_CLIP_ASPECT_RATIO,
  DEFAULT_CLIP_DURATION_SECONDS,
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
      }),
    ).toEqual({
      prompt: 'windy night',
      model: 'seedance-2.0',
      aspectRatio: '9:16',
      durationSeconds: 8,
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
    })
    expect('referenceImages' in params).toBe(false)
  })
})
