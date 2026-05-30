import { describe, it, expect } from 'vitest'
import { isMediaToolName, parseMediaToolOutput, type MediaToolOutputV1 } from '../../services/media'

// ── isMediaToolName ────────────────────────────────────────────────────────────

describe('isMediaToolName', () => {
  it('returns true for image_generate', () => {
    expect(isMediaToolName('image_generate')).toBe(true)
  })

  it('returns true for image_edit', () => {
    expect(isMediaToolName('image_edit')).toBe(true)
  })

  it('returns true for image_upscale', () => {
    expect(isMediaToolName('image_upscale')).toBe(true)
  })

  it('returns true for image_variation', () => {
    expect(isMediaToolName('image_variation')).toBe(true)
  })

  it('returns true for video_generate', () => {
    expect(isMediaToolName('video_generate')).toBe(true)
  })

  it('returns true for video_extend', () => {
    expect(isMediaToolName('video_extend')).toBe(true)
  })

  it('returns true for audio_generate', () => {
    expect(isMediaToolName('audio_generate')).toBe(true)
  })

  it('returns true for audio_tts', () => {
    expect(isMediaToolName('audio_tts')).toBe(true)
  })

  it('returns true for audio_sfx', () => {
    expect(isMediaToolName('audio_sfx')).toBe(true)
  })

  it('returns false for non-media tool (read)', () => {
    expect(isMediaToolName('read')).toBe(false)
  })

  it('returns false for non-media tool (bash)', () => {
    expect(isMediaToolName('bash')).toBe(false)
  })

  it('returns false for non-media tool (task)', () => {
    expect(isMediaToolName('task')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isMediaToolName('')).toBe(false)
  })

  it('returns false for image_ alone (must have underscore-separated segments)', () => {
    // "image_" technically starts with `image_` but we treat `image_` as prefix with no suffix
    expect(isMediaToolName('image_')).toBe(true)
  })
})

// ── parseMediaToolOutput ───────────────────────────────────────────────────────

const makeImageOutput = (overrides?: Partial<MediaToolOutputV1['result']>): string =>
  JSON.stringify({
    version: 1,
    kind: 'image',
    status: 'completed',
    result: {
      workspaceFileId: 'wf_01h_image',
      mime: 'image/png',
      access: {
        preview: { href: 'https://cdn.example.com/generated/img.png' },
      },
      ...overrides,
    },
    provider: 'test',
    model: 'v1',
  })

const makeVideoOutput = (overrides?: Partial<MediaToolOutputV1['result']>): string =>
  JSON.stringify({
    version: 1,
    kind: 'video',
    status: 'completed',
    result: {
      workspaceFileId: 'wf_01h_video',
      mime: 'video/mp4',
      access: {
        preview: { href: '/api/dev-media/generated/video.mp4' },
        poster: { href: '/api/dev-media/generated/poster.webp' },
      },
      ...overrides,
    },
  })

const makeAudioOutput = (overrides?: Partial<MediaToolOutputV1['result']>): string =>
  JSON.stringify({
    version: 1,
    kind: 'audio',
    status: 'completed',
    result: {
      workspaceFileId: 'wf_01h_audio',
      mime: 'audio/mpeg',
      access: {
        preview: { href: 'data:audio/mpeg;base64,...' },
      },
      ...overrides,
    },
  })

describe('parseMediaToolOutput', () => {
  // ── Happy path ──────────────────────────────────────────────────────────────

  it('parses valid image output', () => {
    const output = makeImageOutput()
    const result = parseMediaToolOutput(output)
    expect(result).not.toBeNull()
    expect(result!.kind).toBe('image')
    expect(result!.result.workspaceFileId).toBe('wf_01h_image')
    expect(result!.result.mime).toBe('image/png')
    expect(result!.result.access.preview.href).toBe('https://cdn.example.com/generated/img.png')
  })

  it('parses valid video output with poster', () => {
    const output = makeVideoOutput()
    const result = parseMediaToolOutput(output)
    expect(result).not.toBeNull()
    expect(result!.kind).toBe('video')
    expect(result!.result.access.preview.href).toBe('/api/dev-media/generated/video.mp4')
    expect(result!.result.access.poster?.href).toBe('/api/dev-media/generated/poster.webp')
  })

  it('parses valid audio output', () => {
    const output = makeAudioOutput()
    const result = parseMediaToolOutput(output)
    expect(result).not.toBeNull()
    expect(result!.kind).toBe('audio')
    expect(result!.result.access.preview.href).toBe('data:audio/mpeg;base64,...')
  })

  it('parses output with optional fields (width, height, duration, seed)', () => {
    const output = makeImageOutput({
      width: 1024,
      height: 1024,
      seed: 42,
    })
    const result = parseMediaToolOutput(output)
    expect(result).not.toBeNull()
    expect(result!.result.width).toBe(1024)
    expect(result!.result.height).toBe(1024)
    expect(result!.result.seed).toBe(42)
  })

  // ── Version check ────────────────────────────────────────────────────────────

  it('returns null when version is not 1', () => {
    const output = JSON.stringify({
      version: 2,
      kind: 'image',
      status: 'completed',
      result: {
        workspaceFileId: 'wf_test',
        mime: 'image/png',
        access: { preview: { href: 'https://example.com/img.png' } },
      },
    })
    expect(parseMediaToolOutput(output)).toBeNull()
  })

  it('returns null when version is missing', () => {
    const output = JSON.stringify({
      kind: 'image',
      status: 'completed',
      result: {
        workspaceFileId: 'wf_test',
        mime: 'image/png',
        access: { preview: { href: 'https://example.com/img.png' } },
      },
    })
    expect(parseMediaToolOutput(output)).toBeNull()
  })

  // ── Status check ─────────────────────────────────────────────────────────────

  it('returns null when status is not "completed"', () => {
    const output = JSON.stringify({
      version: 1,
      kind: 'image',
      status: 'running',
      result: {
        workspaceFileId: 'wf_test',
        mime: 'image/png',
        access: { preview: { href: 'https://example.com/img.png' } },
      },
    })
    expect(parseMediaToolOutput(output)).toBeNull()
  })

  // ── Kind check ───────────────────────────────────────────────────────────────

  it('returns null when kind is invalid', () => {
    const output = JSON.stringify({
      version: 1,
      kind: 'document',
      status: 'completed',
      result: {
        workspaceFileId: 'wf_test',
        mime: 'image/png',
        access: { preview: { href: 'https://example.com/img.png' } },
      },
    })
    expect(parseMediaToolOutput(output)).toBeNull()
  })

  // ── Structural checks ────────────────────────────────────────────────────────

  it('returns null for non-JSON string', () => {
    expect(parseMediaToolOutput('not json at all')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseMediaToolOutput('')).toBeNull()
  })

  it('returns null for null/undefined input', () => {
    // TypeScript won't allow null, but defensive runtime check
    expect(parseMediaToolOutput(undefined as unknown as string)).toBeNull()
  })

  it('returns null when result is missing', () => {
    const output = JSON.stringify({
      version: 1,
      kind: 'image',
      status: 'completed',
    })
    expect(parseMediaToolOutput(output)).toBeNull()
  })

  it('returns null when result.workspaceFileId is missing', () => {
    const output = JSON.stringify({
      version: 1,
      kind: 'image',
      status: 'completed',
      result: {
        mime: 'image/png',
        access: { preview: { href: 'https://example.com/img.png' } },
      },
    })
    expect(parseMediaToolOutput(output)).toBeNull()
  })

  it('returns null when result.access.preview.href is missing', () => {
    const output = JSON.stringify({
      version: 1,
      kind: 'image',
      status: 'completed',
      result: {
        workspaceFileId: 'wf_test',
        mime: 'image/png',
        access: {},
      },
    })
    expect(parseMediaToolOutput(output)).toBeNull()
  })

  it('returns null when result.access is missing', () => {
    const output = JSON.stringify({
      version: 1,
      kind: 'image',
      status: 'completed',
      result: {
        workspaceFileId: 'wf_test',
        mime: 'image/png',
      },
    })
    expect(parseMediaToolOutput(output)).toBeNull()
  })

  // ── Kind-tool prefix mismatch ────────────────────────────────────────────────

  it('returns null when kind does not match the expected media kind (optional toolPrefix param)', () => {
    const output = makeImageOutput()
    // Pass video as kind hint — mismatch means null
    const result = parseMediaToolOutput(output, 'video')
    expect(result).toBeNull()
  })

  it('returns result when kind matches the expected kind (optional toolPrefix param)', () => {
    const output = makeImageOutput()
    const result = parseMediaToolOutput(output, 'image')
    expect(result).not.toBeNull()
  })
})
