import { Effect, Layer } from "effect"
import {
  type MediaProvider,
  type GenerateImageParams,
  type GenerateVideoParams,
  type GenerateResult,
  GenerateError,
  MediaProviderTag,
} from "../provider.js"
import { MediaConfig, type MediaConfigData } from "../config.js"

// ── OpenAI Provider Implementation ─────────────────────────────────────

/**
 * Creates an OpenAI media provider backed by the `openai` SDK.
 *
 * Supports:
 *   - Image generation: `gpt-image-2` (preferred), `gpt-image-2-2026-04-21`,
 *     `gpt-image-1.5`, `gpt-image-1`, `gpt-image-1-mini`
 *   - Video generation: skeleton only (Sora API not yet integrated)
 *
 * Returns a clear error when `OPENAI_API_KEY` is missing.
 */
export function createOpenAIProvider(config: MediaConfigData): MediaProvider {
  const apiKey = config.providers["openai"]?.apiKey

  const models: string[] = [
    // Current generation (preferred default for new workflows)
    "gpt-image-2",
    "gpt-image-2-2026-04-21",
    // Previous generation (migration compatibility)
    "gpt-image-1.5",
    "gpt-image-1",
    "gpt-image-1-mini",
    // Video models registered for capability discovery; live calls deferred
    "sora-2",
    "sora-2-pro",
  ]

  function requireApiKey(): string {
    if (!apiKey) {
      throw new GenerateError(
        "openai",
        "OPENAI_API_KEY is not set. " +
          "Configure it via the OPENAI_API_KEY environment variable or " +
          "MediaConfig.providers.openai.apiKey.",
      )
    }
    return apiKey
  }

  /** Map GenerateImageParams to OpenAI SDK images.generate() params. */
  function buildImageRequest(params: GenerateImageParams) {
    const req: Record<string, unknown> = {
      model: params.model,
      prompt: params.prompt,
      n: 1,
      size: params.size ?? "1024x1024",
      response_format: "b64_json",
    }

    if (params.quality) req["quality"] = params.quality
    if (params.outputFormat) req["output_format"] = params.outputFormat
    if (params.background) req["background"] = params.background

    return req
  }

  return {
    id: "openai",
    label: "OpenAI (GPT Image / Sora)",
    kind: "image",
    models,

    generateImage(params: GenerateImageParams) {
      return Effect.tryPromise({
        try: async () => {
          const key = requireApiKey()
          // Dynamic import for testability — Bun's mock.module can intercept
          const { OpenAI } = await import("openai")
          const client = new OpenAI({ apiKey: key })

          const response = await client.images.generate(
            buildImageRequest(params) as any,
          )

          const image = response.data?.[0]
          if (!image?.b64_json) {
            throw new GenerateError(
              "openai",
              `No image data returned by ${params.model}`,
            )
          }

          return {
            url: `data:image/png;base64,${image.b64_json}`,
            metadata: {
              provider: "openai",
              model: params.model,
              ...(params.size ? { size: params.size } : {}),
              ...(params.quality ? { quality: params.quality } : {}),
            },
          } satisfies GenerateResult
        },
        catch: (error) =>
          error instanceof GenerateError
            ? error
            : new GenerateError(
                "openai",
                `OpenAI API error: ${(error as Error).message}`,
                error,
              ),
      })
    },

    generateVideo(_params: GenerateVideoParams) {
      return Effect.fail(
        new GenerateError(
          "openai",
          "Sora video generation is not yet implemented. " +
            "Image generation is available via gpt-image-2, gpt-image-1.5, and gpt-image-1.",
        ),
      )
    },
  }
}

// ── Layer ──────────────────────────────────────────────────────────────

/**
 * OpenAI provider layer.
 *
 * Requires `MediaConfig`.  If `OPENAI_API_KEY` is configured the provider
 * is registered; generation fails with a clear error at execute time
 * if the key is missing.
 */
export const OpenAIProviderLayer: Layer.Layer<
  MediaProviderTag,
  GenerateError,
  MediaConfig
> = Layer.effect(
  MediaProviderTag,
  Effect.gen(function* () {
    const config = yield* MediaConfig
    return createOpenAIProvider(config)
  }),
)
