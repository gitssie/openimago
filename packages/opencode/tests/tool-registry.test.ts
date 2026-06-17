import { describe, test, expect } from "bun:test"
import { createToolRegistry } from "../src/tools/registry.ts"

describe("tool registry", () => {
  test("registers imago_status diagnostic tool", () => {
    const registry = createToolRegistry()

    expect(registry.imago_status).toBeDefined()
    expect(registry.imago_status.description).toContain("diagnostic")
  })

  test("registers image_generate media tool with contract prefix", () => {
    const registry = createToolRegistry()

    expect(registry.image_generate).toBeDefined()
    expect(registry.image_generate.description).toContain("image")
  })

  test("registers video_generate media tool with contract prefix", () => {
    const registry = createToolRegistry()

    expect(registry.video_generate).toBeDefined()
    expect(registry.video_generate.description).toContain("video")
  })

  test("media tool names use the frontend-detected media prefixes", () => {
    const registry = createToolRegistry()
    const names = Object.keys(registry)

    expect(names).toContain("imago_status")
    expect(names).toContain("image_generate")
    expect(names).toContain("video_generate")
    expect(names).toContain("audio_generate")
    expect(names.length).toBe(4)

    // No legacy imago_generate_* names remain — they would not match the
    // frontend's image_*/video_*/audio_* media detection.
    expect(names.some((n) => n.startsWith("imago_generate_"))).toBe(false)
  })
})
