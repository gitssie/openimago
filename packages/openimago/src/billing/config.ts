// ── Billing config (ADR 0010) ────────────────────────────────────────────────
//
// Media pre-charge TTL. No hidden default (repo No-Hidden-Defaults rule): the
// value MUST come from OPENIMAGO_MEDIA_PRECHARGE_TTL_SECONDS. If it is missing or
// not a positive integer, we fail loudly so the operator knows exactly which key
// to set instead of silently applying a guessed TTL.

export const MEDIA_PRECHARGE_TTL_ENV = "OPENIMAGO_MEDIA_PRECHARGE_TTL_SECONDS"

/** Error thrown when the pre-charge TTL config key is missing or invalid. */
export const MEDIA_PRECHARGE_TTL_NOT_CONFIGURED = "MEDIA_PRECHARGE_TTL_NOT_CONFIGURED"

/**
 * Read the media pre-charge TTL, in seconds, from the environment.
 *
 * @throws Error with message `MEDIA_PRECHARGE_TTL_NOT_CONFIGURED` when the key is
 *   unset or not a positive integer.
 */
export function getMediaPrechargeTtlSeconds(): number {
  const raw = process.env[MEDIA_PRECHARGE_TTL_ENV]
  if (raw === undefined || raw.trim() === "") {
    throw new Error(MEDIA_PRECHARGE_TTL_NOT_CONFIGURED)
  }

  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(MEDIA_PRECHARGE_TTL_NOT_CONFIGURED)
  }

  return parsed
}
