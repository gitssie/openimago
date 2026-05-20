<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated>
      <q-toolbar>
        <q-btn flat dense round icon="menu" aria-label="Menu" @click="toggleLeftDrawer" />

        <q-toolbar-title> openimago </q-toolbar-title>

        <q-btn flat round icon="account_circle" aria-label="User">
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

    <q-drawer v-model="leftDrawerOpen" show-if-above bordered :mini="miniState" @mouseover="miniState = false" @mouseout="miniState = true" mini-to-overlay>
      <q-list padding>
        <q-item-label header class="text-caption text-grey-5"> 导航 </q-item-label>

        <q-item clickable v-ripple to="/projects" class="nav-item">
          <q-item-section avatar>
            <q-icon name="folder" />
          </q-item-section>
          <q-item-section>项目</q-item-section>
        </q-item>

        <q-item clickable v-ripple to="/assets" class="nav-item">
          <q-item-section avatar>
            <q-icon name="image" />
          </q-item-section>
          <q-item-section>资产</q-item-section>
        </q-item>

        <q-item clickable v-ripple to="/prompts" class="nav-item">
          <q-item-section avatar>
            <q-icon name="auto_awesome" />
          </q-item-section>
          <q-item-section>Prompt</q-item-section>
        </q-item>

        <q-separator spaced />

        <q-item clickable v-ripple to="/settings" class="nav-item">
          <q-item-section avatar>
            <q-icon name="settings" />
          </q-item-section>
          <q-item-section>设置</q-item-section>
        </q-item>

        <q-item v-if="auth.isAdmin" clickable v-ripple to="/admin/users" class="nav-item">
          <q-item-section avatar>
            <q-icon name="admin_panel_settings" />
          </q-item-section>
          <q-item-section>管理</q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from 'src/stores/auth'

const auth = useAuthStore()

const leftDrawerOpen = ref(false)
const miniState = ref(true)

function toggleLeftDrawer() {
  leftDrawerOpen.value = !leftDrawerOpen.value
}

function handleLogout() {
  auth.clearAuth()
  window.location.href = '/auth'
}
</script>
