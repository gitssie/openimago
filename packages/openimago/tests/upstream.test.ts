/**
 * Tests for GlobalEventUpstream SSE parsing behavior.
 *
 * We test the observable behavior through the public interface:
 *   - Given a mock fetch that returns SSE-formatted bytes,
 *     `upstream.stream` should emit correctly parsed GlobalEvent objects.
 *
 * We do NOT test internal implementation details (buffer handling,
 * field parsing internals, retry scheduling).
 */
import { describe, test, expect, beforeAll, mock } from "bun:test"
import { Effect, Stream } from "effect"
import type { GlobalEvent } from "../src/event/types"
import { parseSseChunks } from "../src/event/upstream"

// ─── Helper: build raw SSE bytes ──────────────────────────────────────────────

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

function encodeSSE(...events: unknown[]): ReadableStream<Uint8Array> {
  const text = events.map(sseEvent).join("")
  const bytes = new TextEncoder().encode(text)
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("parseSseChunks", () => {
  test("parses a single GlobalEvent from SSE stream", async () => {
    const event: GlobalEvent = {
      workspace: "wrk_abc",
      directory: "/home/user/project",
      payload: { id: "evt_1", type: "session.updated", properties: { foo: "bar" } },
    }

    const stream = encodeSSE(event)
    const results = await Effect.runPromise(
      parseSseChunks(stream).pipe(Stream.runCollect, Effect.map((chunk) => Array.from(chunk))),
    )

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual(event)
  })

  test("parses multiple events emitted in one SSE stream", async () => {
    const evt1: GlobalEvent = {
      workspace: "wrk_1",
      payload: { id: "e1", type: "a", properties: {} },
    }
    const evt2: GlobalEvent = {
      workspace: "wrk_2",
      payload: { id: "e2", type: "b", properties: {} },
    }

    const stream = encodeSSE(evt1, evt2)
    const results = await Effect.runPromise(
      parseSseChunks(stream).pipe(Stream.runCollect, Effect.map((chunk) => Array.from(chunk))),
    )

    expect(results).toHaveLength(2)
    expect(results[0]).toEqual(evt1)
    expect(results[1]).toEqual(evt2)
  })

  test("skips malformed JSON events without crashing", async () => {
    // One bad event followed by one good event
    const bad = "data: not-valid-json\n\n"
    const good: GlobalEvent = {
      workspace: "wrk_ok",
      payload: { id: "e_ok", type: "ok", properties: {} },
    }
    const combined = bad + sseEvent(good)
    const bytes = new TextEncoder().encode(combined)
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes)
        c.close()
      },
    })

    const results = await Effect.runPromise(
      parseSseChunks(stream).pipe(Stream.runCollect, Effect.map((chunk) => Array.from(chunk))),
    )

    // Malformed event is dropped; valid event is emitted
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual(good)
  })

  test("handles chunked delivery (bytes split mid-line)", async () => {
    const event: GlobalEvent = {
      workspace: "wrk_chunked",
      payload: { id: "e_c", type: "chunked", properties: { n: 42 } },
    }
    const text = sseEvent(event)
    const half = Math.floor(text.length / 2)

    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(text.slice(0, half)))
        c.enqueue(new TextEncoder().encode(text.slice(half)))
        c.close()
      },
    })

    const results = await Effect.runPromise(
      parseSseChunks(stream).pipe(Stream.runCollect, Effect.map((chunk) => Array.from(chunk))),
    )

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual(event)
  })
})
