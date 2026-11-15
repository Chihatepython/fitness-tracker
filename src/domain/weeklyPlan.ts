import type { ExerciseId } from '@/database'
import type { MuscleName } from '@/domain/trainingStats'

export const WEEKLY_PLAN_DRAFT_ID = 'current' as const
export const WEEKLY_PLAN_SCHEMA_VERSION = 2 as const

export interface WeeklyPlanMuscleTarget {
  muscle: MuscleName
  targetSets: number
}

export interface WeeklyPlanExercise {
  exerciseId: ExerciseId
  plannedSets: number
  order: number
}

export interface WeeklyPlanDraft {
  id: typeof WEEKLY_PLAN_DRAFT_ID
  schemaVersion: typeof WEEKLY_PLAN_SCHEMA_VERSION
  startDate: string
  targets: WeeklyPlanMuscleTarget[]
  exercises: WeeklyPlanExercise[]
  createdAt: number
  updatedAt: number
}

export type WeeklyPlanDraftContent = Pick<WeeklyPlanDraft, 'startDate' | 'targets' | 'exercises'>
