import { Context, Effect, Layer, PubSub, Schedule, Stream } from "effect"
import { createProxyConfig, type ProxyConfig } from "../proxy/service"
import { logger } from "../server/logger"
import type { GlobalEvent } from "./types"

// ─── Public helper (exported for tests) ──────────────────────────────────────

/**
 * Parse a ReadableStream<Uint8Array> of SSE bytes into a Stream of GlobalEvent.
 * Exported for unit testing in isolation.
 */
export function parseSseChunks(body: ReadableStream<Uint8Array>): Stream.Stream<GlobalEvent> {
  return Stream.async<GlobalEvent>((emit) => {
    ;(async () => {
      const reader = body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let currentData: string[] = []

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""

          for (const line of lines) {
            const cleanLine = line.endsWith("\r") ? line.slice(0, -1) : line

            if (cleanLine === "") {
              if (currentData.length > 0) {
                const raw = currentData.join("\n")
                currentData = []
                try {
                  emit.single(JSON.parse(raw) as GlobalEvent)
                } catch {
                  logger.warn({ data: raw }, "parseSseChunks: JSON parse error, skipping")
                }
              }
              continue
            }

            const idx = cleanLine.indexOf(":")
            const field = idx === -1 ? cleanLine : cleanLine.slice(0, idx)
            const val = idx === -1 ? "" : cleanLine.slice(idx + (cleanLine[idx + 1] === " " ? 2 : 1))

            if (field === "data") {
              currentData.push(val)
            }
          }
        }

        // Flush remaining data
        if (currentData.length > 0) {
          const raw = currentData.join("\n")
          try {
            emit.single(JSON.parse(raw) as GlobalEvent)
          } catch {
            logger.warn({ data: raw }, "parseSseChunks: JSON parse error on flush")
          }
        }
      } catch (err) {
        logger.error({ err }, "parseSseChunks: reader error")
      } finally {
        emit.end()
      }
    })()
  })
}

// ─── Service ──────────────────────────────────────────────────────────────────

export interface GlobalEventUpstreamService {
  readonly stream: Stream.Stream<GlobalEvent>
}

export class GlobalEventUpstream extends Context.Tag("@openimago/GlobalEventUpstream")<
  GlobalEventUpstream,
  GlobalEventUpstreamService
>() {}

/**
 * Live layer — uses Layer.effect so the PubSub and daemon connection
 * persist for the process lifetime (not tied to per-request scopes).
 */
export const GlobalEventUpstreamLive = Layer.effect(
  GlobalEventUpstream,
  Effect.gen(function* () {
    const config: ProxyConfig = createProxyConfig()

    // Shared PubSub — all subscribers get every raw event
    const pubsub = yield* PubSub.unbounded<GlobalEvent>()

    // ── Connect + publish loop (daemon fiber, runs forever) ──────────────────

    const retrySchedule = Schedule.exponential("100 millis").pipe(
      Schedule.jittered,
      Schedule.intersect(Schedule.recurs(999_999)),
    )

    const connectOnce = Effect.gen(function* () {
      const abort = new AbortController()

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(`${config.opencodeUrl}/global/event`, {
            headers: {
              Authorization: `Basic ${config.basicAuth}`,
              Accept: "text/event-stream",
            },
            signal: abort.signal,
          }),
        catch: (err) => {
          logger.error({ err }, "GlobalEventUpstream: fetch failed")
          return err as Error
        },
      })

      if (!response.ok || !response.body) {
        abort.abort()
        logger.warn({ status: response.status }, "GlobalEventUpstream: bad response")
        return yield* Effect.fail(new Error(`HTTP ${response.status}`))
      }

      logger.info("GlobalEventUpstream: connected to /global/event")

      // Parse SSE and publish each event into the shared PubSub
      yield* parseSseChunks(response.body as ReadableStream<Uint8Array>).pipe(
        Stream.runForEach((evt) => PubSub.publish(pubsub, evt)),
      )

      abort.abort()
      logger.info("GlobalEventUpstream: stream ended, will retry")
      return yield* Effect.fail(new Error("stream ended"))
    })

    // Retry forever with exponential backoff
    const connectLoop = Effect.forever(
      connectOnce.pipe(
        Effect.retry(retrySchedule),
        Effect.catchAll((err) => {
          logger.error({ err }, "GlobalEventUpstream: connect attempt failed")
          return Effect.void
        }),
        Effect.delay("1 second"),
      ),
    )

    yield* Effect.forkDaemon(connectLoop)

    // Return a Stream backed by the shared PubSub
    let subscribed = false
    const stream = Stream.unwrap(
      Effect.sync(() => {
        if (!subscribed) {
          subscribed = true
          logger.info("GlobalEventUpstream: first subscriber attached")
        }
        return Stream.fromPubSub(pubsub)
      }),
    )

    return { stream }
  }),
)
