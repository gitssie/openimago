import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { api } from '../../api/client'

// ── Unit test for the session-reachable Story read API (ADR 0009) ──────────────
//
// These thin wrappers mirror the projectStory* reads but hit the session path
// `/api/platform/sessions/:id/story/*` exposed by the backend (openimago-zaet).
// We stub global fetch to assert each function (a) requests the correct URL and
// (b) unwraps the named field, returning null when the request fails.

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('session story API client (ADR 0009)', () => {
  let calls: string[]

  beforeEach(() => {
    setActivePinia(createPinia())
    calls = []
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubFetch(body: unknown) {
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input)
      calls.push(url)
      return Promise.resolve(jsonResponse(body))
    })
  }

  it('sessionStoryBible hits the session story path and unwraps bible', async () => {
    stubFetch({ bible: { logline: 'x', characters: [], scenes: [], styleSeeds: [] } })
    const bible = await api.sessionStoryBible('ses_1')
    expect(calls[0]).toBe('/api/platform/sessions/ses_1/story/bible')
    expect(bible).toEqual({ logline: 'x', characters: [], scenes: [], styleSeeds: [] })
  })

  it('sessionStorySeries hits the session story path and unwraps series', async () => {
    stubFetch({ series: { episodes: [] } })
    const series = await api.sessionStorySeries('ses_2')
    expect(calls[0]).toBe('/api/platform/sessions/ses_2/story/series')
    expect(series).toEqual({ episodes: [] })
  })

  it('sessionStoryEpisode hits the session episodes path', async () => {
    stubFetch({ episode: { id: 'ep_1', shots: [] } })
    const episode = await api.sessionStoryEpisode('ses_3', 'ep_1')
    expect(calls[0]).toBe('/api/platform/sessions/ses_3/story/episodes/ep_1')
    expect(episode).toEqual({ id: 'ep_1', shots: [] })
  })

  it('sessionStoryWorkflow hits the session workflow path', async () => {
    stubFetch({ workflow: { nodes: [] } })
    const wf = await api.sessionStoryWorkflow('ses_4', 'ep_2')
    expect(calls[0]).toBe('/api/platform/sessions/ses_4/story/episodes/ep_2/workflow')
    expect(wf).toEqual({ nodes: [] })
  })

  it('sessionStoryRuns hits the session runs path', async () => {
    stubFetch({ runs: { runs: [] } })
    const runs = await api.sessionStoryRuns('ses_5', 'ep_3')
    expect(calls[0]).toBe('/api/platform/sessions/ses_5/story/episodes/ep_3/runs')
    expect(runs).toEqual({ runs: [] })
  })

  it('sessionStoryManifest hits the session manifest path', async () => {
    stubFetch({ manifest: { version: 1 } })
    const manifest = await api.sessionStoryManifest('ses_6')
    expect(calls[0]).toBe('/api/platform/sessions/ses_6/story/manifest')
    expect(manifest).toEqual({ version: 1 })
  })

  it('sessionStoryCut hits the session cut path and unwraps cut', async () => {
    stubFetch({ cut: { clips: [], transitions: [] } })
    const cut = await api.sessionStoryCut('ses_7', 'ep_4')
    expect(calls[0]).toBe('/api/platform/sessions/ses_7/story/episodes/ep_4/cut')
    expect(cut).toEqual({ clips: [], transitions: [] })
  })

  it('returns null when the request fails (missing file → non-OK)', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(new Response('nope', { status: 404, headers: { 'content-type': 'text/plain' } })),
    )
    const bible = await api.sessionStoryBible('ses_missing')
    expect(bible).toBeNull()
  })
})
