import { Hono } from "hono"
import { cors } from "hono/cors"
import { authRoutes } from "../auth/routes"
import { projectRoutes } from "../project/routes"
import { workDirRoutes } from "../workdir/routes"
import { proxyRoutes } from "../proxy/routes"
import { healthRoutes } from "../health/routes"

export function createApp() {
  const app = new Hono()

  app.use("*", cors())

  app.route("/auth", authRoutes)
  app.route("/api/platform/projects", projectRoutes)
  app.route("/api/platform/sessions", workDirRoutes)
  app.route("/api/platform/work-dirs", workDirRoutes)
  app.route("/", healthRoutes)
  app.route("/", proxyRoutes)

  return app
}
