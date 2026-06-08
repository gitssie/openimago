import { describe, test, expect } from "bun:test"
import { createToolRegistry } from "../src/tools/registry.ts"

describe("tool registry", () => {
  test("registers imago_status diagnostic tool", () => {
    const registry = createToolRegistry()

    expect(registry.imago_status).toBeDefined()
    expect(registry.imago_status.description).toContain("diagnostic")
  })

  test("registers imago_generate_image media tool", () => {
    const registry = createToolRegistry()

    expect(registry.imago_generate_image).toBeDefined()
    expect(registry.imago_generate_image.description).toContain("image")
  })

  test("registers imago_generate_video media tool", () => {
    const registry = createToolRegistry()

    expect(registry.imago_generate_video).toBeDefined()
    expect(registry.imago_generate_video.description).toContain("video")
  })

  test("all expected tool names are present", () => {
    const registry = createToolRegistry()
    const names = Object.keys(registry)

    expect(names).toContain("imago_status")
    expect(names).toContain("imago_generate_image")
    expect(names).toContain("imago_generate_video")
    expect(names).toContain("imago_generate_audio")
    expect(names.length).toBe(4)
  })
})
