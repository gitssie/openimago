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
})
