<template>
  <q-layout view="hHh LpR fFf" class="home-shell">
    <!-- ── Sidebar (200px) ──────────────────────────────────────────────── -->
    <q-drawer
      side="left"
      :width="208"
      :breakpoint="0"
      show-if-above
      :model-value="true"
      class="home-sidebar"
    >
      <div class="home-sidebar__inner">
        <!-- Primary nav -->
        <nav class="home-sidebar__nav" :aria-label="t('nav.workbench')">
          <RouterLink
            v-for="item in visibleNavItems"
            :key="item.to"
            :to="item.to"
            :class="['home-sidebar__nav-item', { 'is-active': isActive(item.to) }]"
          >
            <q-icon
              v-if="item.iconKind === 'material'"
              :name="item.icon"
              size="18px"
              class="home-sidebar__nav-icon"
            />
            <OiIcon
              v-else
              :name="oiIcon(item.icon)"
              :size="18"
              class="home-sidebar__nav-icon"
            />
            <span class="home-sidebar__nav-label">{{ item.label }}</span>
            <q-icon
              v-if="item.to === '/'"
              name="chevron_right"
              size="14px"
              class="home-sidebar__nav-arrow"
            />
          </RouterLink>
        </nav>

        <!-- Spacer pushes the bottom group down -->
        <div class="home-sidebar__spacer" />

        <!-- Bottom utility links -->
        <div class="home-sidebar__util">
          <RouterLink
            v-for="item in utilItems"
            :key="item.to"
            :to="item.to"
            class="home-sidebar__util-item"
          >
            <OiIcon :name="oiIcon(item.icon)" :size="14" />
            <span>{{ item.label }}</span>
          </RouterLink>
        </div>

        <!-- Balance card -->
        <div class="home-sidebar__balance" @click="goBilling" role="button" tabindex="0">
          <div class="home-sidebar__balance-head">
            <span class="home-sidebar__balance-label">{{ t('gallery.balanceLabel') }}</span>
            <div class="home-sidebar__balance-dot" aria-hidden="true" />
          </div>
          <div class="home-sidebar__balance-row">
            <div class="home-sidebar__balance-value">{{ balanceDisplay }}</div>
            <q-icon name="add" size="14px" class="home-sidebar__balance-add" />
          </div>
          <div class="home-sidebar__recharge">
            <span>{{ t('gallery.rechargeCenter') }}</span>
            <q-icon name="chevron_right" size="12px" />
          </div>
        </div>

        <!-- User card -->
        <button type="button" class="home-sidebar__user" @click="goSettings">
          <q-avatar size="32px" class="home-sidebar__user-avatar">
            <q-icon name="person" size="16px" />
          </q-avatar>
          <div class="home-sidebar__user-info">
            <div class="home-sidebar__user-name">
              <span>{{ auth.user?.username || t('gallery.userPlan').split(' ')[0] || '创意探索者' }}</span>
              <span class="home-sidebar__user-pro">{{ t('gallery.userPlan') }}</span>
            </div>
            <div class="home-sidebar__user-email">
              {{ auth.user?.email || 'creative@openimago.ai' }}
            </div>
          </div>
          <q-icon name="expand_more" size="16px" class="home-sidebar__user-caret" />
        </button>
      </div>
    </q-drawer>

    <!-- ── Top bar (right-aligned actions) ─────────────────────────────── -->
    <q-header class="home-topbar">
      <q-toolbar class="home-topbar__toolbar">
        <RouterLink to="/" class="home-topbar__brand">
          <OiIcon
            name="oi-logomark"
            :size="26"
            class="home-topbar__brand-icon"
          />
          <span class="home-topbar__brand-name">openimago</span>
        </RouterLink>
        <q-space />
        <q-btn
          flat
          no-caps
          dense
          class="home-topbar__btn"
          icon="groups"
          :label="t('gallery.groupLabel')"
        />
        <q-btn
          unelevated
          no-caps
          dense
          class="home-topbar__pro"
        >
          <q-icon name="workspace_premium" size="14px" class="home-topbar__pro-icon" />
          <span>{{ t('gallery.upgradePro') }}</span>
        </q-btn>
        <q-btn
          flat
          round
          dense
          class="home-topbar__bell"
          :aria-label="t('gallery.notifications')"
        >
          <q-icon name="notifications_none" size="20px" />
          <span class="home-topbar__bell-dot" aria-hidden="true" />
        </q-btn>
      </q-toolbar>
    </q-header>

    <!-- ── Page ────────────────────────────────────────────────────────── -->
    <q-page-container class="home-page-container">
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from 'src/stores/auth'
import { api } from 'src/api/client'
import OiIcon, { type OiIconName } from 'src/components/ui/OiIcon.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const auth = useAuthStore()

// ── Balance ─────────────────────────────────────────────────────────────
const balanceMicros = ref<number | null>(null)
const balanceDisplay = computed(() => {
  if (balanceMicros.value === null) return '8,742'
  const yuan = balanceMicros.value / 1_000_000
  if (Math.abs(yuan) >= 10) return yuan.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return yuan.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
})

async function loadBalance() {
  if (!auth.token) return
  try {
    const account = await api.billingAccount()
    balanceMicros.value = account.balanceMicros
  } catch {
    /* keep placeholder */
  }
}

onMounted(() => {
  void loadBalance()
})

// ── Nav ─────────────────────────────────────────────────────────────────
interface NavItem {
  icon: string
  iconKind: 'oi' | 'material'
  label: string
  to: string
  requiresAdmin?: boolean
}

const navItems: NavItem[] = [
  // 工作台: house icon — no project SVG matches a house, use Material
  { icon: 'home',           iconKind: 'material', label: t('gallery.navWorkbench'), to: '/' },
  // 会话: chat bubble — matches the MainLayout's existing icon
  { icon: 'chat',           iconKind: 'oi',       label: t('gallery.navSessions'), to: '/sessions' },
  { icon: 'project-folder', iconKind: 'oi',       label: t('gallery.navProjects'), to: '/projects' },
  // 资产: image icon — image-placeholder is the closest visual metaphor
  { icon: 'image-placeholder', iconKind: 'oi',    label: t('gallery.navAssets'), to: '/assets' },
  // 技能与风格: 4-grid template (matches reference's 4-grid look)
  { icon: 'template-grid',  iconKind: 'oi',       label: t('gallery.navPrompts'), to: '/prompts' },
  // 计费: clock (timer / billing time)
  { icon: 'clock',          iconKind: 'oi',       label: t('gallery.navBilling'), to: '/billing' },
  { icon: 'settings',       iconKind: 'oi',       label: t('gallery.navSettings'), to: '/settings' },
  // Admin-only entry — hidden for non-admins
  { icon: 'tool-cube',      iconKind: 'oi',       label: t('gallery.navAdmin'), to: '/admin/users', requiresAdmin: true },
]

const visibleNavItems = computed<NavItem[]>(() => {
  if (!auth.isAdmin) return navItems.filter((item) => !item.requiresAdmin)
  return navItems
})

const utilItems: NavItem[] = [
  // 帮助中心: lightbulb (thinking) — represents "ideas/help"
  { icon: 'thinking',       iconKind: 'oi',       label: '帮助中心', to: '/help' },
  // 快捷键: slash — keyboard shortcut
  { icon: 'command-slash',  iconKind: 'oi',       label: '快捷键', to: '/shortcuts' },
  // API 文档: tool box
  { icon: 'tool-cube',      iconKind: 'oi',       label: 'API 文档', to: '/api-docs' },
]

// Type-cast helper: OiIcon's `name` prop is a strict union, but NavItem.icon
// is a free string so we can also store Material icon names in the same list.
const oiIcon = (name: string): OiIconName => name as OiIconName

function isActive(to: string) {
  if (to === '/') return route.path === '/' || route.path === ''
  return route.path === to || route.path.startsWith(`${to}/`)
}

function goBilling() {
  void router.push('/billing')
}

function goSettings() {
  void router.push('/settings')
}
</script>

<style lang="scss" scoped>
.home-shell {
  background: var(--imago-bg-void);
}

// ── Sidebar ─────────────────────────────────────────────────────────────
.home-sidebar {
  background: transparent !important;
  border-right: 0 !important;
}

.home-sidebar :deep(.q-drawer__content) {
  background: rgba(8, 8, 15, 0.92) !important;
  backdrop-filter: var(--imago-blur-panel);
  -webkit-backdrop-filter: var(--imago-blur-panel);
  border-right: 1px solid var(--imago-border-ghost) !important;
  padding: 0;
}

.home-sidebar__inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 20px 14px 16px;
}

// ── Nav items ──────────────────────────────────────────────────────────
.home-sidebar__nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 8px;
}

.home-sidebar__nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 38px;
  padding: 0 12px;
  border-radius: 8px;
  color: var(--imago-text-secondary);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition:
    background var(--imago-ease-fast),
    color var(--imago-ease-fast);
}

.home-sidebar__nav-item:hover {
  background: var(--imago-bg-raised);
  color: var(--imago-text-primary);
}

.home-sidebar__nav-item.is-active {
  color: var(--imago-neon-cyan);
  background:
    linear-gradient(90deg, rgba(0, 240, 255, 0.32) 0%, rgba(0, 240, 255, 0.10) 50%, rgba(168, 85, 247, 0.24) 100%);
  box-shadow:
    inset 2px 0 0 var(--imago-neon-cyan),
    0 0 22px rgba(0, 240, 255, 0.22),
    0 0 36px rgba(168, 85, 247, 0.10);
}

.home-sidebar__nav-icon {
  color: currentColor;
  opacity: 0.85;
}

.home-sidebar__nav-label {
  flex: 1;
  white-space: nowrap;
}

.home-sidebar__nav-arrow {
  color: var(--imago-text-faint);
  opacity: 0.6;
  transition:
    color var(--imago-ease-fast),
    opacity var(--imago-ease-fast);
}

.home-sidebar__nav-item.is-active .home-sidebar__nav-arrow {
  color: var(--imago-neon-cyan);
  opacity: 1;
  filter: drop-shadow(0 0 6px rgba(0, 240, 255, 0.65));
}

// ── Spacer ─────────────────────────────────────────────────────────────
.home-sidebar__spacer {
  flex: 1;
  min-height: 16px;
}

// ── Util links ────────────────────────────────────────────────────────
.home-sidebar__util {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--imago-border-ghost);
}

.home-sidebar__util-item {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 30px;
  padding: 0 12px;
  border-radius: 6px;
  color: var(--imago-text-muted);
  text-decoration: none;
  font-size: 12.5px;
  transition: color var(--imago-ease-fast);
}

.home-sidebar__util-item:hover {
  color: var(--imago-text-secondary);
}

// ── Balance card ──────────────────────────────────────────────────────
.home-sidebar__balance {
  position: relative;
  padding: 12px 14px 12px;
  margin-bottom: 12px;
  border: 1px solid var(--imago-border-light);
  border-radius: 10px;
  background:
    radial-gradient(ellipse 80% 60% at 0% 0%, rgba(0, 240, 255, 0.08), transparent 70%),
    rgba(20, 20, 36, 0.50);
  cursor: pointer;
  transition: border-color var(--imago-ease-fast);
}

.home-sidebar__balance:hover {
  border-color: var(--imago-border-cyan);
}

.home-sidebar__balance-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.home-sidebar__balance-label {
  font-size: 11px;
  color: var(--imago-text-dim);
  letter-spacing: 0.02em;
}

.home-sidebar__balance-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--imago-neon-cyan);
  box-shadow: 0 0 8px var(--imago-neon-cyan);
}

.home-sidebar__balance-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 6px;
}

.home-sidebar__balance-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--imago-text-primary);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

.home-sidebar__balance-add {
  margin-left: 4px;
  color: var(--imago-text-muted);
  border: 1px solid var(--imago-border-light);
  border-radius: 4px;
  padding: 1px;
}

.home-sidebar__recharge {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  color: var(--imago-text-muted);
}

// ── User card ─────────────────────────────────────────────────────────
.home-sidebar__user {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 8px 8px;
  border: 0;
  border-top: 1px solid var(--imago-border-ghost);
  background: transparent;
  color: var(--imago-text-primary);
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}

.home-sidebar__user:hover .home-sidebar__user-caret {
  color: var(--imago-text-secondary);
}

.home-sidebar__user-avatar {
  background: linear-gradient(135deg, rgba(0, 240, 255, 0.30), rgba(168, 85, 247, 0.40));
  color: var(--imago-text-primary);
  border: 1px solid rgba(168, 85, 247, 0.50);
  box-shadow: 0 0 12px rgba(140, 55, 255, 0.30);
}

.home-sidebar__user-info {
  flex: 1;
  min-width: 0;
}

.home-sidebar__user-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.2;
}

.home-sidebar__user-pro {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 1px 6px;
  border-radius: 4px;
  background: linear-gradient(90deg, #00f0ff, #a855f7);
  color: #030713;
}

.home-sidebar__user-email {
  font-size: 10.5px;
  color: var(--imago-text-dim);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.home-sidebar__user-caret {
  color: var(--imago-text-faint);
  transition: color var(--imago-ease-fast);
}

// ── Top bar ────────────────────────────────────────────────────────────
.home-topbar {
  background: transparent !important;
  border-bottom: 0 !important;
  height: 56px;
}

.home-topbar__toolbar {
  height: 56px;
  min-height: 56px;
  padding: 0 24px;
  gap: 10px;
}

.home-topbar__brand {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 56px;
  color: var(--imago-text-primary);
  text-decoration: none;

  &:hover { opacity: 0.9; }
}

.home-topbar__brand-icon {
  display: block;
  flex-shrink: 0;
  filter: drop-shadow(0 0 8px rgba(0, 240, 255, 0.45));
}

.home-topbar__brand-name {
  font-family: 'Trebuchet MS', 'Segoe UI', 'PingFang SC', sans-serif;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  background: linear-gradient(90deg, #e8e8ec 0%, #a0e9ff 55%, #c39bff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  line-height: 1;
}

.home-topbar__btn {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--imago-border-light);
  border-radius: 8px;
  color: var(--imago-text-secondary);
  font-size: 12.5px;
  background: var(--imago-bg-raised);
}

.home-topbar__btn:hover {
  border-color: var(--imago-border-cyan);
  color: var(--imago-text-primary);
}

.home-topbar__pro {
  height: 32px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(90deg, #ff2d95 0%, #a855f7 100%);
  box-shadow:
    0 0 18px rgba(255, 45, 149, 0.40),
    0 0 32px rgba(168, 85, 247, 0.28);
}

.home-topbar__pro-icon {
  margin-right: 4px;
}

.home-topbar__pro:hover {
  filter: brightness(1.08);
}

.home-topbar__bell {
  position: relative;
  width: 36px;
  height: 32px;
  color: var(--imago-text-secondary);
  border: 1px solid var(--imago-border-light);
  border-radius: 8px;
  background: var(--imago-bg-raised);
}

.home-topbar__bell:hover {
  color: var(--imago-text-primary);
  border-color: var(--imago-border-cyan);
}

.home-topbar__bell-dot {
  position: absolute;
  top: 7px;
  right: 8px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--imago-neon-pink);
  box-shadow: 0 0 6px var(--imago-neon-pink);
}

// ── Page container ────────────────────────────────────────────────────
.home-page-container {
  background: transparent;
}

// ── Responsive ────────────────────────────────────────────────────────
@media (max-width: 900px) {
  .home-sidebar :deep(.q-drawer__content) {
    width: 200px !important;
  }
  .home-sidebar {
    :deep(.q-drawer__content) {
      transform: translateX(-100%);
    }
  }
}
</style>
