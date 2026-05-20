import { useAuthStore } from 'src/stores/auth'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const auth = useAuthStore()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth.token) headers['Authorization'] = `Bearer ${auth.token}`
  const res = await fetch(path, { ...options, headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || err.error?.message || `HTTP ${res.status}`)
  }
  return res.json()
}

export interface SessionInfo {
  id: string
  title?: string
  projectID?: string
  projectId?: string
  time?: { created?: number }
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
  fullPath: string
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

  // Sessions — { session, workDir }
  listSessions: () =>
    request<SessionInfo[]>('/api/platform/sessions'),
  createSession: (data: { projectId?: string }) =>
    request<{ session: SessionInfo }>('/api/platform/sessions', { method: 'POST', body: JSON.stringify(data) }).then((r) => r.session),
  sessionMessages: (id: string) =>
    request<Record<string, unknown>[]>(`/api/session/${id}/message`),
  sendPrompt: (id: string, prompt: string) =>
    request<{ content?: string; message?: string }>(`/api/session/${id}/prompt`, { method: 'POST', body: JSON.stringify({ prompt }) }),
  abortSession: (id: string) =>
    request<void>(`/api/session/${id}/abort`, { method: 'POST' }),

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
}
