import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

import { useSupabaseAuth } from '@/composables/useSupabaseAuth'
import { getPlannedExercisesForDate } from '@/domain/todayWorkout'
import { reconcileWeeklyPlanSchedule } from '@/services/weeklyPlanSchedule'
import { listWeeklyPlans, type CloudWeeklyPlan } from '@/services/weeklyPlans'

export function useTodayPlan(enabled: Readonly<Ref<boolean>>, date: Readonly<Ref<string>>) {
  const { session } = useSupabaseAuth()
  const accountId = computed(() => session.value?.user.id)
  const loadedPlans = ref<{ accountId: string; plans: CloudWeeklyPlan[] }>()
  const warning = ref('')
  let requestId = 0

  async function refresh(): Promise<void> {
    const version = ++requestId
    const userId = accountId.value
    if (loadedPlans.value?.accountId !== userId) loadedPlans.value = undefined
    warning.value = ''
    if (!enabled.value || !userId) return

    try {
      const plans = await listWeeklyPlans(userId)
      if (version !== requestId) return
      loadedPlans.value = { accountId: userId, plans }
    } catch {
      if (version !== requestId) return
      warning.value = loadedPlans.value?.plans.length
        ? '暂时无法刷新云端计划，显示上次读取的安排。'
        : '暂时无法读取云端计划，仍可正常记录训练。'
    }
  }

  function refreshOnVisible(): void {
    if (document.visibilityState === 'visible' && enabled.value) void refresh()
  }

  watch([enabled, accountId], refresh, { immediate: true })
  onMounted(() => {
    window.addEventListener('online', refreshOnVisible)
    document.addEventListener('visibilitychange', refreshOnVisible)
  })
  onBeforeUnmount(() => {
    requestId++
    window.removeEventListener('online', refreshOnVisible)
    document.removeEventListener('visibilitychange', refreshOnVisible)
  })

  const plannedExercises = computed(() => {
    const result = loadedPlans.value
    if (!result || result.accountId !== accountId.value) return []
    const latestStarted = result.plans.filter((plan) => plan.startDate <= date.value).at(-1)
    if (!latestStarted) return []

    const schedule = reconcileWeeklyPlanSchedule(
      latestStarted.schedule,
      Object.fromEntries(latestStarted.exercises.map((item) => [item.exerciseId, item.plannedSets])),
    )
    return getPlannedExercisesForDate(schedule, date.value)
  })

  return { plannedExercises, warning }
}
