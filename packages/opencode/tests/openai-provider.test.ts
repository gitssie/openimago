import { describe, test, expect, mock, afterEach } from "bun:test"
import { Effect, Layer } from "effect"
import { MediaProviderRegistry, layer as registryLayer } from "../src/lib/media/registry.ts"
import { MediaProviderRouter, layer as routerLayer } from "../src/lib/media/router.ts"
import { MediaConfig, layer as configLayer } from "../src/lib/media/config.ts"
import { createOpenAIProvider } from "../src/lib/media/providers/openai.ts"
import { mockImageProvider } from "../src/lib/media/provider.ts"

describe("OpenAI provider", () => {
  afterEach(() => {
    mock.restore()
  })

  test("exact model match selects OpenAI for gpt-image-2", async () => {
    const populatedRegistry = Layer.effect(
      MediaProviderRegistry,
      Effect.gen(function* () {
        const registry = yield* MediaProviderRegistry
        const config = yield* MediaConfig
        const openai = createOpenAIProvider(config)
        yield* registry.register(openai)
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
        return yield* router.resolve("gpt-image-2", "image")
      }).pipe(Effect.provide(layer)),
    )

    expect(provider.id).toBe("openai")
    expect(provider.models).toContain("gpt-image-2")
    expect(provider.models).toContain("gpt-image-2-2026-04-21")
  })

  test("exact model match selects OpenAI for gpt-image-1.5", async () => {
    const populatedRegistry = Layer.effect(
      MediaProviderRegistry,
      Effect.gen(function* () {
        const registry = yield* MediaProviderRegistry
        const config = yield* MediaConfig
        const openai = createOpenAIProvider(config)
        yield* registry.register(openai)
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
        return yield* router.resolve("gpt-image-1.5", "image")
      }).pipe(Effect.provide(layer)),
    )

    expect(provider.id).toBe("openai")
    expect(provider.models).toContain("gpt-image-1.5")
  })

  test("generateImage with gpt-image-2 extracts b64_json and passes params", async () => {
    let capturedParams: Record<string, unknown> = {}
    mock.module("openai", () => ({
      OpenAI: class {
        images = {
          generate: async (params: Record<string, unknown>) => {
            capturedParams = params
            return {
              data: [{ b64_json: "ZmFrZWltYWdlZGF0YQ==" }],
            }
          },
        }
      },
    }))

    const openai = createOpenAIProvider({
      backendUrl: "http://localhost:5467",
      providers: { openai: { apiKey: "test-key" } },
    })

    const result = await Effect.runPromise(
      openai.generateImage({
        model: "gpt-image-2",
        prompt: "test image",
        size: "1536x1024",
        quality: "high",
        outputFormat: "webp",
      }),
    )

    expect(result.url).toStartWith("data:image/png;base64,")
    expect(result.url).toContain("ZmFrZWltYWdlZGF0YQ==")
    expect((result.metadata as Record<string, unknown>).provider).toBe("openai")
    expect((result.metadata as Record<string, unknown>).model).toBe("gpt-image-2")
    expect((result.metadata as Record<string, unknown>).size).toBe("1536x1024")
    expect((result.metadata as Record<string, unknown>).quality).toBe("high")

    // Verify params were forwarded to the SDK
    expect(capturedParams.model).toBe("gpt-image-2")
    expect(capturedParams.size).toBe("1536x1024")
    expect(capturedParams.quality).toBe("high")
    expect(capturedParams.output_format).toBe("webp")
  })

  test("generateImage with gpt-image-1.5 still works", async () => {
    mock.module("openai", () => ({
      OpenAI: class {
        images = {
          generate: async () => ({
            data: [{ b64_json: "bGVnYWN5aW1hZ2U=" }],
          }),
        }
      },
    }))

    const openai = createOpenAIProvider({
      backendUrl: "http://localhost:5467",
      providers: { openai: { apiKey: "test-key" } },
    })

    const result = await Effect.runPromise(
      openai.generateImage({
        model: "gpt-image-1.5",
        prompt: "legacy test",
      }),
    )

    expect(result.url).toStartWith("data:image/png;base64,")
    expect((result.metadata as Record<string, unknown>).provider).toBe("openai")
    expect((result.metadata as Record<string, unknown>).model).toBe("gpt-image-1.5")
  })

  test("missing OPENAI_API_KEY returns clear error", async () => {
    const openai = createOpenAIProvider({
      backendUrl: "http://localhost:5467",
      providers: {},
    })

    await expect(
      Effect.runPromise(
        openai.generateImage({ model: "gpt-image-2", prompt: "test" }),
      ),
    ).rejects.toThrow("OPENAI_API_KEY is not set")
  })

  test("generateVideo returns not-yet-implemented error", async () => {
    const openai = createOpenAIProvider({
      backendUrl: "http://localhost:5467",
      providers: { openai: { apiKey: "test-key" } },
    })

    await expect(
      Effect.runPromise(
        openai.generateVideo({ model: "sora-2", prompt: "test video" }),
      ),
    ).rejects.toThrow("not yet implemented")
  })

  test("provider lists all supported image and video models", () => {
    const openai = createOpenAIProvider({
      backendUrl: "http://localhost:5467",
      providers: { openai: { apiKey: "test-key" } },
    })

    expect(openai.models).toContain("gpt-image-2")
    expect(openai.models).toContain("gpt-image-2-2026-04-21")
    expect(openai.models).toContain("gpt-image-1.5")
    expect(openai.models).toContain("gpt-image-1")
    expect(openai.models).toContain("gpt-image-1-mini")
    expect(openai.models).toContain("sora-2")
    expect(openai.models).toContain("sora-2-pro")
  })

  test("API error wrapping produces GenerateError", async () => {
    mock.module("openai", () => ({
      OpenAI: class {
        images = {
          generate: async () => {
            throw new Error("401 Unauthorized")
          },
        }
      },
    }))

    const openai = createOpenAIProvider({
      backendUrl: "http://localhost:5467",
      providers: { openai: { apiKey: "test-key" } },
    })

    await expect(
      Effect.runPromise(
        openai.generateImage({ model: "gpt-image-2", prompt: "test" }),
      ),
    ).rejects.toThrow("OpenAI API error: 401 Unauthorized")
  })
})
