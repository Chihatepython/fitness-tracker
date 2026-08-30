import { createRouter, createWebHistory } from 'vue-router'

import ExerciseFirstSetView from '@/views/ExerciseFirstSetView.vue'
import HomeView from '@/views/HomeView.vue'
import TrainingPerformanceView from '@/views/TrainingPerformanceView.vue'

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
      path: '/performance/:exerciseId/first-set',
      name: 'exercise-first-set',
      component: ExerciseFirstSetView,
    },
  ],
})

export default router
