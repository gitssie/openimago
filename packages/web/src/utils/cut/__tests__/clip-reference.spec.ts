import { describe, it, expect } from 'vitest'
import { buildReferenceAttachment, mimeFromUrl } from '../clip-reference'

describe('mimeFromUrl', () => {
  it('maps common extensions', () => {
    expect(mimeFromUrl('https://cdn/x.mp4')).toBe('video/mp4')
    expect(mimeFromUrl('https://cdn/x.webm?token=1')).toBe('video/webm')
    expect(mimeFromUrl('https://cdn/x.png')).toBe('image/png')
    expect(mimeFromUrl('https://cdn/x.jpg')).toBe('image/jpeg')
    expect(mimeFromUrl('https://cdn/x.mp3')).toBe('audio/mpeg')
  })
  it('defaults to mp4 for unknown', () => {
    expect(mimeFromUrl('https://cdn/x')).toBe('video/mp4')
  })
})

describe('buildReferenceAttachment', () => {
  const genId = () => 'att-1'

  it('builds an already-uploaded attachment from the run preview (no upload)', () => {
    const att = buildReferenceAttachment(
      'shot_1',
      { previewUrl: 'https://cdn/shot_1.mp4', thumbnailUrl: 't.png', resultArtifactId: 'art-9' },
      genId,
    )
    expect(att).toEqual({
      id: 'att-1',
      name: 'shot_1.mp4',
      mime: 'video/mp4',
      url: 'https://cdn/shot_1.mp4',
      status: 'uploaded',
      progress: 100,
      assetId: 'art-9',
    })
  })

  it('falls back to thumbnailUrl when no preview', () => {
    const att = buildReferenceAttachment(
      'shot_1',
      { previewUrl: null, thumbnailUrl: 'https://cdn/t.png', resultArtifactId: null },
      genId,
    )
    expect(att?.url).toBe('https://cdn/t.png')
    expect(att?.mime).toBe('image/png')
    expect(att?.assetId).toBeUndefined()
  })

  it('returns null when the run has no media', () => {
    expect(buildReferenceAttachment('shot_1', { previewUrl: null, thumbnailUrl: null, resultArtifactId: null }, genId)).toBeNull()
    expect(buildReferenceAttachment('shot_1', null, genId)).toBeNull()
  })
})
