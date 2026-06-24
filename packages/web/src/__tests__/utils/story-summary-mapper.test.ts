import { describe, it, expect } from 'vitest'
import { rawRunsToRunSummaries, rawBibleToSummary } from 'src/utils/story-summary-mapper'
import type { OpenimagoStoryBible, OpenimagoStoryRuns } from 'src/api/client'

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

  it('extracts kind and mime from nested result', () => {
    const run = mapOne(nestedCompletedRun({
      result: {
        artifactId: 'wf_audio01',
        kind: 'audio',
        mime: 'audio/mpeg',
        access: { preview: '/mock/bgm-demo.mp3', thumbnail: '/mock/placeholder-1x1.svg' },
      },
    }))
    expect(run.kind).toBe('audio')
    expect(run.mime).toBe('audio/mpeg')
  })

  it('maps image/video result kinds through', () => {
    expect(mapOne(nestedCompletedRun()).kind).toBe('image')
    expect(
      mapOne(nestedCompletedRun({ result: { artifactId: 'v1', kind: 'video', mime: 'video/mp4' } })).kind,
    ).toBe('video')
  })

  it('returns null kind/mime for an unknown kind or a run with no result', () => {
    expect(mapOne(nestedCompletedRun({ result: { artifactId: 'x', kind: 'weird' } })).kind).toBeNull()
    const running = mapOne({
      id: 'run_running',
      nodeId: 'n03',
      status: 'running',
      startedAt: '2026-06-08T10:10:00Z',
    })
    expect(running.kind).toBeNull()
    expect(running.mime).toBeNull()
  })

  // Filmstrip + duration (openimago-0t9m): generateShot now emits the same shape
  // as the seed fixture, so the timeline can render continuous distinct frames.
  it('reads filmstrip url, dims and real duration from a video run', () => {
    const run = mapOne(nestedCompletedRun({
      result: {
        artifactId: 'wf_shot01_video',
        kind: 'video',
        mime: 'video/mp4',
        duration: 15.069,
        access: {
          preview: '/mock/shot-s01.mp4',
          thumbnail: '/mock/placeholder-16x9.svg',
          filmstrip: '/mock/shot-s01.filmstrip.png',
        },
        filmstrip: { frameCount: 24, frameW: 28, frameH: 50 },
      },
    }))
    expect(run.previewUrl).toBe('/mock/shot-s01.mp4')
    expect(run.filmstripUrl).toBe('/mock/shot-s01.filmstrip.png')
    expect(run.filmstripFrameCount).toBe(24)
    expect(run.filmstripFrameW).toBe(28)
    expect(run.filmstripFrameH).toBe(50)
    expect(run.durationSeconds).toBe(15.069)
  })

  it('leaves filmstrip fields null/undefined when a run carries no sprite (orphan)', () => {
    const run = mapOne(nestedCompletedRun())
    expect(run.filmstripUrl).toBeNull()
    expect(run.filmstripFrameCount).toBeNull()
    expect(run.durationSeconds).toBeNull()
  })
})

// ── Bible audioElements ───────────────────────────────────────────────────────

function makeBible(overrides: Partial<OpenimagoStoryBible> = {}): OpenimagoStoryBible {
  return {
    schemaVersion: 1,
    projectId: 'proj_x',
    world: { name: '', description: '', era: '', moodKeywords: [], visualStyleNotes: '' },
    characters: [],
    scenes: [],
    styleSeeds: [],
    updatedAt: '2026-06-08T00:00:00Z',
    ...overrides,
  }
}

describe('rawBibleToSummary — audioElements', () => {
  it('maps an audio element with all fields', () => {
    const summary = rawBibleToSummary(
      makeBible({
        audioElements: [
          {
            id: 'bgm-main-theme',
            displayName: 'Main Theme',
            kind: 'bgm',
            description: 'Driving synthwave bed',
            timingNote: 'Loops under the whole episode',
            referenceArtifactIds: ['ref-a'],
          },
        ],
      }),
    )
    expect(summary.audioElements).toHaveLength(1)
    const el = summary.audioElements[0]!
    expect(el.id).toBe('bgm-main-theme')
    expect(el.displayName).toBe('Main Theme')
    expect(el.kind).toBe('bgm')
    expect(el.description).toBe('Driving synthwave bed')
    expect(el.timingNote).toBe('Loops under the whole episode')
    expect(el.referenceArtifactIds).toEqual(['ref-a'])
  })

  it('defaults missing/unknown kind to narration and tolerates absent audioElements', () => {
    expect(rawBibleToSummary(makeBible()).audioElements).toEqual([])
    const el = rawBibleToSummary(
      makeBible({ audioElements: [{ id: 'x', kind: 'bogus' }] }),
    ).audioElements[0]!
    expect(el.kind).toBe('narration')
    expect(el.displayName).toBe('未命名音频')
  })
})
