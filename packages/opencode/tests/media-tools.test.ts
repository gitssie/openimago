import { describe, test, expect } from "bun:test"
import type { ToolContext } from "@opencode-ai/plugin"

// Minimal mock tool context for direct tool execution tests
const mockToolContext: ToolContext = {
  agent: "test-agent",
  sessionID: "test-session",
  messageID: "test-message",
  directory: "/tmp/test",
  worktree: "/tmp/test",
  abort: new AbortController().signal,
  metadata: () => {},
  ask: async () => {},
}

/** Extract output string from tool result (handles both string and object forms). */
function outputString(result: unknown): string {
  if (typeof result === "string") return result
  if (typeof result === "object" && result !== null && "output" in result) {
    return (result as { output: string }).output
  }
  throw new Error(`Unexpected tool result type: ${typeof result}`)
}

describe("imago_generate_image tool execution", () => {
  test("returns JSON with expected fields on mock execution", async () => {
    const { createGenerateImageTool } = await import(
      "../src/tools/media/generate-image.ts"
    )

    const tool = createGenerateImageTool()
    const raw = await tool.execute(
      { prompt: "a test image of a mountain", model: "mock-image-model" } as any,
      mockToolContext,
    )

    const parsed = JSON.parse(outputString(raw))
    expect(parsed.kind).toBe("image")
    expect(parsed.url).toStartWith("mock://image")
    expect(parsed.provider).toBe("mock-image")
    expect(parsed.model).toBe("mock-image-model")
  })

  test("uses default model when none specified", async () => {
    const { createGenerateImageTool } = await import(
      "../src/tools/media/generate-image.ts"
    )

    const tool = createGenerateImageTool()
    const raw = await tool.execute(
      { prompt: "test with default model" } as any,
      mockToolContext,
    )

    const parsed = JSON.parse(outputString(raw)) as Record<string, unknown>
    expect(parsed.model).toBe("mock-image-model")
  })
})

describe("imago_generate_video tool execution", () => {
  test("returns JSON with expected fields on mock execution", async () => {
    const { createGenerateVideoTool } = await import(
      "../src/tools/media/generate-video.ts"
    )

    const tool = createGenerateVideoTool()
    const raw = await tool.execute(
      { prompt: "a test video of waves", model: "mock-video-model" } as any,
      mockToolContext,
    )

    const parsed = JSON.parse(outputString(raw))
    expect(parsed.kind).toBe("video")
    expect(parsed.url).toStartWith("mock://video")
    expect(parsed.provider).toBe("mock-video")
    expect(parsed.model).toBe("mock-video-model")
  })

  test("uses default model when none specified", async () => {
    const { createGenerateVideoTool } = await import(
      "../src/tools/media/generate-video.ts"
    )

    const tool = createGenerateVideoTool()
    const raw = await tool.execute(
      { prompt: "test video default model" } as any,
      mockToolContext,
    )

    const parsed = JSON.parse(outputString(raw)) as Record<string, unknown>
    expect(parsed.model).toBe("mock-video-model")
  })

  test("includes durationSeconds in output", async () => {
    const { createGenerateVideoTool } = await import(
      "../src/tools/media/generate-video.ts"
    )

    const tool = createGenerateVideoTool()
    const raw = await tool.execute(
      { prompt: "duration test", model: "mock-video-model", durationSeconds: 10 } as any,
      mockToolContext,
    )

    const parsed = JSON.parse(outputString(raw)) as Record<string, unknown>
    expect(parsed.durationSeconds).toBe(10)
  })
})

describe("imago_generate_audio tool execution", () => {
  test("returns JSON with expected fields on mock execution", async () => {
    const { createGenerateAudioTool } = await import(
      "../src/tools/media/generate-audio.ts"
    )

    const tool = createGenerateAudioTool()
    const raw = await tool.execute(
      { prompt: "Hello world, this is a test", model: "mock-audio-model" } as any,
      mockToolContext,
    )

    const parsed = JSON.parse(outputString(raw))
    expect(parsed.kind).toBe("audio")
    expect(parsed.url).toStartWith("mock://audio")
    expect(parsed.provider).toBe("mock-audio")
    expect(parsed.model).toBe("mock-audio-model")
  })

  test("uses default model when none specified", async () => {
    const { createGenerateAudioTool } = await import(
      "../src/tools/media/generate-audio.ts"
    )

    const tool = createGenerateAudioTool()
    const raw = await tool.execute(
      { prompt: "test with default model" } as any,
      mockToolContext,
    )

    const parsed = JSON.parse(outputString(raw)) as Record<string, unknown>
    expect(parsed.model).toBe("mock-audio-model")
  })

  test("includes voiceId in output when specified", async () => {
    const { createGenerateAudioTool } = await import(
      "../src/tools/media/generate-audio.ts"
    )

    const tool = createGenerateAudioTool()
    const raw = await tool.execute(
      { prompt: "voice test", model: "mock-audio-model", voiceId: "en-US-Wavenet-D" } as any,
      mockToolContext,
    )

    const parsed = JSON.parse(outputString(raw)) as Record<string, unknown>
    expect(parsed.voiceId).toBe("en-US-Wavenet-D")
  })

  test("includes outputFormat in output", async () => {
    const { createGenerateAudioTool } = await import(
      "../src/tools/media/generate-audio.ts"
    )

    const tool = createGenerateAudioTool()
    const raw = await tool.execute(
      { prompt: "format test", model: "mock-audio-model", outputFormat: "wav" } as any,
      mockToolContext,
    )

    const parsed = JSON.parse(outputString(raw)) as Record<string, unknown>
    expect(parsed.outputFormat).toBe("wav")
  })
})
