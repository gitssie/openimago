import { Hono } from "hono"
import { authMiddleware } from "../server/middleware"
import { billingService } from "./service"

export const billingRoutes = new Hono()

billingRoutes.use("/*", authMiddleware)

// GET /api/platform/billing/account
billingRoutes.get("/account", async (c) => {
  const userId = c.get("userId") as string
  const account = await billingService.getOrCreateAccount(userId)

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

// GET /api/platform/billing/ledger
billingRoutes.get("/ledger", async (c) => {
  const userId = c.get("userId") as string
  const limit = parseInt(c.req.query("limit") ?? "50", 10)
  const offset = parseInt(c.req.query("offset") ?? "0", 10)

  const account = await billingService.getAccount(userId)
  if (!account) {
    return c.json({ entries: [], total: 0 })
  }

  const result = await billingService.listLedgerEntries(account.id, { limit, offset })

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

// GET /api/platform/billing/ledger/:id
billingRoutes.get("/ledger/:id", async (c) => {
  const userId = c.get("userId") as string
  const entryId = c.req.param("id")

  const entry = await billingService.getLedgerEntry(entryId)
  if (!entry) {
    return c.json({ error: { code: "NOT_FOUND", message: "Ledger entry not found" } }, 404 as any)
  }

  const account = await billingService.getAccount(userId)
  if (!account || entry.accountId !== account.id) {
    return c.json({ error: { code: "NOT_FOUND", message: "Ledger entry not found" } }, 404 as any)
  }

  return c.json({
    entry: {
      id: entry.id,
      accountId: entry.accountId,
      userId: entry.userId,
      workspaceId: entry.workspaceId,
      projectId: entry.projectId,
      sessionId: entry.sessionId,
      entryType: entry.entryType,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      sourceStatus: entry.sourceStatus,
      provider: entry.provider,
      model: entry.model,
      toolName: entry.toolName,
      mediaKind: entry.mediaKind,
      quantity: entry.quantity,
      unit: entry.unit,
      amountMicros: entry.amountMicros,
      balanceAfterMicros: entry.balanceAfterMicros,
      currency: entry.currency,
      pricingSnapshot: entry.pricingSnapshot,
      metadata: entry.metadata,
      createdAt: entry.createdAt.toISOString(),
    },
  })
})

// GET /api/platform/billing/payment-orders
billingRoutes.get("/payment-orders", async (c) => {
  const userId = c.get("userId") as string
  const limit = parseInt(c.req.query("limit") ?? "50", 10)
  const offset = parseInt(c.req.query("offset") ?? "0", 10)

  const account = await billingService.getAccount(userId)
  if (!account) {
    return c.json({ orders: [], total: 0 })
  }

  const result = await billingService.listPaymentOrders(account.id, { limit, offset })

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
