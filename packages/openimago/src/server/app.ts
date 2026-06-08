import { Hono } from "hono"
import { cors } from "hono/cors"
import { Context, Effect, Layer } from "effect"
import { authRoutes } from "../auth/routes"
import { projectRoutes } from "../project/routes"
import { workDirRoutes } from "../workdir/routes"
import { healthRoutes } from "../health/routes"
import { adminRoutes } from "../admin/routes"
import { filesRoutes, projectFilesRoutes } from "../files/routes"
import { outputsRoutes, projectOutputsRoutes } from "../outputs/routes"
import { promptsRoutes } from "../prompts/routes"
import { assetsRoutes } from "../assets/routes"
import { tempUploadRoutes } from "../temp-uploads/routes"
import { galleryRoutes, galleryFilesRoutes } from "../gallery/routes"
import { authMiddleware, adminMiddleware } from "./middleware"
import { createProxyRoutes, type SubscribeFn } from "../proxy/routes"
import { billingRoutes } from "../billing/routes"
import { billingAdminRoutes } from "../billing/admin-routes"
import { mediaChargeRoutes } from "../billing/media-charge-routes"
import { storyRoutes } from "../project/story-routes"
import { EventLayer } from "../event/layer"
import { UserEventBus, type UserEventBusService } from "../event/bus"
import { logger } from "./logger"

/** Global reference to UserEventBus — set once at startup */
let eventBus: UserEventBusService | null = null

/** Start EventLayer with Effect.runFork + Effect.never — keeps daemon alive */
Effect.runFork(
  Effect.scoped(
    Effect.gen(function* () {
      const services = yield* Layer.build(EventLayer)
      eventBus = Context.unsafeGet(services, UserEventBus)
      logger.info("GlobalEventManager: initialized, upstream connecting")
      yield* Effect.never // Keep scope alive forever
    }),
  ),
)

/** SubscribeFn for the route handler */
const subscribe: SubscribeFn = async (userId: string) => {
  // Wait for EventLayer — eventBus is set after Layer.build completes
  for (let i = 0; i < 50; i++) {
    if (eventBus) break
    await new Promise((r) => setTimeout(r, 200))
  }
  if (!eventBus) throw new Error("EventBus not initialized")
  const sub = eventBus.subscribe(userId)
  return { stream: sub.stream, unsubscribe: () => sub.unsubscribe() }
}

export function createApp() {
  const app = new Hono()
  app.use("*", cors())
  app.route("/auth", authRoutes)

  const adminApp = new Hono()
  adminApp.use("*", authMiddleware)
  adminApp.use("*", adminMiddleware)
  adminApp.route("/", adminRoutes)
  adminApp.route("/billing", billingAdminRoutes)
  app.route("/api/admin", adminApp)

  app.route("/api/platform/projects", projectRoutes)
  app.route("/api/platform/projects", projectOutputsRoutes)
  app.route("/api/platform/projects", projectFilesRoutes)
  app.route("/api/platform/sessions", workDirRoutes)
  app.route("/api/platform/work-dirs", workDirRoutes)
  app.route("/api/platform/files", filesRoutes)
  app.route("/api/platform/sessions", outputsRoutes)
  app.route("/api/platform/prompts", promptsRoutes)
  app.route("/api/platform/assets", assetsRoutes)
  app.route("/api/platform/temp-uploads", tempUploadRoutes)
  app.route("/api/platform/gallery", galleryRoutes)
  app.route("/api/platform/gallery/files", galleryFilesRoutes)
  app.route("/api/platform/billing", billingRoutes)
  app.route("/api/platform/billing", mediaChargeRoutes)
  app.route("/api/platform/projects", storyRoutes)
  app.route("/", healthRoutes)
  app.route("/", createProxyRoutes(undefined, subscribe))

  return app
}
