// ── Workspace Projection Helpers ─────────────────────────────────────────────
//
// Shared projection types and helpers used by both SessionWorkspacePage
// and ProjectWorkspacePage for rendering sidebar session items, result
// panel items, and common layout calculations.
//
// Each page still owns its specific orchestration (session switching,
// project loading) but shares these pure projection functions.

// ── Types ────────────────────────────────────────────────────────────────────

export interface WorkspaceSidebarItem {
  id: string
  title: string
  preview: string
  timeLabel: string
  clockLabel: string
  meta: string
  active: boolean
}

export interface WorkspaceResultItem {
  id: string
  url: string
  filename: string
  kind: 'image' | 'video' | 'audio'
  timeLabel: string
  promptText: string
}

// ── Layout helpers ───────────────────────────────────────────────────────────

/** Compute full-height page style to fill the viewport below a header offset. */
export function pageHeightFn(offset: number): { minHeight: string; height: string } {
  const h = `${window.innerHeight - offset}px`
  return { minHeight: h, height: h }
}

// ── Text helpers ─────────────────────────────────────────────────────────────

/** Clip text to a maximum length with ellipsis. */
export function clipText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '…'
}

/** Format a Date to zh-CN locale time string (HH:mm). */
export function formatClock(date: Date): string {
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

/** Format a Date to relative label: "今天", "昨天", or locale date. */
export function formatDateLabel(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const dayMs = 24 * 60 * 60 * 1000

  if (diff < dayMs && date.getDate() === now.getDate()) return '今天'
  const yesterday = new Date(now.getTime() - dayMs)
  if (diff < 2 * dayMs && date.getDate() === yesterday.getDate()) return '昨天'
  return date.toLocaleDateString('zh-CN')
}
