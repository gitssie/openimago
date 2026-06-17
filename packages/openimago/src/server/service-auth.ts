import type { Context } from "hono"
import { logger } from "./logger"

/**
 * Internal service-to-service API key for trusted backend callers
 * (e.g. the OpenCode plugin). Must be set via OPENIMAGO_INTERNAL_API_KEY.
 *
 * This is the single source of truth for service auth — billing media-charge
 * and workspace-files registration both validate against this value.
 */
function getInternalApiKey(): string | undefined {
  return process.env.OPENIMAGO_INTERNAL_API_KEY
}

/**
 * Validate the `x-api-key` header against OPENIMAGO_INTERNAL_API_KEY.
 *
 * Returns:
 *   - a `Response` when validation fails (caller should return it directly):
 *       - 500 CONFIGURATION_REQUIRED when the key is not configured
 *       - 401 UNAUTHORIZED when the header is missing or does not match
 *   - `null` when validation passes.
 *
 * Note: an absent header on a route that ALSO supports JWT auth should NOT be
 * treated as a service-auth failure by the caller — check `hasServiceApiKey`
 * first to decide whether the service channel applies.
 */
export function validateServiceApiKey(c: Context): Response | null {
  const expectedKey = getInternalApiKey()
  if (!expectedKey) {
    logger.error("service-auth: OPENIMAGO_INTERNAL_API_KEY not configured")
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
    logger.warn("service-auth: invalid or missing x-api-key")
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid API key" } },
      401,
    )
  }

  return null // auth passed
}

/** Whether the request carries an `x-api-key` header (service-auth channel). */
export function hasServiceApiKey(c: Context): boolean {
  return c.req.header("x-api-key") != null
}
