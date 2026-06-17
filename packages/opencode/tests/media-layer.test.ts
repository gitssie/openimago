import { describe, test, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { mediaDefaultLayer } from "../src/lib/media/layer.ts"
import { MediaGenerationService } from "../src/lib/media/service.ts"
import { MediaProviderRouter, layer as routerLayer } from "../src/lib/media/router.ts"
import { MediaProviderRegistry, layer as registryLayer } from "../src/lib/media/registry.ts"
import { MediaConfig, layer as configLayer } from "../src/lib/media/config.ts"

describe("Effect IOC media layer", () => {
  test("mediaDefaultLayer generates mock image with exact model match", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* MediaGenerationService
        return yield* svc.generateImage({
          model: "mock-image-model",
          prompt: "a cat on a skateboard",
        })
      }).pipe(Effect.provide(mediaDefaultLayer)),
    )

    // Loadable picsum.photos URL (per media-tool-integration-contract)
    expect(result.url).toStartWith("https://picsum.photos/seed/")
    expect(result.url).toContain("/1024/1024")
    expect(result.metadata).toBeDefined()
    expect((result.metadata as Record<string, unknown>).provider).toBe("mock-image")
    expect((result.metadata as Record<string, unknown>).model).toBe("mock-image-model")
    expect((result.metadata as Record<string, unknown>).mime).toBe("image/jpeg")
  })

  test("mediaDefaultLayer generates mock video with exact model match", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* MediaGenerationService
        return yield* svc.generateVideo({
          model: "mock-video-model",
          prompt: "a sunset timelapse",
        })
      }).pipe(Effect.provide(mediaDefaultLayer)),
    )

    // Loadable public sample MP4 (per media-tool-integration-contract)
    expect(result.url).toStartWith("https://")
    expect(result.url).toEndWith(".mp4")
    expect((result.metadata as Record<string, unknown>).provider).toBe("mock-video")
    expect((result.metadata as Record<string, unknown>).model).toBe("mock-video-model")
    expect((result.metadata as Record<string, unknown>).mime).toBe("video/mp4")
  })

  test("unknown model falls back to first provider of requested kind", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* MediaGenerationService
        return yield* svc.generateImage({
          model: "nonexistent-model",
          prompt: "test fallback",
        })
      }).pipe(Effect.provide(mediaDefaultLayer)),
    )

    // Falls back to first image provider (mock-image)
    expect(result.url).toStartWith("https://picsum.photos/seed/")
    expect((result.metadata as Record<string, unknown>).provider).toBe("mock-image")
  })

  test("ResolveError when no provider registered for requested kind", async () => {
    // Build a layer with an empty registry (no mock providers registered)
    const emptyLayer = routerLayer.pipe(
      Layer.provide(registryLayer),
      Layer.provide(configLayer),
    )

    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const router = yield* MediaProviderRouter
          return yield* router.resolve("any-model", "image")
        }).pipe(Effect.provide(emptyLayer)),
      ),
    ).rejects.toThrow("No provider found")
  })

  test("exact model match selects correct provider", async () => {
    // Build a router layer that registers mock providers
    const { mockImageProvider, mockVideoProvider } = await import(
      "../src/lib/media/provider.ts"
    )

    const populatedRouter = routerLayer.pipe(
      Layer.provide(
        Layer.effect(
          MediaProviderRegistry,
          Effect.gen(function* () {
            const reg = yield* MediaProviderRegistry
            yield* reg.register(mockImageProvider)
            yield* reg.register(mockVideoProvider)
            return reg
          }),
        ).pipe(
          Layer.provide(registryLayer),
          Layer.provide(configLayer),
        ),
      ),
      Layer.provide(configLayer),
    )

    const provider = await Effect.runPromise(
      Effect.gen(function* () {
        const router = yield* MediaProviderRouter
        return yield* router.resolve("mock-image-model", "image")
      }).pipe(Effect.provide(populatedRouter)),
    )

    expect(provider.id).toBe("mock-image")
    expect(provider.kind).toBe("image")
    expect(provider.models).toContain("mock-image-model")
  })

  test("mock image provider rejects video generation with GenerateError", async () => {
    const { mockImageProvider } = await import("../src/lib/media/provider.ts")

    await expect(
      Effect.runPromise(
        mockImageProvider.generateVideo({
          model: "mock-image-model",
          prompt: "test",
        }),
      ),
    ).rejects.toThrow("does not support video")
  })

  test("mock video provider rejects image generation with GenerateError", async () => {
    const { mockVideoProvider } = await import("../src/lib/media/provider.ts")

    await expect(
      Effect.runPromise(
        mockVideoProvider.generateImage({
          model: "mock-video-model",
          prompt: "test",
        }),
      ),
    ).rejects.toThrow("does not support images")
  })

  test("mediaDefaultLayer generates mock audio with exact model match", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* MediaGenerationService
        return yield* svc.generateAudio({
          model: "mock-audio-model",
          text: "Hello world",
        })
      }).pipe(Effect.provide(mediaDefaultLayer)),
    )

    // Loadable WAV data URI (per media-tool-integration-contract)
    expect(result.url).toStartWith("data:audio/wav;base64,")
    expect(result.metadata).toBeDefined()
    expect((result.metadata as Record<string, unknown>).provider).toBe("mock-audio")
    expect((result.metadata as Record<string, unknown>).model).toBe("mock-audio-model")
    expect((result.metadata as Record<string, unknown>).mime).toBe("audio/wav")
  })

  test("mock audio provider rejects image generation with GenerateError", async () => {
    const { mockAudioProvider } = await import("../src/lib/media/provider.ts")

    await expect(
      Effect.runPromise(
        mockAudioProvider.generateImage({
          model: "mock-audio-model",
          prompt: "test",
        }),
      ),
    ).rejects.toThrow("does not support images")
  })

  test("mock audio provider rejects video generation with GenerateError", async () => {
    const { mockAudioProvider } = await import("../src/lib/media/provider.ts")

    await expect(
      Effect.runPromise(
        mockAudioProvider.generateVideo({
          model: "mock-audio-model",
          prompt: "test",
        }),
      ),
    ).rejects.toThrow("does not support video")
  })
})
