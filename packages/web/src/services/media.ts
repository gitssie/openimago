// ── MediaToolOutputV1 Protocol ───────────────────────────────────────────────
//
// Implements ADR 0002 media ToolCall output parsing for inline chatbot rendering.
// Detects media tool prefixes (image_*, video_*, audio_*) and validates
// ToolPart.state.output against the MediaToolOutputV1 contract.
//
// See: docs/adr/0002-media-toolcall-workspace-files.md

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MediaAccessLocator {
  /** Opaque browser-loadable string. Frontend must not parse or construct it. */
  href: string
  /** Optional hint only; identity and authorization must not depend on this. */
  expiresAt?: string
}

export interface MediaToolResultV1 {
  /** Stable domain identity. This is the only durable identifier. */
  workspaceFileId: string

  /** Browser-loadable access locators. These are not identity. */
  access: {
    preview: MediaAccessLocator
    download?: MediaAccessLocator
    thumbnail?: MediaAccessLocator
    poster?: MediaAccessLocator
  }

  mime: string
  filename?: string
  width?: number
  height?: number
  duration?: number
  seed?: number
  createdAt?: string
  metadata?: Record<string, unknown>
}

export interface MediaToolOutputV1 {
  version: 1
  kind: 'image' | 'video' | 'audio'
  status: 'completed'
  result: MediaToolResultV1
  prompt?: string
  provider?: string
  model?: string
  metadata?: Record<string, unknown>
}

const MEDIA_KINDS = ['image', 'video', 'audio'] as const
export type MediaKind = (typeof MEDIA_KINDS)[number]

// ── Detection ──────────────────────────────────────────────────────────────────

/** Map of media tool name prefixes. Built from ADR 0002 naming convention. */
const MEDIA_TOOL_PREFIXES: Record<string, MediaKind> = {
  image_generate: 'image',
  image_edit: 'image',
  image_upscale: 'image',
  image_variation: 'image',
  video_generate: 'video',
  video_image_to_video: 'video',
  video_extend: 'video',
  audio_generate: 'audio',
  audio_tts: 'audio',
  audio_music: 'audio',
  audio_sfx: 'audio',
}

/**
 * Checks whether a tool name starts with a known media prefix.
 * Matches `image_*`, `video_*`, `audio_*` prefixes.
 */
export function isMediaToolName(name: string): boolean {
  // Strip any trailing detail (tool names may have additional segments)
  return name.startsWith('image_') || name.startsWith('video_') || name.startsWith('audio_')
}

/**
 * Resolve the expected media kind from a tool name.
 * Returns undefined for non-media tools.
 */
export function resolveMediaKind(toolName: string): MediaKind | undefined {
  // Exact match first
  if (toolName in MEDIA_TOOL_PREFIXES) {
    return MEDIA_TOOL_PREFIXES[toolName]
  }
  // Prefix-based fallback
  if (toolName.startsWith('image_')) return 'image'
  if (toolName.startsWith('video_')) return 'video'
  if (toolName.startsWith('audio_')) return 'audio'
  return undefined
}

// ── Parsing ────────────────────────────────────────────────────────────────────

function isMediaKind(value: unknown): value is MediaKind {
  return typeof value === 'string' && (MEDIA_KINDS as readonly string[]).includes(value)
}

/**
 * Parse and validate a ToolPart.state.output string as MediaToolOutputV1.
 *
 * Protocol rules (per ADR 0002):
 *   - output.version MUST be 1
 *   - output.status MUST be 'completed'
 *   - output.kind MUST be a valid media kind
 *   - result.workspaceFileId MUST exist
 *   - result.access.preview.href MUST exist
 *   - If expectedKind is provided, output.kind MUST match it
 *
 * Returns null on any protocol violation — silently falls back to existing
 * AgentToolCall output behavior (dev console warning acceptable per ADR).
 */
export function parseMediaToolOutput(
  output: string | undefined | null,
  expectedKind?: MediaKind,
): MediaToolOutputV1 | null {
  if (!output) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(output)
  } catch {
    // Bad JSON — protocol violation
    return null
  }

  if (typeof parsed !== 'object' || parsed === null) return null

  const obj = parsed as Record<string, unknown>

  // Version check
  if (obj.version !== 1) return null

  // Status check
  if (obj.status !== 'completed') return null

  // Kind check
  if (!isMediaKind(obj.kind)) return null

  // Kind mismatch check (tool prefix vs output kind)
  if (expectedKind !== undefined && obj.kind !== expectedKind) return null

  // Result structural check
  const result = obj.result
  if (typeof result !== 'object' || result === null) return null

  const r = result as Record<string, unknown>
  if (typeof r.workspaceFileId !== 'string' || !r.workspaceFileId) return null
  if (typeof r.mime !== 'string' || !r.mime) return null

  // Access locators check
  const access = r.access
  if (typeof access !== 'object' || access === null) return null

  const a = access as Record<string, unknown>
  const preview = a.preview
  if (typeof preview !== 'object' || preview === null) return null

  const p = preview as Record<string, unknown>
  if (typeof p.href !== 'string' || !p.href) return null

  // All required fields validated above — narrow to concrete types
  const kind = obj.kind
  const workspaceFileId = r.workspaceFileId
  const mime = r.mime

  // Build access locators with proper runtime type checks
  const accessResult: MediaToolResultV1['access'] = {
    preview: { href: p.href },
  }

  if (a.download && typeof a.download === 'object' && a.download !== null) {
    const downloadRef = a.download as Record<string, unknown>
    if (typeof downloadRef.href === 'string' && downloadRef.href) {
      accessResult.download = { href: downloadRef.href }
    }
  }

  if (a.thumbnail && typeof a.thumbnail === 'object' && a.thumbnail !== null) {
    const thumbRef = a.thumbnail as Record<string, unknown>
    if (typeof thumbRef.href === 'string' && thumbRef.href) {
      accessResult.thumbnail = { href: thumbRef.href }
    }
  }

  if (a.poster && typeof a.poster === 'object' && a.poster !== null) {
    const posterRef = a.poster as Record<string, unknown>
    if (typeof posterRef.href === 'string' && posterRef.href) {
      accessResult.poster = { href: posterRef.href }
    }
  }

  return {
    version: 1 as const,
    kind,
    status: 'completed' as const,
    result: {
      workspaceFileId,
      mime,
      access: accessResult,
      ...(typeof r.filename === 'string' ? { filename: r.filename } : {}),
      ...(typeof r.width === 'number' ? { width: r.width } : {}),
      ...(typeof r.height === 'number' ? { height: r.height } : {}),
      ...(typeof r.duration === 'number' ? { duration: r.duration } : {}),
      ...(typeof r.seed === 'number' ? { seed: r.seed } : {}),
      ...(typeof r.createdAt === 'string' ? { createdAt: r.createdAt } : {}),
      ...(typeof r.metadata === 'object' && r.metadata !== null ? { metadata: r.metadata as Record<string, unknown> } : {}),
    },
    ...(typeof obj.prompt === 'string' ? { prompt: obj.prompt } : {}),
    ...(typeof obj.provider === 'string' ? { provider: obj.provider } : {}),
    ...(typeof obj.model === 'string' ? { model: obj.model } : {}),
    ...(typeof obj.metadata === 'object' && obj.metadata !== null
      ? { metadata: obj.metadata as Record<string, unknown> }
      : {}),
  }
}
