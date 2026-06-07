import { eq, desc, and, sql } from "drizzle-orm"
import { db } from "../db/client"
import {
  billingAccounts,
  billingLedger,
  billingPaymentOrders,
} from "../db/schema"

export interface Account {
  id: string
  ownerType: string
  ownerId: string
  currency: string
  balanceMicros: number
  minimumBalanceMicros: number
  creditLimitMicros: number
  status: string
  createdAt: Date
  updatedAt: Date
}

export interface LedgerEntry {
  id: string
  accountId: string
  userId: string
  workspaceId: string | null
  projectId: string | null
  sessionId: string | null
  entryType: string
  sourceType: string
  sourceId: string
  sourceStatus: string
  provider: string | null
  model: string | null
  toolName: string | null
  mediaKind: string | null
  quantity: number | null
  unit: string | null
  amountMicros: number
  balanceAfterMicros: number
  currency: string
  pricingSnapshot: unknown
  metadata: unknown
  createdAt: Date
}

export interface PaymentOrder {
  id: string
  accountId: string
  userId: string
  provider: string
  providerOrderId: string | null
  status: string
  amountMicros: number
  currency: string
  checkoutUrl: string | null
  paidAt: Date | null
  expiresAt: Date | null
  metadata: unknown
  createdAt: Date
  updatedAt: Date
}

function genId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 25)}`
}

/** Atomic ledger write: inserts entry and updates account balance in one transaction */
async function writeLedgerEntry(params: {
  accountId: string
  userId: string
  entryType: string
  sourceType: string
  sourceId: string
  amountMicros: number
  currency?: string
  workspaceId?: string | null
  projectId?: string | null
  sessionId?: string | null
  provider?: string | null
  model?: string | null
  toolName?: string | null
  mediaKind?: string | null
  quantity?: number | null
  unit?: string | null
  pricingSnapshot?: unknown
  metadata?: unknown
  sourceStatus?: string
  /** If set, requires current balance >= this amount before writing. */
  requireBalanceAtLeast?: number
}): Promise<LedgerEntry> {
  return db.transaction(async (tx) => {
    // Lock and read current account balance
    const [account] = await tx
      .select({ balanceMicros: billingAccounts.balanceMicros, currency: billingAccounts.currency })
      .from(billingAccounts)
      .where(eq(billingAccounts.id, params.accountId))
      .for("update")

    if (!account) {
      throw new Error(`Billing account ${params.accountId} not found`)
    }

    // Pre-charge balance eligibility check
    if (
      params.requireBalanceAtLeast !== undefined &&
      account.balanceMicros < params.requireBalanceAtLeast
    ) {
      throw new Error("INSUFFICIENT_BALANCE")
    }

    const newBalance = account.balanceMicros + params.amountMicros
    const id = genId("bdl")

    await tx
      .update(billingAccounts)
      .set({
        balanceMicros: newBalance,
        updatedAt: sql`NOW()`,
      })
      .where(eq(billingAccounts.id, params.accountId))

    await tx.insert(billingLedger).values({
      id,
      accountId: params.accountId,
      userId: params.userId,
      workspaceId: params.workspaceId ?? null,
      projectId: params.projectId ?? null,
      sessionId: params.sessionId ?? null,
      entryType: params.entryType,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      sourceStatus: params.sourceStatus ?? "completed",
      provider: params.provider ?? null,
      model: params.model ?? null,
      toolName: params.toolName ?? null,
      mediaKind: params.mediaKind ?? null,
      quantity: params.quantity ?? null,
      unit: params.unit ?? null,
      amountMicros: params.amountMicros,
      balanceAfterMicros: newBalance,
      currency: params.currency ?? account.currency,
      pricingSnapshot: params.pricingSnapshot as Record<string, unknown> | null ?? null,
      metadata: params.metadata as Record<string, unknown> | null ?? null,
      createdAt: sql`NOW()`,
    })

    const [entry] = await tx
      .select()
      .from(billingLedger)
      .where(eq(billingLedger.id, id))
      .limit(1)

    return entry as unknown as LedgerEntry
  })
}

export const billingService = {
  /** Get or create a billing account for a user */
  async getOrCreateAccount(userId: string, opts?: { currency?: string }): Promise<Account> {
    const [existing] = await db
      .select()
      .from(billingAccounts)
      .where(
        and(
          eq(billingAccounts.ownerType, "user"),
          eq(billingAccounts.ownerId, userId),
        ),
      )
      .limit(1)

    if (existing) {
      return existing as unknown as Account
    }

    const id = genId("bac")
    const [created] = await db
      .insert(billingAccounts)
      .values({
        id,
        ownerType: "user",
        ownerId: userId,
        currency: opts?.currency ?? "CNY",
        balanceMicros: 0,
        minimumBalanceMicros: 0,
        creditLimitMicros: 0,
        status: "active",
        createdAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      })
      .returning()

    return created as unknown as Account
  },

  /** Get account by owner_type/owner_id */
  async getAccount(userId: string): Promise<Account | null> {
    const [account] = await db
      .select()
      .from(billingAccounts)
      .where(
        and(
          eq(billingAccounts.ownerType, "user"),
          eq(billingAccounts.ownerId, userId),
        ),
      )
      .limit(1)

    return (account as Account) ?? null
  },

  /** Check if user has sufficient balance */
  async checkBalance(userId: string): Promise<{ allowed: boolean; account: Account | null }> {
    const account = await this.getAccount(userId)
    if (!account) {
      // No account yet — allow (first-use creates account on charge)
      return { allowed: true, account: null }
    }
    if (account.balanceMicros < account.minimumBalanceMicros) {
      return { allowed: false, account }
    }
    return { allowed: true, account }
  },

  /** List ledger entries for an account */
  async listLedgerEntries(
    accountId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<{ entries: LedgerEntry[]; total: number }> {
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(billingLedger)
      .where(eq(billingLedger.accountId, accountId))

    const entries = await db
      .select()
      .from(billingLedger)
      .where(eq(billingLedger.accountId, accountId))
      .orderBy(desc(billingLedger.createdAt))
      .limit(opts?.limit ?? 50)
      .offset(opts?.offset ?? 0)

    return {
      entries: entries as unknown as LedgerEntry[],
      total: countRow?.count ?? 0,
    }
  },

  /** Get a single ledger entry by id */
  async getLedgerEntry(entryId: string): Promise<LedgerEntry | null> {
    const [entry] = await db
      .select()
      .from(billingLedger)
      .where(eq(billingLedger.id, entryId))
      .limit(1)

    return (entry as LedgerEntry) ?? null
  },

  /** Admin: issue credit (positive amount) */
  async createCredit(
    accountId: string,
    amountMicros: number,
    adminId: string,
    metadata?: unknown,
  ): Promise<LedgerEntry> {
    if (amountMicros <= 0) {
      throw new Error("Credit amount must be positive")
    }
    return writeLedgerEntry({
      accountId,
      userId: adminId,
      entryType: "credit",
      sourceType: "admin",
      sourceId: genId("crd"),
      amountMicros,
      metadata,
    })
  },

  /** Admin: issue adjustment (can be positive or negative) */
  async createAdjustment(
    accountId: string,
    amountMicros: number,
    adminId: string,
    metadata?: unknown,
  ): Promise<LedgerEntry> {
    return writeLedgerEntry({
      accountId,
      userId: adminId,
      entryType: "adjustment",
      sourceType: "admin",
      sourceId: genId("adj"),
      amountMicros,
      metadata,
    })
  },

  /** Charge for tool call (negative amount) */
  async chargeToolCall(params: {
    accountId: string
    userId: string
    amountMicros: number
    workspaceId?: string
    projectId?: string
    sessionId?: string
    provider?: string
    model?: string
    toolName?: string
    mediaKind?: string
    quantity?: number
    unit?: string
    pricingSnapshot?: unknown
    metadata?: unknown
  }): Promise<LedgerEntry> {
    if (params.amountMicros >= 0) {
      throw new Error("Charge amount must be negative")
    }
    return writeLedgerEntry({
      accountId: params.accountId,
      userId: params.userId,
      entryType: "charge",
      sourceType: "toolcall",
      sourceId: genId("tch"),
      amountMicros: params.amountMicros,
      workspaceId: params.workspaceId,
      projectId: params.projectId,
      sessionId: params.sessionId,
      provider: params.provider,
      model: params.model,
      toolName: params.toolName,
      mediaKind: params.mediaKind,
      quantity: params.quantity,
      unit: params.unit,
      pricingSnapshot: params.pricingSnapshot,
      metadata: params.metadata,
    })
  },

  /**
   * Pre-charge for a media tool call (negative amount).
   *
   * Atomic eligibility check: current balance must be >= costMagnitude
   * before the charge is written. Throws `INSUFFICIENT_BALANCE` if not.
   * Does NOT create a new account — if no account exists, fails.
   */
  async prechargeToolCall(params: {
    accountId: string
    userId: string
    amountMicros: number
    workspaceId?: string
    projectId?: string
    sessionId?: string
    provider?: string
    model?: string
    toolName?: string
    mediaKind?: string
    quantity?: number
    unit?: string
    pricingSnapshot?: unknown
    metadata?: unknown
  }): Promise<LedgerEntry> {
    if (params.amountMicros >= 0) {
      throw new Error("Charge amount must be negative")
    }
    const costMagnitude = Math.abs(params.amountMicros)
    return writeLedgerEntry({
      accountId: params.accountId,
      userId: params.userId,
      entryType: "charge",
      sourceType: "toolcall",
      sourceId: genId("tch"),
      sourceStatus: "completed",
      amountMicros: params.amountMicros,
      requireBalanceAtLeast: costMagnitude,
      workspaceId: params.workspaceId,
      projectId: params.projectId,
      sessionId: params.sessionId,
      provider: params.provider,
      model: params.model,
      toolName: params.toolName,
      mediaKind: params.mediaKind,
      quantity: params.quantity,
      unit: params.unit,
      pricingSnapshot: params.pricingSnapshot,
      metadata: params.metadata,
    })
  },

  /**
   * Refund a tool-call pre-charge (positive amount).
   *
   * Writes a positive refund entry that offsets the original pre-charge.
   * Links to the original charge via metadata for audit trail.
   */
  async refundToolCallPrecharge(params: {
    accountId: string
    userId: string
    amountMicros: number
    originalChargeSourceId: string
    workspaceId?: string
    projectId?: string
    sessionId?: string
    provider?: string
    model?: string
    toolName?: string
    mediaKind?: string
    metadata?: unknown
  }): Promise<LedgerEntry> {
    if (params.amountMicros <= 0) {
      throw new Error("Refund amount must be positive")
    }
    return writeLedgerEntry({
      accountId: params.accountId,
      userId: params.userId,
      entryType: "refund",
      sourceType: "toolcall_refund",
      sourceId: genId("tcr"),
      amountMicros: params.amountMicros,
      workspaceId: params.workspaceId,
      projectId: params.projectId,
      sessionId: params.sessionId,
      provider: params.provider,
      model: params.model,
      toolName: params.toolName,
      mediaKind: params.mediaKind,
      metadata: {
        ...(params.metadata as Record<string, unknown> | undefined),
        originalChargeSourceId: params.originalChargeSourceId,
      },
    })
  },

  /** Create a payment order (manual recharge placeholder) */
  async createPaymentOrder(params: {
    accountId: string
    userId: string
    provider: string
    amountMicros: number
    currency?: string
    metadata?: unknown
  }): Promise<PaymentOrder> {
    const id = genId("bpo")
    const [order] = await db
      .insert(billingPaymentOrders)
      .values({
        id,
        accountId: params.accountId,
        userId: params.userId,
        provider: params.provider,
        status: "pending",
        amountMicros: params.amountMicros,
        currency: params.currency ?? "CNY",
        metadata: params.metadata as Record<string, unknown> | null ?? null,
        createdAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      })
      .returning()

    return order as unknown as PaymentOrder
  },

  /** List payment orders for an account */
  async listPaymentOrders(
    accountId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<{ orders: PaymentOrder[]; total: number }> {
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(billingPaymentOrders)
      .where(eq(billingPaymentOrders.accountId, accountId))

    const orders = await db
      .select()
      .from(billingPaymentOrders)
      .where(eq(billingPaymentOrders.accountId, accountId))
      .orderBy(desc(billingPaymentOrders.createdAt))
      .limit(opts?.limit ?? 50)
      .offset(opts?.offset ?? 0)

    return {
      orders: orders as unknown as PaymentOrder[],
      total: countRow?.count ?? 0,
    }
  },

  // ── Admin list methods ──────────────────────────────────────────

  /** Admin: list all accounts */
  async listAccounts(opts?: { limit?: number; offset?: number }): Promise<{ accounts: Account[]; total: number }> {
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(billingAccounts)

    const accounts = await db
      .select()
      .from(billingAccounts)
      .orderBy(desc(billingAccounts.createdAt))
      .limit(opts?.limit ?? 50)
      .offset(opts?.offset ?? 0)

    return {
      accounts: accounts as unknown as Account[],
      total: countRow?.count ?? 0,
    }
  },

  /** Admin: list all ledger entries */
  async listAllLedger(opts?: { limit?: number; offset?: number }): Promise<{ entries: LedgerEntry[]; total: number }> {
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(billingLedger)

    const entries = await db
      .select()
      .from(billingLedger)
      .orderBy(desc(billingLedger.createdAt))
      .limit(opts?.limit ?? 50)
      .offset(opts?.offset ?? 0)

    return {
      entries: entries as unknown as LedgerEntry[],
      total: countRow?.count ?? 0,
    }
  },

  /** Admin: list all payment orders */
  async listAllPaymentOrders(opts?: { limit?: number; offset?: number }): Promise<{ orders: PaymentOrder[]; total: number }> {
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(billingPaymentOrders)

    const orders = await db
      .select()
      .from(billingPaymentOrders)
      .orderBy(desc(billingPaymentOrders.createdAt))
      .limit(opts?.limit ?? 50)
      .offset(opts?.offset ?? 0)

    return {
      orders: orders as unknown as PaymentOrder[],
      total: countRow?.count ?? 0,
    }
  },

  /** Admin: update account config (minimum balance, credit limit, status) */
  async updateAccountConfig(
    accountId: string,
    updates: { minimumBalanceMicros?: number; creditLimitMicros?: number; status?: string },
  ): Promise<Account | null> {
    const setData: Record<string, unknown> = { updatedAt: sql`NOW()` }
    if (updates.minimumBalanceMicros !== undefined) setData.minimumBalanceMicros = updates.minimumBalanceMicros
    if (updates.creditLimitMicros !== undefined) setData.creditLimitMicros = updates.creditLimitMicros
    if (updates.status !== undefined) setData.status = updates.status

    const [updated] = await db
      .update(billingAccounts)
      .set(setData)
      .where(eq(billingAccounts.id, accountId))
      .returning()

    return (updated as Account) ?? null
  },
}
