// ── Workspace Key Extractor ─────────────────────────────────────────────────
//
// Extracted from UserEventBus.makeUserEventBus (bus.ts:72-93) so the workspace
// key extraction logic is testable independently and not entangled with fanout.
//
// Purpose: Given a raw GlobalEvent from the OpenCode upstream, extract the
// workspace identifier that should be used to look up the owning user.

import type { GlobalEvent } from "./types"

/**
 * Extract the workspace key from a GlobalEvent for owner lookup.
 *
 * Extraction priority:
 *   1. evt.workspace (if it looks like a workspaceId — not "/" or empty)
 *   2. evt.directory (if it doesn't look like a filesystem path)
 *   3. evt.payload.properties.workspaceID
 *   4. evt.payload.properties.info.workspaceID
 *   5. Last path segment of evt.directory
 *
 * Returns the resolved workspace key, or empty string if unresolvable.
 * Caller should skip events with empty return.
 */
export function extractWorkspaceKey(evt: GlobalEvent): string {
  let ws = evt.workspace ?? evt.directory ?? ""

  // Try payload property fallbacks
  if (!ws || ws.startsWith("/")) {
    const p = evt.payload.properties as Record<string, unknown> | undefined
    const infoWs = (p?.info as Record<string, unknown> | undefined)?.workspaceID as string | undefined
    ws = (p?.workspaceID as string) ?? infoWs ?? ""
  }

  // Last-resort: last path segment of directory
  if ((!ws || ws.startsWith("/")) && evt.directory) {
    const parts = evt.directory.split("/").filter(Boolean)
    ws = parts.pop() ?? ""
  }

  return ws && !ws.startsWith("/") ? ws : ""
}
