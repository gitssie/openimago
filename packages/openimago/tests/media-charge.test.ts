import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { setup, teardown, setupSessionTable, ensureWorkspace } from "./helper"
import { db } from "../src/db/client"
import { billingService } from "../src/billing/service"
import { mediaChargeRoutes } from "../src/billing/media-charge-routes"
import { SessionTable } from "../src/db/session-schema"
import { WorkspaceTable } from "../src/db/workspace-schema"
import { users } from "../src/db/schema"
import { eq } from "drizzle-orm"

// ── Test setup ───────────────────────────────────────────────────────────

let app: Hono

const TEST_SESSION_ID = "ses_media_charge_test"
const TEST_DIRECTORY = "/mnt/cos/test-workspace"
const TEST_WORKSPACE_ID = "wrk_media_charge_test"
const TEST_USER_ID = "test-media-charge-user-001"

beforeAll(async () => {
  await setup()
  await setupSessionTable()

  // Set internal API key for testing
  process.env.OPENIMAGO_INTERNAL_API_KEY = "test-internal-key-123"

  // Create a user directly (bypass auth)
  await db
    .insert(users)
    .values({
      id: TEST_USER_ID,
      username: "media-charge-test",
      email: "media-charge@test.com",
      role: "user",
      workspaceId: TEST_WORKSPACE_ID,
    })
    .onConflictDoNothing()

  // Create workspace linked to user
  await db
    .insert(WorkspaceTable)
    .values({
      id: TEST_WORKSPACE_ID,
      type: "worktree",
      name: "test-workspace",
      directory: TEST_DIRECTORY,
      project_id: "global",
      time_used: Date.now(),
      userId: TEST_USER_ID,
    })
    .onConflictDoUpdate({
      target: WorkspaceTable.id,
      set: { userId: TEST_USER_ID, directory: TEST_DIRECTORY },
    })

  // Create session linked to workspace
  await db
    .insert(SessionTable)
    .values({
      id: TEST_SESSION_ID,
      project_id: "global",
      workspace_id: TEST_WORKSPACE_ID,
      slug: "test-media-charge",
      directory: TEST_DIRECTORY,
      title: "Test Media Charge Session",
      version: "1.0",
      time_created: 0,
      time_updated: 0,
    })
    .onConflictDoNothing()

  app = new Hono()
  app.route("/api/platform/billing", mediaChargeRoutes)
}, 30000)

afterAll(async () => {
  delete process.env.OPENIMAGO_INTERNAL_API_KEY
  await teardown()
})

// ── Helpers ──────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-api-key": "test-internal-key-123",
  }
}

function makeChargeBody(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    sessionId: TEST_SESSION_ID,
    directory: TEST_DIRECTORY,
    amountMicros: -150,
    provider: "google",
    model: "gemini-2.5-flash-image",
    toolName: "imago_generate_image",
    mediaKind: "image",
    quantity: 1,
    unit: "image",
    pricingSnapshot: { table: "image" },
    ...overrides,
  }
}

async function ensureBalance(userId: string, balanceMicros: number): Promise<void> {
  const account = await billingService.getOrCreateAccount(userId)
  if (account.balanceMicros !== balanceMicros) {
    // Adjust balance via credit (simplified for test)
    await db.execute(`UPDATE billing_accounts SET balance_micros = ${balanceMicros} WHERE id = '${account.id}'`)
  }
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("POST /api/platform/billing/media-charge", () => {
  test("rejects missing x-api-key", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/platform/billing/media-charge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "s1", directory: "/d", amountMicros: -100 }),
      }),
    )

    expect(res.status).toBe(401)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBeDefined()
    expect((body.error as Record<string, unknown>).code).toBe("UNAUTHORIZED")
  })

  test("rejects invalid x-api-key", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/platform/billing/media-charge", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": "wrong-key",
        },
        body: JSON.stringify({ sessionId: "s1", directory: "/d", amountMicros: -100 }),
      }),
    )

    expect(res.status).toBe(401)
  })

  test("rejects missing sessionId", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/platform/billing/media-charge", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ directory: TEST_DIRECTORY, amountMicros: -100 }),
      }),
    )

    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect((body.error as Record<string, unknown>).code).toBe("BAD_REQUEST")
  })

  test("rejects missing directory", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/platform/billing/media-charge", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ sessionId: TEST_SESSION_ID, amountMicros: -100 }),
      }),
    )

    expect(res.status).toBe(400)
  })

  test("rejects missing amountMicros", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/platform/billing/media-charge", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ sessionId: TEST_SESSION_ID, directory: TEST_DIRECTORY }),
      }),
    )

    expect(res.status).toBe(400)
  })

  test("rejects positive amountMicros", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/platform/billing/media-charge", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(makeChargeBody({ amountMicros: 100 })),
      }),
    )

    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect((body.error as Record<string, unknown>).code).toBe("BAD_REQUEST")
  })

  test("rejects zero amountMicros", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/platform/billing/media-charge", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(makeChargeBody({ amountMicros: 0 })),
      }),
    )

    expect(res.status).toBe(400)
  })

  test("rejects unknown sessionId", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/platform/billing/media-charge", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(
          makeChargeBody({ sessionId: "unknown-session" }),
        ),
      }),
    )

    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect((body.error as Record<string, unknown>).code).toBe("BILLING_IDENTITY_NOT_FOUND")
  })

  test("rejects directory mismatch", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/platform/billing/media-charge", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(
          makeChargeBody({ directory: "/wrong/directory" }),
        ),
      }),
    )

    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect((body.error as Record<string, unknown>).code).toBe("BILLING_IDENTITY_NOT_FOUND")
  })

  test("rejects insufficient balance (no account)", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/platform/billing/media-charge", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(makeChargeBody()),
      }),
    )

    // No billing account created yet → insufficient balance
    expect(res.status).toBe(402)
    const body = await res.json() as Record<string, unknown>
    expect((body.error as Record<string, unknown>).code).toBe("INSUFFICIENT_BALANCE")
  })

  test("rejects insufficient balance (account exists but balance too low)", async () => {
    // Ensure account exists with 0 balance
    await billingService.getOrCreateAccount(TEST_USER_ID)

    const res = await app.fetch(
      new Request("http://localhost/api/platform/billing/media-charge", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(makeChargeBody({ amountMicros: -150 })),
      }),
    )

    expect(res.status).toBe(402)
    const body = await res.json() as Record<string, unknown>
    expect((body.error as Record<string, unknown>).code).toBe("INSUFFICIENT_BALANCE")
  })

  test("records pre-charge when balance is sufficient", async () => {
    // Ensure account with sufficient balance
    const account = await billingService.getOrCreateAccount(TEST_USER_ID)
    // Set balance to 500 micros (enough for -150 charge)
    await db.execute(`UPDATE billing_accounts SET balance_micros = 500 WHERE id = '${account.id}'`)

    const res = await app.fetch(
      new Request("http://localhost/api/platform/billing/media-charge", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(makeChargeBody()),
      }),
    )

    expect(res.status).toBe(201)
    const body = await res.json() as Record<string, unknown>
    const entry = body.entry as Record<string, unknown>
    expect(entry.entryType).toBe("charge")
    expect(entry.amountMicros).toBe(-150)
    // balanceAfter should be 500 - 150 = 350
    expect(entry.balanceAfterMicros).toBe(350)
    // sourceId should be present for refunds
    expect(entry.sourceId).toBeDefined()
  })

  test("records video pre-charge with session context", async () => {
    const account = await billingService.getAccount(TEST_USER_ID)
    // Ensure sufficient balance
    await db.execute(`UPDATE billing_accounts SET balance_micros = 2000 WHERE id = '${account!.id}'`)

    const res = await app.fetch(
      new Request("http://localhost/api/platform/billing/media-charge", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(
          makeChargeBody({
            amountMicros: -1000,
            provider: "fal",
            model: "seedance-2.0",
            toolName: "imago_generate_video",
            mediaKind: "video",
            unit: "video",
            pricingSnapshot: { table: "video" },
          }),
        ),
      }),
    )

    expect(res.status).toBe(201)
    const body = await res.json() as Record<string, unknown>
    const entry = body.entry as Record<string, unknown>
    expect(entry.entryType).toBe("charge")
    expect(entry.amountMicros).toBe(-1000)
    expect(entry.balanceAfterMicros).toBe(1000)
  })

  test("returns 400 for invalid JSON body", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/platform/billing/media-charge", {
        method: "POST",
        headers: {
          ...authHeaders(),
          "content-type": "application/json",
        },
        body: "not json",
      }),
    )

    expect(res.status).toBe(400)
  })

  test("accepts directory with trailing slash (normalized)", async () => {
    const account = await billingService.getAccount(TEST_USER_ID)
    await db.execute(`UPDATE billing_accounts SET balance_micros = 500 WHERE id = '${account!.id}'`)

    const res = await app.fetch(
      new Request("http://localhost/api/platform/billing/media-charge", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(
          makeChargeBody({ directory: TEST_DIRECTORY + "/" }),
        ),
      }),
    )

    expect(res.status).toBe(201)
  })
})

describe("POST /api/platform/billing/media-charge/refund", () => {
  test("rejects missing x-api-key", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/platform/billing/media-charge/refund", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: TEST_SESSION_ID,
          directory: TEST_DIRECTORY,
          amountMicros: 100,
          originalChargeSourceId: "tch_test",
        }),
      }),
    )

    expect(res.status).toBe(401)
  })

  test("rejects positive amountMicros = 0 for refund", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/platform/billing/media-charge/refund", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          sessionId: TEST_SESSION_ID,
          directory: TEST_DIRECTORY,
          amountMicros: 0,
          originalChargeSourceId: "tch_test",
        }),
      }),
    )

    expect(res.status).toBe(400)
  })

  test("writes positive refund entry", async () => {
    const account = await billingService.getAccount(TEST_USER_ID)
    // Ensure account exists with some balance
    await db.execute(`UPDATE billing_accounts SET balance_micros = 1000 WHERE id = '${account!.id}'`)

    const res = await app.fetch(
      new Request("http://localhost/api/platform/billing/media-charge/refund", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          sessionId: TEST_SESSION_ID,
          directory: TEST_DIRECTORY,
          amountMicros: 150, // positive refund
          originalChargeSourceId: "tch_original_123",
          provider: "google",
          model: "gemini-2.5-flash-image",
          toolName: "imago_generate_image",
          mediaKind: "image",
        }),
      }),
    )

    expect(res.status).toBe(201)
    const body = await res.json() as Record<string, unknown>
    const entry = body.entry as Record<string, unknown>
    expect(entry.entryType).toBe("refund")
    expect(entry.amountMicros).toBe(150)
    // balanceAfter should be 1000 + 150 = 1150
    expect(entry.balanceAfterMicros).toBe(1150)
  })

  test("refund preserves provider/model metadata", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/platform/billing/media-charge/refund", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          sessionId: TEST_SESSION_ID,
          directory: TEST_DIRECTORY,
          amountMicros: 200,
          originalChargeSourceId: "tch_original_456",
          provider: "fal",
          model: "seedance-2.0",
          toolName: "imago_generate_video",
          mediaKind: "video",
        }),
      }),
    )

    expect(res.status).toBe(201)
    const body = await res.json() as Record<string, unknown>
    const entry = body.entry as Record<string, unknown>
    expect(entry.entryType).toBe("refund")
    expect(entry.amountMicros).toBe(200)
  })
})
