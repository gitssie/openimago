import { describe, it, expect } from 'vitest'
import { resolveShotMediaSource, makeShotMediaResolver } from '../shot-media-resolver'
import type { StoryRunSummary, StoryShotSummary } from '../../../components/session-workspace/types'

function shot(id: string, latestRunId: string | null = null): StoryShotSummary {
  return {
    id,
    shotNumber: 1,
    sceneId: 'sc_1',
    description: '',
    visualPrompt: '',
    cameraNotes: '',
    lightingNotes: '',
    dialog: [],
    characterIds: [],
    referenceArtifactIds: [],
    status: 'generated',
    durationEstimate: null,
    latestRunId,
  }
}

function run(
  id: string,
  shotId: string,
  over: Partial<StoryRunSummary> = {},
): StoryRunSummary {
  return {
    id,
    nodeId: 'n1',
    shotId,
    status: 'completed',
    startedAt: '2026-06-18T00:00:00Z',
    completedAt: '2026-06-18T00:01:00Z',
    model: 'm',
    prompt: '',
    resultArtifactId: 'a1',
    kind: 'video',
    mime: 'video/mp4',
    thumbnailUrl: `${id}-thumb.png`,
    previewUrl: `${id}-preview.mp4`,
    filmstripUrl: `${id}.filmstrip.webp`,
    filmstripFrameCount: 24,
    filmstripFrameW: 28,
    filmstripFrameH: 50,
    error: null,
    ...over,
  }
}

describe('resolveShotMediaSource', () => {
  it('returns the shot latest completed run preview as the clip source', () => {
    const res = resolveShotMediaSource('shot_1', [shot('shot_1', 'r2')], [
      run('r1', 'shot_1', { completedAt: '2026-06-18T00:01:00Z' }),
      run('r2', 'shot_1', { completedAt: '2026-06-18T00:00:30Z' }),
    ])
    // latestRunId wins even though r1 completed later
    expect(res).toEqual({
      sourceShotId: 'shot_1',
      url: 'r2-preview.mp4',
      thumbnailUrl: 'r2-thumb.png',
      filmstripUrl: 'r2.filmstrip.webp',
      filmstripFrameCount: 24,
      filmstripFrameW: 28,
      filmstripFrameH: 50,
      name: 'shot_1.mp4',
    })
  })

  it('falls back to most-recent completedAt when latestRunId is unset', () => {
    const res = resolveShotMediaSource('shot_1', [shot('shot_1', null)], [
      run('r1', 'shot_1', { completedAt: '2026-06-18T00:00:30Z' }),
      run('r2', 'shot_1', { completedAt: '2026-06-18T00:02:00Z' }),
    ])
    expect(res?.url).toBe('r2-preview.mp4')
  })

  it('ignores non-completed runs and runs without a preview', () => {
    const res = resolveShotMediaSource('shot_1', [shot('shot_1')], [
      run('r1', 'shot_1', { status: 'failed' }),
      run('r2', 'shot_1', { previewUrl: null }),
    ])
    expect(res).toBeNull()
  })

  it('returns null for an unknown shot (orphan clip)', () => {
    expect(resolveShotMediaSource('ghost', [shot('shot_1')], [])).toBeNull()
  })

  it('makeShotMediaResolver binds shots/runs', () => {
    const resolver = makeShotMediaResolver([shot('shot_1')], [run('r1', 'shot_1')])
    expect(resolver('shot_1')?.url).toBe('r1-preview.mp4')
    expect(resolver('nope')).toBeNull()
  })

  // openimago-78m9: a shot with image + video + audio runs (e.g. s01-opening)
  // must resolve to the VIDEO run — the clip is on the video track and only the
  // video run carries the filmstrip sprite. The audio run completes LAST but has
  // no video and no sprite, so plain "latest" would wrongly pick it.
  it('prefers the video run even when an audio/image run completed more recently', () => {
    const res = resolveShotMediaSource('s01', [shot('s01')], [
      run('img', 's01', { kind: 'image', completedAt: '2026-06-08T10:05:25Z', previewUrl: 'img.png', filmstripUrl: null, filmstripFrameCount: null }),
      run('vid', 's01', { kind: 'video', completedAt: '2026-06-08T10:14:32Z', previewUrl: '/mock/shot-s01.mp4', filmstripUrl: '/mock/shot-s01.filmstrip.png' }),
      run('aud', 's01', { kind: 'audio', completedAt: '2026-06-08T10:21:14Z', previewUrl: '/mock/narration-s01.mp3', filmstripUrl: null, filmstripFrameCount: null }),
    ])
    expect(res?.url).toBe('/mock/shot-s01.mp4')
    expect(res?.filmstripUrl).toBe('/mock/shot-s01.filmstrip.png')
    expect(res?.filmstripFrameCount).toBe(24)
  })

  it('falls back to a run with a filmstripUrl, then to the latest, when no video run', () => {
    // No video run → prefer any run carrying a filmstrip sprite.
    const withStrip = resolveShotMediaSource('s2', [shot('s2')], [
      run('a', 's2', { kind: 'audio', completedAt: '2026-06-08T10:21:00Z', previewUrl: 'a.mp3', filmstripUrl: null, filmstripFrameCount: null }),
      run('b', 's2', { kind: 'image', completedAt: '2026-06-08T10:10:00Z', previewUrl: 'b.png', filmstripUrl: 'b.filmstrip.png' }),
    ])
    expect(withStrip?.url).toBe('b.png')
    // No video AND no filmstrip anywhere → legacy: latest completed run.
    const legacy = resolveShotMediaSource('s3', [shot('s3')], [
      run('c', 's3', { kind: 'image', completedAt: '2026-06-08T10:10:00Z', previewUrl: 'c.png', filmstripUrl: null, filmstripFrameCount: null }),
      run('d', 's3', { kind: 'audio', completedAt: '2026-06-08T10:21:00Z', previewUrl: 'd.mp3', filmstripUrl: null, filmstripFrameCount: null }),
    ])
    expect(legacy?.url).toBe('d.mp3')
  })
})
