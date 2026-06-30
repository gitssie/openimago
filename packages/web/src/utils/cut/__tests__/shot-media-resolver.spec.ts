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
    generationParams: null,
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
    durationSeconds: 12,
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
    // latestRunId wins even though r1 completed later. filmstrip is the VO; the
    // playback duration is integer ms (12s → 12000ms).
    expect(res).toEqual({
      sourceShotId: 'shot_1',
      url: 'r2-preview.mp4',
      thumbnailUrl: 'r2-thumb.png',
      filmstrip: {
        spriteUrl: 'r2.filmstrip.webp',
        frameCount: 24,
        frameW: 28,
        frameH: 50,
        sourceDurationMs: 12000,
      },
      sourceDurationMs: 12000,
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
    expect(res?.filmstrip?.spriteUrl).toBe('/mock/shot-s01.filmstrip.png')
    expect(res?.filmstrip?.frameCount).toBe(24)
  })

  it('falls back to a run with a filmstripUrl for the FILMSTRIP, preview from primary, when no video run', () => {
    // No video run → preview comes from the primary (completed[0] = most recent),
    // while the FILMSTRIP is resolved independently from the run that has a sprite.
    // (openimago-iiab: decoupled — preview from primary, filmstrip from best-sprite run.)
    const withStrip = resolveShotMediaSource('s2', [shot('s2')], [
      run('a', 's2', { kind: 'audio', completedAt: '2026-06-08T10:21:00Z', previewUrl: 'a.mp3', filmstripUrl: null, filmstripFrameCount: null }),
      run('b', 's2', { kind: 'image', completedAt: '2026-06-08T10:10:00Z', previewUrl: 'b.png', filmstripUrl: 'b.filmstrip.png' }),
    ])
    // preview = primary = completed[0] = the most-recent run (a)
    expect(withStrip?.url).toBe('a.mp3')
    // filmstrip = the run that HAS a sprite (b), decoupled from preview
    expect(withStrip?.filmstrip?.spriteUrl).toBe('b.filmstrip.png')
    // No video AND no filmstrip anywhere → legacy: latest completed run for both.
    const legacy = resolveShotMediaSource('s3', [shot('s3')], [
      run('c', 's3', { kind: 'image', completedAt: '2026-06-08T10:10:00Z', previewUrl: 'c.png', filmstripUrl: null, filmstripFrameCount: null }),
      run('d', 's3', { kind: 'audio', completedAt: '2026-06-08T10:21:00Z', previewUrl: 'd.mp3', filmstripUrl: null, filmstripFrameCount: null }),
    ])
    expect(legacy?.url).toBe('d.mp3')
    expect(legacy?.filmstrip).toBeNull()
  })

  // openimago-iiab: the blank-after-refresh bug. The filmstrip is re-resolved each
  // hydration, and the run-pick coupled filmstrip to the preview/video run. When the
  // newest VIDEO run has no sprite but an OLDER completed run does, the clip went
  // blank. Decouple: preview from the video run, filmstrip from the best-sprite run.
  //
  // openimago-wa33: AND the playback duration must come from the PRIMARY (newest
  // video) run, while the sprite's own source duration comes from the filmstrip run.
  it('resolves the filmstrip from an older completed run when the newest video run lacks a sprite', () => {
    const res = resolveShotMediaSource('s10', [shot('s10', 'vidNew')], [
      // older completed run that DID get a sprite generated (source = 9s)
      run('older', 's10', {
        kind: 'video',
        completedAt: '2026-06-08T10:00:00Z',
        previewUrl: 'older.mp4',
        thumbnailUrl: 'older-thumb.png',
        filmstripUrl: 'older.filmstrip.png',
        filmstripFrameCount: 24,
        filmstripFrameW: 28,
        filmstripFrameH: 50,
        durationSeconds: 9,
      }),
      // newest video run (latestRunId) — preview/playback source, but NO sprite yet
      // (source = 10s, a DIFFERENT length than the older sprite run)
      run('vidNew', 's10', {
        kind: 'video',
        completedAt: '2026-06-08T11:00:00Z',
        previewUrl: 'new.mp4',
        thumbnailUrl: 'new-thumb.png',
        filmstripUrl: null,
        filmstripFrameCount: null,
        filmstripFrameW: null,
        filmstripFrameH: null,
        durationSeconds: 10,
      }),
    ])
    // preview/playback + thumbnail come from the newest video run (primary)
    expect(res?.url).toBe('new.mp4')
    expect(res?.thumbnailUrl).toBe('new-thumb.png')
    // filmstrip fields come TOGETHER from the older run that has the sprite — so the
    // thumbnail survives instead of going blank.
    expect(res?.filmstrip).toEqual({
      spriteUrl: 'older.filmstrip.png',
      frameCount: 24,
      frameW: 28,
      frameH: 50,
      // the sprite maps cell-time → frame against ITS OWN run's source duration (9s).
      sourceDurationMs: 9000,
    })
    // BUG FIX (openimago-wa33): the clip's PLAYBACK source duration — what trim is
    // bounded against — comes from the PRIMARY run (10s → 10000ms), NOT the filmstrip
    // run (which is 9s). These were wrongly conflated before.
    expect(res?.sourceDurationMs).toBe(10000)
  })

  it('keeps the filmstrip from the video run itself when that run has its own sprite', () => {
    const res = resolveShotMediaSource('s11', [shot('s11', 'vid')], [
      run('vid', 's11', {
        kind: 'video',
        previewUrl: 'v.mp4',
        filmstripUrl: 'v.filmstrip.png',
        filmstripFrameCount: 24,
        durationSeconds: 7,
      }),
      run('img', 's11', {
        kind: 'image',
        completedAt: '2026-06-08T09:00:00Z',
        previewUrl: 'i.png',
        filmstripUrl: 'i.filmstrip.png',
      }),
    ])
    expect(res?.url).toBe('v.mp4')
    // the video run has its own sprite → it is the first sprite run, used unchanged.
    // primary === filmstripRun here, so both durations agree (7s → 7000ms).
    expect(res?.filmstrip?.spriteUrl).toBe('v.filmstrip.png')
    expect(res?.filmstrip?.sourceDurationMs).toBe(7000)
    expect(res?.sourceDurationMs).toBe(7000)
  })

  it('leaves the filmstrip null when no completed run of the shot has a sprite', () => {
    // image-only shot: nothing has a sprite → whole filmstrip stays null (the
    // image case is handled elsewhere; this documents it is NOT this fix's job).
    const res = resolveShotMediaSource('s12', [shot('s12', 'img')], [
      run('img', 's12', { kind: 'image', previewUrl: 'i.png', filmstripUrl: null, filmstripFrameCount: null, filmstripFrameW: null, filmstripFrameH: null, durationSeconds: null }),
    ])
    expect(res?.url).toBe('i.png')
    expect(res?.filmstrip).toBeNull()
    // playback run also has no duration → null.
    expect(res?.sourceDurationMs).toBeNull()
  })

  it('leaves the filmstrip null when the sprite run has no source duration (incomplete VO)', () => {
    // A sprite with all image facts but no source duration cannot map cell-time →
    // frame, so the VO is whole-or-null: it stays null rather than half-built.
    const res = resolveShotMediaSource('s13', [shot('s13', 'vid')], [
      run('vid', 's13', {
        kind: 'video',
        previewUrl: 'v.mp4',
        filmstripUrl: 'v.filmstrip.png',
        filmstripFrameCount: 24,
        filmstripFrameW: 28,
        filmstripFrameH: 50,
        durationSeconds: null,
      }),
    ])
    expect(res?.url).toBe('v.mp4')
    expect(res?.filmstrip).toBeNull()
    expect(res?.sourceDurationMs).toBeNull()
  })
})
