import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { sql, eq } from "drizzle-orm"
import { Hono } from "hono"
import { setup, teardown, setupSessionTable, COS_BASE_PATH } from "./helper"
import { db } from "../src/db/client"
import { billingAccounts, users } from "../src/db/schema"
import { SessionTable } from "../src/db/session-schema"
import { WorkspaceTable } from "../src/db/workspace-schema"
import { authRoutes } from "../src/auth/routes"
import { billingRoutes } from "../src/billing/routes"
import { billingAdminRoutes } from "../src/billing/admin-routes"
import { billingService } from "../src/billing/service"
import { authMiddleware, adminMiddleware } from "../src/server/middleware"
import { createProxyRoutes } from "../src/proxy/routes"

let app: Hono

beforeAll(async () => {
  await setup()
  await setupSessionTable()

  const proxyRoutes = createProxyRoutes()
  app = new Hono()
  app.route("/auth", authRoutes)

  const appAdmin = new Hono()
  appAdmin.use("*", authMiddleware)
  appAdmin.use("*", adminMiddleware)
  appAdmin.route("/billing", billingAdminRoutes)
  app.route("/api/admin", appAdmin)

  app.route("/api/platform/billing", billingRoutes)
  app.route("/", proxyRoutes)
}, 30000)

afterAll(async () => {
  await teardown()
})

async function registerUser(username: string, email: string, role = "user"): Promise<{
  token: string; userId: string; workspaceId: string
}> {
  const res = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, email, password: "password123", role }),
    }),
  )
  const body = await res.json() as Record<string, any>
  return {
    token: body.token as string,
    userId: body.user.id as string,
    workspaceId: body.user.workspaceId as string,
  }
}

// ════════════════════════════════════════════════════════════════
// Schema & Migration
// ════════════════════════════════════════════════════════════════

test("billing tables exist after migration", async () => {
  const tables = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name LIKE 'billing_%'
    ORDER BY table_name
  `)
  const names = (tables as any[]).map((r: any) => r.table_name)
  expect(names).toContain("billing_accounts")
  expect(names).toContain("billing_ledger")
  expect(names).toContain("billing_cdc_processed_events")
  expect(names).toContain("billing_payment_orders")
})

// ════════════════════════════════════════════════════════════════
// Account creation
// ════════════════════════════════════════════════════════════════

test("getOrCreateAccount creates account for new user", async () => {
  const { userId } = await registerUser("b_ac_create", "b_ac_create@example.com")
  const account = await billingService.getOrCreateAccount(userId)

  expect(account.ownerType).toBe("user")
  expect(account.ownerId).toBe(userId)
  expect(account.balanceMicros).toBe(0)
  expect(account.minimumBalanceMicros).toBe(0)
  expect(account.currency).toBe("CNY")
  expect(account.status).toBe("active")
})

test("getOrCreateAccount returns same account on second call", async () => {
  const { userId } = await registerUser("b_ac_idem", "b_ac_idem@example.com")
  const first = await billingService.getOrCreateAccount(userId)
  const second = await billingService.getOrCreateAccount(userId)

  expect(second.id).toBe(first.id)
  expect(second.balanceMicros).toBe(first.balanceMicros)
})

// ════════════════════════════════════════════════════════════════
// Signed ledger & balance updates
// ════════════════════════════════════════════════════════════════

test("credit increases account balance and writes signed ledger entry", async () => {
  const { userId } = await registerUser("b_cred_bal", "b_cred_bal@example.com")
  const account = await billingService.getOrCreateAccount(userId)

  const entry = await billingService.createCredit(account.id, 100_000_000, userId)
  // 100_000_000 micros = 100 CNY

  expect(entry.amountMicros).toBe(100_000_000)
  expect(entry.entryType).toBe("credit")
  expect(entry.balanceAfterMicros).toBe(100_000_000)

  const updated = await billingService.getAccount(userId)
  expect(updated).not.toBeNull()
  expect(updated!.balanceMicros).toBe(100_000_000)
})

test("adjustment can be positive or negative", async () => {
  const { userId } = await registerUser("b_adj", "b_adj@example.com")
  const account = await billingService.getOrCreateAccount(userId)

  // Positive adjustment
  await billingService.createAdjustment(account.id, 50_000_000, userId)

  let updated = await billingService.getAccount(userId)
  expect(updated!.balanceMicros).toBe(50_000_000)

  // Negative adjustment
  await billingService.createAdjustment(account.id, -10_000_000, userId)

  updated = await billingService.getAccount(userId)
  expect(updated!.balanceMicros).toBe(40_000_000)
})

test("multiple credits accumulate correctly", async () => {
  const { userId } = await registerUser("b_multi_cred", "b_multi_cred@example.com")
  const account = await billingService.getOrCreateAccount(userId)

  await billingService.createCredit(account.id, 10_000_000, userId)
  await billingService.createCredit(account.id, 20_000_000, userId)
  await billingService.createCredit(account.id, 30_000_000, userId)

  const updated = await billingService.getAccount(userId)
  expect(updated!.balanceMicros).toBe(60_000_000)
})

// ════════════════════════════════════════════════════════════════
// Tool call charge (negative amount)
// ════════════════════════════════════════════════════════════════

test("tool call charge records negative entry and reduces balance", async () => {
  const { userId } = await registerUser("b_charge", "b_charge@example.com")
  const account = await billingService.getOrCreateAccount(userId)

  // Give some balance first
  await billingService.createCredit(account.id, 100_000_000, userId)

  // Charge
  const entry = await billingService.chargeToolCall({
    accountId: account.id,
    userId,
    amountMicros: -15_000_000,
    provider: "deepseek",
    model: "deepseek-v4",
    toolName: "read_file",
  })

  expect(entry.amountMicros).toBe(-15_000_000)
  expect(entry.entryType).toBe("charge")
  expect(entry.balanceAfterMicros).toBe(85_000_000)
  expect(entry.provider).toBe("deepseek")
  expect(entry.model).toBe("deepseek-v4")
  expect(entry.toolName).toBe("read_file")

  const updated = await billingService.getAccount(userId)
  expect(updated!.balanceMicros).toBe(85_000_000)
})

// ════════════════════════════════════════════════════════════════
// User ledger list & detail
// ════════════════════════════════════════════════════════════════

test("listLedgerEntries returns entries for user account", async () => {
  const { userId } = await registerUser("b_ledger_list", "b_ledger_list@example.com")
  const account = await billingService.getOrCreateAccount(userId)

  await billingService.createCredit(account.id, 100_000_000, userId)
  await billingService.createCredit(account.id, 50_000_000, userId)

  const result = await billingService.listLedgerEntries(account.id)
  expect(result.entries.length).toBe(2)
  expect(result.total).toBe(2)
  // Most recent first
  expect(result.entries[0]!.amountMicros).toBe(50_000_000)
})

test("getLedgerEntry returns single entry detail", async () => {
  const { userId } = await registerUser("b_ledger_detail", "b_ledger_detail@example.com")
  const account = await billingService.getOrCreateAccount(userId)

  const entry = await billingService.createCredit(account.id, 10_000_000, userId)
  const fetched = await billingService.getLedgerEntry(entry.id)

  expect(fetched).not.toBeNull()
  expect(fetched!.id).toBe(entry.id)
  expect(fetched!.amountMicros).toBe(10_000_000)
})

// ════════════════════════════════════════════════════════════════
// Payment orders
// ════════════════════════════════════════════════════════════════

test("create and list payment orders", async () => {
  const { userId } = await registerUser("b_pay_order", "b_pay_order@example.com")
  const account = await billingService.getOrCreateAccount(userId)

  const order = await billingService.createPaymentOrder({
    accountId: account.id,
    userId,
    provider: "manual",
    amountMicros: 100_000_000,
  })

  expect(order.status).toBe("pending")
  expect(order.provider).toBe("manual")
  expect(order.amountMicros).toBe(100_000_000)

  const result = await billingService.listPaymentOrders(account.id)
  expect(result.orders.length).toBe(1)
  expect(result.total).toBe(1)
})

// ════════════════════════════════════════════════════════════════
// User API routes
// ════════════════════════════════════════════════════════════════

test("GET /api/platform/billing/account returns user account", async () => {
  const { token, userId } = await registerUser("b_api_ac", "b_api_ac@example.com")
  await billingService.getOrCreateAccount(userId)

  const res = await app.fetch(
    new Request("http://localhost/api/platform/billing/account", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )

  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.account).toBeDefined()
  expect(body.account.ownerType).toBe("user")
  expect(body.account.ownerId).toBe(userId)
  expect(typeof body.account.balanceMicros).toBe("number")
})

test("GET /api/platform/billing/ledger returns entries", async () => {
  const { token, userId } = await registerUser("b_api_ledger", "b_api_ledger@example.com")
  const account = await billingService.getOrCreateAccount(userId)
  await billingService.createCredit(account.id, 50_000_000, userId)

  const res = await app.fetch(
    new Request("http://localhost/api/platform/billing/ledger", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )

  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.entries).toBeArray()
  expect(body.entries.length).toBe(1)
  expect(body.total).toBe(1)
})

test("GET /api/platform/billing/ledger/:id returns single entry", async () => {
  const { token, userId } = await registerUser("b_api_ledger_id", "b_api_ledger_id@example.com")
  const account = await billingService.getOrCreateAccount(userId)
  const entry = await billingService.createCredit(account.id, 10_000_000, userId)

  const res = await app.fetch(
    new Request(`http://localhost/api/platform/billing/ledger/${entry.id}`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  )

  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.entry).toBeDefined()
  expect(body.entry.id).toBe(entry.id)
})

test("GET /api/platform/billing/ledger/:id returns 404 for other user's entry", async () => {
  const { userId: userId1 } = await registerUser("b_ledger_owner", "b_ledger_owner@example.com")
  const { token: token2 } = await registerUser("b_ledger_other", "b_ledger_other@example.com")

  const account1 = await billingService.getOrCreateAccount(userId1)
  const entry = await billingService.createCredit(account1.id, 10_000_000, userId1)

  const res = await app.fetch(
    new Request(`http://localhost/api/platform/billing/ledger/${entry.id}`, {
      headers: { authorization: `Bearer ${token2}` },
    }),
  )

  expect(res.status).toBe(404)
})

test("GET /api/platform/billing/payment-orders returns orders", async () => {
  const { token, userId } = await registerUser("b_api_po", "b_api_po@example.com")
  const account = await billingService.getOrCreateAccount(userId)
  await billingService.createPaymentOrder({
    accountId: account.id, userId, provider: "manual", amountMicros: 50_000_000,
  })

  const res = await app.fetch(
    new Request("http://localhost/api/platform/billing/payment-orders", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )

  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.orders).toBeArray()
  expect(body.orders.length).toBe(1)
})

// ════════════════════════════════════════════════════════════════
// Admin API routes
// ════════════════════════════════════════════════════════════════

async function registerAdmin(): Promise<{ token: string; userId: string }> {
  const username = `admin_${crypto.randomUUID().slice(0, 8)}`
  const email = `admin_${crypto.randomUUID().slice(0, 8)}@example.com`

  // Register normally first (gets role "user")
  const regRes = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, email, password: "password123" }),
    }),
  )
  const regBody = await regRes.json() as Record<string, any>
  const userId = regBody.user.id as string

  // Update role to admin directly
  await db.update(users).set({ role: "admin" }).where(eq(users.id, userId))

  // Login to get token with admin role
  const loginRes = await app.fetch(
    new Request("http://localhost/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "password123" }),
    }),
  )
  const loginBody = await loginRes.json() as Record<string, any>
  return { token: loginBody.token as string, userId }
}

test("GET /api/admin/billing/accounts lists accounts (admin only)", async () => {
  const { token, userId } = await registerAdmin()
  await billingService.getOrCreateAccount(userId)

  const res = await app.fetch(
    new Request("http://localhost/api/admin/billing/accounts", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )

  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.accounts).toBeArray()
  expect(body.accounts.length).toBeGreaterThanOrEqual(1)
  expect(body.total).toBeGreaterThanOrEqual(1)
})

test("admin routes require admin role", async () => {
  const { token } = await registerUser("b_admin_reject", "b_admin_reject@example.com")

  const res = await app.fetch(
    new Request("http://localhost/api/admin/billing/accounts", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )

  expect(res.status).toBe(403)
})

test("POST /api/admin/billing/accounts/:id/credits issues credit", async () => {
  const { token: adminToken, userId: adminId } = await registerAdmin()
  const { userId } = await registerUser("b_admin_cred_user", "b_admin_cred_user@example.com")
  const account = await billingService.getOrCreateAccount(userId)

  const res = await app.fetch(
    new Request(`http://localhost/api/admin/billing/accounts/${account.id}/credits`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ amountMicros: 200_000_000 }),
    }),
  )

  expect(res.status).toBe(201)
  const body = await res.json() as Record<string, any>
  expect(body.entry).toBeDefined()
  expect(body.entry.amountMicros).toBe(200_000_000)
  expect(body.entry.balanceAfterMicros).toBe(200_000_000)

  const updated = await billingService.getAccount(userId)
  expect(updated!.balanceMicros).toBe(200_000_000)
})

test("POST /api/admin/billing/accounts/:id/adjustments applies adjustment", async () => {
  const { token: adminToken } = await registerAdmin()
  const { userId } = await registerUser("b_admin_adj_user", "b_admin_adj_user@example.com")
  const account = await billingService.getOrCreateAccount(userId)

  // Give initial balance
  await billingService.createCredit(account.id, 100_000_000, userId)

  const res = await app.fetch(
    new Request(`http://localhost/api/admin/billing/accounts/${account.id}/adjustments`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ amountMicros: -30_000_000 }),
    }),
  )

  expect(res.status).toBe(201)
  const body = await res.json() as Record<string, any>
  expect(body.entry.balanceAfterMicros).toBe(70_000_000)
})

// ════════════════════════════════════════════════════════════════
// Balance check & prompt blocking
// ════════════════════════════════════════════════════════════════

test("checkBalance returns allowed when no account exists (first use)", async () => {
  const { userId } = await registerUser("b_chk_none", "b_chk_none@example.com")

  const result = await billingService.checkBalance(userId)
  expect(result.allowed).toBe(true)
  expect(result.account).toBeNull()
})

test("checkBalance returns allowed when balance >= minimum", async () => {
  const { userId } = await registerUser("b_chk_ok", "b_chk_ok@example.com")
  await billingService.getOrCreateAccount(userId)

  // Default minimum is 0, balance is 0
  const result = await billingService.checkBalance(userId)
  expect(result.allowed).toBe(true)
})

test("checkBalance blocks when balance < minimum (configured via adjustment)", async () => {
  const { userId } = await registerUser("b_chk_block", "b_chk_block@example.com")
  const account = await billingService.getOrCreateAccount(userId)

  // Set minimum balance to 1 CNY (1_000_000 micros) by updating directly
  await db
    .update(billingAccounts)
    .set({ minimumBalanceMicros: 1_000_000 })
    .where(eq(billingAccounts.id, account.id))

  const result = await billingService.checkBalance(userId)
  expect(result.allowed).toBe(false)
  expect(result.account).not.toBeNull()
  expect(result.account!.minimumBalanceMicros).toBe(1_000_000)
})

test("prompt endpoint returns 402 when balance insufficient", async () => {
  const { token, userId, workspaceId } = await registerUser("b_prompt_402", "b_prompt_402@example.com")
  const account = await billingService.getOrCreateAccount(userId)

  // Set minimum balance to block (1 CNY = 1_000_000 micros)
  await db
    .update(billingAccounts)
    .set({ minimumBalanceMicros: 1_000_000 })
    .where(eq(billingAccounts.id, account.id))

  const sessionId = `ses_prompt_402_${crypto.randomUUID().slice(0, 8)}`

  // Verify workspace exists
  await db
    .insert(WorkspaceTable)
    .values({
      id: workspaceId,
      type: "worktree",
      name: "default",
      directory: `${COS_BASE_PATH}/${workspaceId}`,
      project_id: "global",
      time_used: Date.now(),
    })
    .onConflictDoUpdate({
      target: WorkspaceTable.id,
      set: { directory: `${COS_BASE_PATH}/${workspaceId}`, type: "worktree" },
    })

  // Create a session for the prompt endpoint
  await db.insert(SessionTable).values({
    id: sessionId,
    project_id: "global",
    workspace_id: workspaceId,
    slug: "test",
    directory: `${COS_BASE_PATH}/${workspaceId}`,
    title: "Test",
    version: "1.0",
    time_created: 0,
    time_updated: 0,
  })

  const res = await app.fetch(
    new Request(`http://localhost/api/session/${sessionId}/prompt`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ prompt: "hello" }),
    }),
  )

  // 402 Payment Required — balance below minimum
  expect(res.status).toBe(402)
  const body = await res.json() as Record<string, any>
  expect(body.error).toBeDefined()
  expect(body.error.code).toBe("INSUFFICIENT_BALANCE")
})