import { describe, it, expect, vi } from 'vitest'
import { runCutMutation, isConflict } from '../cut-mutation'

class FakeApiError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`)
  }
}

describe('isConflict', () => {
  it('detects a 409 by status', () => {
    expect(isConflict(new FakeApiError(409))).toBe(true)
    expect(isConflict(new FakeApiError(500))).toBe(false)
    expect(isConflict(new Error('x'))).toBe(false)
    expect(isConflict(null)).toBe(false)
  })
})

describe('runCutMutation', () => {
  it('succeeds on first try with the current updatedAt', async () => {
    const mutate = vi.fn().mockResolvedValue(undefined)
    const refetch = vi.fn()
    const outcome = await runCutMutation({
      currentUpdatedAt: () => 'v1',
      refetch,
      mutate,
    })
    expect(outcome).toBe('ok')
    expect(mutate).toHaveBeenCalledExactlyOnceWith('v1')
    expect(refetch).not.toHaveBeenCalled()
  })

  it('refetches and retries once on 409, then succeeds', async () => {
    const mutate = vi
      .fn()
      .mockRejectedValueOnce(new FakeApiError(409))
      .mockResolvedValueOnce(undefined)
    const refetch = vi.fn().mockResolvedValue('v2')
    const outcome = await runCutMutation({
      currentUpdatedAt: () => 'v1',
      refetch,
      mutate,
    })
    expect(outcome).toBe('ok')
    expect(refetch).toHaveBeenCalledOnce()
    expect(mutate).toHaveBeenNthCalledWith(1, 'v1')
    expect(mutate).toHaveBeenNthCalledWith(2, 'v2') // fresh updatedAt
  })

  it('returns conflict when the retry also 409s', async () => {
    const mutate = vi.fn().mockRejectedValue(new FakeApiError(409))
    const refetch = vi.fn().mockResolvedValue('v2')
    const outcome = await runCutMutation({
      currentUpdatedAt: () => 'v1',
      refetch,
      mutate,
    })
    expect(outcome).toBe('conflict')
    expect(mutate).toHaveBeenCalledTimes(2)
  })

  it('reports the successful write updatedAt via onWritten (ADR 0008 #3)', async () => {
    const mutate = vi.fn().mockResolvedValue({ updatedAt: 'v2' })
    const onWritten = vi.fn()
    const outcome = await runCutMutation({
      currentUpdatedAt: () => 'v1',
      refetch: vi.fn(),
      mutate,
      onWritten,
    })
    expect(outcome).toBe('ok')
    expect(onWritten).toHaveBeenCalledExactlyOnceWith('v2')
  })

  it('reports updatedAt from the post-409 retry write', async () => {
    const mutate = vi
      .fn()
      .mockRejectedValueOnce(new FakeApiError(409))
      .mockResolvedValueOnce({ updatedAt: 'v3' })
    const onWritten = vi.fn()
    await runCutMutation({
      currentUpdatedAt: () => 'v1',
      refetch: vi.fn().mockResolvedValue('v2'),
      mutate,
      onWritten,
    })
    expect(onWritten).toHaveBeenCalledExactlyOnceWith('v3')
  })

  it('does not call onWritten on a sustained conflict', async () => {
    const onWritten = vi.fn()
    const outcome = await runCutMutation({
      currentUpdatedAt: () => 'v1',
      refetch: vi.fn().mockResolvedValue('v2'),
      mutate: vi.fn().mockRejectedValue(new FakeApiError(409)),
      onWritten,
    })
    expect(outcome).toBe('conflict')
    expect(onWritten).not.toHaveBeenCalled()
  })

  it('propagates non-409 errors without retrying', async () => {
    const mutate = vi.fn().mockRejectedValue(new FakeApiError(500))
    const refetch = vi.fn()
    await expect(
      runCutMutation({ currentUpdatedAt: () => 'v1', refetch, mutate }),
    ).rejects.toThrow('HTTP 500')
    expect(refetch).not.toHaveBeenCalled()
  })
})
