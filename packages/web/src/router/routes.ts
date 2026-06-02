import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/auth',
    name: 'auth',
    component: () => import('pages/AuthPage.vue'),
  },

  // ── Home (HomeLayout: 200px sidebar + top actions, per design spec) ──
  {
    path: '/',
    component: () => import('layouts/HomeLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('pages/HomePage.vue'),
        meta: { requiresAuth: true },
      },
    ],
  },

  // ── Gallery Detail (standalone — full-screen immersive viewer) ──
  {
    path: '/gallery/:slug',
    name: 'gallery-detail',
    component: () => import('pages/GalleryDetailPage.vue'),
    meta: { requiresAuth: true },
  },

  // ── Main Layout (wraps existing pages with nav rail) ──
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: 'sessions',
        name: 'sessions',
        component: () => import('pages/SessionWorkspacePage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'sessions/:id',
        name: 'session',
        component: () => import('pages/SessionWorkspacePage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'projects',
        name: 'projects',
        component: () => import('pages/ProjectsPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'projects/:id',
        name: 'project-workspace',
        component: () => import('pages/ProjectWorkspacePage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'projects/:id/sessions/:sessionId',
        name: 'project-session',
        component: () => import('pages/ProjectWorkspacePage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'assets',
        name: 'assets',
        component: () => import('pages/AssetsPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'prompts',
        name: 'prompts',
        component: () => import('pages/PromptsPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('pages/SettingsPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'billing',
        name: 'billing',
        component: () => import('pages/BillingPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'admin/users',
        name: 'admin-users',
        component: () => import('pages/AdminUsersPage.vue'),
        meta: { requiresAuth: true, requiresAdmin: true },
      },
    ],
  },

  // Always leave this as last one
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
]

export default routes
