// ── WorkspaceArtifact — unified artifact shape (ADR 0003) ──────────────────
//
// Shared by WorkspaceArtifactsPanel for both session-scoped and
// project-scoped artifact display. Maps to MediaToolResultV1 (ADR 0002)
// but flattens access locators for panel rendering.

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
}

export type WorkspaceScope = 'session' | 'project'
