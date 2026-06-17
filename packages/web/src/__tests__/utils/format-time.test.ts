import { describe, it, expect } from 'vitest'
import { formatRelativeTime, formatIsoRelative } from 'src/utils/format-time'

const NOW = Date.parse('2026-06-17T12:00:00Z')

describe('formatRelativeTime', () => {
  it('returns "刚刚" within the last minute', () => {
    expect(formatRelativeTime(new Date(NOW - 30_000), NOW)).toBe('刚刚')
  })

  it('returns minutes for under an hour', () => {
    expect(formatRelativeTime(new Date(NOW - 5 * 60_000), NOW)).toBe('5 分钟前')
  })

  it('returns hours for under a day', () => {
    expect(formatRelativeTime(new Date(NOW - 3 * 3_600_000), NOW)).toBe('3 小时前')
  })

  it('returns an absolute short date beyond 24h', () => {
    const label = formatRelativeTime(new Date(NOW - 3 * 86_400_000), NOW)
    expect(label).not.toMatch(/前|刚刚/)
    expect(label.length).toBeGreaterThan(0)
  })
})

describe('formatIsoRelative', () => {
  it('parses an ISO string and formats it relatively', () => {
    expect(formatIsoRelative('2026-06-17T11:30:00Z', NOW)).toBe('30 分钟前')
  })

  it('returns empty string for null/undefined/empty', () => {
    expect(formatIsoRelative(null, NOW)).toBe('')
    expect(formatIsoRelative(undefined, NOW)).toBe('')
    expect(formatIsoRelative('', NOW)).toBe('')
  })

  it('returns empty string for an unparseable timestamp', () => {
    expect(formatIsoRelative('not-a-date', NOW)).toBe('')
  })
})
