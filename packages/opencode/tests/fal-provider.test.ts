import { describe, test, expect, mock, afterEach } from "bun:test"
import { Effect, Layer } from "effect"
import { MediaProviderRegistry, layer as registryLayer } from "../src/lib/media/registry.ts"
import { MediaProviderRouter, layer as routerLayer } from "../src/lib/media/router.ts"
import { MediaConfig, layer as configLayer } from "../src/lib/media/config.ts"
import {
  createFalImageProvider,
  createFalVideoProvider,
} from "../src/lib/media/providers/fal.ts"
import { mockImageProvider } from "../src/lib/media/provider.ts"

describe("fal.ai image provider", () => {
  afterEach(() => {
    mock.restore()
  })

  test("exact model match selects fal-image for fal-ai/flux/dev", async () => {
    const populatedRegistry = Layer.effect(
      MediaProviderRegistry,
      Effect.gen(function* () {
        const registry = yield* MediaProviderRegistry
        const config = yield* MediaConfig

        const falImage = createFalImageProvider(config)
        yield* registry.register(falImage)
        yield* registry.register(mockImageProvider)

        return registry
      }),
    ).pipe(Layer.provide(registryLayer), Layer.provide(configLayer))

    const layer = routerLayer.pipe(
      Layer.provide(populatedRegistry),
      Layer.provide(configLayer),
    )

    const provider = await Effect.runPromise(
      Effect.gen(function* () {
        const router = yield* MediaProviderRouter
        return yield* router.resolve("fal-ai/flux/dev", "image")
      }).pipe(Effect.provide(layer)),
    )

    expect(provider.id).toBe("fal-image")
    expect(provider.kind).toBe("image")
    expect(provider.models).toContain("fal-ai/flux/dev")
    expect(provider.models).toContain("fal-ai/flux/schnell")
  })

  test("model alias flux-dev routes to fal-image", async () => {
    const populatedRegistry = Layer.effect(
      MediaProviderRegistry,
      Effect.gen(function* () {
        const registry = yield* MediaProviderRegistry
        const config = yield* MediaConfig
        const falImage = createFalImageProvider(config)
        yield* registry.register(falImage)
        return registry
      }),
    ).pipe(Layer.provide(registryLayer), Layer.provide(configLayer))

    const layer = routerLayer.pipe(
      Layer.provide(populatedRegistry),
      Layer.provide(configLayer),
    )

    const provider = await Effect.runPromise(
      Effect.gen(function* () {
        const router = yield* MediaProviderRouter
        return yield* router.resolve("flux-dev", "image")
      }).pipe(Effect.provide(layer)),
    )

    expect(provider.id).toBe("fal-image")
  })

  test("generateImage extracts data.images[0].url from fal.subscribe", async () => {
    mock.module("@fal-ai/client", () => ({
      fal: {
        config: () => {},
        subscribe: async () => ({
          data: {
            images: [{ url: "https://fal.ai/output/test-image.png" }],
          },
        }),
      },
    }))

    const falImage = createFalImageProvider({
      backendUrl: "http://localhost:5467",
      providers: { fal: { apiKey: "test-fal-key" } },
    })

    const result = await Effect.runPromise(
      falImage.generateImage({
        model: "fal-ai/flux/dev",
        prompt: "a majestic mountain",
      }),
    )

    expect(result.url).toBe("https://fal.ai/output/test-image.png")
    expect((result.metadata as Record<string, unknown>).provider).toBe("fal")
    expect((result.metadata as Record<string, unknown>).model).toBe("fal-ai/flux/dev")
  })

  test("missing FAL_KEY throws clear error at execute time", async () => {
    const falImage = createFalImageProvider({
      backendUrl: "http://localhost:5467",
      providers: {},
    })

    await expect(
      Effect.runPromise(
        falImage.generateImage({
          model: "fal-ai/flux/dev",
          prompt: "test",
        }),
      ),
    ).rejects.toThrow("FAL_KEY is not set")
  })
})

describe("fal.ai video provider", () => {
  afterEach(() => {
    mock.restore()
  })

  test("exact model match selects fal-video for seedance endpoint", async () => {
    const populatedRegistry = Layer.effect(
      MediaProviderRegistry,
      Effect.gen(function* () {
        const registry = yield* MediaProviderRegistry
        const config = yield* MediaConfig

        const falVideo = createFalVideoProvider(config)
        yield* registry.register(falVideo)

        return registry
      }),
    ).pipe(Layer.provide(registryLayer), Layer.provide(configLayer))

    const layer = routerLayer.pipe(
      Layer.provide(populatedRegistry),
      Layer.provide(configLayer),
    )

    const provider = await Effect.runPromise(
      Effect.gen(function* () {
        const router = yield* MediaProviderRouter
        return yield* router.resolve(
          "bytedance/seedance-2.0/text-to-video",
          "video",
        )
      }).pipe(Effect.provide(layer)),
    )

    expect(provider.id).toBe("fal-video")
    expect(provider.kind).toBe("video")
    expect(provider.models).toContain("bytedance/seedance-2.0/text-to-video")
  })

  test("model alias seedance-2.0 routes to fal-video", async () => {
    const populatedRegistry = Layer.effect(
      MediaProviderRegistry,
      Effect.gen(function* () {
        const registry = yield* MediaProviderRegistry
        const config = yield* MediaConfig
        const falVideo = createFalVideoProvider(config)
        yield* registry.register(falVideo)
        return registry
      }),
    ).pipe(Layer.provide(registryLayer), Layer.provide(configLayer))

    const layer = routerLayer.pipe(
      Layer.provide(populatedRegistry),
      Layer.provide(configLayer),
    )

    const provider = await Effect.runPromise(
      Effect.gen(function* () {
        const router = yield* MediaProviderRouter
        return yield* router.resolve("seedance-2.0", "video")
      }).pipe(Effect.provide(layer)),
    )

    expect(provider.id).toBe("fal-video")
  })

  test("generateVideo extracts data.video.url from fal.subscribe", async () => {
    mock.module("@fal-ai/client", () => ({
      fal: {
        config: () => {},
        subscribe: async () => ({
          data: {
            video: { url: "https://fal.ai/output/test-video.mp4" },
          },
        }),
      },
    }))

    const falVideo = createFalVideoProvider({
      backendUrl: "http://localhost:5467",
      providers: { fal: { apiKey: "test-fal-key" } },
    })

    const result = await Effect.runPromise(
      falVideo.generateVideo({
        model: "seedance-2.0",
        prompt: "a sunset over mountains",
        durationSeconds: 5,
        aspectRatio: "16:9",
      }),
    )

    expect(result.url).toBe("https://fal.ai/output/test-video.mp4")
    expect((result.metadata as Record<string, unknown>).provider).toBe("fal")
    expect((result.metadata as Record<string, unknown>).durationSeconds).toBe(5)
  })
})
