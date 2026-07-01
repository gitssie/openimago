import { describe, test, expect, mock, afterEach } from "bun:test"
import { Effect, Layer } from "effect"
import { MediaConfig, type MediaConfigData } from "../src/lib/media/config.js"
import { layer as billingLayer } from "../src/lib/media/billing.js"
import {
  MediaProviderRegistry,
  layer as registryLayer,
} from "../src/lib/media/registry.js"
import { layer as routerLayer } from "../src/lib/media/router.js"
import {
  MediaGenerationService,
  layer as serviceLayer,
} from "../src/lib/media/service.js"
import {
  mockImageProvider,
  mockVideoProvider,
  mockAudioProvider,
} from "../src/lib/media/provider.js"

// ── Layer wiring: real service + real billing (enabled) + mock providers ──

function makeServiceStack(): Layer.Layer<MediaGenerationService> {
  const configLayer = Layer.succeed(
    MediaConfig,
    {
      backendUrl: "http://localhost:9999",
      providers: {},
      billingEnabled: true,
    } satisfies MediaConfigData,
  )

  const populatedRegistry = Layer.effect(
    MediaProviderRegistry,
    Effect.gen(function* () {
      const registry = yield* MediaProviderRegistry
      yield* registry.register(mockImageProvider)
      yield* registry.register(mockVideoProvider)
      yield* registry.register(mockAudioProvider)
      return registry
    }),
  ).pipe(Layer.provide(registryLayer))

  return serviceLayer.pipe(
    Layer.provide(routerLayer),
    Layer.provide(populatedRegistry),
    Layer.provide(billingLayer),
    Layer.provide(configLayer),
  )
}

interface RecordedCall {
  url: string
  method: string
  body: Record<string, unknown>
}

/**
 * Mock fetch that returns a 201 pre-charge response (with the given sourceId)
 * for the base media-charge endpoint, and a configurable status for the
 * confirm endpoint. Records every call.
 */
function installFetchMock(opts?: {
  prechargeSourceId?: string
  confirmStatus?: number
}): RecordedCall[] {
  const calls: RecordedCall[] = []
  const prechargeSourceId = opts?.prechargeSourceId ?? "tch_precharge_1"
  const confirmStatus = opts?.confirmStatus ?? 200

  globalThis.fetch = (((input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url
    let body: Record<string, unknown> = {}
    if (init?.body && typeof init.body === "string") {
      try {
        body = JSON.parse(init.body) as Record<string, unknown>
      } catch {
        body = {}
      }
    }
    calls.push({ url, method: init?.method ?? "GET", body })

    if (url.endsWith("/media-charge/confirm")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ entry: { sourceId: prechargeSourceId, sourceStatus: "CONFIRMED" } }),
          { status: confirmStatus },
        ),
      )
    }

    // base pre-charge endpoint
    return Promise.resolve(
      new Response(
        JSON.stringify({ entry: { sourceId: prechargeSourceId } }),
        { status: 201 },
      ),
    )
  }) as unknown) as typeof fetch

  return calls
}

function generateImage() {
  return Effect.runPromise(
    Effect.gen(function* () {
      const svc = yield* MediaGenerationService
      return yield* svc.generateImage({
        model: "mock-image-model",
        prompt: "a cat on a skateboard",
        sessionId: "test-session",
        directory: "/workspace/test-project",
      })
    }).pipe(Effect.provide(makeServiceStack())),
  )
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("media service confirm wiring", () => {
  afterEach(() => {
    mock.restore()
  })

  test("confirms the pre-charge on provider success, threading sourceId", async () => {
    const calls = installFetchMock({ prechargeSourceId: "tch_abc_999" })

    try {
      const result = await generateImage()
      expect(result.url).toBeDefined()

      const confirm = calls.find((c) => c.url.endsWith("/media-charge/confirm"))
      expect(confirm).toBeDefined()
      expect(confirm!.method).toBe("POST")
      // The precharge's returned sourceId is threaded through to confirm
      expect(confirm!.body.originalChargeSourceId).toBe("tch_abc_999")
    } finally {
      mock.restore()
    }
  })

  test("does not refund on success — confirm only", async () => {
    const calls = installFetchMock()

    try {
      await generateImage()
      const refund = calls.find((c) => c.url.endsWith("/media-charge/refund"))
      expect(refund).toBeUndefined()
    } finally {
      mock.restore()
    }
  })

  test("confirm failure does not fail the generation (best-effort)", async () => {
    installFetchMock({ confirmStatus: 500 })

    try {
      // Generation still resolves despite the confirm endpoint erroring.
      const result = await generateImage()
      expect(result.url).toBeDefined()
    } finally {
      mock.restore()
    }
  })
})
