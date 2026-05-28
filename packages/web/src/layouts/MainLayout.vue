<template>
  <q-layout view="lHh Lpr lFf" class="main-shell">
    <q-header class="imago-header main-header">
      <q-toolbar class="main-toolbar">
        <q-btn flat dense round icon="menu" aria-label="Menu" class="menu-btn" @click="toggleLeftDrawer" />

        <q-toolbar-title class="imago-text-cyan imago-page-title">{{ pageTitle }}</q-toolbar-title>

        <q-btn flat no-caps class="imago-user-chip user-chip" aria-label="User">
          <q-avatar size="46px" class="imago-user-avatar user-avatar">
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

    <q-drawer v-model="leftDrawerOpen" show-if-above bordered :mini="miniState" :width="160" :mini-width="160" class="imago-drawer main-drawer">
      <div class="imago-text-cyan imago-brand imago-drawer-brand drawer-brand">openimago</div>

      <q-list class="nav-list">
        <q-item clickable v-ripple to="/projects" class="imago-nav-item nav-item" active-class="imago-nav-active">
          <q-item-section avatar>
            <q-icon name="folder" />
          </q-item-section>
          <q-item-section class="imago-nav-label nav-label">项目</q-item-section>
        </q-item>

        <q-item clickable v-ripple to="/prompts" class="imago-nav-item nav-item" active-class="imago-nav-active">
          <q-item-section avatar>
            <q-icon name="grid_view" />
          </q-item-section>
          <q-item-section class="imago-nav-label nav-label">Prompt</q-item-section>
        </q-item>

        <q-item clickable v-ripple to="/sessions" class="imago-nav-item nav-item" active-class="imago-nav-active">
          <q-item-section avatar>
            <q-icon name="deployed_code" />
          </q-item-section>
          <q-item-section class="imago-nav-label nav-label">工作台</q-item-section>
        </q-item>

        <q-item clickable v-ripple to="/assets" class="imago-nav-item nav-item" active-class="imago-nav-active">
          <q-item-section avatar>
            <q-icon name="image" />
          </q-item-section>
          <q-item-section class="imago-nav-label nav-label">资产</q-item-section>
        </q-item>

        <q-item clickable v-ripple to="/admin/users" class="imago-nav-item nav-item" active-class="imago-nav-active">
          <q-item-section avatar>
            <q-icon name="group" />
          </q-item-section>
          <q-item-section class="imago-nav-label nav-label">用户</q-item-section>
        </q-item>

        <q-item clickable v-ripple class="imago-nav-item nav-item">
          <q-item-section avatar>
            <q-icon name="bar_chart" />
          </q-item-section>
          <q-item-section class="imago-nav-label nav-label">统计</q-item-section>
        </q-item>
      </q-list>

      <q-item clickable v-ripple to="/settings" class="imago-nav-item nav-item nav-settings" active-class="imago-nav-active">
        <q-item-section avatar>
          <q-icon name="settings" />
        </q-item-section>
        <q-item-section class="imago-nav-label nav-label">设置</q-item-section>
      </q-item>

      <q-btn round flat icon="keyboard_double_arrow_right" class="imago-btn-glass drawer-collapse" @click="toggleLeftDrawer" />
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

.nav-list {
  padding: 46px 18px 0;
  display: grid;
  gap: 16px;
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
  border-radius: 50%;
}
</style>
