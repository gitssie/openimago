import { defineRouter } from '#q-app/wrappers'
import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  createWebHistory,
} from 'vue-router'
import routes from './routes'
import { useAuthStore } from 'stores/auth'

export default defineRouter((/* { store, ssrContext } */) => {
  const createHistory = process.env.SERVER
    ? createMemoryHistory
    : process.env.VUE_ROUTER_MODE === 'history'
      ? createWebHistory
      : createWebHashHistory

  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,
    history: createHistory(process.env.VUE_ROUTER_BASE),
  })

  Router.beforeEach(async (to) => {
    const auth = useAuthStore()
    if (!to.meta.requiresAuth) return

    // Verify token with backend when we have a local token but haven't confirmed it's valid
    if (auth.isAuthenticated && !auth.verified) {
      await auth.fetchMe()
    }

    if (!auth.isAuthenticated) {
      // If user was previously authenticated (token existed but expired), show
      // the global reauth dialog instead of redirecting away from the current page.
      if (auth.wasPreviouslyAuthenticated && to.path !== '/auth') {
        auth.requestReauth()
        return true
      }
      return '/auth'
    }
  })

  return Router
})
