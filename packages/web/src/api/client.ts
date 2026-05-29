import { useAuthStore } from 'src/stores/auth'

function apiUrl(path: string): string {
  return path
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const auth = useAuthStore()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
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
  sendPrompt: (id: string, prompt: string) =>
    request<{ content?: string; message?: string }>(`/api/session/${id}/prompt`, { method: 'POST', body: JSON.stringify({ prompt }) }),
  abortSession: (id: string) =>
    request<void>(`/api/session/${id}/abort`, { method: 'POST' }),
  deleteSession: (id: string) =>
    request<void>(`/api/session/${id}`, { method: 'DELETE' }),

  // Assets — { items: [...], cursor } / { asset: {...} }
  listAssets: () =>
    request<{ items: OpenimagoAsset[] }>('/api/platform/assets').then((r) => r.items ?? []),
  deleteAsset: (id: string) =>
    request<{ asset: OpenimagoAsset }>(`/api/platform/assets/${id}`, { method: 'DELETE' }),

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
}
