import { Context, Effect, Layer } from "effect"
import type { MediaProvider } from "./provider.js"

// ── Interface ──────────────────────────────────────────────────────────

export interface MediaProviderRegistryInterface {
  /** List all registered providers. */
  readonly all: () => Effect.Effect<ReadonlyArray<MediaProvider>>

  /** Register a provider. */
  readonly register: (p: MediaProvider) => Effect.Effect<void>
}

// ── Service Tag ────────────────────────────────────────────────────────

export class MediaProviderRegistry extends Context.Tag(
  "openimago/MediaProviderRegistry",
)<MediaProviderRegistry, MediaProviderRegistryInterface>() {}

// ── Layer ──────────────────────────────────────────────────────────────

export const layer = Layer.effect(
  MediaProviderRegistry,
  Effect.gen(function* () {
    const providers = new Map<string, MediaProvider>()

    const all: MediaProviderRegistryInterface["all"] = () =>
      Effect.succeed(Array.from(providers.values()))

    const register: MediaProviderRegistryInterface["register"] = (p) =>
      Effect.sync(() => {
        providers.set(p.id, p)
      })

    return { all, register }
  }),
)
