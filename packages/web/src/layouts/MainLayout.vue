<template>
  <q-layout view="hHh lpr fFf" class="main-shell">
    <q-header class="main-header">
      <q-toolbar class="main-toolbar">
        <div class="brand">
          <OiIcon name="openimago-logo" :size="36" style="width: auto; height: 36px;" class="brand-logo" />
        </div>
        <q-space />
        <div class="topbar-actions">
          <q-btn flat no-caps class="user-chip" aria-label="User">
            <q-avatar size="28px" class="user-avatar">
              <q-icon name="person" size="14px" />
            </q-avatar>
            <span class="user-name">{{ auth.user?.username || auth.user?.email || 'User' }}</span>
            <q-icon name="expand_more" size="14px" class="q-ml-xs" />
            <q-menu>
              <q-list style="min-width: 160px">
                <q-item clickable to="/settings">
                  <q-item-section avatar><q-icon name="settings" /></q-item-section>
                  <q-item-section>设置</q-item-section>
                </q-item>
                <q-separator />
                <q-item clickable @click="handleLogout">
                  <q-item-section avatar><q-icon name="logout" /></q-item-section>
                  <q-item-section>退出登录</q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </q-btn>
        </div>
      </q-toolbar>
    </q-header>

    <q-drawer
      v-model="railOpen"
      side="left"
      :width="64"
      :breakpoint="0"
      show-if-above
      class="main-rail"
    >
      <div class="rail-inner">
        <nav class="rail-nav">
          <q-btn
            v-for="item in navItems"
            :key="item.to"
            flat
            :to="item.to"
            :aria-label="item.label"
            :class="['rail-btn', { 'rail-btn--active': isActive(item.to) }]"
          >
            <OiIcon :name="item.icon" :size="20" />
            <q-tooltip anchor="center right" self="center left" :offset="[14, 0]">{{ item.label }}</q-tooltip>
          </q-btn>
        </nav>

        <div class="rail-footer">
          <div class="rail-credits" @click="$router.push('/billing')" style="cursor: pointer">
            <span class="rail-credits__label">余额</span>
            <q-icon name="bolt" size="14px" color="cyan-4" />
            <span class="rail-credits__value">{{ balanceDisplay }}</span>
          </div>
        </div>
      </div>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from 'src/stores/auth'
import OiIcon, { type OiIconName } from 'src/components/ui/OiIcon.vue'
import { api } from 'src/api/client'

const auth = useAuthStore()
const route = useRoute()
const railOpen = ref(true)
const balanceMicros = ref<number | null>(null)
const balanceLoading = ref(false)

const balanceDisplay = computed(() => {
  if (balanceMicros.value === null) return '--'
  const yuan = balanceMicros.value / 1_000_000
  if (Math.abs(yuan) >= 10) return `¥${yuan.toFixed(0)}`
  return `¥${yuan.toFixed(2)}`
})

async function loadBalance() {
  balanceLoading.value = true
  try {
    const account = await api.billingAccount()
    balanceMicros.value = account.balanceMicros
  } catch {
    balanceMicros.value = null
  } finally {
    balanceLoading.value = false
  }
}

onMounted(() => {
  if (auth.token) void loadBalance()
})

const navItems: { icon: OiIconName; label: string; to: string }[] = [
  { icon: 'chat', label: '会话', to: '/sessions' },
  { icon: 'project-folder', label: '项目', to: '/projects' },
  { icon: 'asset-cube', label: '资产', to: '/assets' },
  { icon: 'template-grid', label: '技能与风格', to: '/prompts' },
  { icon: 'clock', label: '计费', to: '/billing' },
  { icon: 'settings', label: '设置', to: '/settings' },
]

function isActive(to: string): boolean {
  return route.path.startsWith(to)
}

function handleLogout() {
  auth.clearAuth()
  window.location.href = '/auth'
}
</script>

<style scoped>
/* ── Shell background ──────────────────────────────────────────────────────── */
.main-shell {
  background:
    radial-gradient(circle at 14% 82%, rgb(0 101 255 / 20%), transparent 23%),
    radial-gradient(circle at 96% 78%, rgb(186 31 255 / 22%), transparent 25%),
    radial-gradient(circle at 50% 46%, rgb(0 218 255 / 7%), transparent 30%),
    #030713;
}

/* ── Header ────────────────────────────────────────────────────────────────── */
.main-header {
  height: 52px;
  background: rgba(3, 7, 19, 0.92) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(12px);
}

.main-toolbar {
  height: 52px;
  min-height: 52px;
  padding: 0 20px 0 12px;
}

.brand {
  display: flex;
  align-items: center;
}

.brand-logo {
  width: auto;
  height: 28px;
  color: #00f0ff;
  filter: drop-shadow(0 0 12px rgba(0, 240, 255, 0.35));
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-chip {
  gap: 7px;
  padding: 4px 10px;
  color: rgba(255, 255, 255, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
}

.user-chip:hover {
  background: rgba(255, 255, 255, 0.05);
}

.user-avatar {
  background: rgba(0, 240, 255, 0.12);
  color: #00f0ff;
}

.user-name {
  font-size: 13px;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Rail drawer ───────────────────────────────────────────────────────────── */
.main-rail :deep(.q-drawer__content) {
  background: rgba(3, 7, 19, 0.92) !important;
  border-right: 1px solid rgba(255, 255, 255, 0.06) !important;
  backdrop-filter: blur(12px);
}

.rail-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
}

.rail-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding-top: 12px;
}

.rail-btn {
  width: 40px;
  height: 40px;
  min-height: unset !important;
  min-width: unset !important;
  padding: 0 !important;
  color: rgba(255, 255, 255, 0.32);
  border-radius: 10px;
  transition: color 120ms ease, background 120ms ease;
}

.rail-btn :deep(.q-btn__content) {
  display: flex;
  align-items: center;
  justify-content: center;
}

.rail-btn:hover {
  color: rgba(255, 255, 255, 0.75);
  background: rgba(255, 255, 255, 0.06);
}

.rail-btn--active {
  color: #00e5ff;
  background: rgba(0, 229, 255, 0.1);
}

.rail-btn--active :deep(svg) {
  filter: drop-shadow(0 0 6px rgba(0, 229, 255, 0.7));
}

.rail-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-bottom: 12px;
  gap: 8px;
}

.rail-credits {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  cursor: default;
}

.rail-credits__label {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.3);
  line-height: 1;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.rail-credits__value {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1;
}
</style>
