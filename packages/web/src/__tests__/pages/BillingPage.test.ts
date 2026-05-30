import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { h, defineComponent, type Component } from 'vue'
import { QLayout, QPageContainer } from 'quasar'
import BillingPage from '../../pages/BillingPage.vue'

/**
 * Mount helper that wraps the component in QLayout + QPageContainer so QPage works.
 * QPage requires QLayout as an ancestor; without it Quasar renders nothing.
 */
function mountPage(component: Component, opts?: Parameters<typeof mount>[1]) {
  const Wrapper = defineComponent({
    components: { QLayout, QPageContainer },
    setup() {
      return () => h(QLayout, { view: 'hHh Lpr fFf' }, () =>
        h(QPageContainer, () => h(component)),
      )
    },
  })
  return mount(Wrapper, opts)
}

const mockBillingAccount = vi.fn()
const mockBillingLedger = vi.fn()
const mockBillingLedgerEntry = vi.fn()

vi.mock('../../api/client', () => ({
  api: {
    billingAccount: (...args: unknown[]) => mockBillingAccount(...args),
    billingLedger: (...args: unknown[]) => mockBillingLedger(...args),
    billingLedgerEntry: (...args: unknown[]) => mockBillingLedgerEntry(...args),
  },
}))

interface BillingAccount {
  id: string; ownerType: string; ownerId: string; currency: string
  balanceMicros: number; minimumBalanceMicros: number; creditLimitMicros: number
  status: string; createdAt: string; updatedAt: string
}

interface BillingLedgerEntry {
  id: string; accountId: string; userId: string
  workspaceId: string | null; projectId: string | null; sessionId: string | null
  entryType: string; sourceType: string; sourceId: string; sourceStatus: string
  provider: string | null; model: string | null; toolName: string | null
  mediaKind: string | null; quantity: number | null; unit: string | null
  amountMicros: number; balanceAfterMicros: number; currency: string
  pricingSnapshot: unknown; metadata: unknown; createdAt: string
}

function createAccount(overrides?: Partial<BillingAccount>): BillingAccount {
  return {
    id: 'bac_test', ownerType: 'user', ownerId: 'usr_test', currency: 'CNY',
    balanceMicros: 100_000_000, minimumBalanceMicros: 0, creditLimitMicros: 0,
    status: 'active', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function createLedgerEntries(count: number): BillingLedgerEntry[] {
  const entries: BillingLedgerEntry[] = []
  for (let i = 0; i < count; i++) {
    entries.push({
      id: `bdl_${i}`, accountId: 'bac_test', userId: 'usr_test',
      workspaceId: null, projectId: i % 2 === 0 ? 'proj_abc' : null,
      sessionId: i % 3 === 0 ? 'ses_xyz' : null,
      entryType: i % 3 === 0 ? 'charge' : i % 3 === 1 ? 'credit' : 'adjustment',
      sourceType: i % 3 === 0 ? 'toolcall' : 'admin', sourceId: `src_${i}`,
      sourceStatus: 'completed',
      provider: i % 3 === 0 ? 'deepseek' : null, model: i % 3 === 0 ? 'deepseek-v4' : null,
      toolName: i % 3 === 0 ? 'read_file' : null, mediaKind: null,
      quantity: i % 3 === 0 ? 1000 : null, unit: i % 3 === 0 ? 'tokens' : null,
      amountMicros: i % 3 === 0 ? -15_000_000 : i % 3 === 1 ? 50_000_000 : -5_000_000,
      balanceAfterMicros: 100_000_000 + (i * 10_000_000),
      currency: 'CNY', pricingSnapshot: null, metadata: null,
      createdAt: new Date(2026, 0, 1 + i).toISOString(),
    })
  }
  return entries
}

describe('BillingPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders account balance, minimum, and credit cards when account is loaded', async () => {
    mockBillingAccount.mockResolvedValue(createAccount())
    mockBillingLedger.mockResolvedValue({ entries: [], total: 0 })

    const wrapper = mountPage(BillingPage)
    await flushPromises()

    expect(wrapper.text()).toContain('¥100')
    expect(wrapper.text()).toContain('最低余额')
    expect(wrapper.text()).toContain('信用额度')
  })

  it('displays negative balance in red', async () => {
    mockBillingAccount.mockResolvedValue(createAccount({ balanceMicros: -50_000_000 }))
    mockBillingLedger.mockResolvedValue({ entries: [], total: 0 })

    const wrapper = mountPage(BillingPage)
    await flushPromises()

    const balanceVal = wrapper.find('.acct-card__value.text-negative')
    expect(balanceVal.exists()).toBe(true)
    expect(balanceVal.text()).toContain('-')
  })

  it('shows loading spinner while account is loading', () => {
    mockBillingAccount.mockReturnValue(new Promise(() => {}))
    mockBillingLedger.mockResolvedValue({ entries: [], total: 0 })

    const wrapper = mountPage(BillingPage)
    expect(wrapper.find('.acct-card--loading').exists()).toBe(true)
  })

  it('shows insufficient balance warning when balance < minimumBalanceMicros', async () => {
    mockBillingAccount.mockResolvedValue(
      createAccount({ balanceMicros: 500_000, minimumBalanceMicros: 1_000_000 }),
    )
    mockBillingLedger.mockResolvedValue({ entries: [], total: 0 })

    const wrapper = mountPage(BillingPage)
    await flushPromises()

    const banner = wrapper.find('.insuff-banner')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('余额不足')
    expect(banner.text()).toContain('联系管理员手动充值')
  })

  it('does NOT show warning when balance >= minimum', async () => {
    mockBillingAccount.mockResolvedValue(
      createAccount({ balanceMicros: 1_000_000, minimumBalanceMicros: 1_000_000 }),
    )
    mockBillingLedger.mockResolvedValue({ entries: [], total: 0 })

    const wrapper = mountPage(BillingPage)
    await flushPromises()

    expect(wrapper.find('.insuff-banner').exists()).toBe(false)
  })

  it('always shows manual recharge note', async () => {
    mockBillingAccount.mockResolvedValue(createAccount())
    mockBillingLedger.mockResolvedValue({ entries: [], total: 0 })

    const wrapper = mountPage(BillingPage)
    await flushPromises()

    expect(wrapper.text()).toContain('手动充值')
  })

  it('renders ledger entries with signed amounts', async () => {
    mockBillingAccount.mockResolvedValue(createAccount())
    mockBillingLedger.mockResolvedValue({ entries: createLedgerEntries(3), total: 3 })

    const wrapper = mountPage(BillingPage)
    await flushPromises()

    expect(wrapper.text()).toContain('-¥15')
    expect(wrapper.text()).toContain('+¥50')
    expect(wrapper.text()).toContain('充值')
  })

  it('shows provider and model in source column', async () => {
    mockBillingAccount.mockResolvedValue(createAccount())
    mockBillingLedger.mockResolvedValue({ entries: createLedgerEntries(1), total: 1 })

    const wrapper = mountPage(BillingPage)
    await flushPromises()

    expect(wrapper.text()).toContain('deepseek')
    expect(wrapper.text()).toContain('deepseek-v4')
  })

  it('calls billingLedger on mount', async () => {
    mockBillingAccount.mockResolvedValue(createAccount())
    mockBillingLedger.mockResolvedValue({ entries: [], total: 0 })

    mountPage(BillingPage)
    await flushPromises()

    expect(mockBillingLedger).toHaveBeenCalledWith({ limit: 200 })
    expect(mockBillingAccount).toHaveBeenCalledOnce()
  })

  it('renders filter controls', () => {
    mockBillingAccount.mockReturnValue(new Promise(() => {}))
    mockBillingLedger.mockResolvedValue({ entries: [], total: 0 })

    const wrapper = mountPage(BillingPage)
    expect(wrapper.find('.filter-bar').exists()).toBe(true)
  })

  it('formats micros ≥ 100 CNY as whole number', async () => {
    mockBillingAccount.mockResolvedValue(createAccount({ balanceMicros: 500_000_000 }))
    mockBillingLedger.mockResolvedValue({ entries: [], total: 0 })

    const wrapper = mountPage(BillingPage)
    await flushPromises()

    expect(wrapper.text()).toContain('¥500')
  })

  it('formats micros < 1 CNY with 4 decimal places', async () => {
    mockBillingAccount.mockResolvedValue(createAccount({ balanceMicros: 1234 }))
    mockBillingLedger.mockResolvedValue({ entries: [], total: 0 })

    const wrapper = mountPage(BillingPage)
    await flushPromises()

    expect(wrapper.text()).toContain('¥0.0012')
  })
})
