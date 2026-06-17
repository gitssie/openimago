import { Context, Effect } from "effect"
import type { GenerateUsage } from "./pricing.js"

// ── Shared types ───────────────────────────────────────────────────────

/** Media kind discriminator shared across provider, service, billing, and workspace-files. */
export type MediaKind = "image" | "video" | "audio"

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

/** Parameters for audio (TTS) generation requests. */
export interface GenerateAudioParams {
  model: string
  text: string
  /** Voice ID for TTS. Provider-specific. */
  voiceId?: string
  /** Output audio format (e.g. "mp3", "wav"). */
  outputFormat?: string
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

  /** Optional: generate audio (TTS). Providers that do not support audio omit this method. */
  generateAudio?(
    params: GenerateAudioParams,
  ): Effect.Effect<GenerateResult, GenerateError>
}

/** Context.Tag used when resolving a specific named provider. */
export class MediaProviderTag extends Context.Tag("openimago/MediaProvider")<
  MediaProviderTag,
  MediaProvider
>() {}

// ── Mock asset helpers ─────────────────────────────────────────────────
//
// Mock providers return real, browser-loadable resources so the openimago UI
// can render them end-to-end without a live AI backend:
//   - image → picsum.photos with a prompt-derived stable seed
//   - video → a public sample MP4
//   - audio → a short generated sine-wave WAV as a data URI
//
// These are deterministic per prompt so reruns are stable.

const MOCK_IMAGE_MIME = "image/jpeg"
const MOCK_VIDEO_MIME = "video/mp4"
const MOCK_AUDIO_MIME = "audio/wav"

/** Public, browser-loadable sample MP4 used by the mock video provider. */
const MOCK_VIDEO_SAMPLE_URL =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"

/** Stable, positive 32-bit hash of a string (FNV-1a). */
function stableHash(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Build a browser-loadable picsum.photos URL seeded from the prompt. */
function mockImageUrl(prompt: string): string {
  const seed = stableHash(prompt).toString(36)
  return `https://picsum.photos/seed/${seed}/1024/1024`
}

/**
 * Generate a short mono 8-bit PCM WAV sine tone as a base64 data URI.
 * Browser-loadable; deterministic per (frequency, duration).
 */
function mockAudioWavDataUri(frequencyHz = 440, seconds = 1): string {
  const sampleRate = 8000
  const numSamples = Math.floor(sampleRate * seconds)
  const dataSize = numSamples // 8-bit mono → 1 byte per sample
  const buffer = new Uint8Array(44 + dataSize)
  const view = new DataView(buffer.buffer)

  // RIFF header
  writeAscii(buffer, 0, "RIFF")
  view.setUint32(4, 36 + dataSize, true) // file size - 8
  writeAscii(buffer, 8, "WAVE")
  // fmt chunk
  writeAscii(buffer, 12, "fmt ")
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // audio format = PCM
  view.setUint16(22, 1, true) // channels = 1
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate, true) // byte rate (1 byte/sample)
  view.setUint16(32, 1, true) // block align
  view.setUint16(34, 8, true) // bits per sample
  // data chunk
  writeAscii(buffer, 36, "data")
  view.setUint32(40, dataSize, true)

  for (let i = 0; i < numSamples; i++) {
    const sample = Math.sin((2 * Math.PI * frequencyHz * i) / sampleRate)
    // map [-1, 1] → unsigned 8-bit [0, 255]
    buffer[44 + i] = Math.round((sample * 0.5 + 0.5) * 255)
  }

  const base64 = bytesToBase64(buffer)
  return `data:${MOCK_AUDIO_MIME};base64,${base64}`
}

function writeAscii(target: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    target[offset + i] = text.charCodeAt(i)
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64")
  }
  let binary = ""
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  // btoa is available in browser/worker runtimes
  return btoa(binary)
}

// ── Mock providers ──────────────────────────────────────────────────────

/** Mock image provider — returns a browser-loadable picsum.photos URL. */
export const mockImageProvider: MediaProvider = {
  id: "mock-image",
  label: "Mock Image Provider",
  kind: "image",
  models: ["mock-image-model"],

  generateImage(params) {
    return Effect.succeed({
      url: mockImageUrl(params.prompt),
      metadata: {
        provider: "mock-image",
        model: params.model,
        mime: MOCK_IMAGE_MIME,
        width: 1024,
        height: 1024,
      },
    })
  },

  generateVideo() {
    return Effect.fail(
      new GenerateError("mock-image", "This provider does not support video"),
    )
  },
}

/** Mock video provider — returns a public, browser-loadable sample MP4. */
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
      url: MOCK_VIDEO_SAMPLE_URL,
      metadata: {
        provider: "mock-video",
        model: params.model,
        mime: MOCK_VIDEO_MIME,
      },
    })
  },
}

/** Mock audio provider — returns a generated sine-wave WAV data URI. */
export const mockAudioProvider: MediaProvider = {
  id: "mock-audio",
  label: "Mock Audio Provider",
  kind: "audio",
  models: ["mock-audio-model"],

  generateImage() {
    return Effect.fail(
      new GenerateError("mock-audio", "This provider does not support images"),
    )
  },

  generateVideo() {
    return Effect.fail(
      new GenerateError("mock-audio", "This provider does not support video"),
    )
  },

  generateAudio(params: GenerateAudioParams) {
    return Effect.succeed({
      url: mockAudioWavDataUri(),
      metadata: {
        provider: "mock-audio",
        model: params.model,
        mime: MOCK_AUDIO_MIME,
        duration: 1,
      },
    })
  },
}
