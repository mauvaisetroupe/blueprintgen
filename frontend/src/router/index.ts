import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'dag-list',
      component: () => import('@/views/DagListView.vue'),
    },
    {
      path: '/dag/new',
      name: 'dag-create',
      component: () => import('@/views/DagCreateView.vue'),
    },
    {
      path: '/import',
      name: 'dag-import',
      component: () => import('@/views/DagImportView.vue'),
    },
    {
      path: '/dag/:id',
      component: () => import('@/views/DagDetailLayout.vue'),
      children: [
        {
          path: 'components',
          name: 'dag-overview',
          component: () => import('@/views/dag/DagOverviewView.vue'),
        },
        {
          path: 'landscape',
          name: 'dag-landscape',
          component: () => import('@/views/dag/LandscapeView.vue'),
        },
        {
          path: 'technical',
          name: 'dag-technical',
          component: () => import('@/views/dag/TechnicalLandscapeView.vue'),
        },
        {
          path: 'flows',
          name: 'dag-flows',
          component: () => import('@/views/dag/ApplicationFlowsView.vue'),
        },
      ],
    },
  ],
})

export default router
