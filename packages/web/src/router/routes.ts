import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/auth',
    name: 'auth',
    component: () => import('pages/AuthPage.vue'),
  },
  {
    path: '/sessions',
    name: 'sessions',
    component: () => import('pages/SessionWorkspacePage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/sessions/:id',
    name: 'session',
    component: () => import('pages/SessionWorkspacePage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        redirect: '/projects',
      },
      {
        path: 'projects',
        name: 'projects',
        component: () => import('pages/ProjectsPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'projects/:id',
        name: 'project-detail',
        component: () => import('pages/ProjectDetailPage.vue'),
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
