import { Hono } from "hono"
import { healthCheck } from "./service"
import { db } from "../db/client"

export function createHealthRoutes(opts?: { opencodeUrl?: string }) {
  const routes = new Hono()

  routes.get("/health", async (c) => {
    const result = await healthCheck({ db, ...opts })
    return c.json(result)
  })

  return routes
}

export const healthRoutes = createHealthRoutes()
