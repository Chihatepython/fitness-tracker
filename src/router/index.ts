import { createRouter, createWebHistory } from 'vue-router'

import ExerciseFirstSetView from '@/views/ExerciseFirstSetView.vue'
import HomeView from '@/views/HomeView.vue'
import TrainingPerformanceView from '@/views/TrainingPerformanceView.vue'
import WeeklyPlanView from '@/views/WeeklyPlanView.vue'
import WeeklyScheduleView from '@/views/WeeklyScheduleView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.name !== from.name) return { top: 0 }
  },
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { tab: 'today' },
    },
    {
      path: '/data',
      name: 'training-data',
      component: HomeView,
      meta: { tab: 'data' },
    },
    {
      path: '/me',
      name: 'profile',
      component: HomeView,
      meta: { tab: 'me' },
    },
    {
      path: '/performance',
      name: 'training-performance',
      component: TrainingPerformanceView,
      meta: { tab: 'me' },
    },
    {
      path: '/plan',
      name: 'weekly-plan',
      component: WeeklyPlanView,
      meta: { tab: 'plan' },
    },
    {
      path: '/plan/schedule',
      name: 'weekly-schedule',
      component: WeeklyScheduleView,
      meta: { tab: 'plan' },
    },
    {
      path: '/performance/:exerciseId/first-set',
      name: 'exercise-first-set',
      component: ExerciseFirstSetView,
      meta: { tab: 'me' },
    },
  ],
})

export default router
