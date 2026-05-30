<template>
  <q-page padding>
    <div class="billing-page">
      <h4 class="neon-text-cyan">账户 · 计费</h4>

      <!-- Insufficient balance warning -->
      <q-banner v-if="account && account.balanceMicros < account.minimumBalanceMicros" dense rounded
        class="bg-negative text-white q-mb-md insuff-banner">
        <template #avatar>
          <q-icon name="warning" color="white" size="20px" />
        </template>
        余额不足 (当前 ¥{{ fmtMicros(account.balanceMicros) }}，最低 ¥{{ fmtMicros(account.minimumBalanceMicros) }})。
        请<span class="text-bold text-yellow-3">联系管理员手动充值</span>恢复使用。
      </q-banner>

      <!-- Account cards -->
      <div class="account-cards q-mb-lg">
        <div class="acct-card" v-if="account">
          <div class="acct-card__label">账户余额</div>
          <div class="acct-card__value" :class="{ 'text-negative': account.balanceMicros < 0 }">
            ¥{{ fmtMicros(account.balanceMicros) }}
          </div>
          <div class="acct-card__meta">{{ account.currency }} · {{ account.status }}</div>
        </div>
        <div class="acct-card" v-if="account">
          <div class="acct-card__label">最低余额</div>
          <div class="acct-card__value">¥{{ fmtMicros(account.minimumBalanceMicros) }}</div>
          <div class="acct-card__meta">低于此值将暂停服务</div>
        </div>
        <div class="acct-card" v-if="account">
          <div class="acct-card__label">信用额度</div>
          <div class="acct-card__value">
            {{ account.creditLimitMicros > 0 ? `¥${fmtMicros(account.creditLimitMicros)}` : '无' }}
          </div>
          <div class="acct-card__meta">授信上限</div>
        </div>
        <div class="acct-card acct-card--loading" v-if="!account">
          <q-spinner color="cyan-4" size="24px" />
          <div class="acct-card__meta q-mt-sm">加载中...</div>
        </div>
      </div>

      <!-- Recharge note -->
      <q-banner dense rounded class="bg-dark text-grey-5 q-mb-md note-banner">
        <template #avatar>
          <q-icon name="info" color="cyan-4" size="18px" />
        </template>
        当前版本仅支持<span class="text-cyan-4 text-bold">手动充值</span>。如需充值或调整额度，请联系管理员。
        充值记录和支付订单将在后续版本中逐步开放。
      </q-banner>

      <!-- Filter bar -->
      <div class="filter-bar q-mb-md">
        <q-select v-model="filterEntryType" :options="entryTypeOptions" label="类型" outlined dense dark
          clearable emit-value class="filter-select" />
        <q-select v-model="filterSourceType" :options="sourceTypeOptions" label="来源" outlined dense dark
          clearable emit-value class="filter-select" />
        <q-select v-model="filterMediaKind" :options="mediaKindOptions" label="媒体" outlined dense dark
          clearable emit-value class="filter-select" />
        <q-input v-model="filterDateFrom" type="date" label="起始" outlined dense dark class="filter-select" clearable />
        <q-input v-model="filterDateTo" type="date" label="截止" outlined dense dark class="filter-select" clearable />
        <q-btn flat dense icon="refresh" @click="loadLedger" color="grey-5" class="q-ml-sm">
          <q-tooltip>刷新</q-tooltip>
        </q-btn>
      </div>

      <!-- Ledger table -->
      <q-table :rows="filteredLedger" :columns="ledgerColumns" row-key="id" :loading="ledgerLoading" dark flat bordered
        :pagination="{ rowsPerPage: 20 }" :rows-per-page-options="[10, 20, 50]" class="ledger-table">
        <template #body-cell-time="props">
          <q-td :props="props">
            <span class="text-grey-6 text-caption">{{ fmtTime(props.row.createdAt) }}</span>
          </q-td>
        </template>
        <template #body-cell-entryType="props">
          <q-td :props="props">
            <q-badge :color="entryColor(props.row.entryType)" text-color="white" :label="entryLabel(props.row.entryType)" />
          </q-td>
        </template>
        <template #body-cell-source="props">
          <q-td :props="props">
            <div class="text-caption">{{ props.row.sourceType }}</div>
            <div class="text-grey-6" style="font-size: 10px">{{ props.row.provider || '-' }} / {{ props.row.model || '-' }}</div>
          </q-td>
        </template>
        <template #body-cell-context="props">
          <q-td :props="props">
            <div class="text-caption" v-if="props.row.projectId || props.row.sessionId">
              {{ props.row.projectId ? `项目:${truncId(props.row.projectId)}` : '' }}
              {{ props.row.sessionId ? `会话:${truncId(props.row.sessionId)}` : '' }}
            </div>
            <div class="text-grey-6 text-caption" v-if="props.row.toolName">{{ props.row.toolName }}</div>
            <div class="text-grey-6" style="font-size: 10px" v-if="props.row.mediaKind">{{ props.row.mediaKind }}</div>
          </q-td>
        </template>
        <template #body-cell-quantity="props">
          <q-td :props="props" class="text-right">
            <span v-if="props.row.quantity !== null">{{ props.row.quantity }}{{ props.row.unit ? ` ${props.row.unit}` : '' }}</span>
            <span v-else class="text-grey-6">-</span>
          </q-td>
        </template>
        <template #body-cell-amount="props">
          <q-td :props="props" class="text-right">
            <span :class="props.row.amountMicros < 0 ? 'text-negative' : 'text-positive'">
              {{ props.row.amountMicros < 0 ? '-' : '+' }}¥{{ fmtMicros(Math.abs(props.row.amountMicros)) }}
            </span>
          </q-td>
        </template>
        <template #body-cell-balance="props">
          <q-td :props="props" class="text-right">
            <span :class="props.row.balanceAfterMicros < 0 ? 'text-negative' : ''">
              ¥{{ fmtMicros(props.row.balanceAfterMicros) }}
            </span>
          </q-td>
        </template>
        <template #body-cell-status="props">
          <q-td :props="props">
            <q-badge :color="props.row.sourceStatus === 'completed' ? 'positive' : 'warning'" outline
              :label="props.row.sourceStatus" />
          </q-td>
        </template>
      </q-table>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api } from 'src/api/client'
import type { BillingAccount, BillingLedgerEntry } from 'src/api/client'

const account = ref<BillingAccount | null>(null)
const ledger = ref<BillingLedgerEntry[]>([])
const ledgerLoading = ref(false)

// Filters
const filterEntryType = ref<string | null>(null)
const filterSourceType = ref<string | null>(null)
const filterMediaKind = ref<string | null>(null)
const filterDateFrom = ref<string | null>(null)
const filterDateTo = ref<string | null>(null)

const entryTypeOptions = [
  { label: '全部', value: null },
  { label: '充值', value: 'credit' },
  { label: '调整', value: 'adjustment' },
  { label: '消费', value: 'charge' },
]
const sourceTypeOptions = [
  { label: '全部', value: null },
  { label: '管理员', value: 'admin' },
  { label: '工具调用', value: 'toolcall' },
]
const mediaKindOptions = [
  { label: '全部', value: null },
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' },
  { label: '音频', value: 'audio' },
]

const ledgerColumns = [
  { name: 'time', label: '时间', field: 'createdAt', align: 'left' as const, sortable: true },
  { name: 'entryType', label: '类型', field: 'entryType', align: 'left' as const },
  { name: 'source', label: '来源/模型', field: (r: BillingLedgerEntry) => r.provider, align: 'left' as const },
  { name: 'context', label: '项目/会话/工具', field: (r: BillingLedgerEntry) => r.projectId, align: 'left' as const },
  { name: 'quantity', label: '数量', field: 'quantity', align: 'right' as const },
  { name: 'amount', label: '金额', field: 'amountMicros', align: 'right' as const, sortable: true },
  { name: 'balance', label: '余额', field: 'balanceAfterMicros', align: 'right' as const, sortable: true },
  { name: 'status', label: '状态', field: 'sourceStatus', align: 'left' as const },
]

const filteredLedger = computed(() => {
  let rows = ledger.value
  if (filterEntryType.value) rows = rows.filter((r) => r.entryType === filterEntryType.value)
  if (filterSourceType.value) rows = rows.filter((r) => r.sourceType === filterSourceType.value)
  if (filterMediaKind.value) rows = rows.filter((r) => r.mediaKind === filterMediaKind.value)
  if (filterDateFrom.value) {
    const from = new Date(filterDateFrom.value)
    rows = rows.filter((r) => new Date(r.createdAt) >= from)
  }
  if (filterDateTo.value) {
    const to = new Date(filterDateTo.value)
    to.setDate(to.getDate() + 1)
    rows = rows.filter((r) => new Date(r.createdAt) < to)
  }
  return rows
})

function fmtMicros(micros: number): string {
  const yuan = micros / 1_000_000
  if (Math.abs(yuan) >= 100) return yuan.toFixed(0)
  if (Math.abs(yuan) >= 1) return yuan.toFixed(2)
  return yuan.toFixed(4)
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function truncId(id: string): string {
  return id.length > 12 ? id.slice(0, 12) + '…' : id
}

function entryColor(type: string): string {
  return { credit: 'positive', adjustment: 'warning', charge: 'negative' }[type] ?? 'grey'
}

function entryLabel(type: string): string {
  return { credit: '充值', adjustment: '调整', charge: '消费' }[type] ?? type
}

async function loadAccount() {
  try {
    account.value = await api.billingAccount()
  } catch {
    account.value = null
  }
}

async function loadLedger() {
  ledgerLoading.value = true
  try {
    const result = await api.billingLedger({ limit: 200 })
    ledger.value = result.entries
  } catch {
    ledger.value = []
  } finally {
    ledgerLoading.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadAccount(), loadLedger()])
})
</script>

<style scoped>
.billing-page {
  max-width: 1200px;
}

.neon-text-cyan {
  color: #00e5ff;
  text-shadow: 0 0 12px rgba(0, 229, 255, 0.4);
  margin-bottom: 20px;
  font-weight: 700;
}

/* Account cards */
.account-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.acct-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  padding: 20px 24px;
}

.acct-card--loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 80px;
}

.acct-card__label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.acct-card__value {
  font-size: 28px;
  font-weight: 700;
  color: #00e5ff;
  line-height: 1.2;
  margin-bottom: 4px;
}

.acct-card__value.text-negative {
  color: #ff5252;
}

.acct-card__meta {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
}

/* Banners */
.insuff-banner,
.note-banner {
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 13px;
}

/* Filter bar */
.filter-bar {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  flex-wrap: wrap;
}

.filter-select {
  min-width: 130px;
}

/* Table */
.ledger-table {
  background: transparent;
}

.ledger-table :deep(.q-table) {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 12px;
}

.ledger-table :deep(.q-table th) {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4) !important;
  letter-spacing: 0.05em;
}

.ledger-table :deep(.q-table td) {
  font-size: 13px;
}
</style>
