import { describe, test, expect, mock, afterEach } from "bun:test"
import { Effect, Layer } from "effect"
import { MediaConfig, type MediaConfigData } from "../src/lib/media/config.js"

// ── Helpers ──────────────────────────────────────────────────────────────

function makeConfigLayer(overrides?: Partial<MediaConfigData>): Layer.Layer<MediaConfig> {
  return Layer.succeed(
    MediaConfig,
    {
      backendUrl: "http://localhost:9999",
      providers: {},
      ...overrides,
    } satisfies MediaConfigData,
  )
}

/** Minimal mock fetch that captures calls. */
function mockFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): typeof fetch {
  return ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    return Promise.resolve(handler(url, init))
  }) as unknown as typeof fetch
}

// ── Request construction tests ────────────────────────────────────────────

describe("Tencent Cloud image provider API calls", () => {
  afterEach(() => {
    mock.restore()
  })

  test("constructs signed request with correct TC3 headers", async () => {
    const { createTencentCloudImageProvider } = await import(
      "../src/lib/media/providers/tencent-cloud.js"
    )

    const apiCalls: Array<{ url: string; headers: Record<string, string>; body: string }> = []

    globalThis.fetch = mockFetch((url, init) => {
      const headers: Record<string, string> = {}
      if (init?.headers) {
        if (init.headers instanceof Headers) {
          init.headers.forEach((v, k) => { headers[k] = v })
        } else if (Array.isArray(init.headers)) {
          init.headers.forEach(([k, v]) => { headers[k] = v })
        } else {
          Object.assign(headers, init.headers)
        }
      }
      apiCalls.push({
        url,
        headers,
        body: init?.body?.toString() ?? "",
      })

      // Return submit response with a JobId, then completed result on query
      if (apiCalls.length === 1) {
        return new Response(
          JSON.stringify({
            Response: { JobId: "test-job-123", RequestId: "req-1" },
          }),
          { status: 200 },
        )
      }
      // Query response — mock completed
      return new Response(
        JSON.stringify({
          Response: {
            JobId: "test-job-123",
            JobStatusCode: "5",
            ResultImage: "https://example.com/image.png",
            RequestId: "req-2",
          },
        }),
        { status: 200 },
      )
    })

    const provider = createTencentCloudImageProvider({
      backendUrl: "http://localhost:9999",
      providers: {
        "tencent-cloud": {
          secretId: "test-secret-id",
          secretKey: "test-secret-key",
          region: "ap-shanghai",
        },
      },
    })

    const result = await Effect.runPromise(
      provider.generateImage({
        model: "hy-image-v3.0",
        prompt: "a cat",
      }),
    )

    // Verify the submit request
    expect(apiCalls.length).toBeGreaterThanOrEqual(1)
    const submitCall = apiCalls[0]!
    expect(submitCall.url).toBe("https://aiart.tencentcloudapi.com")
    expect(submitCall.headers["Content-Type"]).toBe("application/json")
    expect(submitCall.headers["X-TC-Action"]).toBe("SubmitTextToImageJob")
    expect(submitCall.headers["X-TC-Version"]).toBe("2022-12-29")
    expect(submitCall.headers["X-TC-Region"]).toBe("ap-shanghai")
    expect(submitCall.headers["Authorization"]).toStartWith("TC3-HMAC-SHA256")
    expect(submitCall.headers["Authorization"]).toContain("Credential=test-secret-id/")
    expect(submitCall.headers["Authorization"]).toContain("/aiart/tc3_request")

    // Verify result
    expect(result.url).toBe("https://example.com/image.png")
    expect(result.metadata).toBeDefined()
  })

  test("handles API error response from submit", async () => {
    const { createTencentCloudImageProvider } = await import(
      "../src/lib/media/providers/tencent-cloud.js"
    )

    globalThis.fetch = mockFetch(() => {
      return new Response(JSON.stringify({
        Response: {
          Error: { Code: "AuthFailure", Message: "Invalid credentials" },
        },
      }), { status: 200 })
    })

    const provider = createTencentCloudImageProvider({
      backendUrl: "http://localhost:9999",
      providers: {
        "tencent-cloud": {
          secretId: "bad-id",
          secretKey: "bad-key",
          region: "ap-guangzhou",
        },
      },
    })

    await expect(
      Effect.runPromise(
        provider.generateImage({
          model: "hy-image-v3.0",
          prompt: "test",
        }),
      ),
    ).rejects.toThrow(/AuthFailure/)
  })

  test("handles HTTP error from API", async () => {
    const { createTencentCloudImageProvider } = await import(
      "../src/lib/media/providers/tencent-cloud.js"
    )

    globalThis.fetch = mockFetch(() => {
      return new Response("Gateway Timeout", { status: 504 })
    })

    const provider = createTencentCloudImageProvider({
      backendUrl: "http://localhost:9999",
      providers: {
        "tencent-cloud": {
          secretId: "test-id",
          secretKey: "test-key",
          region: "ap-guangzhou",
        },
      },
    })

    await expect(
      Effect.runPromise(
        provider.generateImage({
          model: "hy-image-v3.0",
          prompt: "test",
        }),
      ),
    ).rejects.toThrow(/504/)
  })
})

// ── Polling tests ─────────────────────────────────────────────────────────

describe("Tencent Cloud polling behavior", () => {
  afterEach(() => {
    mock.restore()
  })

  test("polls until task completes successfully", async () => {
    const { createTencentCloudImageProvider } = await import(
      "../src/lib/media/providers/tencent-cloud.js"
    )

    let callCount = 0
    globalThis.fetch = mockFetch(() => {
      callCount++
      if (callCount === 1) {
        // Submit — return JobId
        return new Response(
          JSON.stringify({
            Response: { JobId: "poll-job-456", RequestId: "req-submit" },
          }),
          { status: 200 },
        )
      }
      if (callCount === 2) {
        // First poll — still running
        return new Response(
          JSON.stringify({
            Response: {
              JobId: "poll-job-456",
              JobStatusCode: "1", // running
              RequestId: "req-poll-1",
            },
          }),
          { status: 200 },
        )
      }
      // Second poll — completed
      return new Response(
        JSON.stringify({
          Response: {
            JobId: "poll-job-456",
            JobStatusCode: "5", // done
            ResultImage: "https://example.com/result.png",
            RequestId: "req-poll-2",
          },
        }),
        { status: 200 },
      )
    })

    const provider = createTencentCloudImageProvider({
      backendUrl: "http://localhost:9999",
      providers: {
        "tencent-cloud": {
          secretId: "test-id",
          secretKey: "test-key",
          region: "ap-guangzhou",
        },
      },
    })

    const result = await Effect.runPromise(
      provider.generateImage({
        model: "hy-image-v3.0",
        prompt: "test polling",
      }),
    )

    expect(callCount).toBe(3) // submit + 2 polls
    expect(result.url).toBe("https://example.com/result.png")
  }, { timeout: 15000 })

  test("throws when task fails during polling", async () => {
    const { createTencentCloudImageProvider } = await import(
      "../src/lib/media/providers/tencent-cloud.js"
    )

    let callCount = 0
    globalThis.fetch = mockFetch(() => {
      callCount++
      if (callCount === 1) {
        return new Response(
          JSON.stringify({
            Response: { JobId: "fail-job", RequestId: "req-submit" },
          }),
          { status: 200 },
        )
      }
      // Poll returns failure
      return new Response(
        JSON.stringify({
          Response: {
            JobId: "fail-job",
            JobStatusCode: "FAILED",
            JobErrorCode: 500,
            JobErrorMsg: "Processing failed",
            RequestId: "req-poll",
          },
        }),
        { status: 200 },
      )
    })

    const provider = createTencentCloudImageProvider({
      backendUrl: "http://localhost:9999",
      providers: {
        "tencent-cloud": {
          secretId: "test-id",
          secretKey: "test-key",
          region: "ap-guangzhou",
        },
      },
    })

    await expect(
      Effect.runPromise(
        provider.generateImage({
          model: "hy-image-v3.0",
          prompt: "test failure",
        }),
      ),
    ).rejects.toThrow(/Processing failed/)
  }, { timeout: 15000 })

  test("throws when no JobId returned from submit", async () => {
    const { createTencentCloudImageProvider } = await import(
      "../src/lib/media/providers/tencent-cloud.js"
    )

    globalThis.fetch = mockFetch(() => {
      return new Response(
        JSON.stringify({
          Response: { RequestId: "req-no-job" },
        }),
        { status: 200 },
      )
    })

    const provider = createTencentCloudImageProvider({
      backendUrl: "http://localhost:9999",
      providers: {
        "tencent-cloud": {
          secretId: "test-id",
          secretKey: "test-key",
          region: "ap-guangzhou",
        },
      },
    })

    await expect(
      Effect.runPromise(
        provider.generateImage({
          model: "hy-image-v3.0",
          prompt: "test no jobid",
        }),
      ),
    ).rejects.toThrow(/No JobId/)
  })
})

// ── Pricing tests ─────────────────────────────────────────────────────────

describe("Tencent Cloud pricing entries", () => {
  test("image models have pricing entries", async () => {
    const { resolvePricing } = await import("../src/lib/media/pricing.js")

    for (const model of ["hy-image-v3.0", "HY-Image-V3.0", "hy-image-lite"]) {
      const entry = resolvePricing("image", model)
      expect(entry.amountMicros).toBeLessThan(0)
      expect(entry.unit).toBe("image")
    }
  })

  test("video model has pricing entry", async () => {
    const { resolvePricing } = await import("../src/lib/media/pricing.js")

    const entry = resolvePricing("video", "hy-video-1.5")
    expect(entry.amountMicros).toBeLessThan(0)
    expect(entry.unit).toBe("video")
  })

  test("audio model has pricing entry", async () => {
    const { resolvePricing } = await import("../src/lib/media/pricing.js")

    const entry = resolvePricing("audio", "tencent-tts")
    expect(entry.amountMicros).toBeLessThan(0)
    expect(entry.unit).toBe("second")
  })
})

// ── Provider identity tests ───────────────────────────────────────────────

describe("Tencent Cloud provider identity", () => {
  test("image provider has correct id, kind, and models", async () => {
    const { createTencentCloudImageProvider } = await import(
      "../src/lib/media/providers/tencent-cloud.js"
    )

    const provider = createTencentCloudImageProvider({
      backendUrl: "http://localhost:9999",
      providers: {},
    })

    expect(provider.id).toBe("tencent-cloud-image")
    expect(provider.kind).toBe("image")
    expect(provider.models).toContain("hy-image-v3.0")
    expect(provider.models).toContain("HY-Image-V3.0")
    expect(provider.models).toContain("hy-image-lite")
  })

  test("video provider has correct id, kind, and models", async () => {
    const { createTencentCloudVideoProvider } = await import(
      "../src/lib/media/providers/tencent-cloud.js"
    )

    const provider = createTencentCloudVideoProvider({
      backendUrl: "http://localhost:9999",
      providers: {},
    })

    expect(provider.id).toBe("tencent-cloud-video")
    expect(provider.kind).toBe("video")
    expect(provider.models).toContain("hy-video-1.5")
  })

  test("audio provider has correct id, kind, and models", async () => {
    const { createTencentCloudAudioProvider } = await import(
      "../src/lib/media/providers/tencent-cloud.js"
    )

    const provider = createTencentCloudAudioProvider({
      backendUrl: "http://localhost:9999",
      providers: {},
    })

    expect(provider.id).toBe("tencent-cloud-audio")
    expect(provider.kind).toBe("audio")
    expect(provider.models).toContain("tencent-tts")
  })

  test("unsupported kind returns clear error", async () => {
    const { createTencentCloudImageProvider } = await import(
      "../src/lib/media/providers/tencent-cloud.js"
    )

    const provider = createTencentCloudImageProvider({
      backendUrl: "http://localhost:9999",
      providers: {},
    })

    await expect(
      Effect.runPromise(
        provider.generateVideo({
          model: "hy-video-1.5",
          prompt: "test",
        }),
      ),
    ).rejects.toThrow(/tencent-cloud-video/)
  })
})
