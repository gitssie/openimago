import { describe, it, expect } from 'vitest'
import { rawRunsToRunSummaries } from 'src/utils/story-summary-mapper'
import type { OpenimagoStoryRuns } from 'src/api/client'

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeRuns(runs: Record<string, unknown>[]): OpenimagoStoryRuns {
  return { schemaVersion: 1, episodeId: 'ep_001', runs }
}

/** Map a single raw run and assert exactly one summary came back. */
function mapOne(raw: Record<string, unknown>) {
  const summaries = rawRunsToRunSummaries(makeRuns([raw]))
  expect(summaries).toHaveLength(1)
  return summaries[0]!
}

// A completed keyframe run shaped like the real schema
// (docs/story-schema/runs/ep_001.runs.json): nested `result` with `access`.
function nestedCompletedRun(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'run_shot01',
    nodeId: 'n07-shot-s01',
    shotId: 's01-opening',
    status: 'completed',
    model: 'flux-pro',
    startedAt: '2026-06-08T10:05:00Z',
    completedAt: '2026-06-08T10:05:25Z',
    result: {
      artifactId: 'wf_01h_shot01',
      kind: 'image',
      access: {
        preview: 'https://cdn.example.com/shot01.png',
        thumbnail: 'https://cdn.example.com/shot01.thumb.webp',
      },
    },
    ...overrides,
  }
}

describe('rawRunsToRunSummaries — nested result parsing', () => {
  it('reads artifactId from nested result.artifactId', () => {
    const run = mapOne(nestedCompletedRun())
    expect(run.resultArtifactId).toBe('wf_01h_shot01')
  })

  it('reads thumbnail and preview from result.access', () => {
    const run = mapOne(nestedCompletedRun())
    expect(run.thumbnailUrl).toBe('https://cdn.example.com/shot01.thumb.webp')
    expect(run.previewUrl).toBe('https://cdn.example.com/shot01.png')
  })

  it('returns null thumbnail/preview/artifactId for a running run with no result', () => {
    const run = mapOne({
      id: 'run_running',
      nodeId: 'n03',
      shotId: null,
      status: 'running',
      startedAt: '2026-06-08T10:10:00Z',
    })
    expect(run.status).toBe('running')
    expect(run.resultArtifactId).toBeNull()
    expect(run.thumbnailUrl).toBeNull()
    expect(run.previewUrl).toBeNull()
  })

  it('maps shotId null (concept-art run) to empty string', () => {
    const run = mapOne(nestedCompletedRun({ shotId: null }))
    expect(run.shotId).toBe('')
  })

  it('falls back to top-level artifactId when no nested result is present', () => {
    const run = mapOne({
      id: 'run_legacy',
      nodeId: 'n01',
      shotId: 's01',
      status: 'completed',
      startedAt: '2026-06-08T10:00:00Z',
      resultArtifactId: 'legacy-artifact',
    })
    expect(run.resultArtifactId).toBe('legacy-artifact')
    expect(run.thumbnailUrl).toBeNull()
  })

  it('preserves status, model and timestamps', () => {
    const run = mapOne(nestedCompletedRun())
    expect(run.status).toBe('completed')
    expect(run.model).toBe('flux-pro')
    expect(run.startedAt).toBe('2026-06-08T10:05:00Z')
    expect(run.completedAt).toBe('2026-06-08T10:05:25Z')
  })
})
