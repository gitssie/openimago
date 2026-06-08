import { Effect } from "effect"
import { createHash, createHmac, type BinaryLike } from "node:crypto"
import {
  type MediaProvider,
  type GenerateImageParams,
  type GenerateVideoParams,
  type GenerateAudioParams,
  type GenerateResult,
  GenerateError,
} from "../provider.js"
import { type MediaConfigData } from "../config.js"

// ── Tencent Cloud API 3.0 signing ──────────────────────────────────────

/** Minimal config required for Tencent Cloud API 3.0 signed requests. */
interface TencentCredentials {
  secretId: string
  secretKey: string
  region: string
  appId?: string
}

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex")
}

function hmacSha256(key: BinaryLike, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest()
}

function requireTencentCredentials(config: MediaConfigData): TencentCredentials {
  const tc = config.providers["tencent-cloud"]
  if (!tc?.secretId) {
    throw new GenerateError(
      "tencent-cloud",
      "TENCENT_CLOUD_SECRET_ID is not set. " +
        "Configure it via the TENCENT_CLOUD_SECRET_ID environment variable or " +
        "MediaConfig.providers[\"tencent-cloud\"].secretId.",
    )
  }
  if (!tc?.secretKey) {
    throw new GenerateError(
      "tencent-cloud",
      "TENCENT_CLOUD_SECRET_KEY is not set. " +
        "Configure it via the TENCENT_CLOUD_SECRET_KEY environment variable or " +
        "MediaConfig.providers[\"tencent-cloud\"].secretKey.",
    )
  }
  const region = tc.region ?? "ap-guangzhou"
  return {
    secretId: tc.secretId,
    secretKey: tc.secretKey,
    region,
    appId: tc.appId,
  }
}

/**
 * Make a signed Tencent Cloud API 3.0 request.
 *
 * Implements TC3-HMAC-SHA256 signing per:
 * https://www.tencentcloud.com/document/api/213/30654
 */
async function callTencentCloudAPI(
  creds: TencentCredentials,
  service: string,
  version: string,
  action: string,
  payload: Record<string, unknown>,
  endpoint?: string,
): Promise<Record<string, unknown>> {
  const host = endpoint ?? `${service}.tencentcloudapi.com`
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10).replace(/-/g, "-")
  const dateShort = date.replace(/-/g, "")
  const contentType = "application/json"
  const payloadStr = JSON.stringify(payload)

  // ── Step 1: Canonical request ──
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`
  const signedHeaders = "content-type;host"
  const hashedPayload = sha256(payloadStr)
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    hashedPayload,
  ].join("\n")

  // ── Step 2: String to sign ──
  const credentialScope = `${dateShort}/${service}/tc3_request`
  const hashedCanonicalRequest = sha256(canonicalRequest)
  const stringToSign = [
    "TC3-HMAC-SHA256",
    String(timestamp),
    credentialScope,
    hashedCanonicalRequest,
  ].join("\n")

  // ── Step 3: Signature ──
  const kDate = hmacSha256(`TC3${creds.secretKey}`, dateShort)
  const kService = hmacSha256(kDate, service)
  const kSigning = hmacSha256(kService, "tc3_request")
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign)
    .digest("hex")

  // ── Step 4: Authorization header ──
  const authorization =
    `TC3-HMAC-SHA256 Credential=${creds.secretId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  const response = await fetch(`https://${host}`, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      "Host": host,
      "X-TC-Action": action,
      "X-TC-Version": version,
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Region": creds.region,
      "Authorization": authorization,
    },
    body: payloadStr,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new GenerateError(
      "tencent-cloud",
      `Tencent Cloud API returned ${response.status}: ${body.slice(0, 500)}`,
    )
  }

  const data = await response.json() as Record<string, unknown>
  const responseBody = data.Response as Record<string, unknown>

  if (responseBody?.Error) {
    const err = responseBody.Error as Record<string, unknown>
    throw new GenerateError(
      "tencent-cloud",
      `Tencent Cloud API error: ${err.Code ?? "Unknown"}: ${err.Message ?? "No message"}`,
    )
  }

  return responseBody
}

// ── Polling helper ──────────────────────────────────────────────────────

/** Poll a task until completion with exponential backoff and timeout. */
async function pollTask(
  creds: TencentCredentials,
  service: string,
  version: string,
  queryAction: string,
  submitResponse: Record<string, unknown>,
  endpoint?: string,
): Promise<Record<string, unknown>> {
  const jobId = submitResponse.JobId as string | undefined
  if (!jobId) {
    throw new GenerateError("tencent-cloud", "No JobId returned from submit")
  }

  const maxDurationMs = 5 * 60 * 1000 // 5 minutes
  const startedAt = Date.now()
  let delayMs = 2000 // start at 2 seconds

  for (let attempt = 0; attempt < 30; attempt++) {
    if (Date.now() - startedAt > maxDurationMs) {
      throw new GenerateError(
        "tencent-cloud",
        `Task ${jobId} timed out after ${Math.floor(maxDurationMs / 1000)}s`,
      )
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs))
    delayMs = Math.min(delayMs * 1.5, 30000) // exponential backoff, max 30s

    const response = await callTencentCloudAPI(
      creds,
      service,
      version,
      queryAction,
      { JobId: jobId },
      endpoint,
    )

    const status = response.JobStatusCode as string | undefined
    if (status === "5" || status === "DONE" || status === "SUCCESS") {
      // Check for task-level failure
      if (response.JobErrorCode && response.JobErrorCode !== 0) {
        throw new GenerateError(
          "tencent-cloud",
          `Task ${jobId} failed: ${response.JobErrorMsg ?? "Unknown error"}`,
        )
      }
      return response
    }

    if (status === "FAILED" || status === "ERROR" || response.JobErrorCode) {
      throw new GenerateError(
        "tencent-cloud",
        `Task ${jobId} failed: ${response.JobErrorMsg ?? "Unknown error"}`,
      )
    }
  }

  throw new GenerateError(
    "tencent-cloud",
    `Task ${jobId} exceeded maximum polling attempts`,
  )
}

// ── Image Provider ──────────────────────────────────────────────────────

const IMAGE_MODELS = [
  "hy-image-v3.0",
  "HY-Image-V3.0",
  "hy-image-lite",
] as const

/**
 * Creates a Tencent Cloud image provider using AIArt service.
 *
 * API pattern: SubmitTextToImageJob → poll QueryTextToImageJob.
 * Returns a GenerateResult with the image URL on completion.
 */
export function createTencentCloudImageProvider(
  config: MediaConfigData,
): MediaProvider {
  return {
    id: "tencent-cloud-image",
    label: "Tencent Cloud (Hunyuan Image)",
    kind: "image",
    models: [...IMAGE_MODELS],

    generateImage(params: GenerateImageParams) {
      return Effect.tryPromise({
        try: async () => {
          const creds = requireTencentCredentials(config)

          // Map model name: normalize "HY-Image-V3.0" → "hy-image-v3.0"
          const model = params.model.toLowerCase()

          const submitPayload: Record<string, unknown> = {
            Prompt: params.prompt,
            Model: model,
          }
          if (params.size) {
            submitPayload.Resolution = params.size
          }

          const submitResponse = await callTencentCloudAPI(
            creds,
            "aiart",
            "2022-12-29",
            "SubmitTextToImageJob",
            submitPayload,
          )

          const result = await pollTask(
            creds,
            "aiart",
            "2022-12-29",
            "QueryTextToImageJob",
            submitResponse,
          )

          // Extract image URL from ResultImage
          const resultImage = result.ResultImage as string | undefined
          if (!resultImage) {
            throw new GenerateError(
              "tencent-cloud",
              "No image URL returned from Tencent Cloud",
            )
          }

          return {
            url: resultImage,
            metadata: {
              provider: "tencent-cloud",
              model: params.model,
              jobId: result.JobId ?? submitResponse.JobId,
            },
          } satisfies GenerateResult
        },
        catch: (error) =>
          error instanceof GenerateError
            ? error
            : new GenerateError(
                "tencent-cloud",
                `Tencent Cloud image API error: ${(error as Error).message}`,
                error,
              ),
      })
    },

    generateVideo() {
      return Effect.fail(
        new GenerateError(
          "tencent-cloud",
          "Use tencent-cloud-video provider for video generation",
        ),
      )
    },
  }
}

// ── Video Provider ──────────────────────────────────────────────────────

const VIDEO_MODELS = [
  "hy-video-1.5",
] as const

/**
 * Creates a Tencent Cloud video provider using Hunyuan video service.
 *
 * API pattern: SubmitVideoJob → poll QueryVideoJob.
 */
export function createTencentCloudVideoProvider(
  config: MediaConfigData,
): MediaProvider {
  return {
    id: "tencent-cloud-video",
    label: "Tencent Cloud (Hunyuan Video)",
    kind: "video",
    models: [...VIDEO_MODELS],

    generateImage() {
      return Effect.fail(
        new GenerateError(
          "tencent-cloud",
          "Use tencent-cloud-image provider for image generation",
        ),
      )
    },

    generateVideo(params: GenerateVideoParams) {
      return Effect.tryPromise({
        try: async () => {
          const creds = requireTencentCredentials(config)

          const submitPayload: Record<string, unknown> = {
            Prompt: params.prompt,
            Model: params.model,
          }
          if (params.durationSeconds) {
            submitPayload.Duration = params.durationSeconds
          }
          if (params.aspectRatio) {
            submitPayload.AspectRatio = params.aspectRatio
          }

          const submitResponse = await callTencentCloudAPI(
            creds,
            "vclm",
            "2024-05-22",
            "SubmitVideoJob",
            submitPayload,
          )

          const result = await pollTask(
            creds,
            "vclm",
            "2024-05-22",
            "QueryVideoJob",
            submitResponse,
          )

          const videoUrl = result.VideoUrl as string | undefined
          if (!videoUrl && !result.ResultVideoUrl) {
            throw new GenerateError(
              "tencent-cloud",
              "No video URL returned from Tencent Cloud",
            )
          }

          return {
            url: (videoUrl ?? result.ResultVideoUrl) as string,
            metadata: {
              provider: "tencent-cloud",
              model: params.model,
              jobId: result.JobId ?? submitResponse.JobId,
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
                "tencent-cloud",
                `Tencent Cloud video API error: ${(error as Error).message}`,
                error,
              ),
      })
    },
  }
}

// ── Audio Provider (TTS) ────────────────────────────────────────────────

const AUDIO_MODELS = [
  "tencent-tts",
] as const

/**
 * Creates a Tencent Cloud audio provider for TTS.
 *
 * Uses Tencent Cloud TTS service to generate speech from text.
 * Returns a GenerateResult with a data URL (base64-encoded audio).
 */
export function createTencentCloudAudioProvider(
  config: MediaConfigData,
): MediaProvider {
  return {
    id: "tencent-cloud-audio",
    label: "Tencent Cloud (TTS)",
    kind: "audio",
    models: [...AUDIO_MODELS],

    generateImage() {
      return Effect.fail(
        new GenerateError(
          "tencent-cloud",
          "This provider does not support image generation",
        ),
      )
    },

    generateVideo() {
      return Effect.fail(
        new GenerateError(
          "tencent-cloud",
          "This provider does not support video generation",
        ),
      )
    },

    generateAudio(params: GenerateAudioParams) {
      return Effect.tryPromise({
        try: async () => {
          const creds = requireTencentCredentials(config)

          const payload: Record<string, unknown> = {
            Text: params.text,
            SessionId: `${Date.now()}`,
            ModelType: 1, // 1 = standard TTS model
            VoiceType: params.voiceId ? Number(params.voiceId) : 1001, // default voice
            Codec: params.outputFormat ?? "mp3",
          }

          const response = await callTencentCloudAPI(
            creds,
            "tts",
            "2019-08-23",
            "TextToVoice",
            payload,
          )

          // TTS returns Audio as base64-encoded data
          const audioData = response.Audio as string | undefined
          if (!audioData) {
            throw new GenerateError(
              "tencent-cloud",
              "No audio data returned from Tencent Cloud TTS",
            )
          }

          const codec = (params.outputFormat ?? "mp3").toLowerCase()
          const mime = codec === "wav" ? "audio/wav" : "audio/mpeg"

          return {
            url: `data:${mime};base64,${audioData}`,
            metadata: {
              provider: "tencent-cloud",
              model: params.model,
              sessionId: response.SessionId,
            },
          } satisfies GenerateResult
        },
        catch: (error) =>
          error instanceof GenerateError
            ? error
            : new GenerateError(
                "tencent-cloud",
                `Tencent Cloud TTS API error: ${(error as Error).message}`,
                error,
              ),
      })
    },
  }
}
