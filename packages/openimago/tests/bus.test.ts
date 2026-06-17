/**
 * Tests for UserEventBus — fan-out behavior.
 *
 * Behaviors tested through the public events(userId) interface:
 *   1. Events for a user are delivered to their subscriber stream
 *   2. Events for a different user are NOT delivered
 *   3. Multiple users each receive only their own events
 *   4. A single failing event does not crash the whole fanout
 *   5. server.* events are skipped before workspace resolution
 *
 * NOTE on the test shape:
 *   events(userId) returns Stream.fromQueue(PubSub subscription), which NEVER
 *   terminates on its own (the PubSub only shuts down when the surrounding scope
 *   closes). Collecting it with Stream.runCollect therefore deadlocks: runCollect
 *   waits for the stream to end, while the scope waits for runCollect to finish
 *   before it can close the PubSub.
 *
 *   Instead we use the canonical "infinite stream" assertion pattern:
 *     - drain the subscriber stream into a Ref via Stream.runForEach, forked
 *     - run the finite startFanout() to completion (upstream is a finite iterable)
 *     - sleep briefly so the forked delivery lands
 *     - interrupt the collector fiber and read the Ref to assert
 */
import { describe, test, expect } from "bun:test"
import { Effect, Fiber, Ref, Stream } from "effect"
import type { BusEvent, GlobalEvent } from "../src/event/types"
import { makeUserEventBus } from "../src/event/bus"
import { makeWorkspaceResolver } from "../src/event/resolver"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mkGlobalEvent(workspaceId: string, type: string): GlobalEvent {
  return { workspace: workspaceId, payload: { id: `evt_${type}`, type, properties: {} } }
}

/**
 * Drain an infinite subscriber stream into a Ref on a forked fiber, returning
 * both the Ref and the fiber so the caller can interrupt it and read results.
 */
function collectInto(stream: Stream.Stream<BusEvent>) {
  return Effect.gen(function* () {
    const ref = yield* Ref.make<BusEvent[]>([])
    const fiber = yield* Effect.fork(
      stream.pipe(Stream.runForEach((evt) => Ref.update(ref, (xs) => [...xs, evt]))),
    )
    return { ref, fiber }
  })
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
          const stream = yield* bus.events("user_alice")
          const { ref, fiber } = yield* collectInto(stream)
          yield* bus.startFanout()
          yield* Effect.sleep("50 millis")
          yield* Fiber.interrupt(fiber)
          return yield* Ref.get(ref)
        }),
      ),
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
          const { ref, fiber } = yield* collectInto(stream)
          yield* bus.startFanout()
          yield* Effect.sleep("50 millis")
          yield* Fiber.interrupt(fiber)
          return yield* Ref.get(ref)
        }),
      ),
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
          const alice = yield* collectInto(aliceStream)
          const bob = yield* collectInto(bobStream)
          yield* bus.startFanout()
          yield* Effect.sleep("50 millis")
          yield* Fiber.interrupt(alice.fiber)
          yield* Fiber.interrupt(bob.fiber)
          return [yield* Ref.get(alice.ref), yield* Ref.get(bob.ref)] as const
        }),
      ),
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
          const { ref, fiber } = yield* collectInto(stream)
          yield* bus.startFanout()
          yield* Effect.sleep("50 millis")
          yield* Fiber.interrupt(fiber)
          return yield* Ref.get(ref)
        }),
      ),
    )

    expect(received).toHaveLength(1)
    expect(received[0]?.type).toBe("should.succeed")
  })

  test("server events are silently skipped regardless of workspace", async () => {
    // Resolver returns user_alice for wrk_alice — but should never be called
    // because server.* events are filtered before workspace resolution.
    let resolveCalls = 0
    const resolver = makeWorkspaceResolver(async (ws) => {
      resolveCalls++
      if (ws === "wrk_alice") return "user_alice"
      return null
    })

    const events: GlobalEvent[] = [
      mkGlobalEvent("wrk_alice", "server.heartbeat"),
      mkGlobalEvent("", "server.connected"),
      mkGlobalEvent("wrk_alice", "session.updated"),
    ]
    const upstreamStream = Stream.fromIterable(events)
    const bus = makeUserEventBus(upstreamStream, resolver)

    const received = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const stream = yield* bus.events("user_alice")
          const { ref, fiber } = yield* collectInto(stream)
          yield* bus.startFanout()
          yield* Effect.sleep("50 millis")
          yield* Fiber.interrupt(fiber)
          return yield* Ref.get(ref)
        }),
      ),
    )

    // Only session.updated reaches the user; server events are skipped
    expect(received).toHaveLength(1)
    expect(received[0]?.type).toBe("session.updated")
    // Resolver was called only for session.updated, not for server events
    expect(resolveCalls).toBe(1)
  })
})
