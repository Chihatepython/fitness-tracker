import type { ExerciseId, TrainingSet } from '@/database'
import type { WeeklyPlanDayExercise, WeeklyPlanSchedule } from '@/domain/weeklyPlan'

import { calculateMuscleTrainingFromCounts, MUSCLE_GROUPS } from './trainingStats'

export function getPlannedExercisesForDate(
  schedule: WeeklyPlanSchedule,
  date: string,
): readonly WeeklyPlanDayExercise[] {
  // Compare calendar dates in UTC so DST never shifts a day's slot.
  const days = (Date.parse(date) - Date.parse(schedule.sourceStartDate)) / 86_400_000
  if (!Number.isInteger(days) || days < 0) return []
  const cardId = schedule.weekdayCardIds[days % 7]
  return schedule.cards.find((card) => card.id === cardId)?.exercises ?? []
}

export function buildTodayWorkout(
  trainingSets: readonly TrainingSet[],
  plannedExercises: readonly WeeklyPlanDayExercise[],
) {
  const groups = new Map<
    ExerciseId,
    { exerciseId: ExerciseId; planned: number; trainingSets: TrainingSet[] }
  >()
  for (const { exerciseId, sets } of plannedExercises) {
    groups.set(exerciseId, { exerciseId, planned: sets, trainingSets: [] })
  }
  for (const trainingSet of trainingSets) {
    const exerciseId = trainingSet.exerciseId
    const group = groups.get(exerciseId)
    if (group) group.trainingSets.push(trainingSet)
    else groups.set(exerciseId, { exerciseId, planned: 0, trainingSets: [trainingSet] })
  }

  const hasPlan = plannedExercises.length > 0
  const planned = new Map<ExerciseId, number>()
  const completed = new Map<ExerciseId, number>()
  const extra = new Map<ExerciseId, number>()
  for (const group of groups.values()) {
    const actual = group.trainingSets.length
    if (group.planned) planned.set(group.exerciseId, group.planned)
    completed.set(group.exerciseId, hasPlan ? Math.min(actual, group.planned) : actual)
    if (hasPlan && actual > group.planned) extra.set(group.exerciseId, actual - group.planned)
  }

  const plannedTotals = calculateMuscleTrainingFromCounts(planned).totals
  const completedTotals = calculateMuscleTrainingFromCounts(completed).totals
  const extraTotals = calculateMuscleTrainingFromCounts(extra).totals
  const muscleRows = MUSCLE_GROUPS.flatMap(({ region, muscles }) =>
    muscles
      .map((muscle) => ({
        region,
        muscle,
        planned: plannedTotals[muscle],
        completed: completedTotals[muscle],
        extra: extraTotals[muscle],
      }))
      .filter((row) => row.planned || row.completed || row.extra),
  )

  return {
    groups: [...groups.values()],
    muscleRows,
    hasPlan,
    plannedCount: [...planned.values()].reduce((sum, count) => sum + count, 0),
    completedCount: [...completed.values()].reduce((sum, count) => sum + count, 0),
  }
}

export type TodayWorkout = ReturnType<typeof buildTodayWorkout>
