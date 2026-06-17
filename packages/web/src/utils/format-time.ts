/**
 * Relative time formatting shared across workspace views (openimago-upsf).
 *
 * Renders a Date as a compact zh-CN relative label ("刚刚" / "N 分钟前" /
 * "N 小时前") falling back to a short absolute date beyond 24h. Pure: depends
 * only on its inputs (and `now`, injectable for deterministic tests).
 */

/** Format `date` relative to `now` (defaults to current time). */
export function formatRelativeTime(date: Date, now: number = Date.now()): string {
  const diff = now - date.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

/**
 * Format an ISO timestamp string into a relative label. Returns '' for empty
 * or unparseable input so callers can fall back to a placeholder.
 */
export function formatIsoRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return ''
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''
  return formatRelativeTime(new Date(ms), now)
}
