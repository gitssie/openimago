import { Context, Effect, Layer } from "effect"
import type { MediaConfigData } from "./config.js"
import { MediaConfig } from "./config.js"
import type { GenerateUsage } from "./pricing.js"

// ── Types ────────────────────────────────────────────────────────────────

/** Error raised when billing reporting fails. */
export class BillingError extends Error {
  readonly _tag = "BillingError"

  /** Backend error code (e.g. "INSUFFICIENT_BALANCE"). */
  readonly code?: string

  constructor(message: string, readonly cause?: unknown, code?: string) {
    super(message)
    this.code = code
  }
}

/**
 * Error raised when account balance is insufficient for a tool-call
 * pre-charge. Carries the "INSUFFICIENT_BALANCE" code from the backend.
 */
export class InsufficientBalanceError extends BillingError {
  constructor(message: string) {
    super(message, undefined, "INSUFFICIENT_BALANCE")
  }
}

/** Parameters for a tool-call charge report. */
export interface ChargeRequest {
  usage: GenerateUsage
  toolName: string
  /** Session ID — required when billing is active. */
  sessionId: string
  /** Workspace/project directory — required when billing is active. */
  directory: string
}

// ── Interface ────────────────────────────────────────────────────────────

export interface BillingReporterInterface {
  /**
   * Pre-charge: validate eligibility and write a charge BEFORE
   * calling the media provider. Hard-fail on any error.
   *
   * Throws `InsufficientBalanceError` if balance is insufficient.
   * Throws `BillingError` for other failures.
   */
  readonly reportPrecharge: (
    req: ChargeRequest,
  ) => Effect.Effect<{ sourceId: string }, BillingError>

  /**
   * Refund a pre-charge after provider generation fails.
   *
   * Best-effort: refund failures are logged but do NOT fail
   * the overall error path (provider error takes precedence).
   */
  readonly reportRefund: (
    req: ChargeRequest & { originalChargeSourceId: string },
  ) => Effect.Effect<void, BillingError>

  /**
   * Confirm a pre-charge after provider generation succeeds.
   *
   * Marks the original pre-charge CONFIRMED so the expiry safety net
   * (ADR 0010) won't auto-refund a good charge.
   *
   * Best-effort: confirm failures are logged but do NOT fail the
   * overall success path (the generation already succeeded).
   */
  readonly reportConfirm: (
    req: ChargeRequest & { originalChargeSourceId: string },
  ) => Effect.Effect<void, BillingError>
}

// ── Service Tag ──────────────────────────────────────────────────────────

export class BillingReporter extends Context.Tag("openimago/BillingReporter")<
  BillingReporter,
  BillingReporterInterface
>() {}

// ── Layer ────────────────────────────────────────────────────────────────

/**
 * Billing reporter layer.
 *
 * Requires `MediaConfig`.
 *
 * - If billingEnabled is explicitly false → no-op reporter.
 * - If billingEnabled is true → requires sessionId + directory per call;
 *   reports pre-charge/refund to the backend.
 * - If billingEnabled is undefined → no-op (billing not explicitly enabled).
 */
export const layer: Layer.Layer<BillingReporter, never, MediaConfig> =
  Layer.effect(
    BillingReporter,
    Effect.gen(function* () {
      const config = yield* MediaConfig

      // ── Billing explicitly disabled ─────────────────────────────
      if (config.billingEnabled === false) {
        return {
          reportPrecharge: () => Effect.succeed({ sourceId: "" }),
          reportRefund: () => Effect.succeed(undefined),
          reportConfirm: () => Effect.succeed(undefined),
        } satisfies BillingReporterInterface
      }

      // ── Billing not explicitly enabled ──────────────────────────
      if (config.billingEnabled !== true) {
        return {
          reportPrecharge: () => Effect.succeed({ sourceId: "" }),
          reportRefund: () => Effect.succeed(undefined),
          reportConfirm: () => Effect.succeed(undefined),
        } satisfies BillingReporterInterface
      }

      // ── Active billing reporter ─────────────────────────────────
      const backendUrl = config.backendUrl
      const apiKey = config.backendApiKey

      /** Validate session context is present. */
      function validateContext(req: ChargeRequest): void {
        if (!req.sessionId) {
          throw new BillingError("sessionId is required for media billing")
        }
        if (!req.directory) {
          throw new BillingError("directory is required for media billing")
        }
      }

      const postCharge = async (
        req: ChargeRequest,
      ): Promise<{ sourceId: string }> => {
        validateContext(req)

        const body: Record<string, unknown> = {
          sessionId: req.sessionId,
          directory: req.directory,
          provider: req.usage.provider,
          model: req.usage.model,
          toolName: req.toolName,
          mediaKind: req.usage.mediaKind,
          amountMicros: req.usage.amountMicros,
          quantity: req.usage.quantity,
          unit: req.usage.unit,
          pricingSnapshot: req.usage.pricingSnapshot,
        }

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        }
        if (apiKey) {
          headers["x-api-key"] = apiKey
        }

        const response = await fetch(
          `${backendUrl}/api/platform/billing/media-charge`,
          {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          },
        )

        if (!response.ok) {
          let errorCode: string | undefined
          try {
            const errBody = await response.json() as Record<string, unknown>
            errorCode = (errBody.error as Record<string, unknown>)?.code as string | undefined
          } catch {
            // ignore parse errors
          }

          if (errorCode === "INSUFFICIENT_BALANCE") {
            throw new InsufficientBalanceError(
              "Insufficient balance for media generation",
            )
          }

          const text = await response.text().catch(() => "(no body)")
          throw new BillingError(
            `Billing backend returned ${response.status}: ${text}`,
          )
        }

        const data = (await response.json()) as Record<string, unknown>
        const entry = data.entry as Record<string, unknown>
        return { sourceId: entry.sourceId as string }
      }

      const postRefund = async (
        req: ChargeRequest & { originalChargeSourceId: string },
      ): Promise<void> => {
        validateContext(req)

        const body: Record<string, unknown> = {
          sessionId: req.sessionId,
          directory: req.directory,
          amountMicros: Math.abs(req.usage.amountMicros), // positive refund
          originalChargeSourceId: req.originalChargeSourceId,
          provider: req.usage.provider,
          model: req.usage.model,
          toolName: req.toolName,
          mediaKind: req.usage.mediaKind,
        }

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        }
        if (apiKey) {
          headers["x-api-key"] = apiKey
        }

        const response = await fetch(
          `${backendUrl}/api/platform/billing/media-charge/refund`,
          {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          },
        )

        if (!response.ok) {
          const text = await response.text().catch(() => "(no body)")
          throw new BillingError(
            `Refund backend returned ${response.status}: ${text}`,
          )
        }
      }

      const postConfirm = async (
        req: ChargeRequest & { originalChargeSourceId: string },
      ): Promise<void> => {
        validateContext(req)

        const body: Record<string, unknown> = {
          sessionId: req.sessionId,
          directory: req.directory,
          originalChargeSourceId: req.originalChargeSourceId,
        }

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        }
        if (apiKey) {
          headers["x-api-key"] = apiKey
        }

        const response = await fetch(
          `${backendUrl}/api/platform/billing/media-charge/confirm`,
          {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          },
        )

        if (!response.ok) {
          const text = await response.text().catch(() => "(no body)")
          throw new BillingError(
            `Confirm backend returned ${response.status}: ${text}`,
          )
        }
      }

      const reportPrecharge: BillingReporterInterface["reportPrecharge"] = (
        req,
      ) =>
        Effect.tryPromise({
          try: () => postCharge(req),
          catch: (error) =>
            error instanceof InsufficientBalanceError
              ? error
              : error instanceof BillingError
                ? error
                : new BillingError(
                    `Failed to report pre-charge: ${(error as Error).message}`,
                    error,
                  ),
        })

      const reportRefund: BillingReporterInterface["reportRefund"] = (req) =>
        Effect.tryPromise({
          try: () => postRefund(req),
          catch: (error) =>
            error instanceof BillingError
              ? error
              : new BillingError(
                  `Failed to report refund: ${(error as Error).message}`,
                  error,
                ),
        })

      const reportConfirm: BillingReporterInterface["reportConfirm"] = (req) =>
        Effect.tryPromise({
          try: () => postConfirm(req),
          catch: (error) =>
            error instanceof BillingError
              ? error
              : new BillingError(
                  `Failed to report confirm: ${(error as Error).message}`,
                  error,
                ),
        })

      return {
        reportPrecharge,
        reportRefund,
        reportConfirm,
      } satisfies BillingReporterInterface
    }),
  )
