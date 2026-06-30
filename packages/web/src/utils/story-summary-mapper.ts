/**
 * Story summary mapper — converts raw story API JSON (openimago-1a3)
 * into the Story*Summary projection types that ProjectWorkspaceStoryPanel
 * consumes (ADR 0004, openimago-9so).
 *
 * All functions are pure: raw data in, summary out. No side effects.
 */
import type {
  OpenimagoStoryBible,
  OpenimagoStoryEpisode,
  OpenimagoStoryRuns,
  OpenimagoStorySeries,
  OpenimagoStoryWorkflow,
} from '../api/client'
import type {
  StoryAudioElementSummary,
  StoryBibleSummary,
  StoryCharacterSummary,
  StoryEpisodeSummary,
  StoryRunSummary,
  StorySceneSummary,
  StoryShotDialog,
  StoryShotSummary,
  StoryStyleSeedSummary,
  StoryWorkflowNodeSummary,
} from '../components/session-workspace/types'
import type { ShotGenerationParams } from './cut/clip-generate-form'

/** Guard: extract string value safely. */
function safeStr(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** Guard: extract number value safely, returns null for non-numbers. */
function safeNum(v: unknown): number | null {
  return typeof v === 'number' ? v : null
}

/** Guard: extract number value with default, returns number always. */
function safeNumD(v: unknown, fallback: number): number {
  return typeof v === 'number' ? v : fallback
}

/** Guard: extract string array safely. */
function safeStrArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
}

/** Guard: number from unknown (parseInt fallback). */
function parseNum(v: unknown, fallback: number): number {
  if (typeof v === 'number') return Math.round(v)
  if (typeof v === 'string') {
    const n = parseInt(v, 10)
    return Number.isNaN(n) ? fallback : n
  }
  return fallback
}

/** Guard: check if value is a known literal in a tuple. */
function isStatus<T extends readonly string[]>(v: unknown, allowed: T): T[number] | undefined {
  return typeof v === 'string' ? (allowed as readonly string[]).find((s) => s === v) : undefined
}

// ── Bible ─────────────────────────────────────────────────────────────────────

function mapCharacter(raw: Record<string, unknown>, _idx: number): StoryCharacterSummary {
  return {
    id: safeStr(raw['id']) || safeStr(raw['slug']) || `char-${_idx}`,
    displayName: safeStr(raw['name']) || safeStr(raw['displayName']) || '未命名角色',
    role: isStatus(raw['role'], ['protagonist', 'antagonist', 'supporting', 'extra'] as const) ?? 'supporting',
    description: safeStr(raw['description']) || safeStr(raw['bio']) || '',
    visualNotes: safeStr(raw['visualNotes']) || safeStr(raw['appearanceNotes']) || '',
    thumbnailUrl: safeStr(raw['thumbnailUrl']) || safeStr(raw['portraitUrl']) || null,
    referenceArtifactIds: safeStrArr(raw['referenceArtifactIds']),
    tags: safeStrArr(raw['tags']) || safeStrArr(raw['keywords']),
  }
}

function mapScene(raw: Record<string, unknown>, _idx: number): StorySceneSummary {
  return {
    id: safeStr(raw['id']) || safeStr(raw['slug']) || `scene-${_idx}`,
    displayName: safeStr(raw['name']) || safeStr(raw['displayName']) || '未命名场景',
    type: safeStr(raw['type']) || safeStr(raw['location']) || 'interior',
    description: safeStr(raw['description']) || '',
    mood: safeStr(raw['mood']) || safeStr(raw['atmosphere']) || '',
    lighting: safeStr(raw['lighting']) || safeStr(raw['lightingNotes']) || '',
    thumbnailUrl: safeStr(raw['thumbnailUrl']) || safeStr(raw['bgRef']) || null,
    referenceArtifactIds: safeStrArr(raw['referenceArtifactIds']),
    tags: safeStrArr(raw['tags']),
  }
}

function mapStyleSeed(raw: Record<string, unknown>, _idx: number): StoryStyleSeedSummary {
  return {
    id: safeStr(raw['id']) || safeStr(raw['slug']) || `style-${_idx}`,
    displayName: safeStr(raw['name']) || safeStr(raw['displayName']) || '未命名风格',
    description: safeStr(raw['description']) || '',
    visualStyle: safeStr(raw['visualStyle']) || safeStr(raw['stylePrompt']) || '',
    colorPalette: Array.isArray(raw['colorPalette'])
      ? (raw['colorPalette'] as unknown[]).filter((c): c is string => typeof c === 'string')
      : [],
    thumbnailUrl: safeStr(raw['thumbnailUrl']) || safeStr(raw['previewUrl']) || null,
    referenceArtifactIds: safeStrArr(raw['referenceArtifactIds']),
  }
}

function mapAudioElement(raw: Record<string, unknown>, _idx: number): StoryAudioElementSummary {
  return {
    id: safeStr(raw['id']) || safeStr(raw['slug']) || `audio-${_idx}`,
    displayName: safeStr(raw['displayName']) || safeStr(raw['name']) || '未命名音频',
    kind: isStatus(raw['kind'], ['bgm', 'narration', 'sfx'] as const) ?? 'narration',
    description: safeStr(raw['description']) || '',
    timingNote: safeStr(raw['timingNote']) || safeStr(raw['timing']) || '',
    referenceArtifactIds: safeStrArr(raw['referenceArtifactIds']),
  }
}

export function rawBibleToSummary(bible: OpenimagoStoryBible): StoryBibleSummary {
  return {
    schemaVersion: bible.schemaVersion,
    worldName: bible.world?.name ?? '',
    worldDescription: bible.world?.description ?? '',
    era: bible.world?.era ?? '',
    moodKeywords: bible.world?.moodKeywords ?? [],
    visualStyleNotes: bible.world?.visualStyleNotes ?? '',
    characters: (bible.characters ?? []).map((c, idx) => mapCharacter(c, idx)),
    scenes: (bible.scenes ?? []).map((s, idx) => mapScene(s, idx)),
    styleSeeds: (bible.styleSeeds ?? []).map((ss, idx) => mapStyleSeed(ss, idx)),
    audioElements: (bible.audioElements ?? []).map((ae, idx) => mapAudioElement(ae, idx)),
    updatedAt: bible.updatedAt ?? null,
  }
}

// ── Series → episodes ─────────────────────────────────────────────────────────

export function rawSeriesToEpisodeSummaries(series: OpenimagoStorySeries): StoryEpisodeSummary[] {
  return (series.episodes ?? []).map((ep) => {
    return {
      id: safeStr(ep['id']) || '',
      episodeNumber: parseNum(ep['episodeNumber'], 0),
      title: safeStr(ep['title']) || `集数 ${safeStr(ep['episodeNumber'])}`,
      status: isStatus(ep['status'], ['draft', 'storyboard', 'generating', 'review', 'done'] as const) ?? 'draft',
      shotCount: parseNum(ep['shotCount'], Array.isArray(ep['shots']) ? (ep['shots'] as unknown[]).length : 0),
      durationEstimate: safeNum(ep['durationEstimate']) ?? safeNum(ep['duration']) ?? null,
      logline: safeStr(ep['logline']) || safeStr(ep['summary']) || '',
      synopsis: safeStr(ep['synopsis']) || safeStr(ep['description']) || '',
      updatedAt: safeStr(ep['updatedAt']) || null,
    }
  })
}

// ── Episode → shots ───────────────────────────────────────────────────────────

function mapDialog(raw: Record<string, unknown>): StoryShotDialog {
  return {
    characterId: safeStr(raw['characterId']) || safeStr(raw['speaker']) || '',
    text: safeStr(raw['text']) || safeStr(raw['line']) || '',
    emotion: safeStr(raw['emotion']) || safeStr(raw['tone']) || null,
  }
}

export function rawEpisodeToShotSummaries(episode: OpenimagoStoryEpisode): StoryShotSummary[] {
  const shots = episode.shots ?? []
  return shots.map((shot, sIdx) => {
    const rawDialog = shot['dialog'] as unknown[] | undefined
    return {
      id: safeStr(shot['id']) || safeStr(shot['slug']) || `shot-${sIdx}`,
      shotNumber: safeNumD(shot['shotNumber'], sIdx + 1),
      sceneId: safeStr(shot['sceneId']) || safeStr(shot['location']) || '',
      description: safeStr(shot['description']) || safeStr(shot['prompt']) || '',
      visualPrompt: safeStr(shot['visualPrompt']) || safeStr(shot['desc']) || '',
      cameraNotes: safeStr(shot['cameraNotes']) || safeStr(shot['camera']) || '',
      lightingNotes: safeStr(shot['lightingNotes']) || safeStr(shot['lighting']) || '',
      dialog: rawDialog
        ? rawDialog.map((d) => mapDialog(d as Record<string, unknown>))
        : [],
      characterIds: safeStrArr(shot['characterIds']) ?? safeStrArr(shot['characters']),
      referenceArtifactIds: safeStrArr(shot['referenceArtifactIds']),
      status: isStatus(shot['status'], ['pending', 'in_progress', 'generated', 'review', 'approved'] as const) ?? 'pending',
      durationEstimate: safeNum(shot['durationEstimate']) ?? safeNum(shot['duration']) ?? null,
      latestRunId: safeStr(shot['latestRunId']) || safeStr(shot['lastRunId']) || null,
      generationParams: mapGenerationParams(shot['generationParams']),
    }
  })
}

/** Map a shot's persisted AI generation params (openimago-ciqk), tolerating absence
 *  and unknown shapes. Returns null when no usable params are present. */
function mapGenerationParams(v: unknown): ShotGenerationParams | null {
  if (typeof v !== 'object' || v === null) return null
  const raw = v as Record<string, unknown>
  const out: ShotGenerationParams = {}
  if (typeof raw['prompt'] === 'string') out.prompt = raw['prompt']
  if (typeof raw['model'] === 'string') out.model = raw['model']
  if (typeof raw['aspectRatio'] === 'string') out.aspectRatio = raw['aspectRatio']
  if (typeof raw['durationSeconds'] === 'number') out.durationSeconds = raw['durationSeconds']
  return Object.keys(out).length > 0 ? out : null
}

// ── Workflow → nodes ──────────────────────────────────────────────────────────

export function rawWorkflowToNodeSummaries(
  workflow: OpenimagoStoryWorkflow,
): StoryWorkflowNodeSummary[] {
  return (workflow.nodes ?? []).map((node) => {
    return {
      id: safeStr(node['id']) || '',
      shotId: safeStr(node['shotId']) || '',
      toolKind: isStatus(node['toolKind'] ?? node['tool'], ['image_generate', 'video_generate', 'image_edit'] as const) ?? 'image_generate',
      label: safeStr(node['label']) || safeStr(node['name']) || '',
      promptTemplate: safeStr(node['promptTemplate']) || safeStr(node['prompt']) || '',
      model: safeStr(node['model']) || null,
      aspectRatio: safeStr(node['aspectRatio']) || safeStr(node['aspect']) || null,
      dependsOn: safeStrArr(node['dependsOn']) ?? safeStrArr(node['inputsFrom']),
      latestRunId: safeStr(node['latestRunId']) || safeStr(node['lastRunId']) || null,
    }
  })
}

// ── Runs → run summaries ──────────────────────────────────────────────────────

/** Guard: extract a nested record (object) safely, returns empty record otherwise. */
function safeRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {}
}

export function rawRunsToRunSummaries(runs: OpenimagoStoryRuns): StoryRunSummary[] {
  return (runs.runs ?? []).map((run) => {
    // Real schema (ADR 0004, docs/story-schema/runs/ep_001.runs.json) nests the
    // artifact + access URLs under `run.result`; running/queued runs omit it.
    const result = safeRecord(run['result'])
    const access = safeRecord(result['access'])
    // Precomputed filmstrip sprite (openimago-78m9): URL on result.access.filmstrip,
    // dims on result.filmstrip { frameCount, frameW, frameH }.
    const filmstripMeta = safeRecord(result['filmstrip'])
    return {
      id: safeStr(run['id']) || '',
      nodeId: safeStr(run['nodeId']) || safeStr(run['toolNodeId']) || '',
      shotId: safeStr(run['shotId']) || '',
      status: isStatus(run['status'], ['queued', 'running', 'completed', 'failed'] as const) ?? 'queued',
      startedAt: safeStr(run['startedAt']) || safeStr(run['createdAt']) || '',
      completedAt: safeStr(run['completedAt']) || safeStr(run['finishedAt']) || null,
      model: safeStr(run['model']) || '',
      prompt: safeStr(run['prompt']) || safeStr(run['inputPrompt']) || '',
      resultArtifactId:
        safeStr(result['artifactId'])
        || safeStr(run['resultArtifactId'])
        || safeStr(run['artifactId'])
        || null,
      kind: isStatus(result['kind'], ['image', 'video', 'audio'] as const) ?? null,
      mime: safeStr(result['mime']) || null,
      thumbnailUrl: safeStr(access['thumbnail']) || null,
      previewUrl: safeStr(access['preview']) || null,
      filmstripUrl: safeStr(access['filmstrip']) || null,
      filmstripFrameCount: safeNum(filmstripMeta['frameCount']),
      filmstripFrameW: safeNum(filmstripMeta['frameW']),
      filmstripFrameH: safeNum(filmstripMeta['frameH']),
      durationSeconds: safeNum(result['duration']),
      error: safeStr(run['error']) || safeStr(run['errorMessage']) || null,
    }
  })
}
