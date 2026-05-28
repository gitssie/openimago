/**
 * Tests for UserEventBus — fan-out behavior.
 *
 * Behaviors tested through the public events(userId) interface:
 *   1. Events for a user are delivered to their subscriber stream
 *   2. Events for a different user are NOT delivered
 *   3. Multiple users each receive only their own events
 */
import { describe, test, expect } from "bun:test"
import { Effect, Fiber, Stream } from "effect"
import type { BusEvent, GlobalEvent } from "../src/event/types"
import { makeUserEventBus } from "../src/event/bus"
import { makeWorkspaceResolver } from "../src/event/resolver"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mkGlobalEvent(workspaceId: string, type: string): GlobalEvent {
  return { workspace: workspaceId, payload: { id: `evt_${type}`, type, properties: {} } }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("UserEventBus", () => {
  test("delivers events to the correct user", async () => {
    const resolver = makeWorkspaceResolver(async (ws) => {
      if (ws === "wrk_alice") return "user_alice"
      return null
    })

    const events: GlobalEvent[] = [mkGlobalEvent("wrk_alice", "session.updated")]
    const upstreamStream = Stream.fromIterable(events)
    const bus = makeUserEventBus(upstreamStream, resolver)

    const received = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          // Subscribe first, then start fanout so PubSub is registered
          const stream = yield* bus.events("user_alice")
          yield* Effect.forkScoped(bus.startFanout())
          return yield* stream.pipe(Stream.runCollect, Effect.map((c) => Array.from(c) as BusEvent[]))
        }),
      ) as Effect.Effect<BusEvent[], never, never>,
    )

    expect(received).toHaveLength(1)
    expect(received[0]?.type).toBe("session.updated")
  })

  test("does NOT deliver events for a different user", async () => {
    const resolver = makeWorkspaceResolver(async (ws) => {
      if (ws === "wrk_bob") return "user_bob"
      return null
    })

    const events: GlobalEvent[] = [
      mkGlobalEvent("wrk_bob", "session.updated"),
      mkGlobalEvent("wrk_bob", "session.updated"),
    ]
    const upstreamStream = Stream.fromIterable(events)
    const bus = makeUserEventBus(upstreamStream, resolver)

    // Subscribe as alice — upstream events are for bob, alice gets nothing
    const received = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const stream = yield* bus.events("user_alice")
          yield* Effect.forkScoped(bus.startFanout())
          return yield* stream.pipe(Stream.runCollect, Effect.map((c) => Array.from(c) as BusEvent[]))
        }),
      ) as Effect.Effect<BusEvent[], never, never>,
    )

    expect(received).toHaveLength(0)
  })

  test("two users each receive only their own events", async () => {
    const resolver = makeWorkspaceResolver(async (ws) => {
      if (ws === "wrk_alice") return "user_alice"
      if (ws === "wrk_bob") return "user_bob"
      return null
    })

    const events: GlobalEvent[] = [
      mkGlobalEvent("wrk_alice", "alice.event"),
      mkGlobalEvent("wrk_bob", "bob.event"),
      mkGlobalEvent("wrk_alice", "alice.event2"),
    ]
    const upstreamStream = Stream.fromIterable(events)
    const bus = makeUserEventBus(upstreamStream, resolver)

    const [aliceEvents, bobEvents] = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const aliceStream = yield* bus.events("user_alice")
          const bobStream = yield* bus.events("user_bob")
          yield* Effect.forkScoped(bus.startFanout())
          // Collect both streams concurrently — must run in parallel because
          // both subscriber streams end only after the upstream fanout completes
          const [alice, bob] = yield* Effect.all(
            [
              aliceStream.pipe(Stream.runCollect, Effect.map((c) => Array.from(c) as BusEvent[])),
              bobStream.pipe(Stream.runCollect, Effect.map((c) => Array.from(c) as BusEvent[])),
            ],
            { concurrency: "unbounded" },
          )
          return [alice, bob] as const
        }),
      ) as Effect.Effect<readonly [BusEvent[], BusEvent[]], never, never>,
    )

    expect(aliceEvents).toHaveLength(2)
    expect(aliceEvents.every((e: BusEvent) => e.type.startsWith("alice"))).toBe(true)
    expect(bobEvents).toHaveLength(1)
    expect(bobEvents[0]?.type).toBe("bob.event")
  })

  test("single event error does NOT crash the entire fanout", async () => {
    // resolver.ownerOf throws for "wrk_error" to simulate a transient DB failure
    const resolver = makeWorkspaceResolver(async (ws) => {
      if (ws === "wrk_alice") return "user_alice"
      if (ws === "wrk_error") throw new Error("DB transient failure")
      return null
    })

    const events: GlobalEvent[] = [
      mkGlobalEvent("wrk_error", "should.fail"),
      mkGlobalEvent("wrk_alice", "should.succeed"),
    ]
    const upstreamStream = Stream.fromIterable(events)
    const bus = makeUserEventBus(upstreamStream, resolver)

    const received = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const stream = yield* bus.events("user_alice")
          yield* Effect.forkScoped(bus.startFanout())
          return yield* stream.pipe(Stream.runCollect, Effect.map((c) => Array.from(c) as BusEvent[]))
        }),
      ) as Effect.Effect<BusEvent[], never, never>,
    )

    expect(received).toHaveLength(1)
    expect(received[0]?.type).toBe("should.succeed")
  })
})
