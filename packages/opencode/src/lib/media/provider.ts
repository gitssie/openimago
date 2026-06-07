import { Context, Effect } from "effect"
import type { GenerateUsage } from "./pricing.js"

// ── Shared types ───────────────────────────────────────────────────────

/** Media kind discriminator shared across provider, service, and billing. */
export type MediaKind = "image" | "video"

/** Parameters for image generation requests. */
export interface GenerateImageParams {
  model: string
  prompt: string
  /** Output image size (e.g. "1024x1024", "auto"). */
  size?: string
  /** Image quality level. Supported by gpt-image-2. */
  quality?: "low" | "medium" | "high" | "auto"
  /** Output format. Supported by gpt-image-2. */
  outputFormat?: "png" | "jpeg" | "webp"
  /** Background mode. "opaque" or "auto" for gpt-image-2. Transparent unsupported. */
  background?: "opaque" | "auto"
  /** Session ID for billing context. Required when billing is active. */
  sessionId?: string
  /** Workspace/project directory for billing context. Required when billing is active. */
  directory?: string
}

/** Parameters for video generation requests. */
export interface GenerateVideoParams {
  model: string
  prompt: string
  /** Video duration in seconds. */
  durationSeconds?: number
  /** Aspect ratio (e.g. "16:9", "9:16", "1:1"). */
  aspectRatio?: string
  /** Session ID for billing context. Required when billing is active. */
  sessionId?: string
  /** Workspace/project directory for billing context. Required when billing is active. */
  directory?: string
}

/** Result returned by a media generation provider. */
export interface GenerateResult {
  url: string
  metadata?: Record<string, unknown>
  /** Optional usage/cost metadata for billing. Providers MAY populate this. */
  usage?: GenerateUsage
}

/** Structured error from a media provider. */
export class GenerateError extends Error {
  readonly _tag = "GenerateError"
  constructor(
    readonly provider: string,
    message: string,
    readonly cause?: unknown,
  ) {
    super(`[${provider}] ${message}`)
  }
}

// ── MediaProvider interface + Tag ──────────────────────────────────────

/**
 * MediaProvider — adapter contract for a single provider.
 *
 * Every provider (official API, gateway, local mock) implements
 * this interface.  Future extension: add a new provider by
 * implementing this and registering its layer.
 */
export interface MediaProvider {
  readonly id: string
  readonly label: string
  readonly kind: MediaKind
  readonly models: ReadonlyArray<string>

  generateImage(
    params: GenerateImageParams,
  ): Effect.Effect<GenerateResult, GenerateError>

  generateVideo(
    params: GenerateVideoParams,
  ): Effect.Effect<GenerateResult, GenerateError>
}

/** Context.Tag used when resolving a specific named provider. */
export class MediaProviderTag extends Context.Tag("openimago/MediaProvider")<
  MediaProviderTag,
  MediaProvider
>() {}

// ── Mock providers (skeleton) ──────────────────────────────────────────

/** Mock image provider — returns placeholder image URLs for testing. */
export const mockImageProvider: MediaProvider = {
  id: "mock-image",
  label: "Mock Image Provider",
  kind: "image",
  models: ["mock-image-model"],

  generateImage(params) {
    return Effect.succeed({
      url:
        `mock://image?prompt=${encodeURIComponent(params.prompt)}&model=${params.model}`,
      metadata: { provider: "mock-image", model: params.model },
    })
  },

  generateVideo() {
    return Effect.fail(
      new GenerateError("mock-image", "This provider does not support video"),
    )
  },
}

/** Mock video provider — returns placeholder video URLs for testing. */
export const mockVideoProvider: MediaProvider = {
  id: "mock-video",
  label: "Mock Video Provider",
  kind: "video",
  models: ["mock-video-model"],

  generateImage() {
    return Effect.fail(
      new GenerateError("mock-video", "This provider does not support images"),
    )
  },

  generateVideo(params) {
    return Effect.succeed({
      url:
        `mock://video?prompt=${encodeURIComponent(params.prompt)}&model=${params.model}`,
      metadata: { provider: "mock-video", model: params.model },
    })
  },
}
