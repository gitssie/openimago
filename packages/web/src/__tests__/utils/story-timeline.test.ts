import { describe, it, expect } from 'vitest'
import { resolveLatestRunStatus } from 'src/utils/story-timeline'
import type { StoryRunSummary } from 'src/components/session-workspace/types'

function makeRun(overrides: Partial<StoryRunSummary> = {}): StoryRunSummary {
  return {
    id: 'run-1',
    nodeId: 'node-1',
    shotId: 's01',
    status: 'completed',
    startedAt: '2026-06-08T10:00:00Z',
    completedAt: '2026-06-08T10:00:30Z',
    model: 'flux-pro',
    prompt: 'a shot',
    resultArtifactId: 'art-1',
    kind: null,
    mime: null,
    thumbnailUrl: null,
    previewUrl: null,
    filmstripUrl: null,
    filmstripFrameCount: null,
    filmstripFrameW: null,
    filmstripFrameH: null,
    error: null,
    ...overrides,
  }
}

describe('resolveLatestRunStatus', () => {
  it('returns "none" when the node has no latestRunId', () => {
    expect(resolveLatestRunStatus(null, [makeRun()])).toBe('none')
  })

  it('returns the status of the matching run', () => {
    const runs = [makeRun({ id: 'run-1', status: 'running' })]
    expect(resolveLatestRunStatus('run-1', runs)).toBe('running')
  })

  it('returns "none" when latestRunId is not in runs (trimmed history)', () => {
    expect(resolveLatestRunStatus('run-missing', [makeRun({ id: 'run-1' })])).toBe('none')
  })

  it('resolves failed status', () => {
    const runs = [makeRun({ id: 'r', status: 'failed' })]
    expect(resolveLatestRunStatus('r', runs)).toBe('failed')
  })
})
