import { createApp } from "./src/server/app"
import { migrate } from "./src/db/migrate"

await migrate()

const port = Number(process.env.PORT) || 8080
const host = process.env.HOST || "0.0.0.0"

const app = createApp()

export default {
  port,
  hostname: host,
  fetch: app.fetch,
}

console.log(`openimago listening on http://${host}:${port}`)
