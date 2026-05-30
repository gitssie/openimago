import { Hono } from "hono"
import { billingService } from "./service"

export const billingAdminRoutes = new Hono()

// GET /api/admin/billing/accounts
billingAdminRoutes.get("/accounts", async (c) => {
  const limit = parseInt(c.req.query("limit") ?? "50", 10)
  const offset = parseInt(c.req.query("offset") ?? "0", 10)

  const result = await billingService.listAccounts({ limit, offset })

  return c.json({
    accounts: result.accounts.map((a) => ({
      id: a.id,
      ownerType: a.ownerType,
      ownerId: a.ownerId,
      currency: a.currency,
      balanceMicros: a.balanceMicros,
      minimumBalanceMicros: a.minimumBalanceMicros,
      creditLimitMicros: a.creditLimitMicros,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    })),
    total: result.total,
  })
})

// GET /api/admin/billing/ledger
billingAdminRoutes.get("/ledger", async (c) => {
  const limit = parseInt(c.req.query("limit") ?? "50", 10)
  const offset = parseInt(c.req.query("offset") ?? "0", 10)

  const result = await billingService.listAllLedger({ limit, offset })

  return c.json({
    entries: result.entries.map((e) => ({
      id: e.id,
      accountId: e.accountId,
      userId: e.userId,
      workspaceId: e.workspaceId,
      projectId: e.projectId,
      sessionId: e.sessionId,
      entryType: e.entryType,
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      sourceStatus: e.sourceStatus,
      provider: e.provider,
      model: e.model,
      toolName: e.toolName,
      mediaKind: e.mediaKind,
      quantity: e.quantity,
      unit: e.unit,
      amountMicros: e.amountMicros,
      balanceAfterMicros: e.balanceAfterMicros,
      currency: e.currency,
      pricingSnapshot: e.pricingSnapshot,
      metadata: e.metadata,
      createdAt: e.createdAt.toISOString(),
    })),
    total: result.total,
  })
})

// GET /api/admin/billing/payment-orders
billingAdminRoutes.get("/payment-orders", async (c) => {
  const limit = parseInt(c.req.query("limit") ?? "50", 10)
  const offset = parseInt(c.req.query("offset") ?? "0", 10)

  const result = await billingService.listAllPaymentOrders({ limit, offset })

  return c.json({
    orders: result.orders.map((o) => ({
      id: o.id,
      accountId: o.accountId,
      userId: o.userId,
      provider: o.provider,
      providerOrderId: o.providerOrderId,
      status: o.status,
      amountMicros: o.amountMicros,
      currency: o.currency,
      checkoutUrl: o.checkoutUrl,
      paidAt: o.paidAt?.toISOString() ?? null,
      expiresAt: o.expiresAt?.toISOString() ?? null,
      metadata: o.metadata,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    })),
    total: result.total,
  })
})

// POST /api/admin/billing/accounts/:id/credits
billingAdminRoutes.post("/accounts/:id/credits", async (c) => {
  const adminId = c.get("userId") as string
  const accountId = c.req.param("id")
  const body = await c.req.json()
  const amountMicros = body.amountMicros as number | undefined
  const metadata = body.metadata as Record<string, unknown> | undefined

  if (typeof amountMicros !== "number" || amountMicros <= 0) {
    return c.json({ error: { code: "BAD_REQUEST", message: "amountMicros must be a positive integer" } }, 400 as any)
  }

  try {
    const entry = await billingService.createCredit(accountId, amountMicros, adminId, metadata)
    return c.json({
      entry: {
        id: entry.id,
        accountId: entry.accountId,
        entryType: entry.entryType,
        amountMicros: entry.amountMicros,
        balanceAfterMicros: entry.balanceAfterMicros,
        createdAt: entry.createdAt.toISOString(),
      },
    }, 201 as any)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return c.json({ error: { code: "INTERNAL_ERROR", message } }, 500 as any)
  }
})

// POST /api/admin/billing/accounts/:id/adjustments
billingAdminRoutes.post("/accounts/:id/adjustments", async (c) => {
  const adminId = c.get("userId") as string
  const accountId = c.req.param("id")
  const body = await c.req.json()
  const amountMicros = body.amountMicros as number | undefined
  const metadata = body.metadata as Record<string, unknown> | undefined

  if (typeof amountMicros !== "number") {
    return c.json({ error: { code: "BAD_REQUEST", message: "amountMicros must be an integer" } }, 400 as any)
  }

  try {
    const entry = await billingService.createAdjustment(accountId, amountMicros, adminId, metadata)
    return c.json({
      entry: {
        id: entry.id,
        accountId: entry.accountId,
        entryType: entry.entryType,
        amountMicros: entry.amountMicros,
        balanceAfterMicros: entry.balanceAfterMicros,
        createdAt: entry.createdAt.toISOString(),
      },
    }, 201 as any)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return c.json({ error: { code: "INTERNAL_ERROR", message } }, 500 as any)
  }
})

// PATCH /api/admin/billing/accounts/:id — update config fields
billingAdminRoutes.patch("/accounts/:id", async (c) => {
  const accountId = c.req.param("id")
  const body = await c.req.json()
  const updates: { minimumBalanceMicros?: number; creditLimitMicros?: number; status?: string } = {}

  if (typeof body.minimumBalanceMicros === "number") updates.minimumBalanceMicros = body.minimumBalanceMicros
  if (typeof body.creditLimitMicros === "number") updates.creditLimitMicros = body.creditLimitMicros
  if (typeof body.status === "string") updates.status = body.status

  if (Object.keys(updates).length === 0) {
    return c.json({ error: { code: "BAD_REQUEST", message: "No valid fields to update" } }, 400 as any)
  }

  const account = await billingService.updateAccountConfig(accountId, updates)
  if (!account) {
    return c.json({ error: { code: "NOT_FOUND", message: "Account not found" } }, 404 as any)
  }

  return c.json({
    account: {
      id: account.id,
      ownerType: account.ownerType,
      ownerId: account.ownerId,
      currency: account.currency,
      balanceMicros: account.balanceMicros,
      minimumBalanceMicros: account.minimumBalanceMicros,
      creditLimitMicros: account.creditLimitMicros,
      status: account.status,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    },
  })
})
