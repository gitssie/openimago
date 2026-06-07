// ── Directory Resolver ──────────────────────────────────────────────────────
//
// Centralized session → directory resolution with workspace ownership check.
// Extracted from proxyMiddleware (packages/openimago/src/server/middleware.ts)
// so workspace-files, outputs, and other services can reuse the same ownership
// check without duplicating the session lookup pattern.
//
// See: docs/adr/0001-global-event-manager.md, docs/adr/0002-media-toolcall-workspace-files.md

import { eq } from "drizzle-orm"
import { db } from "../db/client"
import { SessionTable } from "../db/session-schema"

// ── Types ────────────────────────────────────────────────────────────────────

export interface ResolvedDirectory {
  directory: string
  workspaceId: string
}

export interface DirectoryError {
  status: 404 | 403
  code: "NOT_FOUND" | "FORBIDDEN"
  message: string
}

// ── Resolver ─────────────────────────────────────────────────────────────────

/**
 * Resolve a session's working directory with workspace ownership check.
 *
 * Returns the directory if:
 *   1. Session exists
 *   2. Session belongs to the given workspaceId
 *
 * Otherwise returns a structured error (404 for missing session, 403 for wrong workspace).
 */
export async function resolveDirectory(
  sessionId: string,
  workspaceId: string,
): Promise<ResolvedDirectory | DirectoryError> {
  const rows = await db
    .select({
      workspaceId: SessionTable.workspace_id,
      directory: SessionTable.directory,
    })
    .from(SessionTable)
    .where(eq(SessionTable.id, sessionId))
    .limit(1)

  if (rows.length === 0) {
    return { status: 404, code: "NOT_FOUND", message: "Session not found" }
  }

  const session = rows[0]!

  if (session.workspaceId !== workspaceId) {
    return { status: 403, code: "FORBIDDEN", message: "Access denied" }
  }

  return { directory: session.directory, workspaceId: session.workspaceId }
}
