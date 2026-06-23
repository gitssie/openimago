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
import type { PreviewVM, PreviewKind } from '../PreviewPane.vue'

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
 * token of the element id. URL-agnostic — callers gate on thumbnail/preview.
 */
function runNodeMatchesElement(run: StoryRunSummary, elementId: string, wantKind: 'image' | 'audio'): boolean {
  if (run.status !== 'completed' || run.kind !== wantKind) return false
  const node = run.nodeId.toLowerCase()
  return slugTokens(elementId).some((t) => node.includes(t))
}

/** As runNodeMatchesElement, additionally requiring a thumbnail URL. */
function runMatchesElement(run: StoryRunSummary, elementId: string, wantKind: 'image' | 'audio'): boolean {
  return Boolean(run.thumbnailUrl) && runNodeMatchesElement(run, elementId, wantKind)
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

// ── 中央预览 (PreviewPane) ─────────────────────────────────────────────────────
//
// The center PreviewPane is selection-driven: a {section,id} picks one card from
// one of the three left lists and shows its big media. Media URL derivation lives
// here (pure) so the page only owns the selection ref.

/** Which left section a selection points at (mirrors PreviewVM.section). */
export type PreviewSection = 'element' | 'shot' | 'audio'

/** A cross-section selection: which list, and which card id within it. */
export interface PreviewSelection {
  section: PreviewSection
  id: string
}

/** The three ordered card lists the PreviewPane steps through. */
export interface PreviewLists {
  elements: ElementCardVM[]
  shots: ShotCardVM[]
  audio: AudioCardVM[]
}

/** The canonical empty preview (nothing selected). */
export function emptyPreview(): PreviewVM {
  return { id: '', section: 'element', kind: 'empty', title: '', mediaUrl: null, hasPrev: false, hasNext: false }
}

/** The ordered id list for a section (for prev/next + index lookup). */
function sectionIds(section: PreviewSection, lists: PreviewLists): string[] {
  if (section === 'shot') return lists.shots.map((s) => s.id)
  if (section === 'audio') return lists.audio.map((a) => a.id)
  return lists.elements.map((e) => e.id)
}

/** First completed run of `wantKind` that matches a concept/global element id. */
function elementPreviewRun(
  elementId: string,
  runs: StoryRunSummary[],
  wantKind: 'image' | 'audio',
): StoryRunSummary | undefined {
  return runs.find(
    (run) => !run.shotId && run.previewUrl && runNodeMatchesElement(run, elementId, wantKind),
  )
}

/** First completed run of `wantKind` for a specific shot. */
function shotPreviewRun(
  shotId: string,
  runs: StoryRunSummary[],
  wantKind: 'video' | 'audio',
): StoryRunSummary | undefined {
  return runs.find(
    (run) => run.shotId === shotId && run.status === 'completed' && run.previewUrl && run.kind === wantKind,
  )
}

/** Build the media half of a PreviewVM (kind + url + optional model label). */
function previewMedia(
  selection: PreviewSelection,
  runs: StoryRunSummary[],
): { kind: PreviewKind; mediaUrl: string | null; modelLabel?: string } {
  if (selection.section === 'element') {
    const run = elementPreviewRun(selection.id, runs, 'image')
    return { kind: 'image', mediaUrl: run?.previewUrl ?? null, ...(run?.model ? { modelLabel: run.model } : {}) }
  }
  if (selection.section === 'shot') {
    const run = shotPreviewRun(selection.id, runs, 'video')
    return { kind: 'video', mediaUrl: run?.previewUrl ?? null, ...(run?.model ? { modelLabel: run.model } : {}) }
  }
  // audio: prefer a global (shotId-null) audio run for this element.
  const run = elementPreviewRun(selection.id, runs, 'audio')
  return { kind: 'audio', mediaUrl: run?.previewUrl ?? null, ...(run?.model ? { modelLabel: run.model } : {}) }
}

/** Human title for the selected card across the three sections. */
function selectionTitle(selection: PreviewSelection, lists: PreviewLists): string | undefined {
  if (selection.section === 'shot') return lists.shots.find((s) => s.id === selection.id)?.title
  if (selection.section === 'audio') return lists.audio.find((a) => a.id === selection.id)?.title
  return lists.elements.find((e) => e.id === selection.id)?.title
}

/**
 * Project the current {section,id} selection into a PreviewVM for the center
 * PreviewPane. Returns the empty preview when nothing is selected or the id is
 * not present in its section list. Media url is best-effort (null when no run
 * matches); title/kind/nav still resolve so the pane renders the chrome.
 */
export function mapSelectedPreview(
  selection: PreviewSelection | null,
  lists: PreviewLists,
  runs: StoryRunSummary[],
): PreviewVM {
  if (!selection) return emptyPreview()
  const ids = sectionIds(selection.section, lists)
  const idx = ids.indexOf(selection.id)
  if (idx < 0) return emptyPreview()

  const title = selectionTitle(selection, lists) ?? selection.id
  const media = previewMedia(selection, runs)
  return {
    id: selection.id,
    section: selection.section,
    title,
    hasPrev: idx > 0,
    hasNext: idx < ids.length - 1,
    ...media,
  }
}

/**
 * Step the selection one item within its own section. Returns the new selection,
 * or null when stepping past either end (the caller keeps the current selection).
 */
export function stepPreviewSelection(
  selection: PreviewSelection,
  direction: 'prev' | 'next',
  lists: PreviewLists,
): PreviewSelection | null {
  const ids = sectionIds(selection.section, lists)
  const idx = ids.indexOf(selection.id)
  if (idx < 0) return null
  const nextIdx = direction === 'next' ? idx + 1 : idx - 1
  if (nextIdx < 0 || nextIdx >= ids.length) return null
  return { section: selection.section, id: ids[nextIdx]! }
}
