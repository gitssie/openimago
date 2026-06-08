// ── WorkspaceArtifact — unified artifact shape (ADR 0003) ──────────────────
//
// Shared by WorkspaceArtifactsPanel for both session-scoped and
// project-scoped artifact display. Maps to MediaToolResultV1 (ADR 0002)
// but flattens access locators for panel rendering.

// ── Generation-run metadata (ADR 0003, openimago-xkn) ────────────────────
//
// Carries tool-call identity, input arguments, and parent lineage for
// artifact-first rerun. Surfaces enough data for the WorkspaceArtifactsPanel
// parameter editor to show prompt-first params plus advanced JSON.

export interface GenerationRunMetadata {
  /** Tool name that generated this artifact (e.g. "image_generate"). */
  toolName: string
  /** OpenCode tool-call ID for traceability. */
  toolCallId: string
  /** Chat message ID containing the tool call. */
  messageId: string
  /** Full input arguments to the tool call (provider params, prompt, etc.).
   *  The parameter editor surfaces prompt + common fields first; everything
   *  else goes into the advanced JSON editor. */
  inputArgs: Record<string, unknown>
  /** Parent artifact ID when this was created from a rerun/edit of another
   *  artifact. Immutably links rerun output to source artifact. */
  parentArtifactId?: string
}

export interface WorkspaceArtifact {
  /** Stable identity. Maps to workspaceFileId or project file id. */
  id: string
  kind: 'image' | 'video' | 'audio'

  /** Opaque access locators from ADR 0002 protocol. */
  access: {
    preview?: string
    download?: string
    thumbnail?: string
    poster?: string
  }

  filename?: string
  prompt?: string
  provider?: string
  model?: string
  width?: number
  height?: number
  duration?: number
  seed?: number

  /** Human-readable relative time label (e.g. "3 分钟前"). */
  timeLabel: string

  /** Generation-run metadata for parameter editor / rerun UX.
   *  Populated when the artifact was produced by a tool call with preserved
   *  gen-run data. Legacy artifacts created before openimago-xkn may lack this. */
  genRun?: GenerationRunMetadata
}

// ── Panel events (ADR 0003) ─────────────────────────────────────────────

export interface ArtifactRerunPayload {
  artifactId: string
  prompt?: string
  negativePrompt?: string
  model?: string
  aspectRatio?: string
  duration?: number
  seed?: number
  /** Advanced full-input-args update for tool-specific JSON editor. */
  inputArgs?: Record<string, unknown>
}

export type WorkspaceScope = 'session' | 'project'

// ── Story UI shapes (ADR 0004, openimago-ntd) ─────────────────────────────
//
// These are *read-only* summary projections that the ProjectWorkspaceStoryPanel
// renders. They are intentionally *not* the on-disk story JSON shape (see
// docs/adr/0004-story-state-json-schema.md) — they are the flattened, UI-ready
// shape that the page derives before handing them to the panel.
//
// Naming convention:
//   `Story*Summary` — read-only view models (UI consumes, never mutates)
//   `Story*Intent`   — emit payloads for future edit/regenerate affordances
//
// The coder is expected to:
//   1. Fetch raw story JSON via `api.projectStoryBible/Series/Episode/...`
//   2. Map raw fields into the `Story*Summary` shapes below
//   3. Pass them as props; the panel does not know about the filesystem

/** Lightweight bible character projection (ADR 0004 BibleCharacter, flattened). */
export interface StoryCharacterSummary {
  id: string
  displayName: string
  role: 'protagonist' | 'antagonist' | 'supporting' | 'extra'
  description: string
  visualNotes: string
  thumbnailUrl: string | null
  referenceArtifactIds: string[]
  tags: string[]
}

/** Lightweight bible scene projection (ADR 0004 BibleScene, flattened). */
export interface StorySceneSummary {
  id: string
  displayName: string
  /** ADR 0004 enumerates 'interior' | 'exterior' | 'abstract'. The panel is
   *  permissive on the read path because on-disk JSON may have free-form
   *  variants as the schema evolves. */
  type: string
  description: string
  mood: string
  lighting: string
  thumbnailUrl: string | null
  referenceArtifactIds: string[]
  tags: string[]
}

/** Lightweight style-seed projection (ADR 0004 StyleSeed, flattened). */
export interface StoryStyleSeedSummary {
  id: string
  displayName: string
  description: string
  visualStyle: string
  colorPalette: string[]
  thumbnailUrl: string | null
  referenceArtifactIds: string[]
}

/** Lightweight bible container — the canon reference. */
export interface StoryBibleSummary {
  schemaVersion: number
  worldName: string
  worldDescription: string
  era: string
  moodKeywords: string[]
  visualStyleNotes: string
  characters: StoryCharacterSummary[]
  scenes: StorySceneSummary[]
  styleSeeds: StoryStyleSeedSummary[]
  updatedAt: string | null
}

/** Series/episode index entry (ADR 0004 SeriesEpisodeEntry, flattened). */
export interface StoryEpisodeSummary {
  id: string
  episodeNumber: number
  title: string
  status: 'draft' | 'storyboard' | 'generating' | 'review' | 'done'
  shotCount: number
  durationEstimate: number | null
  logline: string
  synopsis: string
  updatedAt: string | null
}

/** Single dialog line within a shot (ADR 0004 ShotDialog, flattened). */
export interface StoryShotDialog {
  characterId: string
  text: string
  emotion: string | null
}

/** Single shot within an episode (ADR 0004 EpisodeShot, flattened). */
export interface StoryShotSummary {
  id: string
  shotNumber: number
  sceneId: string
  description: string
  visualPrompt: string
  cameraNotes: string
  lightingNotes: string
  dialog: StoryShotDialog[]
  characterIds: string[]
  referenceArtifactIds: string[]
  status: 'pending' | 'in_progress' | 'generated' | 'review' | 'approved'
  durationEstimate: number | null
  /** Optional: latest run for this shot (most-recent first). */
  latestRunId: string | null
}

/** Single workflow node (ADR 0004 WorkflowNode, flattened). */
export interface StoryWorkflowNodeSummary {
  id: string
  shotId: string
  toolKind: 'image_generate' | 'video_generate' | 'image_edit'
  label: string
  promptTemplate: string
  model: string | null
  aspectRatio: string | null
  dependsOn: string[]
  /** Optional latest run for this node. */
  latestRunId: string | null
}

/** Single run entry (ADR 0004 GenerationRun, flattened). */
export interface StoryRunSummary {
  id: string
  nodeId: string
  shotId: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  startedAt: string
  completedAt: string | null
  model: string
  prompt: string
  resultArtifactId: string | null
  error: string | null
}

/** Selection emitted when the user picks a story entity. */
export type StorySelection =
  | { kind: 'episode'; id: string }
  | { kind: 'scene'; id: string }
  | { kind: 'shot'; id: string }
  | { kind: 'character'; id: string }
  | { kind: 'styleSeed'; id: string }

/**
 * Future-affordance intent — read-only MVP emits these for the coder to wire.
 * The panel itself does not perform edits or rerun generations.
 */
export type StoryEditIntent =
  | { kind: 'edit-shot'; episodeId: string; shotId: string }
  | { kind: 'regenerate-shot'; episodeId: string; shotId: string }
  | { kind: 'regenerate-run'; episodeId: string; runId: string }
  | { kind: 'open-artifact'; episodeId: string; artifactId: string }
