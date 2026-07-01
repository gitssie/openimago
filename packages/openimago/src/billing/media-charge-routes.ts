import { Hono } from "hono"
import {
  parseChargeBody,
  parseRefundBody,
  parseConfirmBody,
  executePrecharge,
  executeRefund,
  executeConfirm,
} from "./media-charge-commands"
import { validateServiceApiKey } from "../server/service-auth"

// ── Routes ───────────────────────────────────────────────────────────────

export const mediaChargeRoutes = new Hono()

/** Validate the x-api-key service auth header (OPENIMAGO_INTERNAL_API_KEY). */
const validateApiKey = validateServiceApiKey

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

  let rawBody: Record<string, unknown>
  try {
    rawBody = await c.req.json()
  } catch {
    return c.json(
      { error: { code: "BAD_REQUEST", message: "Invalid JSON body" } },
      400 as never,
    )
  }

  const parsed = parseChargeBody(rawBody)
  if ("code" in parsed) {
    return c.json(
      { error: { code: parsed.code, message: parsed.message } },
      parsed.status as never,
    )
  }

  const result = await executePrecharge(parsed)
  if (!result.success) {
    return c.json(
      { error: { code: result.code, message: result.message } },
      result.status as never,
    )
  }

  return c.json(
    {
      entry: {
        id: result.entryId,
        accountId: result.accountId,
        entryType: result.entryType,
        amountMicros: result.amountMicros,
        balanceAfterMicros: result.balanceAfterMicros,
        sourceId: result.sourceId,
        expiresAt: result.expiresAt,
        createdAt: result.createdAt,
      },
    },
    201 as never,
  )
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

  let rawBody: Record<string, unknown>
  try {
    rawBody = await c.req.json()
  } catch {
    return c.json(
      { error: { code: "BAD_REQUEST", message: "Invalid JSON body" } },
      400 as never,
    )
  }

  const parsed = parseRefundBody(rawBody)
  if ("code" in parsed) {
    return c.json(
      { error: { code: parsed.code, message: parsed.message } },
      parsed.status as never,
    )
  }

  const result = await executeRefund(parsed)
  if (!result.success) {
    return c.json(
      { error: { code: result.code, message: result.message } },
      result.status as never,
    )
  }

  return c.json(
    {
      entry: {
        id: result.entryId,
        accountId: result.accountId,
        entryType: result.entryType,
        amountMicros: result.amountMicros,
        balanceAfterMicros: result.balanceAfterMicros,
        createdAt: result.createdAt,
      },
    },
    201 as never,
  )
})

/**
 * POST /api/platform/billing/media-charge/confirm
 *
 * Confirm a media pre-charge (ADR 0010): mark the pre-charge ledger entry
 * CONFIRMED and clear its expiresAt, so the CDC Worker's expiry sweeper no
 * longer auto-refunds it. Called by the OpenCode plugin after a media-gen
 * provider call succeeds. Idempotent — a duplicate confirm is a no-op 200.
 *
 * Auth: x-api-key header must match OPENIMAGO_INTERNAL_API_KEY.
 */
mediaChargeRoutes.post("/media-charge/confirm", async (c) => {
  const authError = validateApiKey(c)
  if (authError) return authError

  let rawBody: Record<string, unknown>
  try {
    rawBody = await c.req.json()
  } catch {
    return c.json(
      { error: { code: "BAD_REQUEST", message: "Invalid JSON body" } },
      400 as never,
    )
  }

  const parsed = parseConfirmBody(rawBody)
  if ("code" in parsed) {
    return c.json(
      { error: { code: parsed.code, message: parsed.message } },
      parsed.status as never,
    )
  }

  const result = await executeConfirm(parsed)
  if (!result.success) {
    return c.json(
      { error: { code: result.code, message: result.message } },
      result.status as never,
    )
  }

  return c.json(
    {
      entry: {
        id: result.entryId,
        accountId: result.accountId,
        sourceId: result.sourceId,
        sourceStatus: result.sourceStatus,
        expiresAt: result.expiresAt,
      },
    },
    200 as never,
  )
})
