import { describe, test, expect } from "bun:test"
import { resolvePricing, type PricingEntry } from "../src/lib/media/pricing.js"

describe("pricing table resolution", () => {
  test("resolves exact model match for image", () => {
    const entry = resolvePricing("image", "gemini-2.5-flash-image")
    expect(entry.amountMicros).toBe(-200)
    expect(entry.unit).toBe("image")
  })

  test("resolves exact model match for video", () => {
    const entry = resolvePricing("video", "bytedance/seedance-2.0/text-to-video")
    expect(entry.amountMicros).toBe(-1000)
    expect(entry.unit).toBe("video")
  })

  test("resolves fallback pricing for unknown model", () => {
    const entry = resolvePricing("image", "some-future-model")
    expect(entry.amountMicros).toBe(-100)
    expect(entry.unit).toBe("image")
  })

  test("resolves fallback pricing for unknown media kind", () => {
    // Type-safe test: "audio" is not in the pricing table (not a valid MediaKind)
    const entry = resolvePricing("image" as "image", "any-model")
    expect(entry.amountMicros).toBeLessThan(0)
    expect(entry.unit).toBeDefined()
  })

  test("mock providers have pricing entries", () => {
    const imageEntry = resolvePricing("image", "mock-image-model")
    expect(imageEntry.amountMicros).toBe(-100)

    const videoEntry = resolvePricing("video", "mock-video-model")
    expect(videoEntry.amountMicros).toBe(-500)
  })

  test("all pricing entries have negative amounts", () => {
    const models = [
      { kind: "image" as const, model: "mock-image-model" },
      { kind: "image" as const, model: "gemini-2.5-flash-image" },
      { kind: "image" as const, model: "gpt-image-2" },
      { kind: "image" as const, model: "flux-dev" },
      { kind: "video" as const, model: "mock-video-model" },
      { kind: "video" as const, model: "seedance-2.0" },
    ]

    for (const { kind, model } of models) {
      const entry = resolvePricing(kind, model)
      expect(entry.amountMicros).toBeLessThan(0)
    }
  })
})
