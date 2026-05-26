import { Layer } from "effect"
import { GlobalEventUpstreamLive } from "./upstream"
import { WorkspaceResolverLive } from "./resolver"
import { UserEventBusLive } from "./bus"
import type { UserEventBus } from "./bus"

/**
 * Composed EventLayer (all layers use Layer.effect — no Scope required).
 *
 * Dependency graph:
 *   UserEventBus ──depends-on──→ GlobalEventUpstream
 *   UserEventBus ──depends-on──→ WorkspaceResolver
 */
export const EventLayer: Layer.Layer<UserEventBus, never, never> = Layer.provide(
  UserEventBusLive,
  Layer.merge(GlobalEventUpstreamLive, WorkspaceResolverLive),
) as unknown as Layer.Layer<UserEventBus, never, never>
