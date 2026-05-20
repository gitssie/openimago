import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required")
}

function createClient() {
  const client = postgres(connectionString!, { max: 5 })
  return drizzle(client, { schema })
}

export const db = createClient()
export type DB = typeof db
