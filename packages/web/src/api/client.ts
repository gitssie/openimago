import { useAuthStore } from 'src/stores/auth'

/** Error carrying the HTTP status so callers can branch (e.g. 409 conflict). */
export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function apiUrl(path: string): string {
  return path
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const auth = useAuthStore()
  const currentToken = auth.token
  const headers: Record<string, string> = {}
  // Only set Content-Type for JSON bodies; for FormData, let the browser auto-set with boundary
  const isFormData = options.body instanceof FormData
  if (!isFormData) {
    headers['Content-Type'] = 'application/json'
  }
  if (auth.token) headers['Authorization'] = `Bearer ${auth.token}`
  const res = await fetch(apiUrl(path), { ...options, headers })
  const contentType = res.headers.get('content-type') ?? ''
  const isJson = contentType.includes('application/json')
  if (!res.ok) {
    const err = isJson
      ? await res.json().catch(() => ({ message: res.statusText }))
      : { message: await res.text().catch(() => res.statusText) || res.statusText }
    if (res.status === 401 && auth.token === currentToken) {
      auth.clearAuth()
      auth.requestReauth()
    }
    throw new ApiError(err.message || err.error?.message || `HTTP ${res.status}`, res.status)
  }
  if (res.status === 204) return undefined as T
  if (!isJson) {
    const body = await res.text().catch(() => '')
    const returnedHtml = /^\s*<!doctype html|<html[\s>]/i.test(body)
    throw new Error(returnedHtml
      ? 'API returned HTML. Check Quasar dev proxy: requests must hit the openimago backend, not the OpenCode UI.'
      : `Expected JSON response from ${path}`)
  }
  return res.json()
}

export interface SessionInfo {
  id: string
  title?: string
  projectID?: string
  projectId?: string
  time?: { created?: number }
  directory?: string
  createdAt?: string
  time_created?: number
  time_updated?: number
}

function normalizeSessionResponse(response: { items?: SessionInfo[] } | SessionInfo[]): SessionInfo[] {
  if (Array.isArray(response)) return response
  return response.items ?? []
}

function normalizeMessageResponse(response: { items?: Record<string, unknown>[] } | Record<string, unknown>[]): Record<string, unknown>[] {
  if (Array.isArray(response)) return response
  return response.items ?? []
}

export interface OpenimagoUser {
  id: string
  username: string
  email: string
  emailVerified?: boolean
  emailVerifiedAt?: string | null
  role: string
  displayName?: string
  workspaceId?: string
  createdAt?: string
  updatedAt?: string
}

export interface AuthResponse {
  token: string
  user: OpenimagoUser
  requiresEmailVerification?: boolean
  verificationCodeSent?: boolean
}

export interface OpenimagoProject {
  id: string
  name: string
  description?: string
  directory: string
  status: 'active' | 'archived'
  sessionCount?: number
  totalCost?: number
  lastActivityAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface OpenimagoAsset {
  id: string
  name?: string
  filename?: string
  url?: string
  thumbnailUrl?: string
  type: string
  createdAt: string
}

export interface PromptTemplate {
  id: string
  title: string
  content: string
  tags?: string[]
  createdAt: string
  updatedAt: string
}

// ── Workspace Generated Files (ADR 0002) ─────────────────────────────────────
//
// WorkspaceFile mirrors the workspace-files API response shape and is
// structurally aligned with MediaToolResultV1 from services/media.ts.
// The two types represent the same domain entity viewed from different
// consumers (right-side panel vs chatbot inline card).

import type { MediaToolResultV1 } from '../services/media'

import type { GenerationRunMetadata } from '../components/session-workspace/types'

export type { MediaAccessLocator } from '../services/media'
export type { GenerationRunMetadata }

export interface WorkspaceFileAccessLocator {
  href: string
  expiresAt?: string
}

export interface WorkspaceFile extends Omit<MediaToolResultV1, 'access' | 'createdAt'> {
  kind: 'image' | 'video' | 'audio'
  /** Backend API always returns createdAt (ISO string). Required, unlike MediaToolResultV1 where it's optional for inline history. */
  createdAt: string
  access: {
    preview: WorkspaceFileAccessLocator
    download?: WorkspaceFileAccessLocator
    thumbnail?: WorkspaceFileAccessLocator
    poster?: WorkspaceFileAccessLocator
  }
  prompt?: string
  provider?: string
  model?: string
  /** Generation-run metadata surfaced from workspaceGeneratedFiles.metadata.
   *  Present when the file was registered with gen-run data (ADR 0003).
   *  Legacy files created before openimago-xkn may lack this field. */
  generationRun?: GenerationRunMetadata
}

// ── Story Types (ADR 0004, openimago-1a3) ─────────────────────────────────────
//
// Mirror the scaffold JSON shapes from ProjectService.scaffoldProjectFiles().
// These are read-only types used by the story API bridge.

export interface OpenimagoStoryManifest {
  schemaVersion: number
  projectId: string
  createdAt: string
  storyPath: string
  outputsPath: string
}

export interface OpenimagoStoryBible {
  schemaVersion: number
  projectId: string
  world: {
    name: string
    description: string
    era: string
    moodKeywords: string[]
    visualStyleNotes: string
  }
  characters: Record<string, unknown>[]
  scenes: Record<string, unknown>[]
  styleSeeds: Record<string, unknown>[]
  updatedAt: string
}

export interface OpenimagoStorySeries {
  schemaVersion: number
  projectId: string
  title: string
  description: string
  status: string
  episodes: Record<string, unknown>[]
  updatedAt: string
}

export interface OpenimagoStoryEpisode {
  schemaVersion: number
  id: string
  episodeNumber: number
  title: string
  logline: string
  synopsis: string
  status: string
  shots: Record<string, unknown>[]
  updatedAt: string
}

/** A shot appended via the story write API (ADR 0005). */
export interface OpenimagoEpisodeShot {
  id: string
  shotNumber: number
  sceneId: string
  description: string
  cameraNotes: string
  lightingNotes: string
  dialog: Record<string, unknown>[]
  characterIds: string[]
  referenceArtifactIds: string[]
  status: string
}

/** A generation run returned by the mock generate endpoint (ADR 0005). */
export interface OpenimagoGenerationRun {
  id: string
  nodeId: string
  shotId: string
  status: string
  params: { prompt: string; model: string }
  result: {
    artifactId: string
    kind: string
    mime: string
    filename: string
    access: { preview: string; thumbnail: string }
  }
  startedAt: string
  completedAt: string
}

export interface OpenimagoStoryWorkflow {
  schemaVersion: number
  episodeId: string
  nodes: Record<string, unknown>[]
  edges: Record<string, unknown>[]
}

export interface OpenimagoStoryRuns {
  schemaVersion: number
  episodeId: string
  runs: Record<string, unknown>[]
}

// ── Episode Cut (ADR 0006 — edit layer, story/cuts/ep_NNN.cut.json) ────────────

export interface OpenimagoCutClip {
  id: string
  sourceShotId: string
  inPoint: number
  outPoint: number
  order: number
}

export interface OpenimagoCutTransition {
  afterClipId: string
  kind: string
  durationSeconds: number
}

export interface OpenimagoCutAudioRef {
  artifactId: string
  gainDb?: number
  inPoint?: number
  outPoint?: number
}

export interface OpenimagoEpisodeCut {
  schemaVersion: number
  episodeId: string
  clips: OpenimagoCutClip[]
  transitions: OpenimagoCutTransition[]
  bgm?: OpenimagoCutAudioRef
  updatedAt: string
}

// ── Billing ──────────────────────────────────────────────────────────────────

export interface BillingAccount {
  id: string
  ownerType: string
  ownerId: string
  currency: string
  balanceMicros: number
  minimumBalanceMicros: number
  creditLimitMicros: number
  status: string
  createdAt: string
  updatedAt: string
}

export interface BillingLedgerEntry {
  id: string
  accountId: string
  userId: string
  workspaceId: string | null
  projectId: string | null
  sessionId: string | null
  entryType: string
  sourceType: string
  sourceId: string
  sourceStatus: string
  provider: string | null
  model: string | null
  toolName: string | null
  mediaKind: string | null
  quantity: number | null
  unit: string | null
  amountMicros: number
  balanceAfterMicros: number
  currency: string
  pricingSnapshot: unknown
  metadata: unknown
  createdAt: string
}

export interface BillingPaymentOrder {
  id: string
  accountId: string
  userId: string
  provider: string
  providerOrderId: string | null
  status: string
  amountMicros: number
  currency: string
  checkoutUrl: string | null
  paidAt: string | null
  expiresAt: string | null
  metadata: unknown
  createdAt: string
  updatedAt: string
}

// ── Gallery ──────────────────────────────────────────────────────────────────

export interface GalleryCard {
  slug: string
  title: string
  category: string
  tags: string[] | null
  thumbnailUrl: string | null
  // Optional rich fields for the home TV/Recommended layouts.
  // Backend may omit any of these; UI degrades gracefully.
  subtitle?: string | null         // English subtitle, e.g. "Echoes of Memory"
  subtitleZh?: string | null       // Chinese subtitle, e.g. "记忆回声"
  duration?: string | null         // e.g. "2:15"
  resolution?: string | null       // e.g. "4K"
  creator?: string | null          // creator handle/name
  categoryLabel?: string | null    // Display label, e.g. "短片"
  isFeatured?: boolean
  // Aspect ratio hint, used for masonry layout
  aspect?: 'wide' | 'square' | 'tall' | null
}

export interface GalleryDetail {
  slug: string
  title: string
  category: string
  tags: string[] | null
  prompt: string
  imageUrl: string | null
  navigation: {
    prevSlug: string | null
    nextSlug: string | null
  }
}

export const api = {
  // Auth — { token, user } / { id, username, ... }
  register: (data: { email: string; password: string }) =>
    request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { email: string; password: string }) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  sendEmailVerification: (email: string) =>
    request<{ success: boolean }>('/auth/email-verification/send', { method: 'POST', body: JSON.stringify({ email }) }),
  verifyEmail: (code: string) =>
    request<{ user: OpenimagoUser }>('/auth/email-verification/verify', { method: 'POST', body: JSON.stringify({ code }) }),
  me: () => request<OpenimagoUser>('/auth/me'),
  updateMe: (data: { displayName?: string; email?: string }) =>
    request<OpenimagoUser>('/auth/me', { method: 'PATCH', body: JSON.stringify(data) }),

  // Projects — { projects: [...] } / { project: {...} }
  listProjects: () =>
    request<{ projects: OpenimagoProject[] }>('/api/platform/projects').then((r) => r.projects ?? []),
  createProject: (data: { name: string; description?: string }) =>
    request<{ project: OpenimagoProject }>('/api/platform/projects', { method: 'POST', body: JSON.stringify(data) }).then((r) => r.project),
  updateProject: (id: string, data: Partial<OpenimagoProject>) =>
    request<{ project: OpenimagoProject }>(`/api/platform/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }).then((r) => r.project),

  // Sessions
  listSessions: () =>
    request<{ items?: SessionInfo[] } | SessionInfo[]>('/api/session').then(normalizeSessionResponse),
  createSession: (data: { projectId?: string }) =>
    request<SessionInfo>('/api/session', { method: 'POST', body: JSON.stringify(data) }),
  sessionMessages: (id: string) =>
    request<{ items?: Record<string, unknown>[] } | Record<string, unknown>[]>(`/api/session/${id}/message`).then(normalizeMessageResponse),
  sendPrompt: (id: string, prompt: string, meta?: Record<string, string>, attachments?: Array<{ id: string; scope: string; filename: string; mime: string }>) => {
    const body: Record<string, unknown> = { prompt }
    if (meta) body.metadata = meta
    if (attachments && attachments.length > 0) body.attachments = attachments
    return request<{ content?: string; message?: string }>(`/api/session/${id}/prompt`, { method: 'POST', body: JSON.stringify(body) })
  },
  abortSession: (id: string) =>
    request<void>(`/api/session/${id}/abort`, { method: 'POST' }),
  deleteSession: (id: string) =>
    request<void>(`/api/session/${id}`, { method: 'DELETE' }),

  // Assets — { items: [...], cursor } / { asset: {...} }
  listAssets: (params?: { type?: string; cursor?: string; order?: string; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.type) qs.set('type', params.type)
    if (params?.cursor) qs.set('cursor', params.cursor)
    if (params?.order) qs.set('order', params.order)
    if (params?.limit) qs.set('limit', String(params.limit))
    const query = qs.toString()
    return request<{ items: OpenimagoAsset[]; cursor?: string }>(`/api/platform/assets${query ? `?${query}` : ''}`).then((r) => r.items ?? [])
  },
  getAsset: (id: string) =>
    request<{ asset: OpenimagoAsset }>(`/api/platform/assets/${id}`).then((r) => r.asset),
  uploadAsset: (file: File, onProgress?: (percent: number) => void): Promise<{ asset: OpenimagoAsset }> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const formData = new FormData()
      formData.append('file', file)

      const auth = useAuthStore()
      const currentToken = auth.token
      xhr.open('POST', apiUrl('/api/platform/assets/upload'))

      if (onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100)
            onProgress(percent)
          }
        }
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText))
          } catch {
            reject(new Error('Invalid response from upload'))
          }
        } else if (xhr.status === 401) {
          if (auth.token === currentToken) {
            auth.clearAuth()
            auth.requestReauth()
          }
          reject(new Error('Unauthorized'))
        } else {
          try {
            const err = JSON.parse(xhr.responseText)
            reject(new Error(err.message || err.error?.message || `Upload failed: HTTP ${xhr.status}`))
          } catch {
            reject(new Error(`Upload failed: HTTP ${xhr.status}`))
          }
        }
      }

      xhr.onerror = () => reject(new Error('Network error during upload'))
      xhr.ontimeout = () => reject(new Error('Upload timed out'))

      if (auth.token) {
        xhr.setRequestHeader('Authorization', `Bearer ${auth.token}`)
      }
      xhr.send(formData)
    })
  },
  deleteAsset: (id: string) =>
    request<{ asset: OpenimagoAsset }>(`/api/platform/assets/${id}`, { method: 'DELETE' }),

  // Temp uploads — { batchId, attachments: [{ id, filename, mimeType, size, status }] }
  uploadTemp: async (files: File[]): Promise<{ batchId: string; attachments: Array<{ id: string; filename: string; mimeType: string; size: number; status: string }> }> => {
    const form = new FormData()
    for (const file of files) {
      form.append('files', file)
    }
    return request<{ batchId: string; attachments: Array<{ id: string; filename: string; mimeType: string; size: number; status: string }> }>(
      '/api/platform/temp-uploads',
      { method: 'POST', body: form },
    )
  },

  // Prompts — { templates: [...], total } / { template: {...} } / { deleted }
  listPrompts: () =>
    request<{ templates: PromptTemplate[] }>('/api/platform/prompts').then((r) => r.templates ?? []),
  createPrompt: (data: { title: string; content: string; tags?: string[] }) =>
    request<{ template: PromptTemplate }>('/api/platform/prompts', { method: 'POST', body: JSON.stringify(data) }).then((r) => r.template),
  updatePrompt: (id: string, data: Partial<PromptTemplate>) =>
    request<{ template: PromptTemplate }>(`/api/platform/prompts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }).then((r) => r.template),
  deletePrompt: (id: string) =>
    request<{ deleted: boolean }>(`/api/platform/prompts/${id}`, { method: 'DELETE' }),

  // Admin — { users: [...], total } / { user: {...} }
  listUsers: () =>
    request<{ users: OpenimagoUser[] }>('/api/admin/users').then((r) => r.users ?? []),
  updateUserRole: (id: string, role: string) =>
    request<{ user: OpenimagoUser }>(`/api/admin/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }).then((r) => r.user),

  // Workspace Generated Files (ADR 0002)
  sessionWorkspaceFiles: (sessionId: string) =>
    request<{ workspaceFiles: WorkspaceFile[] }>(`/api/platform/sessions/${sessionId}/workspace-files?source=tool`).then((r) => r.workspaceFiles ?? []),

  // Project-level generated files (ADR 0002, openimago-owy7) — aggregates the
  // DB-backed workspace_generated_files across all sessions of the project
  // (resolved via workspace.project_id). Distinct from projectOutputs, which
  // scans the project directory on disk.
  projectWorkspaceFiles: (projectId: string) =>
    request<{ workspaceFiles: WorkspaceFile[] }>(`/api/platform/projects/${projectId}/workspace-files`).then((r) => r.workspaceFiles ?? []),

  // Project outputs — aggregated media results across project sessions
  projectOutputs: (projectId: string) =>
    request<{ outputs: WorkspaceFile[] }>(`/api/platform/projects/${projectId}/outputs`).then((r) => r.outputs ?? []),

  // Project files — flat file listing for a project
  projectFiles: (projectId: string) =>
    request<{ files: WorkspaceFile[] }>(`/api/platform/projects/${projectId}/files`).then((r) => r.files ?? []),

  // ── Story Data (read-only project scaffold files) ───────────────────────────
  //
  // Fetches story JSON files from the project directory (ADRs 0004+, openimago-1a3).
  // Each method returns the raw data on success or null when the file is missing
  // (project may not have been scaffolded yet, or the file was deleted).

  projectStoryManifest: (projectId: string) =>
    request<{ manifest: OpenimagoStoryManifest }>(`/api/platform/projects/${projectId}/story/manifest`)
      .then((r) => r.manifest)
      .catch(() => null),
  projectStoryBible: (projectId: string) =>
    request<{ bible: OpenimagoStoryBible }>(`/api/platform/projects/${projectId}/story/bible`)
      .then((r) => r.bible)
      .catch(() => null),
  projectStorySeries: (projectId: string) =>
    request<{ series: OpenimagoStorySeries }>(`/api/platform/projects/${projectId}/story/series`)
      .then((r) => r.series)
      .catch(() => null),
  projectStoryEpisode: (projectId: string, episodeId: string) =>
    request<{ episode: OpenimagoStoryEpisode }>(`/api/platform/projects/${projectId}/story/episodes/${episodeId}`)
      .then((r) => r.episode)
      .catch(() => null),
  projectStoryWorkflow: (projectId: string, episodeId: string) =>
    request<{ workflow: OpenimagoStoryWorkflow }>(`/api/platform/projects/${projectId}/story/episodes/${episodeId}/workflow`)
      .then((r) => r.workflow)
      .catch(() => null),
  projectStoryRuns: (projectId: string, episodeId: string) =>
    request<{ runs: OpenimagoStoryRuns }>(`/api/platform/projects/${projectId}/story/episodes/${episodeId}/runs`)
      .then((r) => r.runs)
      .catch(() => null),
  // Story writes (ADR 0005) — append a shot with optimistic concurrency.
  addEpisodeShot: (projectId: string, episodeId: string, expectedUpdatedAt?: string) =>
    request<{ shot: OpenimagoEpisodeShot; updatedAt: string }>(
      `/api/platform/projects/${projectId}/story/episodes/${episodeId}/shots`,
      {
        method: 'POST',
        body: JSON.stringify(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),
      },
    ),
  // Story writes (ADR 0005) — mock generation: append a completed run + mark shot generated.
  generateShot: (projectId: string, episodeId: string, shotId: string) =>
    request<{ run: OpenimagoGenerationRun }>(
      `/api/platform/projects/${projectId}/story/episodes/${episodeId}/shots/${shotId}/generate`,
      { method: 'POST', body: '{}' },
    ),
  // Voiceover (ADR 0004) — mock TTS: append one audio run per dialog line of a
  // shot. Derived state — the timeline VO track projects these audio runs.
  generateShotVoiceover: (projectId: string, episodeId: string, shotId: string) =>
    request<{ runs: OpenimagoGenerationRun[] }>(
      `/api/platform/projects/${projectId}/story/episodes/${episodeId}/shots/${shotId}/voiceover`,
      { method: 'POST', body: '{}' },
    ),
  // Voiceover (ADR 0004) — episode-wide: append audio runs for every shot's dialog.
  generateEpisodeVoiceover: (projectId: string, episodeId: string) =>
    request<{ runs: OpenimagoGenerationRun[] }>(
      `/api/platform/projects/${projectId}/story/episodes/${episodeId}/voiceover`,
      { method: 'POST', body: '{}' },
    ),
  // Story writes (ADR 0005) — delete a shot (renumbers the rest).
  deleteShot: (projectId: string, episodeId: string, shotId: string, expectedUpdatedAt?: string) =>
    request<{ updatedAt: string }>(
      `/api/platform/projects/${projectId}/story/episodes/${episodeId}/shots/${shotId}`,
      {
        method: 'DELETE',
        body: JSON.stringify(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),
      },
    ),
  // Story writes (ADR 0005) — update whitelisted shot fields.
  updateShot: (
    projectId: string,
    episodeId: string,
    shotId: string,
    patch: { description?: string; sceneId?: string; cameraNotes?: string; lightingNotes?: string },
    expectedUpdatedAt?: string,
  ) =>
    request<{ shot: OpenimagoEpisodeShot; updatedAt: string }>(
      `/api/platform/projects/${projectId}/story/episodes/${episodeId}/shots/${shotId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ ...patch, ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}) }),
      },
    ),
  // Story writes (ADR 0005) — reorder shots, rewriting shotNumber 1..N.
  reorderShots: (projectId: string, episodeId: string, orderedShotIds: string[], expectedUpdatedAt?: string) =>
    request<{ updatedAt: string }>(
      `/api/platform/projects/${projectId}/story/episodes/${episodeId}/shots/reorder`,
      {
        method: 'PATCH',
        body: JSON.stringify({ orderedShotIds, ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}) }),
      },
    ),
  projectStoryAgents: (projectId: string) =>
    request(`/api/platform/projects/${projectId}/story/agents`)
      .then(() => null)
      .catch(() => null),

  // ── Episode Cut (ADR 0006 — edit layer) ──────────────────────────────────────
  //
  // Reads/writes story/cuts/ep_NNN.cut.json. The reader lazily returns an empty
  // Cut when no file exists. Every write carries an optional expectedUpdatedAt
  // (optimistic concurrency, ADR 0005) and returns 409 on a stale write.

  // Read the episode's Cut (empty Cut when never cut).
  projectStoryCut: (projectId: string, episodeId: string) =>
    request<{ cut: OpenimagoEpisodeCut }>(
      `/api/platform/projects/${projectId}/story/episodes/${episodeId}/cut`,
    )
      .then((r) => r.cut)
      .catch(() => null),

  // Assemble the first Cut from the episode's shots (ADR 0006 rough cut) — one
  // clip per shot with completed video/image media, ordered by shotNumber.
  assembleEpisodeCut: (projectId: string, episodeId: string, expectedUpdatedAt?: string) =>
    request<{ updatedAt: string; cut: { clips: OpenimagoCutClip[] } }>(
      `/api/platform/projects/${projectId}/story/episodes/${episodeId}/cut/assemble`,
      {
        method: 'POST',
        body: JSON.stringify(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),
      },
    ),

  // Reorder clips, rewriting order 0..N-1.
  reorderCutClips: (projectId: string, episodeId: string, orderedClipIds: string[], expectedUpdatedAt?: string) =>
    request<{ updatedAt: string }>(
      `/api/platform/projects/${projectId}/story/episodes/${episodeId}/cut/clips/reorder`,
      {
        method: 'PATCH',
        body: JSON.stringify({ orderedClipIds, ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}) }),
      },
    ),

  // Trim a clip's in/out points.
  trimCutClip: (
    projectId: string,
    episodeId: string,
    clipId: string,
    inPoint: number,
    outPoint: number,
    expectedUpdatedAt?: string,
  ) =>
    request<{ updatedAt: string }>(
      `/api/platform/projects/${projectId}/story/episodes/${episodeId}/cut/clips/${clipId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ inPoint, outPoint, ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}) }),
      },
    ),

  // Split a clip at an absolute source time. The CLIENT mints the new
  // second-half clip id (ADR 0008 #2); the server validates + echoes it.
  splitCutClip: (
    projectId: string,
    episodeId: string,
    clipId: string,
    atSeconds: number,
    newClipId: string,
    expectedUpdatedAt?: string,
  ) =>
    request<{ updatedAt: string; newClipId: string }>(
      `/api/platform/projects/${projectId}/story/episodes/${episodeId}/cut/clips/${clipId}/split`,
      {
        method: 'POST',
        body: JSON.stringify({ atSeconds, newClipId, ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}) }),
      },
    ),

  // Delete a clip (reindexes order, drops its trailing transition).
  deleteCutClip: (projectId: string, episodeId: string, clipId: string, expectedUpdatedAt?: string) =>
    request<{ updatedAt: string }>(
      `/api/platform/projects/${projectId}/story/episodes/${episodeId}/cut/clips/${clipId}`,
      {
        method: 'DELETE',
        body: JSON.stringify(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),
      },
    ),

  // Set (insert or replace) the transition after a clip.
  setCutTransition: (
    projectId: string,
    episodeId: string,
    afterClipId: string,
    kind: string,
    durationSeconds: number,
    expectedUpdatedAt?: string,
  ) =>
    request<{ updatedAt: string }>(
      `/api/platform/projects/${projectId}/story/episodes/${episodeId}/cut/transitions/${afterClipId}`,
      {
        method: 'PUT',
        body: JSON.stringify({ kind, durationSeconds, ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}) }),
      },
    ),

  // Remove the transition after a clip.
  clearCutTransition: (projectId: string, episodeId: string, afterClipId: string, expectedUpdatedAt?: string) =>
    request<{ updatedAt: string }>(
      `/api/platform/projects/${projectId}/story/episodes/${episodeId}/cut/transitions/${afterClipId}`,
      {
        method: 'DELETE',
        body: JSON.stringify(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),
      },
    ),

  // Set the Cut's single BGM audio bed reference.
  setCutBgm: (projectId: string, episodeId: string, bgm: OpenimagoCutAudioRef, expectedUpdatedAt?: string) =>
    request<{ updatedAt: string }>(
      `/api/platform/projects/${projectId}/story/episodes/${episodeId}/cut/bgm`,
      {
        method: 'PUT',
        body: JSON.stringify({ ...bgm, ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}) }),
      },
    ),

  // Remove the Cut's BGM reference.
  clearCutBgm: (projectId: string, episodeId: string, expectedUpdatedAt?: string) =>
    request<{ updatedAt: string }>(
      `/api/platform/projects/${projectId}/story/episodes/${episodeId}/cut/bgm`,
      {
        method: 'DELETE',
        body: JSON.stringify(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),
      },
    ),

  // ── Rerun (stub, openimago-xkn / ADR 0003) ────────────────────────────
  //
  // Future: wire to backend rerun endpoint when the generation-run execution
  // path is implemented. For MVP, the WorkspaceArtifactsPanel emits "rerun"
  // events; pages handle the event with this stub.
  rerunArtifact: (_payload: {
    artifactId: string
    prompt?: string
    model?: string
    aspectRatio?: string
    duration?: number
    seed?: number
    inputArgs?: Record<string, unknown>
  }) =>
    // Stub — returns a dummy response so callers can proceed
    Promise.resolve({ ok: false, message: "Rerun endpoint not yet implemented — openimago-xkn placeholder" }),

  // ── Gallery ──────────────────────────────────────────────────────────────────

  listGallery: (params?: { category?: string; cursor?: string; limit?: number }) => {
    const qs = new URLSearchParams()
    if (params?.category) qs.set('category', params.category)
    if (params?.cursor) qs.set('cursor', params.cursor)
    if (params?.limit) qs.set('limit', String(params.limit))
    const query = qs.toString()
    return request<{ items: GalleryCard[]; nextCursor: string | null; hasMore: boolean }>(`/api/platform/gallery${query ? `?${query}` : ''}`)
  },
  getGalleryItem: (slug: string) =>
    request<{ item: GalleryDetail }>(`/api/platform/gallery/${slug}`).then((r) => r.item),

  // ── Billing ────────────────────────────────────────────────────────────────

  billingAccount: () =>
    request<{ account: BillingAccount }>('/api/platform/billing/account').then((r) => r.account),
  billingLedger: (params?: { limit?: number; offset?: number }) => {
    const qs = new URLSearchParams()
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    const query = qs.toString()
    return request<{ entries: BillingLedgerEntry[]; total: number }>(`/api/platform/billing/ledger${query ? `?${query}` : ''}`)
  },
  billingLedgerEntry: (id: string) =>
    request<{ entry: BillingLedgerEntry }>(`/api/platform/billing/ledger/${id}`).then((r) => r.entry),
  billingPaymentOrders: () =>
    request<{ orders: BillingPaymentOrder[]; total: number }>('/api/platform/billing/payment-orders'),

}
