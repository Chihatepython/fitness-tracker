import { createRouter, createWebHistory } from 'vue-router'

import ExerciseFirstSetView from '@/views/ExerciseFirstSetView.vue'
import HomeView from '@/views/HomeView.vue'
import TrainingPerformanceView from '@/views/TrainingPerformanceView.vue'
import WeeklyPlanView from '@/views/WeeklyPlanView.vue'
import WeeklyScheduleView from '@/views/WeeklyScheduleView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/performance',
      name: 'training-performance',
      component: TrainingPerformanceView,
    },
    {
      path: '/plan',
      name: 'weekly-plan',
      component: WeeklyPlanView,
    },
    {
      path: '/plan/schedule',
      name: 'weekly-schedule',
      component: WeeklyScheduleView,
    },
    {
      path: '/performance/:exerciseId/first-set',
      name: 'exercise-first-set',
      component: ExerciseFirstSetView,
    },
  ],
})

export default router
