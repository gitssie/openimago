import { describe, test, expect, mock, afterEach } from "bun:test"
import { Effect, Layer } from "effect"
import { MediaProviderRegistry, layer as registryLayer } from "../src/lib/media/registry.ts"
import { MediaProviderRouter, layer as routerLayer } from "../src/lib/media/router.ts"
import { MediaConfig, layer as configLayer } from "../src/lib/media/config.ts"
import { createGoogleProvider } from "../src/lib/media/providers/google.ts"
import { mockImageProvider } from "../src/lib/media/provider.ts"

describe("Google provider", () => {
  afterEach(() => {
    mock.restore()
  })

  test("exact model match selects Google for gemini-2.5-flash-image", async () => {
    // Mock the GoogleGenAI module before any import that uses it
    mock.module("@google/genai", () => ({
      GoogleGenAI: class {
        models = {
          generateContent: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inlineData: {
                        mimeType: "image/png",
                        data: "ZmFrZWltYWdlZGF0YQ==", // "fakeimagedata" in base64
                      },
                    },
                  ],
                },
              },
            ],
            text: undefined,
          }),
        }
      },
    }))

    // Build a layer with Google provider registered
    const populatedRegistry = Layer.effect(
      MediaProviderRegistry,
      Effect.gen(function* () {
        const registry = yield* MediaProviderRegistry
        const config = yield* MediaConfig

        const google = createGoogleProvider(config)
        yield* registry.register(google)
        yield* registry.register(mockImageProvider)

        return registry
      }),
    ).pipe(
      Layer.provide(registryLayer),
      Layer.provide(configLayer),
    )

    const layer = routerLayer.pipe(
      Layer.provide(populatedRegistry),
      Layer.provide(configLayer),
    )

    const provider = await Effect.runPromise(
      Effect.gen(function* () {
        const router = yield* MediaProviderRouter
        return yield* router.resolve("gemini-2.5-flash-image", "image")
      }).pipe(Effect.provide(layer)),
    )

    expect(provider.id).toBe("google")
    expect(provider.kind).toBe("image")
    expect(provider.models).toContain("gemini-2.5-flash-image")
    expect(provider.models).toContain("gemini-3-pro-image-preview")
  })

  test("generateImage extracts base64 inline data from response", async () => {
    mock.module("@google/genai", () => ({
      GoogleGenAI: class {
        models = {
          generateContent: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inlineData: {
                        mimeType: "image/png",
                        data: "ZmFrZWltYWdlZGF0YQ==",
                      },
                    },
                  ],
                },
              },
            ],
            text: undefined,
          }),
        }
      },
    }))

    const google = createGoogleProvider({
      backendUrl: "http://localhost:5467",
      providers: { google: { apiKey: "test-key" } },
    })

    const result = await Effect.runPromise(
      google.generateImage({
        model: "gemini-2.5-flash-image",
        prompt: "test image",
      }),
    )

    expect(result.url).toStartWith("data:image/png;base64,")
    expect(result.url).toContain("ZmFrZWltYWdlZGF0YQ==")
    expect((result.metadata as Record<string, unknown>).provider).toBe("google")
    expect((result.metadata as Record<string, unknown>).model).toBe("gemini-2.5-flash-image")
  })

  test("missing GOOGLE_API_KEY returns clear error", async () => {
    const google = createGoogleProvider({
      backendUrl: "http://localhost:5467",
      providers: {},
    })

    await expect(
      Effect.runPromise(
        google.generateImage({
          model: "gemini-2.5-flash-image",
          prompt: "test",
        }),
      ),
    ).rejects.toThrow("GOOGLE_API_KEY is not set")
  })

  test("generateVideo returns not-yet-implemented error", async () => {
    const google = createGoogleProvider({
      backendUrl: "http://localhost:5467",
      providers: { google: { apiKey: "test-key" } },
    })

    await expect(
      Effect.runPromise(
        google.generateVideo({
          model: "veo-3.1-generate-preview",
          prompt: "test video",
        }),
      ),
    ).rejects.toThrow("not yet implemented")
  })

  test("provider lists both image and video models for capability discovery", () => {
    const google = createGoogleProvider({
      backendUrl: "http://localhost:5467",
      providers: { google: { apiKey: "test-key" } },
    })

    expect(google.models).toContain("gemini-2.5-flash-image")
    expect(google.models).toContain("gemini-3-pro-image-preview")
    expect(google.models).toContain("veo-3.1-generate-preview")
    expect(google.models).toContain("veo-3.1-fast-generate-preview")
  })

  test("API error wrapping produces GenerateError", async () => {
    mock.module("@google/genai", () => ({
      GoogleGenAI: class {
        models = {
          generateContent: async () => {
            throw new Error("429 Too Many Requests")
          },
        }
      },
    }))

    const google = createGoogleProvider({
      backendUrl: "http://localhost:5467",
      providers: { google: { apiKey: "test-key" } },
    })

    await expect(
      Effect.runPromise(
        google.generateImage({
          model: "gemini-2.5-flash-image",
          prompt: "test",
        }),
      ),
    ).rejects.toThrow("Google API error: 429 Too Many Requests")
  })
})
