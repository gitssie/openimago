import { describe, test, expect, beforeEach, afterEach } from "bun:test"
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

// ── Stub the workspace-files registration backend ──────────────────────────
//
// The media tools register their output with the openimago backend over HTTP.
// We stub global fetch so the tool's register step returns a deterministic
// workspaceFileId and echoes the access locators it was given.

const realFetch = globalThis.fetch
let lastRegisterBody: Record<string, unknown> | null = null

beforeEach(() => {
  process.env.OPENIMAGO_BACKEND_URL = "http://test-backend"
  process.env.OPENIMAGO_BACKEND_API_KEY = "test-key"
  lastRegisterBody = null

  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()
    if (url.includes("/api/platform/workspace-files")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
      lastRegisterBody = body
      const result = {
        workspaceFileId: "wsf_test_generated_001",
        kind: body.kind,
        mime: body.mime,
        access: { preview: { href: body.accessPreviewHref } },
        createdAt: new Date().toISOString(),
      }
      return new Response(
        JSON.stringify({ workspaceFileId: result.workspaceFileId, result }),
        { status: 201, headers: { "content-type": "application/json" } },
      )
    }
    throw new Error(`Unexpected fetch in test: ${url}`)
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

describe("image_generate tool execution", () => {
  test("returns contract-compliant MediaToolOutputV1 with a loadable preview", async () => {
    const { createGenerateImageTool } = await import(
      "../src/tools/media/generate-image.ts"
    )

    const tool = createGenerateImageTool()
    const raw = await tool.execute(
      { prompt: "a test image of a mountain", model: "mock-image-model" } as any,
      mockToolContext,
    )

    const out = JSON.parse(outputString(raw))
    expect(out.version).toBe(1)
    expect(out.kind).toBe("image")
    expect(out.status).toBe("completed")
    expect(out.result.workspaceFileId).toBe("wsf_test_generated_001")
    expect(out.result.mime).toBe("image/jpeg")
    expect(out.result.access.preview.href).toStartWith("https://picsum.photos/seed/")
    expect(out.provider).toBe("mock-image")
    expect(out.model).toBe("mock-image-model")
  })

  test("registers under the current session id from tool context", async () => {
    const { createGenerateImageTool } = await import(
      "../src/tools/media/generate-image.ts"
    )

    const tool = createGenerateImageTool()
    await tool.execute({ prompt: "session test" } as any, mockToolContext)

    expect(lastRegisterBody?.sessionId).toBe("test-session")
    expect(lastRegisterBody?.kind).toBe("image")
  })
})

describe("video_generate tool execution", () => {
  test("returns contract-compliant MediaToolOutputV1 with a loadable mp4 preview", async () => {
    const { createGenerateVideoTool } = await import(
      "../src/tools/media/generate-video.ts"
    )

    const tool = createGenerateVideoTool()
    const raw = await tool.execute(
      { prompt: "a test video of waves", model: "mock-video-model" } as any,
      mockToolContext,
    )

    const out = JSON.parse(outputString(raw))
    expect(out.version).toBe(1)
    expect(out.kind).toBe("video")
    expect(out.status).toBe("completed")
    expect(out.result.workspaceFileId).toBe("wsf_test_generated_001")
    expect(out.result.mime).toBe("video/mp4")
    expect(out.result.access.preview.href).toEndWith(".mp4")
    expect(out.provider).toBe("mock-video")
  })
})

describe("audio_generate tool execution", () => {
  test("returns contract-compliant MediaToolOutputV1 with a loadable wav preview", async () => {
    const { createGenerateAudioTool } = await import(
      "../src/tools/media/generate-audio.ts"
    )

    const tool = createGenerateAudioTool()
    const raw = await tool.execute(
      { prompt: "Hello world, this is a test", model: "mock-audio-model" } as any,
      mockToolContext,
    )

    const out = JSON.parse(outputString(raw))
    expect(out.version).toBe(1)
    expect(out.kind).toBe("audio")
    expect(out.status).toBe("completed")
    expect(out.result.workspaceFileId).toBe("wsf_test_generated_001")
    expect(out.result.mime).toBe("audio/wav")
    expect(out.result.access.preview.href).toStartWith("data:audio/wav;base64,")
    expect(out.provider).toBe("mock-audio")
  })
})

describe("media tool registration failure — graceful degradation", () => {
  test("still returns a valid MediaToolOutputV1 with a mock_ id when registration fails", async () => {
    // Backend rejects registration (simulates missing env / unreachable backend).
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      const url = typeof input === "string" ? input : input.toString()
      if (url.includes("/api/platform/workspace-files")) {
        return new Response(
          JSON.stringify({ error: { code: "CONFIGURATION_REQUIRED", message: "no key" } }),
          { status: 500, headers: { "content-type": "application/json" } },
        )
      }
      throw new Error(`Unexpected fetch in test: ${url}`)
    }) as typeof fetch

    const { createGenerateImageTool } = await import(
      "../src/tools/media/generate-image.ts"
    )

    const tool = createGenerateImageTool()
    const raw = await tool.execute(
      { prompt: "degrade test", model: "mock-image-model" } as any,
      mockToolContext,
    )

    // No session.error — output is still a valid, renderable media card.
    const out = JSON.parse(outputString(raw))
    expect(out.version).toBe(1)
    expect(out.kind).toBe("image")
    expect(out.status).toBe("completed")
    expect(out.result.workspaceFileId).toStartWith("mock_")
    expect(out.result.access.preview.href).toStartWith("https://picsum.photos/seed/")
  })
})
