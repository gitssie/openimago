import { Layer, Effect } from "effect"

import {
  mockImageProvider,
  mockVideoProvider,
  mockAudioProvider,
} from "./provider.js"
import {
  MediaProviderRegistry,
  layer as registryLayer,
} from "./registry.js"
import { MediaProviderRouter, layer as routerLayer } from "./router.js"
import {
  MediaGenerationService,
  layer as serviceLayer,
} from "./service.js"
import { MediaConfig, layer as configLayer } from "./config.js"
import { BillingReporter, layer as billingLayer } from "./billing.js"
import { createGoogleProvider } from "./providers/google.js"
import { createOpenAIProvider } from "./providers/openai.js"
import { createFalImageProvider, createFalVideoProvider } from "./providers/fal.js"
import {
  createTencentCloudImageProvider,
  createTencentCloudVideoProvider,
  createTencentCloudAudioProvider,
} from "./providers/tencent-cloud.js"

/**
 * Default media layer for the OpenImago plugin.
 *
 * Composes all media IOC layers — registry, router, generation service,
 * and config — and registers mock, Google, OpenAI, and fal.ai providers
 * so the full tool chain works end-to-end.
 *
 * Providers are always registered (capability discovery).
 * They return clear errors if their respective API keys are missing
 * at execute time.
 *
 * Example usage in a tool:
 *   ```ts
 *   const result = await Effect.runPromise(
 *     Effect.gen(function* () {
 *       const svc = yield* MediaGenerationService
 *       return yield* svc.generateImage({ model, prompt })
 *     }).pipe(Effect.provide(mediaDefaultLayer)),
 *   )
 *   ```
 */
export const mediaDefaultLayer = Layer.suspend(() => {
  // Build a populated registry layer that registers all providers
  const populatedRegistry = Layer.effect(
    MediaProviderRegistry,
    Effect.gen(function* () {
      const registry = yield* MediaProviderRegistry
      const config = yield* MediaConfig

      // Register mock providers for testing
      yield* registry.register(mockImageProvider)
      yield* registry.register(mockVideoProvider)
      yield* registry.register(mockAudioProvider)

      // Register Google provider (API key validated at execute time)
      const google = createGoogleProvider(config)
      yield* registry.register(google)

      // Register OpenAI provider (API key validated at execute time)
      const openai = createOpenAIProvider(config)
      yield* registry.register(openai)

      // Register fal.ai providers (FAL_KEY validated at execute time)
      const falImage = createFalImageProvider(config)
      yield* registry.register(falImage)
      const falVideo = createFalVideoProvider(config)
      yield* registry.register(falVideo)

      // Register Tencent Cloud providers (credentials validated at execute time)
      const tcImage = createTencentCloudImageProvider(config)
      yield* registry.register(tcImage)
      const tcVideo = createTencentCloudVideoProvider(config)
      yield* registry.register(tcVideo)
      const tcAudio = createTencentCloudAudioProvider(config)
      yield* registry.register(tcAudio)

      return registry
    }),
  ).pipe(
    Layer.provide(registryLayer),
    Layer.provide(configLayer),
  )

  // Compose the full service stack
  return serviceLayer.pipe(
    Layer.provide(routerLayer),
    Layer.provide(populatedRegistry),
    Layer.provide(billingLayer),
    Layer.provide(configLayer),
  )
})
