/**
 * Session output mapper — converts workspace-files API rows (WorkspaceFile)
 * into AIOutputItem projections for the right-side "AI 产出" panel
 * (ADR 0002, openimago-wm8d).
 *
 * Pure: raw file in, panel item out. The time formatter is injected so the
 * mapping stays deterministic and testable.
 */
import type { WorkspaceFile } from '../api/client'
import type { AIOutputItem } from '../components/session-workspace/types'

/** Map one workspace file to a panel item. `formatTime` renders createdAt. */
export function workspaceFileToAIOutputItem(
  wf: WorkspaceFile,
  formatTime: (date: Date) => string,
): AIOutputItem {
  return {
    id: wf.workspaceFileId,
    url: wf.access.thumbnail?.href ?? wf.access.preview.href ?? '',
    filename: wf.filename || wf.kind || '生成结果',
    kind: wf.kind,
    timeLabel: formatTime(new Date(wf.createdAt)),
    prompt: wf.prompt ?? '',
    model: wf.model ?? null,
  }
}

/**
 * Merge API-sourced items (workspace-files) with items derived from inline
 * `file` message parts, de-duplicating by id and then by url. API items win
 * (they carry DB-backed metadata) and lead the result.
 */
export function mergeAIOutputItems(
  apiItems: AIOutputItem[],
  partItems: AIOutputItem[],
): AIOutputItem[] {
  const merged: AIOutputItem[] = []
  const seenIds = new Set<string>()
  const seenUrls = new Set<string>()
  for (const item of [...apiItems, ...partItems]) {
    if (seenIds.has(item.id)) continue
    const url = item.url ?? ''
    if (url && seenUrls.has(url)) continue
    seenIds.add(item.id)
    if (url) seenUrls.add(url)
    merged.push(item)
  }
  return merged
}
