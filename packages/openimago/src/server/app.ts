import { Hono } from "hono"
import { cors } from "hono/cors"
import { authRoutes } from "../auth/routes"
import { projectRoutes } from "../project/routes"
import { workDirRoutes } from "../workdir/routes"
import { proxyRoutes } from "../proxy/routes"
import { healthRoutes } from "../health/routes"
import { adminRoutes } from "../admin/routes"
import { filesRoutes } from "../files/routes"
import { outputsRoutes } from "../outputs/routes"
import { promptsRoutes } from "../prompts/routes"
import { assetsRoutes } from "../assets/routes"
import { authMiddleware, adminMiddleware } from "./middleware"

export function createApp() {
  const app = new Hono()

  app.use("*", cors())

  app.route("/auth", authRoutes)

  // Admin routes: /api/admin/* with auth + admin middleware
  const adminApp = new Hono()
  adminApp.use("*", authMiddleware)
  adminApp.use("*", adminMiddleware)
  adminApp.route("/", adminRoutes)
  app.route("/api/admin", adminApp)

  app.route("/api/platform/projects", projectRoutes)
  app.route("/api/platform/sessions", workDirRoutes)
  app.route("/api/platform/work-dirs", workDirRoutes)
  app.route("/api/platform/files", filesRoutes)
  app.route("/api/platform/sessions", outputsRoutes)
  app.route("/api/platform/prompts", promptsRoutes)
  app.route("/api/platform/assets", assetsRoutes)
  app.route("/", healthRoutes)
  app.route("/", proxyRoutes)

  return app
}
