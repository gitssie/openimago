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
