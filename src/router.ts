import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'

const isGithubPages = import.meta.env.VITE_DEPLOY_TARGET === 'github-pages'

const router = createRouter({
  history: isGithubPages
    ? createWebHashHistory(import.meta.env.BASE_URL)
    : createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('./views/DashboardView.vue'),
    },
    {
      path: '/projects',
      name: 'projects',
      component: () => import('./views/ProjectsView.vue'),
    },
    {
      path: '/history',
      name: 'history',
      component: () => import('./views/HistoryView.vue'),
    },
  ],
})

export default router
