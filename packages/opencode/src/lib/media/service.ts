import { Context, Effect, Layer } from "effect"
import {
  type GenerateImageParams,
  type GenerateVideoParams,
  type GenerateAudioParams,
  type GenerateResult,
  GenerateError,
  type MediaKind,
} from "./provider.js"
import { MediaProviderRouter, ResolveError } from "./router.js"
import { MediaConfig } from "./config.js"
import { BillingReporter, type BillingError } from "./billing.js"
import { resolvePricing, type GenerateUsage } from "./pricing.js"

// ── Interface ──────────────────────────────────────────────────────────

export interface MediaGenerationServiceInterface {
  /**
   * Generate an image using the provider that handles the requested model.
   * The model param in `params` is used to resolve the provider.
   *
   * Pre-charge: validates billing eligibility before calling the provider.
   * Refunds on provider failure after a successful pre-charge.
   */
  readonly generateImage: (
    params: GenerateImageParams,
  ) => Effect.Effect<GenerateResult, GenerateError | ResolveError | BillingError>

  /**
   * Generate a video using the provider that handles the requested model.
   *
   * Pre-charge: validates billing eligibility before calling the provider.
   * Refunds on provider failure after a successful pre-charge.
   */
  readonly generateVideo: (
    params: GenerateVideoParams,
  ) => Effect.Effect<GenerateResult, GenerateError | ResolveError | BillingError>

  /**
   * Generate audio (TTS) using the provider that handles the requested model.
   *
   * Pre-charge: validates billing eligibility before calling the provider.
   * Refunds on provider failure after a successful pre-charge.
   */
  readonly generateAudio: (
    params: GenerateAudioParams,
  ) => Effect.Effect<GenerateResult, GenerateError | ResolveError | BillingError>
}

// ── Service Tag ────────────────────────────────────────────────────────

export class MediaGenerationService extends Context.Tag(
  "openimago/MediaGenerationService",
)<MediaGenerationService, MediaGenerationServiceInterface>() {}

// ── Helpers ──────────────────────────────────────────────────────────────

function buildUsage(
  result: GenerateResult,
  providerId: string,
  model: string,
  mediaKind: MediaKind,
): GenerateUsage {
  // Provider-reported usage takes precedence
  if (result.usage) return result.usage

  // Fall back to pricing table
  const pricing = resolvePricing(mediaKind, model)
  return {
    provider: providerId,
    model,
    mediaKind,
    amountMicros: pricing.amountMicros,
    quantity: 1,
    unit: pricing.unit,
    pricingSnapshot: {
      source: "pricing_table",
      entry: pricing,
    },
  }
}

/**
 * Build a GenerateUsage from pricing estimation (before provider call).
 * Used for pre-charge where we don't have a result yet.
 */
function buildEstimatedUsage(
  providerId: string,
  model: string,
  mediaKind: MediaKind,
): GenerateUsage {
  const pricing = resolvePricing(mediaKind, model)
  return {
    provider: providerId,
    model,
    mediaKind,
    amountMicros: pricing.amountMicros,
    quantity: 1,
    unit: pricing.unit,
    pricingSnapshot: {
      source: "pricing_table",
      entry: pricing,
    },
  }
}

// ── Layer ──────────────────────────────────────────────────────────────

export const layer = Layer.effect(
  MediaGenerationService,
  Effect.gen(function* () {
    const router = yield* MediaProviderRouter
    const billing = yield* BillingReporter
    yield* MediaConfig // config is yielded to validate it's available

    const generateImage: MediaGenerationServiceInterface["generateImage"] =
      (params) =>
        Effect.gen(function* () {
          const provider = yield* router.resolve(params.model, "image")
          yield* Effect.log(
            `Generating image with provider "${provider.id}" (model: ${params.model})`,
          )

          // Build estimated usage from pricing table
          const estimatedUsage = buildEstimatedUsage(
            provider.id,
            params.model,
            "image",
          )

          // Pre-charge: validate eligibility BEFORE calling provider
          const { sourceId } = yield* billing.reportPrecharge({
            usage: estimatedUsage,
            toolName: "image_generate",
            sessionId: params.sessionId ?? "",
            directory: params.directory ?? "",
          })

          try {
            const result = yield* provider.generateImage(params)
            // Provider succeeded — confirm the pre-charge so the expiry
            // safety net (ADR 0010) won't auto-refund a good charge.
            // Best-effort: a confirm failure must NOT fail the generation.
            yield* billing.reportConfirm({
              usage: estimatedUsage,
              toolName: "image_generate",
              sessionId: params.sessionId ?? "",
              directory: params.directory ?? "",
              originalChargeSourceId: sourceId,
            }).pipe(
              Effect.catchAll((confirmError) =>
                Effect.logError(
                  `Confirm failed after provider success: ${(confirmError as Error).message}`,
                ),
              ),
            )
            return result
          } catch (error) {
            // Provider failed after pre-charge — refund
            yield* billing.reportRefund({
              usage: estimatedUsage,
              toolName: "image_generate",
              sessionId: params.sessionId ?? "",
              directory: params.directory ?? "",
              originalChargeSourceId: sourceId,
            }).pipe(
              Effect.catchAll((refundError) =>
                Effect.logError(
                  `Refund failed after provider error: ${(refundError as Error).message}`,
                ),
              ),
            )
            throw error
          }
        })

    const generateVideo: MediaGenerationServiceInterface["generateVideo"] =
      (params) =>
        Effect.gen(function* () {
          const provider = yield* router.resolve(params.model, "video")
          yield* Effect.log(
            `Generating video with provider "${provider.id}" (model: ${params.model})`,
          )

          // Build estimated usage from pricing table
          const estimatedUsage = buildEstimatedUsage(
            provider.id,
            params.model,
            "video",
          )

          // Pre-charge: validate eligibility BEFORE calling provider
          const { sourceId } = yield* billing.reportPrecharge({
            usage: estimatedUsage,
            toolName: "video_generate",
            sessionId: params.sessionId ?? "",
            directory: params.directory ?? "",
          })

          try {
            const result = yield* provider.generateVideo(params)
            // Provider succeeded — confirm the pre-charge so the expiry
            // safety net (ADR 0010) won't auto-refund a good charge.
            // Best-effort: a confirm failure must NOT fail the generation.
            yield* billing.reportConfirm({
              usage: estimatedUsage,
              toolName: "video_generate",
              sessionId: params.sessionId ?? "",
              directory: params.directory ?? "",
              originalChargeSourceId: sourceId,
            }).pipe(
              Effect.catchAll((confirmError) =>
                Effect.logError(
                  `Confirm failed after provider success: ${(confirmError as Error).message}`,
                ),
              ),
            )
            return result
          } catch (error) {
            // Provider failed after pre-charge — refund
            yield* billing.reportRefund({
              usage: estimatedUsage,
              toolName: "video_generate",
              sessionId: params.sessionId ?? "",
              directory: params.directory ?? "",
              originalChargeSourceId: sourceId,
            }).pipe(
              Effect.catchAll((refundError) =>
                Effect.logError(
                  `Refund failed after provider error: ${(refundError as Error).message}`,
                ),
              ),
            )
            throw error
          }
        })

    const generateAudio: MediaGenerationServiceInterface["generateAudio"] =
      (params) =>
        Effect.gen(function* () {
          const provider = yield* router.resolve(params.model, "audio")
          yield* Effect.log(
            `Generating audio with provider "${provider.id}" (model: ${params.model})`,
          )

          // Build estimated usage from pricing table
          const estimatedUsage = buildEstimatedUsage(
            provider.id,
            params.model,
            "audio",
          )

          // Pre-charge: validate eligibility BEFORE calling provider
          const { sourceId } = yield* billing.reportPrecharge({
            usage: estimatedUsage,
            toolName: "audio_generate",
            sessionId: params.sessionId ?? "",
            directory: params.directory ?? "",
          })

          // Provider must have generateAudio; fail clearly if missing
          if (!provider.generateAudio) {
            return yield* Effect.fail(
              new GenerateError(
                provider.id,
                `Provider "${provider.id}" does not support audio generation`,
              ),
            )
          }

          try {
            const result = yield* provider.generateAudio(params)
            // Provider succeeded — confirm the pre-charge so the expiry
            // safety net (ADR 0010) won't auto-refund a good charge.
            // Best-effort: a confirm failure must NOT fail the generation.
            yield* billing.reportConfirm({
              usage: estimatedUsage,
              toolName: "audio_generate",
              sessionId: params.sessionId ?? "",
              directory: params.directory ?? "",
              originalChargeSourceId: sourceId,
            }).pipe(
              Effect.catchAll((confirmError) =>
                Effect.logError(
                  `Confirm failed after provider success: ${(confirmError as Error).message}`,
                ),
              ),
            )
            return result
          } catch (error) {
            // Provider failed after pre-charge — refund
            yield* billing.reportRefund({
              usage: estimatedUsage,
              toolName: "audio_generate",
              sessionId: params.sessionId ?? "",
              directory: params.directory ?? "",
              originalChargeSourceId: sourceId,
            }).pipe(
              Effect.catchAll((refundError) =>
                Effect.logError(
                  `Refund failed after provider error: ${(refundError as Error).message}`,
                ),
              ),
            )
            throw error
          }
        })

    return { generateImage, generateVideo, generateAudio }
  }),
)
