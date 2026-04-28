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
      path: '/dag/:id/delete',
      name: 'dag-delete',
      component: () => import('@/views/DagDeleteView.vue'),
    },
    {
      path: '/dag/:id',
      component: () => import('@/views/DagDetailLayout.vue'),
      children: [
        {
          path: '',
          redirect: { name: 'dag-overview' },
        },
        {
          path: 'components',
          name: 'dag-overview',
          component: () => import('@/views/dag/DagOverviewView.vue'),
          props: { listKey: 'components' },
        },
        {
          path: 'technical-components',
          name: 'dag-technical-components',
          component: () => import('@/views/dag/DagOverviewView.vue'),
          props: { listKey: 'technicalComponents' },
        },
        {
          path: 'landscape',
          name: 'dag-landscape',
          component: () => import('@/views/dag/LandscapeView.vue'),
        },
        {
          path: 'technical',
          component: () => import('@/views/dag/TechnicalLandscapeView.vue'),
          children: [
            {
              path: 'components',
              name: 'dag-technical-zones',
              component: () =>
                import('@/views/dag/technical/TechnicalComponentsView.vue'),
            },
            {
              path: 'relations',
              name: 'dag-technical-relations',
              component: () =>
                import('@/views/dag/technical/TechnicalRelationsView.vue'),
            },
            {
              path: '',
              redirect: { name: 'dag-technical-zones' },
            },

          ],

        },
        {
          path: 'flows',
          name: 'dag-flows',
          component: () => import('@/views/dag/ApplicationFlowsView.vue'),
        },
        {
          path: 'security',
          name: 'dag-security',
          component: () => import('@/views/dag/SecurityView.vue'),
        },
      ],
    },
  ],
})

export default router
