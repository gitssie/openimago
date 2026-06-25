import { describe, it, expect } from 'vitest'
import { bgmAuthHeaders } from '../bgm-auth'

describe('bgmAuthHeaders', () => {
  it('builds a Bearer Authorization header for a real token', () => {
    expect(bgmAuthHeaders('tok_abc')).toEqual({ Authorization: 'Bearer tok_abc' })
  })

  it('returns NO header for a null token (anonymous fetch, not a broken header)', () => {
    expect(bgmAuthHeaders(null)).toEqual({})
  })

  it('returns NO header for undefined', () => {
    expect(bgmAuthHeaders(undefined)).toEqual({})
  })

  it('returns NO header for an empty-string token', () => {
    // An empty token must not produce `Authorization: Bearer ` (a server may
    // reject that differently from "no Authorization header" — the 401 case).
    expect(bgmAuthHeaders('')).toEqual({})
  })
})
