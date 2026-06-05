import { useAuthStore } from 'src/stores/auth'

function apiUrl(path: string): string {
  return path
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const auth = useAuthStore()
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
    if (res.status === 401) auth.clearAuth()
    throw new Error(err.message || err.error?.message || `HTTP ${res.status}`)
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
  role: string
  displayName?: string
  workspaceId?: string
  createdAt?: string
  updatedAt?: string
}

export interface OpenimagoProject {
  id: string
  name: string
  description?: string
  directory: string
  status: 'active' | 'archived'
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

export interface WorkspaceFileAccessLocator {
  href: string
  expiresAt?: string
}

export interface WorkspaceFile {
  workspaceFileId: string
  kind: 'image' | 'video' | 'audio'
  mime: string
  filename?: string
  width?: number
  height?: number
  duration?: number
  access: {
    preview: WorkspaceFileAccessLocator
    download?: WorkspaceFileAccessLocator
    thumbnail?: WorkspaceFileAccessLocator
    poster?: WorkspaceFileAccessLocator
  }
  prompt?: string
  provider?: string
  model?: string
  createdAt: string
  metadata?: Record<string, unknown>
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
  register: (data: { username: string; email: string; password: string }) =>
    request<{ token: string; user: OpenimagoUser }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { email: string; password: string }) =>
    request<{ token: string; user: OpenimagoUser }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
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
          auth.clearAuth()
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

  // Project outputs — aggregated media results across project sessions
  projectOutputs: (projectId: string) =>
    request<{ outputs: WorkspaceFile[] }>(`/api/platform/projects/${projectId}/outputs`).then((r) => r.outputs ?? []),

  // Project files — flat file listing for a project
  projectFiles: (projectId: string) =>
    request<{ files: WorkspaceFile[] }>(`/api/platform/projects/${projectId}/files`).then((r) => r.files ?? []),

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
