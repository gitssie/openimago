import { describe, it, expect, vi } from 'vitest'
import { dispatchCutEdit, type CutWriteApi, type DispatchCutEditDeps } from '../cut-edit-dispatcher'

function fakeApi(): CutWriteApi {
  const ok = (updatedAt = 'v2') => vi.fn().mockResolvedValue({ updatedAt })
  return {
    reorderCutClips: ok(),
    trimCutClip: ok(),
    splitCutClip: vi.fn().mockResolvedValue({ updatedAt: 'v2', newClipId: 'c-new' }),
    deleteCutClip: ok(),
    setCutTransition: ok(),
    clearCutTransition: ok(),
    setCutBgm: ok(),
    clearCutBgm: ok(),
  }
}

function deps(api: CutWriteApi): DispatchCutEditDeps {
  return {
    api,
    projectId: 'p1',
    episodeId: 'ep_001',
    currentUpdatedAt: () => 'v1',
    refetch: vi.fn().mockResolvedValue('v2'),
  }
}

describe('dispatchCutEdit routes each edit to the right endpoint', () => {
  it('reorder', async () => {
    const api = fakeApi()
    const out = await dispatchCutEdit(deps(api), { kind: 'reorder', orderedClipIds: ['b', 'a'] })
    expect(out).toBe('ok')
    expect(api.reorderCutClips).toHaveBeenCalledWith('p1', 'ep_001', ['b', 'a'], 'v1')
  })

  it('trim', async () => {
    const api = fakeApi()
    await dispatchCutEdit(deps(api), { kind: 'trim', clipId: 'a', inPointMs: 1000, outPointMs: 3000 })
    expect(api.trimCutClip).toHaveBeenCalledWith('p1', 'ep_001', 'a', 1000, 3000, 'v1')
  })

  it('split threads the client-minted newClipId (ADR 0008 #2)', async () => {
    const api = fakeApi()
    await dispatchCutEdit(deps(api), { kind: 'split', clipId: 'a', atMs: 2000, newClipId: 'a-b' })
    expect(api.splitCutClip).toHaveBeenCalledWith('p1', 'ep_001', 'a', 2000, 'a-b', 'v1')
  })

  it('delete', async () => {
    const api = fakeApi()
    await dispatchCutEdit(deps(api), { kind: 'delete', clipId: 'a' })
    expect(api.deleteCutClip).toHaveBeenCalledWith('p1', 'ep_001', 'a', 'v1')
  })

  it('set-transition', async () => {
    const api = fakeApi()
    await dispatchCutEdit(deps(api), {
      kind: 'set-transition',
      afterClipId: 'a',
      transitionKind: 'dissolve',
      durationSeconds: 0.5,
    })
    expect(api.setCutTransition).toHaveBeenCalledWith('p1', 'ep_001', 'a', 'dissolve', 0.5, 'v1')
  })

  it('clear-transition', async () => {
    const api = fakeApi()
    await dispatchCutEdit(deps(api), { kind: 'clear-transition', afterClipId: 'a' })
    expect(api.clearCutTransition).toHaveBeenCalledWith('p1', 'ep_001', 'a', 'v1')
  })

  it('set-bgm omits undefined optional fields', async () => {
    const api = fakeApi()
    await dispatchCutEdit(deps(api), { kind: 'set-bgm', artifactId: 'art1', gainDb: -3 })
    expect(api.setCutBgm).toHaveBeenCalledWith('p1', 'ep_001', { artifactId: 'art1', gainDb: -3 }, 'v1')
  })

  it('clear-bgm', async () => {
    const api = fakeApi()
    await dispatchCutEdit(deps(api), { kind: 'clear-bgm' })
    expect(api.clearCutBgm).toHaveBeenCalledWith('p1', 'ep_001', 'v1')
  })

  it('retries with fresh updatedAt on 409', async () => {
    const api = fakeApi()
    api.deleteCutClip = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }))
      .mockResolvedValueOnce({ updatedAt: 'v3' })
    const d = deps(api)
    const out = await dispatchCutEdit(d, { kind: 'delete', clipId: 'a' })
    expect(out).toBe('ok')
    expect(d.refetch).toHaveBeenCalledOnce()
    expect(api.deleteCutClip).toHaveBeenNthCalledWith(2, 'p1', 'ep_001', 'a', 'v2')
  })
})
