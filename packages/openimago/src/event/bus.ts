import { Context, Effect, Layer, PubSub, Scope, Stream } from "effect"
import type { WorkspaceResolverService } from "./resolver"
import { GlobalEventUpstream } from "./upstream"
import { WorkspaceResolver } from "./resolver"
import type { BusEvent, GlobalEvent } from "./types"
import { logger } from "../server/logger"

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

export function makeUserEventBus(
  upstreamStream: Stream.Stream<GlobalEvent>,
  resolver: WorkspaceResolverService,
): UserEventBusService & { readonly startFanout: () => Effect.Effect<void> } {
  const callbacks = new Map<string, Set<Subscriber>>()
  const emitEnds = new Map<string, Set<EmitEndFn>>()
  const pubsubs = new Map<string, PubSub.PubSub<BusEvent>>()

  function ensureCallbacks(userId: string): Set<Subscriber> {
    let s = callbacks.get(userId); if (!s) { s = new Set(); callbacks.set(userId, s) }; return s
  }
  function ensureEnds(userId: string): Set<EmitEndFn> {
    let e = emitEnds.get(userId); if (!e) { e = new Set(); emitEnds.set(userId, e) }; return e
  }

  const fanout: Effect.Effect<void> = upstreamStream.pipe(
    Stream.mapEffect((evt: GlobalEvent) =>
      Effect.gen(function* () {
        let ws = evt.workspace ?? evt.directory ?? ""
        if (!ws || ws.startsWith("/")) {
          const p = evt.payload.properties as Record<string, unknown> | undefined
          ws = (p?.workspaceID as string) ?? ws
        }
        if (!ws || ws.startsWith("/")) return

        const uid = yield* resolver.ownerOf(ws)
        if (!uid) return

        const cbs = callbacks.get(uid)
        if (cbs) for (const fn of cbs) fn(evt.payload)

        const ps = pubsubs.get(uid)
        if (ps) yield* PubSub.publish(ps, evt.payload)
      }),
    ),
    Stream.ensuring(Effect.gen(function* () {
      for (const [, es] of emitEnds) for (const end of es) end()
      emitEnds.clear(); callbacks.clear()
      for (const [, ps] of pubsubs) yield* PubSub.shutdown(ps)
      pubsubs.clear()
    })),
    Stream.runDrain,
  )

  return {
    startFanout: () => fanout,

    subscribe: (userId: string): UserEventSubscription => {
      const subs = ensureCallbacks(userId)
      const es = ensureEnds(userId)
      const buffer: BusEvent[] = []
      const bufH: Subscriber = (evt) => buffer.push(evt)
      subs.add(bufH)

      const stream = Stream.async<BusEvent>((emit) => {
        for (const evt of buffer) emit.single(evt)
        buffer.length = 0; subs.delete(bufH)
        const h: Subscriber = (evt) => emit.single(evt)
        subs.add(h); es.add(() => emit.end())
        return Effect.sync(() => { subs.delete(h) })
      })

      return {
        stream,
        unsubscribe: () => {
          for (const end of es) end()
          subs.clear(); es.clear()
          callbacks.delete(userId); emitEnds.delete(userId)
          buffer.length = 0
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
  yield* Effect.forkDaemon(bus.startFanout().pipe(Effect.catchAll((err) => {
    logger.error({ err }, "UserEventBus: fanout fiber failed")
    return Effect.void
  })))
  return { subscribe: bus.subscribe, events: bus.events }
}))
