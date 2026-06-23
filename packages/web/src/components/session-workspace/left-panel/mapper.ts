/**
 * Left-panel view-model mappers (openimago-1omg).
 *
 * Pure functions that project the story summary types (bible / shots / runs)
 * into the three card view-models the redesigned 故事板 accordion consumes
 * (ElementCardVM / ShotCardVM / AudioCardVM, see ./types). No fetching, no Vue.
 *
 * Thumbnail association — the run summary (StoryRunSummary) carries `nodeId`,
 * `shotId`, `kind` and `thumbnailUrl`, but no explicit element id. The seed
 * workflow encodes the element in the node id by convention
 * (`n01-char-kai-concept`, `n04-scene-neon-alley`, `n15-bgm-neon-pulse`), so a
 * concept/global run is linked to an element by testing whether the run's
 * `nodeId` contains a meaningful slug token of the element id. The kind axis
 * (image for concept art, audio for narration/BGM) keeps the two from
 * cross-matching. The match degrades gracefully to an empty thumbnail row when
 * the convention does not hold (real provider work is a follow-up).
 */
import type {
  StoryAudioElementSummary,
  StoryBibleSummary,
  StoryCharacterSummary,
  StoryRunSummary,
  StorySceneSummary,
  StoryShotSummary,
} from '../types'
import type {
  AudioCardVM,
  CharacterChipVM,
  ElementCardVM,
  ShotCardVM,
  ShotMediaThumb,
} from './types'

/** Slug tokens of length >= 3 (drops filler like "the"/"a" only by length). */
function slugTokens(id: string): string[] {
  return id
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3)
}

/**
 * Does a completed run of the wanted media kind link to `elementId` via the
 * node-id naming convention? True when the run's nodeId contains any meaningful
 * token of the element id.
 */
function runMatchesElement(run: StoryRunSummary, elementId: string, wantKind: 'image' | 'audio'): boolean {
  if (run.status !== 'completed' || run.kind !== wantKind) return false
  if (!run.thumbnailUrl) return false
  const node = run.nodeId.toLowerCase()
  return slugTokens(elementId).some((t) => node.includes(t))
}

/**
 * Concept/global thumbnails for one element: completed runs with no shotId
 * (concept art / global audio) of the wanted kind whose nodeId matches the
 * element. Preserves run order; de-dupes identical URLs.
 */
function elementThumbnails(
  elementId: string,
  runs: StoryRunSummary[],
  wantKind: 'image' | 'audio',
): string[] {
  const out: string[] = []
  for (const run of runs) {
    if (run.shotId) continue
    if (!runMatchesElement(run, elementId, wantKind)) continue
    const url = run.thumbnailUrl!
    if (!out.includes(url)) out.push(url)
  }
  return out
}

// ── 关键元素 (elements) ← bible characters + scenes ────────────────────────────

function characterToElement(c: StoryCharacterSummary, runs: StoryRunSummary[]): ElementCardVM {
  return {
    id: c.id,
    kind: 'character',
    title: c.displayName,
    description: c.description,
    thumbnails: elementThumbnails(c.id, runs, 'image'),
  }
}

function sceneToElement(s: StorySceneSummary, runs: StoryRunSummary[]): ElementCardVM {
  return {
    id: s.id,
    kind: 'scene',
    title: s.displayName,
    description: s.description,
    thumbnails: elementThumbnails(s.id, runs, 'image'),
  }
}

export function mapElementCards(bible: StoryBibleSummary, runs: StoryRunSummary[]): ElementCardVM[] {
  return [
    ...bible.characters.map((c) => characterToElement(c, runs)),
    ...bible.scenes.map((s) => sceneToElement(s, runs)),
  ]
}

// ── 分镜 (shots) ← episode shots ──────────────────────────────────────────────

/** First matching character concept-run thumbnail, used as a chip avatar. */
function characterAvatar(characterId: string, runs: StoryRunSummary[]): string | null {
  return elementThumbnails(characterId, runs, 'image')[0] ?? null
}

function shotMedia(shotId: string, runs: StoryRunSummary[]): ShotMediaThumb[] {
  const video: ShotMediaThumb[] = []
  const audio: ShotMediaThumb[] = []
  for (const run of runs) {
    if (run.shotId !== shotId || run.status !== 'completed' || !run.thumbnailUrl) continue
    if (run.kind === 'video') video.push({ url: run.thumbnailUrl, kind: 'video' })
    else if (run.kind === 'audio') audio.push({ url: run.thumbnailUrl, kind: 'audio' })
  }
  // Video thumbs first, then audio thumbs (the design mixes both rows).
  return [...video, ...audio]
}

export function mapShotCards(
  shots: StoryShotSummary[],
  bible: StoryBibleSummary,
  runs: StoryRunSummary[],
): ShotCardVM[] {
  const charById = new Map(bible.characters.map((c) => [c.id, c]))
  const sceneById = new Map(bible.scenes.map((s) => [s.id, s]))

  return shots.map((shot) => {
    const characters: CharacterChipVM[] = shot.characterIds.flatMap((id) => {
      const c = charById.get(id)
      if (!c) return []
      return [{ id: c.id, name: c.displayName, avatarUrl: characterAvatar(c.id, runs) }]
    })

    const scene = sceneById.get(shot.sceneId)
    const card: ShotCardVM = {
      id: shot.id,
      title: `镜头 ${String(shot.shotNumber).padStart(2, '0')}`,
      characters,
      description: shot.description,
      status: shot.status,
      media: shotMedia(shot.id, runs),
      ...(scene ? { sceneLabel: scene.displayName } : {}),
      ...(shot.durationEstimate != null ? { durationLabel: `约 ${shot.durationEstimate}s` } : {}),
    }
    return card
  })
}

// ── 旁白与音乐 (audio) ← bible audioElements + global audio runs ──────────────

function audioElementToCard(el: StoryAudioElementSummary, runs: StoryRunSummary[]): AudioCardVM {
  return {
    id: el.id,
    title: el.displayName,
    description: el.description,
    thumbnails: elementThumbnails(el.id, runs, 'audio'),
    ...(el.timingNote ? { timingNote: el.timingNote } : {}),
  }
}

export function mapAudioCards(bible: StoryBibleSummary, runs: StoryRunSummary[]): AudioCardVM[] {
  return bible.audioElements.map((el) => audioElementToCard(el, runs))
}
