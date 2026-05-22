<template>
  <q-layout view="lHh Lpr lFf" class="main-shell">
    <q-header class="main-header">
      <q-toolbar class="main-toolbar">
        <q-btn flat dense round icon="menu" aria-label="Menu" class="menu-btn" @click="toggleLeftDrawer" />

        <q-toolbar-title class="page-title">{{ pageTitle }}</q-toolbar-title>

        <q-btn flat no-caps class="user-chip" aria-label="User">
          <q-avatar size="46px" class="user-avatar">
            <q-icon name="person" />
          </q-avatar>
          <span class="user-name">{{ auth.user?.username || auth.user?.email || 'Timmy' }}</span>
          <q-icon name="expand_more" size="18px" />
          <q-menu>
            <q-list style="min-width: 160px">
              <q-item clickable to="/settings">
                <q-item-section avatar>
                  <q-icon name="settings" />
                </q-item-section>
                <q-item-section>设置</q-item-section>
              </q-item>
              <q-separator />
              <q-item clickable @click="handleLogout">
                <q-item-section avatar>
                  <q-icon name="logout" />
                </q-item-section>
                <q-item-section>退出登录</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>
      </q-toolbar>
    </q-header>

    <q-drawer v-model="leftDrawerOpen" show-if-above bordered :mini="miniState" :width="160" :mini-width="160" class="main-drawer">
      <div class="drawer-brand">openimago</div>

      <q-list class="nav-list">
        <q-item clickable v-ripple to="/projects" class="nav-item" active-class="nav-item--active">
          <q-item-section avatar>
            <q-icon name="folder" />
          </q-item-section>
          <q-item-section class="nav-label">项目</q-item-section>
        </q-item>

        <q-item clickable v-ripple to="/prompts" class="nav-item" active-class="nav-item--active">
          <q-item-section avatar>
            <q-icon name="grid_view" />
          </q-item-section>
          <q-item-section class="nav-label">Prompt</q-item-section>
        </q-item>

        <q-item clickable v-ripple to="/sessions" class="nav-item" active-class="nav-item--active">
          <q-item-section avatar>
            <q-icon name="deployed_code" />
          </q-item-section>
          <q-item-section class="nav-label">工作台</q-item-section>
        </q-item>

        <q-item clickable v-ripple to="/assets" class="nav-item" active-class="nav-item--active">
          <q-item-section avatar>
            <q-icon name="image" />
          </q-item-section>
          <q-item-section class="nav-label">资产</q-item-section>
        </q-item>

        <q-item clickable v-ripple to="/admin/users" class="nav-item" active-class="nav-item--active">
          <q-item-section avatar>
            <q-icon name="group" />
          </q-item-section>
          <q-item-section class="nav-label">用户</q-item-section>
        </q-item>

        <q-item clickable v-ripple class="nav-item">
          <q-item-section avatar>
            <q-icon name="bar_chart" />
          </q-item-section>
          <q-item-section class="nav-label">统计</q-item-section>
        </q-item>
      </q-list>

      <q-item clickable v-ripple to="/settings" class="nav-item nav-settings" active-class="nav-item--active">
        <q-item-section avatar>
          <q-icon name="settings" />
        </q-item-section>
        <q-item-section class="nav-label">设置</q-item-section>
      </q-item>

      <q-btn round flat icon="keyboard_double_arrow_right" class="drawer-collapse" @click="toggleLeftDrawer" />
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from 'src/stores/auth'

const auth = useAuthStore()
const route = useRoute() as ReturnType<typeof useRoute> | undefined

const leftDrawerOpen = ref(false)
const miniState = ref(true)

const pageTitle = computed(() => {
  if (route?.name === 'projects') return '项目'
  if (route?.name === 'assets') return '资产库'
  if (route?.name === 'prompts') return 'Prompt 模板'
  if (route?.name === 'sessions' || route?.name === 'session') return '工作台'
  if (route?.name === 'settings') return '设置'
  if (route?.name === 'admin-users') return '用户管理'
  return '项目'
})

function toggleLeftDrawer() {
  leftDrawerOpen.value = !leftDrawerOpen.value
}

function handleLogout() {
  auth.clearAuth()
  window.location.href = '/auth'
}
</script>

<style scoped>
.main-shell {
  background:
    radial-gradient(circle at 14% 82%, rgb(0 101 255 / 20%), transparent 23%),
    radial-gradient(circle at 96% 78%, rgb(186 31 255 / 22%), transparent 25%),
    radial-gradient(circle at 50% 46%, rgb(0 218 255 / 7%), transparent 30%),
    #030713;
}

.main-shell::before {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  content: '';
  background:
    radial-gradient(circle at 35% 30%, rgb(0 224 255 / 16%) 0 1px, transparent 2px),
    radial-gradient(circle at 78% 58%, rgb(129 38 255 / 17%) 0 2px, transparent 3px);
  background-size: 84px 84px, 132px 132px;
}

.main-header {
  height: 86px;
  background: rgb(3 7 18 / 64%) !important;
  border-bottom: 1px solid rgb(133 174 220 / 18%);
  box-shadow: none;
  backdrop-filter: blur(20px);
}

.main-toolbar {
  height: 86px;
  padding: 0 34px 0 26px;
}

.menu-btn {
  color: #edf7ff;
  font-size: 20px;
  margin-right: 22px;
}

.page-title {
  color: #18f6ff;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-shadow: 0 0 16px rgb(24 246 255 / 46%);
}

.user-chip {
  color: #d8dfed;
  gap: 10px;
  padding: 0;
  font-size: 15px;
}

.user-avatar {
  color: #20efff;
  background: linear-gradient(135deg, rgb(25 239 255 / 20%), rgb(160 55 255 / 42%));
  border: 1px solid rgb(144 85 255 / 80%);
  box-shadow: 0 0 18px rgb(140 55 255 / 42%);
}

.main-drawer {
  background: rgb(2 7 18 / 72%) !important;
  border-right: 1px solid rgb(133 174 220 / 20%) !important;
  backdrop-filter: blur(20px);
}

.drawer-brand {
  height: 86px;
  display: flex;
  align-items: center;
  padding-left: 22px;
  color: #20f7ff;
  font-family: 'Trebuchet MS', 'Segoe UI', sans-serif;
  font-size: 21px;
  font-weight: 700;
  letter-spacing: -0.08em;
  border-bottom: 1px solid rgb(133 174 220 / 18%);
  text-shadow: 0 0 11px rgb(32 247 255 / 56%);
}

.nav-list {
  padding: 46px 18px 0;
  display: grid;
  gap: 16px;
}

.nav-item {
  min-height: 54px;
  color: #d8dfed;
  border: 1px solid transparent;
  border-radius: 10px;
}

.nav-item :deep(.q-icon) {
  font-size: 22px;
}

.nav-label {
  display: none;
}

.nav-item--active,
.nav-item.q-router-link--active {
  color: #12f3ff !important;
  background: linear-gradient(90deg, rgb(0 235 255 / 18%), rgb(21 34 68 / 18%)) !important;
  border-color: rgb(130 178 239 / 22%);
  border-left: 2px solid #16f5ff !important;
  box-shadow: inset 0 0 24px rgb(0 238 255 / 12%);
}

.nav-settings {
  position: absolute;
  right: 18px;
  bottom: 350px;
  left: 18px;
}

.drawer-collapse {
  position: absolute;
  bottom: 34px;
  left: 50px;
  color: #d9efff;
  border: 1px solid #16f5ff;
  background: rgb(0 64 130 / 24%);
  box-shadow: 0 0 18px rgb(0 154 255 / 34%);
}
</style>
