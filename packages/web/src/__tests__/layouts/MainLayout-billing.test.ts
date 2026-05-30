import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import { h, defineComponent } from 'vue'
import { QLayout } from 'quasar'
import MainLayout from '../../layouts/MainLayout.vue'
import routes from '../../router/routes'
import { useAuthStore } from '../../stores/auth'

const mockBillingAccount = vi.fn()
const mockBillingLedger = vi.fn()

vi.mock('../../api/client', () => ({
  api: {
    billingAccount: (...args: unknown[]) => mockBillingAccount(...args),
    billingLedger: (...args: unknown[]) => mockBillingLedger(...args),
    billingLedgerEntry: vi.fn(),
  },
}))

// Stub OiIcon to a simple span to avoid SVG v-html parsing in happy-dom
const StubOiIcon = defineComponent({
  props: { name: String, size: [String, Number] },
  template: '<span class="oi-icon-stub">{{ name }}</span>',
})

interface BillingAccount {
  id: string; ownerType: string; ownerId: string; currency: string
  balanceMicros: number; minimumBalanceMicros: number; creditLimitMicros: number
  status: string; createdAt: string; updatedAt: string
}

function createAccount(overrides?: Partial<BillingAccount>): BillingAccount {
  return {
    id: 'bac_test', ownerType: 'user', ownerId: 'usr_test', currency: 'CNY',
    balanceMicros: 100_000_000, minimumBalanceMicros: 0, creditLimitMicros: 0,
    status: 'active', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function mountLayout(opts?: { router?: ReturnType<typeof createRouter> }) {
  const Wrapper = defineComponent({
    components: { QLayout },
    setup() {
      return () => h(QLayout, { view: 'hHh Lpr fFf' }, () => h(MainLayout))
    },
  })
  return mount(Wrapper, {
    global: {
      plugins: opts?.router ? [opts.router] : [],
      stubs: {
        OiIcon: StubOiIcon,
        RouterView: { template: '<div class="router-view-stub" />' },
      },
    },
  })
}

function makeRouter() {
  return createRouter({ history: createWebHistory(), routes })
}

describe('MainLayout billing integration', () => {
  beforeEach(() => {
    // Clear localStorage to prevent auth store from reading stale tokens
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('includes billing nav item in rail navigation', () => {
    mockBillingAccount.mockReturnValue(new Promise(() => {}))

    const wrapper = mountLayout({ router: makeRouter() })

    // Nav buttons use aria-label for accessibility
    const billingBtn = wrapper.find('.rail-btn[aria-label="计费"]')
    expect(billingBtn.exists()).toBe(true)
  })

  it('loads live balance from billingAccount when authenticated', async () => {
    mockBillingAccount.mockResolvedValue(createAccount({ balanceMicros: 42_000_000 }))

    const auth = useAuthStore()
    auth.setAuth('test-token', {
      id: 'usr_test', username: 'test', email: 'test@test.com', role: 'user',
    })

    const wrapper = mountLayout({ router: makeRouter() })
    await flushPromises()

    expect(mockBillingAccount).toHaveBeenCalledOnce()
    expect(wrapper.find('.rail-credits__value').text()).toContain('¥42')
  })

  it('shows -- when billingAccount fails', async () => {
    mockBillingAccount.mockRejectedValue(new Error('Network error'))

    const auth = useAuthStore()
    auth.setAuth('test-token', {
      id: 'usr_test', username: 'test', email: 'test@test.com', role: 'user',
    })

    const wrapper = mountLayout({ router: makeRouter() })
    await flushPromises()

    expect(wrapper.find('.rail-credits__value').text()).toBe('--')
  })

  it('does NOT call billingAccount when not authenticated', async () => {
    mockBillingAccount.mockResolvedValue(createAccount({ balanceMicros: 42_000_000 }))

    mountLayout({ router: makeRouter() })
    await flushPromises()

    expect(mockBillingAccount).not.toHaveBeenCalled()
  })

  it('formats small balances with 2 decimal places', async () => {
    mockBillingAccount.mockResolvedValue(
      createAccount({ balanceMicros: 1_234_567 }),
    )

    const auth = useAuthStore()
    auth.setAuth('test-token', {
      id: 'usr_test', username: 'test', email: 'test@test.com', role: 'user',
    })

    const wrapper = mountLayout({ router: makeRouter() })
    await flushPromises()

    expect(wrapper.find('.rail-credits__value').text()).toBe('¥1.23')
  })
})
