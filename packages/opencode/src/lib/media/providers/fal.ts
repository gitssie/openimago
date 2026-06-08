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

// ── Shared helpers ─────────────────────────────────────────────────────

function getFalKey(config: MediaConfigData): string | undefined {
  return config.providers["fal"]?.apiKey
}

function requireFalKey(config: MediaConfigData): string {
  const key = getFalKey(config)
  if (!key) {
    throw new GenerateError(
      "fal",
      "FAL_KEY is not set. " +
        "Configure it via the FAL_KEY environment variable or " +
        "MediaConfig.providers.fal.apiKey.",
    )
  }
  return key
}

/** Extract the first image URL from a fal subscribe result. */
function extractImageUrl(result: Record<string, unknown>): string {
  const images = result?.images as Array<{ url?: string }> | undefined
  if (!images || !Array.isArray(images) || images.length === 0) {
    throw new GenerateError("fal", "No images returned from fal.ai")
  }
  const url = images[0]?.url
  if (!url) throw new GenerateError("fal", "Image URL missing in fal.ai response")
  return url
}

/** Extract the first video URL from a fal subscribe result. */
function extractVideoUrl(result: Record<string, unknown>): string {
  const video = result?.video as { url?: string } | undefined
  if (video?.url) return video.url
  // Some endpoints return data.video.url nested
  const data = result as { video?: { url?: string } }
  if (data.video?.url) return data.video.url
  throw new GenerateError("fal", "No video URL found in fal.ai response")
}

// ── Fal Image Provider ─────────────────────────────────────────────────

export function createFalImageProvider(config: MediaConfigData): MediaProvider {
  return {
    id: "fal-image",
    label: "fal.ai (FLUX Image)",
    kind: "image",
    models: [
      "fal-ai/flux/dev",
      "fal-ai/flux/schnell",
      "flux-dev",
      "flux-schnell",
    ],

    generateImage(params: GenerateImageParams) {
      return Effect.tryPromise({
        try: async () => {
          const apiKey = requireFalKey(config)
          // Dynamic import for testability
          const { fal } = await import("@fal-ai/client")
          fal.config({ credentials: apiKey })

          // Map model alias to endpoint
          const endpoint = params.model.startsWith("fal-ai/")
            ? params.model
            : params.model === "flux-dev"
              ? "fal-ai/flux/dev"
              : "fal-ai/flux/schnell"

          const result = await fal.subscribe(endpoint, {
            input: {
              prompt: params.prompt,
              ...(params.size ? { image_size: params.size } : {}),
            },
            logs: true,
          })

          const url = extractImageUrl(result.data as Record<string, unknown>)

          return {
            url,
            metadata: {
              provider: "fal",
              model: params.model,
              endpoint,
            },
          } satisfies GenerateResult
        },
        catch: (error) =>
          error instanceof GenerateError
            ? error
            : new GenerateError(
                "fal",
                `fal.ai API error: ${(error as Error).message}`,
                error,
              ),
      })
    },

    generateVideo() {
      return Effect.fail(
        new GenerateError("fal", "Use fal-video provider for video generation"),
      )
    },
  }
}

// ── Fal Video Provider ─────────────────────────────────────────────────

export function createFalVideoProvider(config: MediaConfigData): MediaProvider {
  return {
    id: "fal-video",
    label: "fal.ai (Seedance Video)",
    kind: "video",
    models: [
      "bytedance/seedance-2.0/text-to-video",
      "bytedance/seedance-2.0/fast/text-to-video",
      "seedance-2.0",
    ],

    generateImage() {
      return Effect.fail(
        new GenerateError("fal", "Use fal-image provider for image generation"),
      )
    },

    generateVideo(params: GenerateVideoParams) {
      return Effect.tryPromise({
        try: async () => {
          const apiKey = requireFalKey(config)
          const { fal } = await import("@fal-ai/client")
          fal.config({ credentials: apiKey })

          const endpoint = params.model.startsWith("bytedance/")
            ? params.model
            : "bytedance/seedance-2.0/text-to-video"

          const input: Record<string, unknown> = {
            prompt: params.prompt,
            ...(params.durationSeconds
              ? { duration: String(params.durationSeconds) }
              : {}),
            ...(params.aspectRatio ? { aspect_ratio: params.aspectRatio } : {}),
          }

          const result = await fal.subscribe(endpoint, {
            input,
            logs: true,
          })

          const url = extractVideoUrl(result.data as Record<string, unknown>)

          return {
            url,
            metadata: {
              provider: "fal",
              model: params.model,
              endpoint,
              ...(params.durationSeconds
                ? { durationSeconds: params.durationSeconds }
                : {}),
            },
          } satisfies GenerateResult
        },
        catch: (error) =>
          error instanceof GenerateError
            ? error
            : new GenerateError(
                "fal",
                `fal.ai API error: ${(error as Error).message}`,
                error,
              ),
      })
    },
  }
}

// ── Layers ─────────────────────────────────────────────────────────────

export const FalImageProviderLayer: Layer.Layer<
  MediaProviderTag,
  GenerateError,
  MediaConfig
> = Layer.effect(
  MediaProviderTag,
  Effect.gen(function* () {
    const config = yield* MediaConfig
    return createFalImageProvider(config)
  }),
)

export const FalVideoProviderLayer: Layer.Layer<
  MediaProviderTag,
  GenerateError,
  MediaConfig
> = Layer.effect(
  MediaProviderTag,
  Effect.gen(function* () {
    const config = yield* MediaConfig
    return createFalVideoProvider(config)
  }),
)
