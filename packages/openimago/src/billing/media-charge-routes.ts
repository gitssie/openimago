import { Hono } from "hono"
import { logger } from "../server/logger"
import {
  parseChargeBody,
  parseRefundBody,
  executePrecharge,
  executeRefund,
} from "./media-charge-commands"

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
