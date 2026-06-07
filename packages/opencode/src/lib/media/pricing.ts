import type { MediaKind } from "./provider.js"

// ── Pricing table ────────────────────────────────────────────────────────

/**
 * Centralized pricing table for media generation.
 *
 * Maps provider/model to deterministic cost in micro-units (negative).
 * Providers do NOT carry pricing — they only return generation results.
 * Billing resolution lives here and in the service layer.
 *
 * Placeholder pricing values. Replace with real pricing when available.
 */
export interface PricingEntry {
  /** Cost in micro-units (negative for charges). */
  amountMicros: number
  /** Unit of billing (e.g. "image", "video", "second"). */
  unit: string
}

const IMAGE_PRICING: Record<string, PricingEntry> = {
  "mock-image-model": { amountMicros: -100, unit: "image" },
  "gemini-2.5-flash-image": { amountMicros: -200, unit: "image" },
  "gemini-3-pro-image-preview": { amountMicros: -500, unit: "image" },
  "gpt-image-2": { amountMicros: -300, unit: "image" },
  "flux-dev": { amountMicros: -150, unit: "image" },
  "flux-schnell": { amountMicros: -100, unit: "image" },
  "fal-ai/flux/dev": { amountMicros: -150, unit: "image" },
  "fal-ai/flux/schnell": { amountMicros: -100, unit: "image" },
}

const VIDEO_PRICING: Record<string, PricingEntry> = {
  "mock-video-model": { amountMicros: -500, unit: "video" },
  "seedance-2.0": { amountMicros: -1000, unit: "video" },
  "bytedance/seedance-2.0/text-to-video": { amountMicros: -1000, unit: "video" },
  "bytedance/seedance-2.0/fast/text-to-video": { amountMicros: -800, unit: "video" },
}

const AUDIO_PRICING: Record<string, PricingEntry> = {
  "mock-audio-model": { amountMicros: -50, unit: "second" },
}

const PRICING_TABLE: Record<string, Record<string, PricingEntry>> = {
  image: IMAGE_PRICING,
  video: VIDEO_PRICING,
  audio: AUDIO_PRICING,
}

const FALLBACK_PRICING: Record<string, PricingEntry> = {
  image: { amountMicros: -100, unit: "image" },
  video: { amountMicros: -500, unit: "video" },
  audio: { amountMicros: -50, unit: "second" },
}

/**
 * Resolve billing pricing for a given media kind and model.
 *
 * Falls back from exact model match to kind-level placeholder.
 * Returns a deterministic pricing entry; never returns undefined.
 */
export function resolvePricing(
  mediaKind: MediaKind,
  model: string,
): PricingEntry {
  const kindTable = PRICING_TABLE[mediaKind]
  if (kindTable) {
    const exact = kindTable[model]
    if (exact) return exact
  }
  const fallback = FALLBACK_PRICING[mediaKind]
  return fallback ?? { amountMicros: -100, unit: mediaKind }
}

// ── Usage info for billing ────────────────────────────────────────────────

/**
 * Structured usage metadata for billing.
 *
 * Carried on GenerateResult.usage when the provider can report
 * actual cost/usage; otherwise resolved from the pricing table
 * in the service layer.
 */
export interface GenerateUsage {
  /** Provider identifier (e.g. "google", "fal", "openai"). */
  provider: string
  /** Model identifier used for generation. */
  model: string
  /** Media kind: "image", "video", or "audio". */
  mediaKind: MediaKind
  /** Charge amount in micro-units (negative). */
  amountMicros: number
  /** Quantity of units consumed. */
  quantity: number
  /** Unit of consumption (e.g. "image", "video", "second"). */
  unit: string
  /** Pricing details at the time of charge. */
  pricingSnapshot: Record<string, unknown>
}
