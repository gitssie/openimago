import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'
import { api } from '../../api/client'
import { useAuthStore } from '../../stores/auth'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'

const envPath = resolve(process.cwd(), '../../.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    const key = match?.[1]
    if (key && !process.env[key]) process.env[key] = match[2]?.replace(/^['"]|['"]$/g, '')
  }
}

describe('session API client against backend', () => {
  const backendFileUrl = (path: string) => pathToFileURL(resolve(process.cwd(), `../openimago/${path}`)).href
  const serverUrl = backendFileUrl('src/server/app.ts')
  const clientUrl = backendFileUrl('src/db/client.ts')
  const schemaUrl = backendFileUrl('src/db/session-schema.ts')
  const helperUrl = backendFileUrl('tests/helper.ts')
  let app: { fetch: (request: Request) => Response | Promise<Response> }
  let db: {
    delete: (table: unknown) => Promise<unknown>
    insert: (table: unknown) => { values: (data: unknown) => Promise<unknown> }
  }
  let SessionTable: unknown
  let users: unknown
  let MessageTable: unknown
  let signJwt: (payload: { userId: string; role: string }) => Promise<string>
  let teardown: (() => Promise<void>) | undefined

  beforeEach(async () => {
    const server = await import(/* @vite-ignore */ serverUrl)
    const client = await import(/* @vite-ignore */ clientUrl)
    const schema = await import(/* @vite-ignore */ schemaUrl)
    const messageSchema = await import(/* @vite-ignore */ backendFileUrl('src/db/message-schema.ts'))
    const helper = await import(/* @vite-ignore */ helperUrl)
    const appSchema = await import(/* @vite-ignore */ backendFileUrl('src/db/schema.ts'))
    const jwt = await import(/* @vite-ignore */ backendFileUrl('src/auth/jwt.ts'))

    app = server.createApp() as typeof app
    db = client.db as typeof db
    SessionTable = schema.SessionTable
    MessageTable = messageSchema.MessageTable
    users = appSchema.users
    signJwt = jwt.signJwt
    teardown = helper.teardown

    setActivePinia(createPinia())
    await helper.setup()
    await helper.setupSessionTable()
    await helper.setupMessageTable()
    await db.delete(MessageTable)
    await db.delete(SessionTable)
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' && input.startsWith('/') ? `http://localhost${input}` : input
      return app.fetch(new Request(url, init))
    })
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    if (teardown) await teardown()
  })

  async function authenticate() {
    const auth = useAuthStore()
    const user = { id: 'user_1', username: 'sessiontest', email: 'sessiontest@example.com', role: 'user', workspaceId: 'wrk_sessiontest' }
    await db.insert(users).values(user)
    const token = await signJwt({ userId: user.id, role: user.role })
    auth.setAuth(token, user)
    return { token, user }
  }

  it('lists real backend sessions from /api/session and preserves title', async () => {
    const { user } = await authenticate()

    await db.insert(SessionTable).values({
      id: 'ses_a',
      project_id: 'global',
      workspace_id: user.workspaceId,
      slug: 'real-title',
      directory: '/mnt/cos/a',
      title: '数据库里的标题',
      version: '1.0',
      time_created: 100,
      time_updated: 100,
    })

    const sessions = await api.listSessions()

    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.id).toBe('ses_a')
    expect(sessions[0]?.title).toBe('数据库里的标题')
    expect(sessions[0]?.directory).toBe('/mnt/cos/a')
  })

  it('routes localhost OpenCode UI-origin session requests to the real backend port', async () => {
    const { user } = await authenticate()
    await db.insert(SessionTable).values({
      id: 'ses_from_backend_port',
      project_id: 'global',
      workspace_id: user.workspaceId,
      slug: 'backend-port',
      directory: '/mnt/cos/backend-port',
      title: 'Backend Port Session',
      version: '1.0',
      time_created: 100,
      time_updated: 100,
    })
    vi.stubGlobal('location', { protocol: 'http:', hostname: 'localhost', port: '3000' })
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = input instanceof Request ? input.url : input
      const url = new URL(rawUrl, 'http://localhost:3000')
      if (url.origin !== 'http://localhost:5467') {
        return new Response('<!doctype html><title>OpenCode</title>', { headers: { 'content-type': 'text/html' } })
      }
      return app.fetch(new Request(url, init))
    })

    const sessions = await api.listSessions()

    expect(sessions.map((session) => session.id)).toContain('ses_from_backend_port')
  })

  it('posts prompts through the real backend proxy route', async () => {
    const { user } = await authenticate()

    await db.insert(SessionTable).values({
      id: 'ses_prompt',
      project_id: 'global',
      workspace_id: user.workspaceId,
      slug: 'prompt',
      directory: '/mnt/cos/prompt',
      title: 'Prompt Session',
      version: '1.0',
      time_created: 100,
      time_updated: 100,
    })

    const response = await api.sendPrompt('ses_prompt', 'hello').catch((error: Error) => error)

    expect(response).toBeInstanceOf(Error)
    expect((response as Error).message).not.toContain('Session not found')
  })

  it('loads real backend session messages from /api/session/:id/message', async () => {
    const { user } = await authenticate()

    await db.insert(SessionTable).values({
      id: 'ses_messages',
      project_id: 'global',
      workspace_id: user.workspaceId,
      slug: 'messages',
      directory: '/mnt/cos/messages',
      title: 'Messages Session',
      version: '1.0',
      time_created: 100,
      time_updated: 100,
    })
    await db.insert(MessageTable).values({
      id: 'msg_1',
      session_id: 'ses_messages',
      time_created: 101,
      time_updated: 101,
      data: {
        info: { id: 'msg_1', role: 'assistant', sessionID: 'ses_messages', time: { created: 101 } },
        parts: [{ id: 'part_1', type: 'text', text: 'hello' }],
      },
    })

    const messages = await api.sessionMessages('ses_messages')

    expect(messages).toHaveLength(1)
    expect(messages[0]?.id).toBe('msg_1')
  })

  it('clears stale auth when backend rejects a token for a missing user', async () => {
    const auth = useAuthStore()
    const staleUser = { id: 'usr_missing', username: 'missing', email: 'missing@example.com', role: 'user' }
    const token = await signJwt({ userId: staleUser.id, role: staleUser.role })
    auth.setAuth(token, staleUser)

    const result = await api.createSession({}).catch((error: Error) => error)

    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toBe('User not found')
    expect(auth.token).toBeNull()
    expect(auth.user).toBeNull()
  })
})
