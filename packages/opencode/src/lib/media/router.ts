import { Context, Effect, Layer } from "effect"
import { type MediaProvider } from "./provider.js"
import { MediaProviderRegistry } from "./registry.js"

// ── Types ──────────────────────────────────────────────────────────────

/** Capability summary exposed to the tool layer. */
export interface ProviderCapability {
  /** Provider identifier, e.g. "openai", "google", "fal" */
  id: string
  /** Supported models for this provider */
  models: string[]
  /** Human-readable display name */
  label: string
  /** Provider kind */
  kind: "image" | "video" | "audio"
}

/** Error returned when no provider matches a requested model. */
export class ResolveError extends Error {
  readonly _tag = "ResolveError"
  constructor(readonly model: string, readonly kind: "image" | "video" | "audio") {
    super(
      `No provider found for model "${model}" (kind: ${kind}). ` +
        `Available providers can be listed via the media provider capabilities.`,
    )
  }
}

// ── Interface ──────────────────────────────────────────────────────────

export interface MediaProviderRouterInterface {
  /**
   * Resolve which provider handles a given model.
   * Falls back to the first provider of the matching kind.
   */
  readonly resolve: (
    model: string,
    kind: "image" | "video" | "audio",
  ) => Effect.Effect<MediaProvider, ResolveError>

  /** List available providers and their capabilities. */
  readonly listCapabilities: (
    kind: "image" | "video" | "audio",
  ) => Effect.Effect<ReadonlyArray<ProviderCapability>>
}

// ── Service Tag ────────────────────────────────────────────────────────

export class MediaProviderRouter extends Context.Tag(
  "openimago/MediaProviderRouter",
)<MediaProviderRouter, MediaProviderRouterInterface>() {}

// ── Layer ──────────────────────────────────────────────────────────────

export const layer = Layer.effect(
  MediaProviderRouter,
  Effect.gen(function* () {
    const registry = yield* MediaProviderRegistry

    const resolve: MediaProviderRouterInterface["resolve"] = (model, kind) =>
      Effect.gen(function* () {
        const providers = yield* registry.all()
        const filtered = providers.filter((p) => p.kind === kind)

        // Exact model match first
        const exact = filtered.find((p) => p.models.includes(model))
        if (exact) return exact

        // Otherwise return the first provider of the right kind
        const fallback = filtered[0]
        if (fallback) return fallback

        return yield* Effect.fail(new ResolveError(model, kind))
      })

    const listCapabilities: MediaProviderRouterInterface["listCapabilities"] =
      (kind) =>
        Effect.gen(function* () {
          const providers = yield* registry.all()
          return providers
            .filter((p) => p.kind === kind)
            .map((p) => ({
              id: p.id,
              models: [...p.models],
              label: p.label,
              kind: p.kind,
            }))
        })

    return { resolve, listCapabilities }
  }),
)
