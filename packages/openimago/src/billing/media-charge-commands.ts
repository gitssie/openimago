// ── Media Charge Commands ───────────────────────────────────────────────────
//
// Extracted from media-charge-routes.ts to separate:
//   1. Request body parsing / validation
//   2. Billing identity resolution (sessionId + directory → userId)
//   3. Ledger write operations
//
// Routes become thin controllers: parse → validate → resolve identity → call command.
// This makes the billing logic testable independently of Hono HTTP concerns.

import { eq } from "drizzle-orm"
import { db } from "../db/client"
import { SessionTable } from "../db/session-schema"
import { WorkspaceTable } from "../db/workspace-schema"
import { billingService } from "./service"
import { logger } from "../server/logger"

// ── Validation ──────────────────────────────────────────────────────────────

export interface ParsedChargeRequest {
  sessionId: string
  directory: string
  amountMicros: number
  provider?: string
  model?: string
  toolName?: string
  mediaKind?: string
  quantity?: number
  unit?: string
  pricingSnapshot?: unknown
  metadata?: unknown
}

export interface ParsedRefundRequest {
  sessionId: string
  directory: string
  amountMicros: number
  originalChargeSourceId: string
  provider?: string
  model?: string
  toolName?: string
  mediaKind?: string
  metadata?: unknown
}

export interface ValidationError {
  code: string
  message: string
  status: 400
}

/**
 * Parse and validate a media charge request body.
 * Returns parsed fields or a structured validation error.
 */
export function parseChargeBody(body: Record<string, unknown>): ParsedChargeRequest | ValidationError {
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : null
  const directory = typeof body.directory === "string" ? body.directory : null
  const amountMicros = typeof body.amountMicros === "number" ? body.amountMicros : null

  if (!sessionId || !directory || amountMicros === null) {
    return {
      code: "BAD_REQUEST",
      message: "sessionId, directory, and amountMicros are required",
      status: 400,
    }
  }

  if (amountMicros >= 0) {
    return {
      code: "BAD_REQUEST",
      message: "amountMicros must be negative for charges",
      status: 400,
    }
  }

  return {
    sessionId,
    directory,
    amountMicros,
    provider: typeof body.provider === "string" ? body.provider : undefined,
    model: typeof body.model === "string" ? body.model : undefined,
    toolName: typeof body.toolName === "string" ? body.toolName : undefined,
    mediaKind: typeof body.mediaKind === "string" ? body.mediaKind : undefined,
    quantity: typeof body.quantity === "number" ? body.quantity : undefined,
    unit: typeof body.unit === "string" ? body.unit : undefined,
    pricingSnapshot: body.pricingSnapshot,
    metadata: body.metadata,
  }
}

/**
 * Parse and validate a media charge refund request body.
 */
export function parseRefundBody(body: Record<string, unknown>): ParsedRefundRequest | ValidationError {
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : null
  const directory = typeof body.directory === "string" ? body.directory : null
  const amountMicros = typeof body.amountMicros === "number" ? body.amountMicros : null
  const originalChargeSourceId =
    typeof body.originalChargeSourceId === "string" ? body.originalChargeSourceId : null

  if (!sessionId || !directory || amountMicros === null || !originalChargeSourceId) {
    return {
      code: "BAD_REQUEST",
      message: "sessionId, directory, amountMicros, and originalChargeSourceId are required",
      status: 400,
    }
  }

  if (amountMicros <= 0) {
    return {
      code: "BAD_REQUEST",
      message: "amountMicros must be positive for refunds",
      status: 400,
    }
  }

  return {
    sessionId,
    directory,
    amountMicros,
    originalChargeSourceId,
    provider: typeof body.provider === "string" ? body.provider : undefined,
    model: typeof body.model === "string" ? body.model : undefined,
    toolName: typeof body.toolName === "string" ? body.toolName : undefined,
    mediaKind: typeof body.mediaKind === "string" ? body.mediaKind : undefined,
    metadata: body.metadata,
  }
}

// ── Identity Resolution ─────────────────────────────────────────────────────

export interface BillingIdentity {
  userId: string
  workspaceId: string
  projectId: string
}

/** Normalize a directory path by stripping trailing separators. */
function normalizeDir(dir: string): string {
  let d = dir.trim()
  while (d.endsWith("/") || d.endsWith("\\")) {
    d = d.slice(0, -1)
  }
  return d
}

/**
 * Resolve billing user identity from sessionId + directory.
 * Returns identity on success, or null if session not found,
 * directory mismatches, no workspace linked, or no userId on the workspace.
 */
export async function resolveBillingIdentity(
  sessionId: string,
  directory: string,
): Promise<BillingIdentity | null> {
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
      { sessionId, sessionDir: session.directory, requestDir: directory },
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
    .select({ userId: WorkspaceTable.userId })
    .from(WorkspaceTable)
    .where(eq(WorkspaceTable.id, workspaceId))
    .limit(1)

  const workspace = workspaces[0]
  if (!workspace?.userId) {
    logger.warn({ sessionId, workspaceId }, "media-charge: workspace has no userId")
    return null
  }

  return { userId: workspace.userId, workspaceId, projectId: session.project_id }
}

// ── Command Handlers ────────────────────────────────────────────────────────

export interface ChargeCommandResult {
  success: true
  entryId: string
  accountId: string
  entryType: string
  amountMicros: number
  balanceAfterMicros: number
  sourceId: string
  createdAt: string
}

export interface ChargeCommandError {
  success: false
  code: string
  message: string
  status: number
}

/**
 * Execute a media pre-charge: resolve identity, verify account, write ledger entry.
 */
export async function executePrecharge(
  req: ParsedChargeRequest,
): Promise<ChargeCommandResult | ChargeCommandError> {
  const identity = await resolveBillingIdentity(req.sessionId, req.directory)
  if (!identity) {
    return {
      success: false,
      code: "BILLING_IDENTITY_NOT_FOUND",
      message: "Could not resolve billing user from sessionId and directory",
      status: 400,
    }
  }

  const account = await billingService.getAccount(identity.userId)
  if (!account) {
    return {
      success: false,
      code: "INSUFFICIENT_BALANCE",
      message: "No billing account found",
      status: 402,
    }
  }

  try {
    const entry = await billingService.prechargeToolCall({
      accountId: account.id,
      userId: identity.userId,
      amountMicros: req.amountMicros,
      workspaceId: identity.workspaceId,
      projectId: identity.projectId,
      sessionId: req.sessionId,
      provider: req.provider,
      model: req.model,
      toolName: req.toolName,
      mediaKind: req.mediaKind,
      quantity: req.quantity,
      unit: req.unit,
      pricingSnapshot: req.pricingSnapshot,
      metadata: req.metadata,
    })

    logger.info(
      { userId: identity.userId, accountId: account.id, amountMicros: req.amountMicros, sessionId: req.sessionId, provider: req.provider, model: req.model },
      "media-charge: pre-charge recorded",
    )

    return {
      success: true,
      entryId: entry.id,
      accountId: entry.accountId,
      entryType: entry.entryType,
      amountMicros: entry.amountMicros,
      balanceAfterMicros: entry.balanceAfterMicros,
      sourceId: entry.sourceId,
      createdAt: entry.createdAt.toISOString(),
    }
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT_BALANCE") {
      return {
        success: false,
        code: "INSUFFICIENT_BALANCE",
        message: "Insufficient balance for this media generation",
        status: 402,
      }
    }

    const message = err instanceof Error ? err.message : "Unknown error"
    logger.error({ err, sessionId: req.sessionId }, "media-charge: failed to record")
    return { success: false, code: "INTERNAL_ERROR", message, status: 500 }
  }
}

/**
 * Execute a media charge refund: resolve identity, verify account, write refund ledger entry.
 */
export async function executeRefund(
  req: ParsedRefundRequest,
): Promise<ChargeCommandResult | ChargeCommandError> {
  const identity = await resolveBillingIdentity(req.sessionId, req.directory)
  if (!identity) {
    return {
      success: false,
      code: "BILLING_IDENTITY_NOT_FOUND",
      message: "Could not resolve billing user from sessionId and directory",
      status: 400,
    }
  }

  const account = await billingService.getAccount(identity.userId)
  if (!account) {
    return {
      success: false,
      code: "INSUFFICIENT_BALANCE",
      message: "No billing account found for refund",
      status: 402,
    }
  }

  try {
    const entry = await billingService.refundToolCallPrecharge({
      accountId: account.id,
      userId: identity.userId,
      amountMicros: req.amountMicros,
      originalChargeSourceId: req.originalChargeSourceId,
      workspaceId: identity.workspaceId,
      projectId: identity.projectId,
      sessionId: req.sessionId,
      provider: req.provider,
      model: req.model,
      toolName: req.toolName,
      mediaKind: req.mediaKind,
      metadata: req.metadata,
    })

    logger.info(
      { userId: identity.userId, accountId: account.id, amountMicros: req.amountMicros, sessionId: req.sessionId, originalChargeSourceId: req.originalChargeSourceId },
      "media-charge: refund recorded",
    )

    return {
      success: true,
      entryId: entry.id,
      accountId: entry.accountId,
      entryType: entry.entryType,
      amountMicros: entry.amountMicros,
      balanceAfterMicros: entry.balanceAfterMicros,
      sourceId: entry.sourceId,
      createdAt: entry.createdAt.toISOString(),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    logger.error({ err, sessionId: req.sessionId }, "media-charge: refund failed")
    return { success: false, code: "INTERNAL_ERROR", message, status: 500 }
  }
}
