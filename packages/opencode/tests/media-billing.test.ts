import { describe, test, expect, mock, afterEach } from "bun:test"
import { Effect, Layer } from "effect"
import { MediaConfig, type MediaConfigData } from "../src/lib/media/config.js"
import { BillingReporter, BillingError, InsufficientBalanceError, layer as billingLayer } from "../src/lib/media/billing.js"
import type { GenerateUsage } from "../src/lib/media/pricing.js"

// ── Helpers ──────────────────────────────────────────────────────────────

function makeUsage(overrides?: Partial<GenerateUsage>): GenerateUsage {
  return {
    provider: "mock-image",
    model: "mock-image-model",
    mediaKind: "image",
    amountMicros: -100,
    quantity: 1,
    unit: "image",
    pricingSnapshot: { source: "test" },
    ...overrides,
  }
}

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

function makeDefaultChargeRequest(usage?: GenerateUsage) {
  return {
    usage: usage ?? makeUsage(),
    toolName: "image_generate",
    sessionId: "test-session",
    directory: "/workspace/test-project",
  }
}

function runPrecharge(
  config: Partial<MediaConfigData>,
  usage?: GenerateUsage,
): Promise<{ sourceId: string }> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const reporter = yield* BillingReporter
      return yield* reporter.reportPrecharge(makeDefaultChargeRequest(usage))
    }).pipe(
      Effect.provide(billingLayer),
      Effect.provide(makeConfigLayer(config)),
    ),
  )
}

function runRefund(
  config: Partial<MediaConfigData>,
  originalChargeSourceId = "orig-123",
  usage?: GenerateUsage,
): Promise<void> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const reporter = yield* BillingReporter
      yield* reporter.reportRefund({
        ...makeDefaultChargeRequest(usage),
        originalChargeSourceId,
      })
    }).pipe(
      Effect.provide(billingLayer),
      Effect.provide(makeConfigLayer(config)),
    ),
  )
}

/** Minimal mock fetch that captures calls without triggering full Request constructor */
function mockFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): typeof fetch {
  return ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    return Promise.resolve(handler(url, init))
  }) as unknown as typeof fetch
}

/** Collect fetch calls and return a 201 response by default */
function createFetchMock(opts?: {
  status?: number
  responseOverride?: Record<string, unknown>
}): {
  fetch: typeof fetch
  calls: Array<{ url: string; method: string; headers: Record<string, string>; body: unknown }>
} {
  const calls: Array<{ url: string; method: string; headers: Record<string, string>; body: unknown }> = []
  const fetch = mockFetch((url: string, init?: RequestInit) => {
    let body: unknown = undefined
    if (init?.body && typeof init.body === "string") {
      try { body = JSON.parse(init.body) } catch { body = init.body }
    }
    calls.push({
      url,
      method: init?.method ?? "GET",
      headers: Object.fromEntries(
        init?.headers instanceof Headers
          ? init.headers.entries()
          : Array.isArray(init?.headers)
            ? init.headers
            : Object.entries(init?.headers ?? {}),
      ),
      body,
    })
    const status = opts?.status ?? 201
    const resp = opts?.responseOverride ?? { entry: { sourceId: "tch_test123" } }
    return new Response(JSON.stringify(resp), { status })
  })
  return { fetch, calls }
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("BillingReporter", () => {
  afterEach(() => {
    mock.restore()
  })

  // ── No-op behavior ───────────────────────────────────────────────

  test("no-ops precharge when billingEnabled is not true (default undefined)", async () => {
    const result = await runPrecharge({})
    expect(result.sourceId).toBe("")
  })

  test("no-ops precharge when billingEnabled is explicitly false", async () => {
    const result = await runPrecharge({ billingEnabled: false })
    expect(result.sourceId).toBe("")
  })

  test("no-ops refund when billingEnabled is not true", async () => {
    await runRefund({})
  })

  // ── Pre-charge with active billing ───────────────────────────────

  test("precharge sends sessionId + directory and NOT userId", async () => {
    const { fetch, calls } = createFetchMock()
    globalThis.fetch = fetch

    try {
      await runPrecharge({ billingEnabled: true })

      expect(calls.length).toBe(1)
      const call = calls[0]!
      expect(call.url).toContain("/api/platform/billing/media-charge")
      expect(call.method).toBe("POST")

      const body = call.body as Record<string, unknown>
      // Must NOT include userId
      expect(body.userId).toBeUndefined()
      // Must include sessionId + directory
      expect(body.sessionId).toBe("test-session")
      expect(body.directory).toBe("/workspace/test-project")
      expect(body.provider).toBe("mock-image")
      expect(body.model).toBe("mock-image-model")
      expect(body.toolName).toBe("image_generate")
      expect(body.mediaKind).toBe("image")
      expect(body.amountMicros).toBe(-100)
      expect(body.quantity).toBe(1)
      expect(body.unit).toBe("image")
      expect(body.pricingSnapshot).toEqual({ source: "test" })
    } finally {
      mock.restore()
    }
  })

  test("includes x-api-key header when backendApiKey is configured", async () => {
    const { fetch, calls } = createFetchMock()
    globalThis.fetch = fetch

    try {
      await runPrecharge({
        billingEnabled: true,
        backendApiKey: "secret-key-123",
      })

      expect(calls.length).toBe(1)
      expect(calls[0]!.headers["x-api-key"]).toBe("secret-key-123")
    } finally {
      mock.restore()
    }
  })

  test("throws BillingError when backend returns non-2xx", async () => {
    globalThis.fetch = mockFetch(() => {
      return new Response("Internal Error", { status: 500 })
    })

    try {
      await expect(
        runPrecharge({ billingEnabled: true }),
      ).rejects.toThrow("Billing backend returned 500")
    } finally {
      mock.restore()
    }
  })

  test("throws BillingError when network fails", async () => {
    globalThis.fetch = mockFetch(() => {
      throw new Error("Network error")
    })

    try {
      await expect(
        runPrecharge({ billingEnabled: true }),
      ).rejects.toThrow("Failed to report pre-charge")
    } finally {
      mock.restore()
    }
  })

  test("throws InsufficientBalanceError when backend returns 402", async () => {
    globalThis.fetch = mockFetch(() => {
      return new Response(
        JSON.stringify({ error: { code: "INSUFFICIENT_BALANCE", message: "Insufficient balance" } }),
        { status: 402 },
      )
    })

    try {
      await expect(
        runPrecharge({ billingEnabled: true }),
      ).rejects.toThrow("Insufficient balance")
    } finally {
      mock.restore()
    }
  })

  // ── Refund ────────────────────────────────────────────────────────

  test("refund sends positive amount to refund endpoint", async () => {
    const { fetch, calls } = createFetchMock()
    globalThis.fetch = fetch

    try {
      await runRefund({ billingEnabled: true }, "orig-charge-abc")

      expect(calls.length).toBe(1)
      const call = calls[0]!
      expect(call.url).toContain("/api/platform/billing/media-charge/refund")
      expect(call.method).toBe("POST")

      const body = call.body as Record<string, unknown>
      // Refund amount should be positive (absolute value of charge)
      expect(body.amountMicros).toBe(100)
      expect(body.originalChargeSourceId).toBe("orig-charge-abc")
      expect(body.sessionId).toBe("test-session")
      expect(body.directory).toBe("/workspace/test-project")
      expect(body.userId).toBeUndefined()
    } finally {
      mock.restore()
    }
  })
})
