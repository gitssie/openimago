import { Hono } from "hono"
import { eq } from "drizzle-orm"
import { db } from "../db/client"
import { SessionTable } from "../db/session-schema"
import { WorkspaceTable } from "../db/workspace-schema"
import { billingService } from "./service"
import { logger } from "../server/logger"

// ── Internal API key validation ──────────────────────────────────────────

/**
 * Internal API key for service-to-service media charge requests.
 *
 * Must be set via OPENIMAGO_INTERNAL_API_KEY env var.
 * If not set, the route will reject all requests with a clear error.
 */
function getInternalApiKey(): string | undefined {
  return process.env.OPENIMAGO_INTERNAL_API_KEY
}

// ── Session / User resolution ────────────────────────────────────────────

/**
 * Normalize a directory path for comparison by stripping trailing separators.
 * Avoids symlink assumptions and complex canonicalization.
 */
function normalizeDir(dir: string): string {
  let d = dir.trim()
  while (d.endsWith("/") || d.endsWith("\\")) {
    d = d.slice(0, -1)
  }
  return d
}

/**
 * Resolve billing user identity from sessionId + directory.
 *
 * Returns { userId, workspaceId, projectId } on success, or null.
 * Fails (returns null) if session not found, directory mismatches,
 * no workspace linked, or no userId on the workspace.
 */
async function resolveBillingIdentity(
  sessionId: string,
  directory: string,
): Promise<{ userId: string; workspaceId: string; projectId: string } | null> {
  const sessions = await db
    .select({
      workspace_id: SessionTable.workspace_id,
      project_id: SessionTable.project_id,
      directory: SessionTable.directory,
    })
    .from(SessionTable)
    .where(eq(SessionTable.id, sessionId))
    .limit(1)

  const session = sessions[0]
  if (!session) {
    logger.warn({ sessionId }, "media-charge: session not found")
    return null
  }

  if (normalizeDir(session.directory) !== normalizeDir(directory)) {
    logger.warn(
      {
        sessionId,
        sessionDir: session.directory,
        requestDir: directory,
      },
      "media-charge: directory mismatch",
    )
    return null
  }

  const workspaceId = session.workspace_id
  if (!workspaceId) {
    logger.warn({ sessionId }, "media-charge: session has no workspace_id")
    return null
  }

  const workspaces = await db
    .select({
      userId: WorkspaceTable.userId,
    })
    .from(WorkspaceTable)
    .where(eq(WorkspaceTable.id, workspaceId))
    .limit(1)

  const workspace = workspaces[0]
  if (!workspace?.userId) {
    logger.warn(
      { sessionId, workspaceId },
      "media-charge: workspace has no userId",
    )
    return null
  }

  return {
    userId: workspace.userId,
    workspaceId,
    projectId: session.project_id,
  }
}

// ── Routes ───────────────────────────────────────────────────────────────

export const mediaChargeRoutes = new Hono()

function validateApiKey(c: any): Response | null {
  const expectedKey = getInternalApiKey()
  if (!expectedKey) {
    logger.error("media-charge: OPENIMAGO_INTERNAL_API_KEY not configured")
    return c.json(
      {
        error: {
          code: "CONFIGURATION_REQUIRED",
          message:
            "Internal API key not configured. Set OPENIMAGO_INTERNAL_API_KEY.",
        },
      },
      500,
    )
  }

  const apiKey = c.req.header("x-api-key")
  if (!apiKey || apiKey !== expectedKey) {
    logger.warn("media-charge: invalid or missing x-api-key")
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid API key" } },
      401,
    )
  }

  return null // auth passed
}

/**
 * POST /api/platform/billing/media-charge
 *
 * Internal route called by the OpenCode plugin to pre-charge a media
 * tool call. Resolves billing identity from sessionId + directory,
 * NOT from request body userId.
 *
 * Auth: x-api-key header must match OPENIMAGO_INTERNAL_API_KEY.
 */
mediaChargeRoutes.post("/media-charge", async (c) => {
  const authError = validateApiKey(c)
  if (authError) return authError

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json(
      { error: { code: "BAD_REQUEST", message: "Invalid JSON body" } },
      400 as never,
    )
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : null
  const directory = typeof body.directory === "string" ? body.directory : null
  const amountMicros = typeof body.amountMicros === "number" ? body.amountMicros : null

  if (!sessionId || !directory || amountMicros === null) {
    return c.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "sessionId, directory, and amountMicros are required",
        },
      },
      400 as never,
    )
  }

  // amountMicros must be negative for charges
  if (amountMicros >= 0) {
    return c.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "amountMicros must be negative for charges",
        },
      },
      400 as never,
    )
  }

  // Resolve billing identity from session + directory
  const identity = await resolveBillingIdentity(sessionId, directory)
  if (!identity) {
    return c.json(
      {
        error: {
          code: "BILLING_IDENTITY_NOT_FOUND",
          message:
            "Could not resolve billing user from sessionId and directory",
        },
      },
      400 as never,
    )
  }

  try {
    // Lookup account (do NOT create — fail if no account)
    const account = await billingService.getAccount(identity.userId)
    if (!account) {
      return c.json(
        {
          error: {
            code: "INSUFFICIENT_BALANCE",
            message: "No billing account found",
          },
        },
        402 as never,
      )
    }

    // Pre-charge: atomic balance eligibility check + charge write
    const entry = await billingService.prechargeToolCall({
      accountId: account.id,
      userId: identity.userId,
      amountMicros,
      workspaceId: identity.workspaceId,
      projectId: identity.projectId,
      sessionId,
      provider: typeof body.provider === "string" ? body.provider : undefined,
      model: typeof body.model === "string" ? body.model : undefined,
      toolName: typeof body.toolName === "string" ? body.toolName : undefined,
      mediaKind: typeof body.mediaKind === "string" ? body.mediaKind : undefined,
      quantity:
        typeof body.quantity === "number" ? body.quantity : undefined,
      unit: typeof body.unit === "string" ? body.unit : undefined,
      pricingSnapshot: body.pricingSnapshot,
      metadata: body.metadata,
    })

    logger.info(
      {
        userId: identity.userId,
        accountId: account.id,
        amountMicros,
        sessionId,
        provider: body.provider,
        model: body.model,
      },
      "media-charge: pre-charge recorded",
    )

    return c.json(
      {
        entry: {
          id: entry.id,
          accountId: entry.accountId,
          entryType: entry.entryType,
          amountMicros: entry.amountMicros,
          balanceAfterMicros: entry.balanceAfterMicros,
          sourceId: entry.sourceId,
          createdAt: entry.createdAt.toISOString(),
        },
      },
      201 as never,
    )
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT_BALANCE") {
      return c.json(
        {
          error: {
            code: "INSUFFICIENT_BALANCE",
            message: "Insufficient balance for this media generation",
          },
        },
        402 as never,
      )
    }

    const message = err instanceof Error ? err.message : "Unknown error"
    logger.error({ err, sessionId }, "media-charge: failed to record")
    return c.json(
      { error: { code: "INTERNAL_ERROR", message } },
      500 as never,
    )
  }
})

/**
 * POST /api/platform/billing/media-charge/refund
 *
 * Write a positive refund entry to offset a failed pre-charge.
 * Called after provider generation fails following a successful pre-charge.
 *
 * Auth: x-api-key header must match OPENIMAGO_INTERNAL_API_KEY.
 */
mediaChargeRoutes.post("/media-charge/refund", async (c) => {
  const authError = validateApiKey(c)
  if (authError) return authError

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json(
      { error: { code: "BAD_REQUEST", message: "Invalid JSON body" } },
      400 as never,
    )
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : null
  const directory = typeof body.directory === "string" ? body.directory : null
  const amountMicros = typeof body.amountMicros === "number" ? body.amountMicros : null
  const originalChargeSourceId =
    typeof body.originalChargeSourceId === "string" ? body.originalChargeSourceId : null

  if (!sessionId || !directory || amountMicros === null || !originalChargeSourceId) {
    return c.json(
      {
        error: {
          code: "BAD_REQUEST",
          message:
            "sessionId, directory, amountMicros, and originalChargeSourceId are required",
        },
      },
      400 as never,
    )
  }

  // amountMicros must be positive for refunds
  if (amountMicros <= 0) {
    return c.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "amountMicros must be positive for refunds",
        },
      },
      400 as never,
    )
  }

  const identity = await resolveBillingIdentity(sessionId, directory)
  if (!identity) {
    return c.json(
      {
        error: {
          code: "BILLING_IDENTITY_NOT_FOUND",
          message:
            "Could not resolve billing user from sessionId and directory",
        },
      },
      400 as never,
    )
  }

  try {
    const account = await billingService.getAccount(identity.userId)
    if (!account) {
      return c.json(
        {
          error: {
            code: "INSUFFICIENT_BALANCE",
            message: "No billing account found for refund",
          },
        },
        402 as never,
      )
    }

    const entry = await billingService.refundToolCallPrecharge({
      accountId: account.id,
      userId: identity.userId,
      amountMicros,
      originalChargeSourceId,
      workspaceId: identity.workspaceId,
      projectId: identity.projectId,
      sessionId,
      provider: typeof body.provider === "string" ? body.provider : undefined,
      model: typeof body.model === "string" ? body.model : undefined,
      toolName: typeof body.toolName === "string" ? body.toolName : undefined,
      mediaKind: typeof body.mediaKind === "string" ? body.mediaKind : undefined,
      metadata: body.metadata,
    })

    logger.info(
      {
        userId: identity.userId,
        accountId: account.id,
        amountMicros,
        sessionId,
        originalChargeSourceId,
      },
      "media-charge: refund recorded",
    )

    return c.json(
      {
        entry: {
          id: entry.id,
          accountId: entry.accountId,
          entryType: entry.entryType,
          amountMicros: entry.amountMicros,
          balanceAfterMicros: entry.balanceAfterMicros,
          createdAt: entry.createdAt.toISOString(),
        },
      },
      201 as never,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    logger.error({ err, sessionId }, "media-charge: refund failed")
    return c.json(
      { error: { code: "INTERNAL_ERROR", message } },
      500 as never,
    )
  }
})
