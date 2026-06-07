import { Context, Effect, Layer, PubSub, Scope, Stream } from "effect"
import type { WorkspaceResolverService } from "./resolver"
import { GlobalEventUpstream } from "./upstream"
import { WorkspaceResolver } from "./resolver"
import type { BusEvent, GlobalEvent } from "./types"
import { logger } from "../server/logger"
import { extractWorkspaceKey } from "./extractor"

/** Maximum concurrent SSE connections per user. Oldest idle connection is closed when exceeded. */
const MAX_CONNECTIONS_PER_USER = parseInt(process.env.SSE_MAX_CONNECTIONS_PER_USER ?? "10", 10)

/** SSE event emitted by the server to signal that a connection is being closed due to LRU eviction. */
const SERVER_CLOSE_EVENT: BusEvent = {
  id: "server.close",
  type: "server.close",
  properties: { reason: "max_connections_exceeded" },
}

export interface UserEventSubscription {
  readonly stream: Stream.Stream<BusEvent>
  readonly unsubscribe: () => void
}

export interface UserEventBusService {
  readonly subscribe: (userId: string) => UserEventSubscription
  readonly events: (userId: string) => Effect.Effect<Stream.Stream<BusEvent>, never, Scope.Scope>
}

type Subscriber = (evt: BusEvent) => void
type EmitEndFn = () => void

/** Tracks a single SSE connection for a user. */
interface ConnectionEntry {
  endFn: EmitEndFn | null
  lastActivity: number
  /** Force-close this connection: sends server.close event then ends the stream. */
  evict: () => void
}

export function makeUserEventBus(
  upstreamStream: Stream.Stream<GlobalEvent>,
  resolver: WorkspaceResolverService,
): UserEventBusService & { readonly startFanout: () => Effect.Effect<void> } {
  /**
   * Per-user handler registry.
   *
   * NOTE on upstream reconnect transparency:
   * The upstream stream is backed by a PubSub that never terminates in normal operation
   * (see upstream.ts — it uses a daemon fiber with exponential backoff). Therefore the
   * fanout's Stream.ensuring block never fires during runtime, and frontend SSE connections
   * are completely unaffected by upstream reconnects.
   */
  const callbacks = new Map<string, Set<Subscriber>>()
  const pubsubs = new Map<string, PubSub.PubSub<BusEvent>>()

  /** Per-user ordered list of active connections (oldest first for LRU eviction). */
  const userConnections = new Map<string, ConnectionEntry[]>()

  function getOrCreateCallbacks(userId: string): Set<Subscriber> {
    let s = callbacks.get(userId)
    if (!s) { s = new Set(); callbacks.set(userId, s) }
    return s
  }

  /** Evict the oldest (least recently active) connection for a user. */
  function evictOldest(userId: string): void {
    const conns = userConnections.get(userId)
    if (!conns || conns.length === 0) return
    const sorted = [...conns].sort((a, b) => a.lastActivity - b.lastActivity)
    sorted[0]?.evict()
  }

  const fanout: Effect.Effect<void> = upstreamStream.pipe(
    Stream.mapEffect((evt: GlobalEvent) =>
      Effect.gen(function* () {
        if (!evt.payload?.type || evt.payload.type.startsWith("server.")) return

        const ws = extractWorkspaceKey(evt)
        if (!ws) {
          logger.warn(
            { workspaceId: evt.workspace ?? evt.directory ?? "<unknown>", eventType: evt.payload.type, reason: "unable to resolve workspaceId" },
            "UserEventBus: skipping event — cannot resolve workspace to workspaceId",
          )
          return
        }

        const uid = yield* resolver.ownerOf(ws)
        if (!uid) {
          logger.warn(
            { workspaceId: ws, eventType: evt.payload.type, reason: "ownerOf returned null/undefined" },
            "UserEventBus: skipping event — no owner found for workspace",
          )
          return
        }

        // Update lastActivity for all connections of this user
        const conns = userConnections.get(uid)
        if (conns) for (const c of conns) c.lastActivity = Date.now()

        const cbs = callbacks.get(uid)
        if (cbs) for (const fn of cbs) fn(evt.payload)

        const ps = pubsubs.get(uid)
        if (ps) yield* PubSub.publish(ps, evt.payload)
      }).pipe(Effect.catchAllCause((cause) => {
        logger.warn({ cause, eventType: evt.payload?.type }, "UserEventBus: fanout event error, skipping")
        return Effect.void
      })),
    ),
    Stream.runDrain,
  )

  return {
    startFanout: () => fanout,

    subscribe: (userId: string): UserEventSubscription => {
      /**
       * Design: a single `handler` is added to `callbacks` once and removed once (in cleanup).
       * No mid-life swap (bufH → myHandler). Instead, `handler` delegates to `emitFn` which
       * starts as a buffer and is upgraded to emit.single() when Stream.async fires.
       *
       * This eliminates the stale-Set bug: previously, cleanup could delete the Set from callbacks
       * between subscribe() and Stream.async firing, causing the new handler to be added to an
       * orphaned Set that fanout no longer references.
       */
      let emitFn: ((evt: BusEvent) => void) | null = null
      const buffer: BusEvent[] = []

      // Permanent handler — stays in callbacks until cleanup. Buffers until Stream.async upgrades it.
      const handler: Subscriber = (evt) => {
        if (emitFn) emitFn(evt)
        else buffer.push(evt)
      }

      // Register handler immediately so no events are missed
      getOrCreateCallbacks(userId).add(handler)

      const entry: ConnectionEntry = {
        endFn: null,
        lastActivity: Date.now(),
        evict: () => {
          handler(SERVER_CLOSE_EVENT)
          if (entry.endFn) entry.endFn()
          // If endFn is null (Stream.async hasn't fired yet), server.close is buffered and will be
          // sent when the fiber starts. Entry is cleaned up when the client disconnects (via abort).
        },
      }

      let conns = userConnections.get(userId)
      if (!conns) { conns = []; userConnections.set(userId, conns) }
      conns.push(entry)

      if (conns.length > MAX_CONNECTIONS_PER_USER) {
        logger.warn(
          { userId, count: conns.length, max: MAX_CONNECTIONS_PER_USER },
          "UserEventBus: max connections per user exceeded, evicting oldest",
        )
        evictOldest(userId)
      }

      let cleaned = false
      const cleanup = () => {
        if (cleaned) return
        cleaned = true

        // Remove handler from current callbacks Set (look up dynamically to avoid stale ref)
        const cbs = callbacks.get(userId)
        if (cbs) {
          cbs.delete(handler)
          if (cbs.size === 0) callbacks.delete(userId)
        }

        emitFn = null
        entry.endFn = null

        // Remove from connection list
        const list = userConnections.get(userId)
        if (list) {
          const idx = list.indexOf(entry)
          if (idx !== -1) list.splice(idx, 1)
          if (list.length === 0) userConnections.delete(userId)
        }
      }

      const stream = Stream.async<BusEvent>((emit) => {
        // Upgrade handler: flush buffered events, then forward live events directly
        emitFn = (evt) => emit.single(evt)
        for (const evt of buffer) emit.single(evt)
        buffer.length = 0

        const endFn: EmitEndFn = () => emit.end()
        entry.endFn = endFn

        // Teardown: called by Effect when this stream fiber is interrupted/cancelled
        return Effect.sync(() => cleanup())
      })

      return {
        stream,
        unsubscribe: () => {
          if (entry.endFn) entry.endFn() // end the async stream
          cleanup()
        },
      }
    },

    events: (userId: string): Effect.Effect<Stream.Stream<BusEvent>, never, Scope.Scope> =>
      (Effect.gen(function* () {
        const ps = yield* PubSub.unbounded<BusEvent>()
        const sub = yield* PubSub.subscribe(ps)
        pubsubs.set(userId, ps)
        yield* Effect.addFinalizer(() =>
          Effect.gen(function* () {
            pubsubs.delete(userId)
            yield* PubSub.shutdown(ps)
          }),
        )
        return Stream.fromQueue(sub)
      }) as Effect.Effect<Stream.Stream<BusEvent>, never, Scope.Scope>),
  }
}

export class UserEventBus extends Context.Tag("@openimago/UserEventBus")<
  UserEventBus, UserEventBusService
>() {}

export const UserEventBusLive = Layer.effect(UserEventBus, Effect.gen(function* () {
  const upstream = yield* GlobalEventUpstream
  const resolver = yield* WorkspaceResolver
  const bus = makeUserEventBus(upstream.stream, resolver)
  yield* Effect.forkDaemon(
    Effect.forever(
      bus.startFanout().pipe(
        Effect.catchAll((err) => {
          logger.error({ err }, "UserEventBus: fanout fiber failed, restarting in 1s")
          return Effect.void
        }),
        Effect.delay("1 second"),
      ),
    ),
  )
  return { subscribe: bus.subscribe, events: bus.events }
}))
