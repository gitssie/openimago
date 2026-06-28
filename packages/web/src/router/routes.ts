import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/auth',
    name: 'auth',
    component: () => import('pages/AuthPage.vue'),
  },

  // ── Authenticated app (unified 208px sidebar layout, per design spec) ──
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
        path: 'skills',
        name: 'skills',
        component: () => import('pages/SkillsPage.vue'),
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

  // ── Projects list (kept under HomeLayout for now) ───────────────────────
  {
    path: '/projects',
    component: () => import('layouts/HomeLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'projects',
        component: () => import('pages/ProjectsPage.vue'),
        meta: { requiresAuth: true },
      },
    ],
  },

  // ── Workspace pages (own full-viewport shell, no HomeLayout chrome) ────
  {
    path: '/sessions',
    component: () => import('layouts/WorkspaceLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'sessions',
        component: () => import('pages/SessionWorkspacePage.vue'),
        meta: { requiresAuth: true, layout: 'session-workspace' },
      },
      {
        path: ':id',
        name: 'session',
        component: () => import('pages/SessionWorkspacePage.vue'),
        meta: { requiresAuth: true, layout: 'session-workspace' },
      },
    ],
  },
  {
    path: '/projects/:id',
    component: () => import('layouts/WorkspaceLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'project-workspace',
        component: () => import('pages/ProjectWorkspacePage.vue'),
        meta: { requiresAuth: true, layout: 'project-workspace' },
      },
      {
        path: 'sessions/:sessionId',
        name: 'project-session',
        component: () => import('pages/ProjectWorkspacePage.vue'),
        meta: { requiresAuth: true, layout: 'project-workspace' },
      },
    ],
  },

  // ── Gallery Detail (standalone — full-screen immersive viewer) ────────
  {
    path: '/gallery/:slug',
    name: 'gallery-detail',
    component: () => import('pages/GalleryDetailPage.vue'),
    meta: { requiresAuth: true },
  },

  // Always leave this as last one
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
]

export default routes
