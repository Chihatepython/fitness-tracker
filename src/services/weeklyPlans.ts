import { isExerciseId } from '@/database'
import { MUSCLE_GROUPS, type MuscleName } from '@/domain/trainingStats'
import {
  WEEKLY_PLAN_SCHEMA_VERSION,
  type WeeklyPlanDraftContent,
  type WeeklyPlanExercise,
  type WeeklyPlanMuscleTarget,
  type WeeklyPlanSchedule,
} from '@/domain/weeklyPlan'
import { supabase } from '@/lib/supabase'
import { normalizeWeeklyPlanSchedule } from '@/services/weeklyPlanSchedule'

interface WeeklyPlanRow {
  id: string
  start_date: string
  schema_version: number
  targets: unknown
  exercises: unknown
  schedule: unknown
  created_at: string
  updated_at: string
}

export interface CloudWeeklyPlan extends WeeklyPlanDraftContent {
  id: string
  name: string
  schemaVersion: number
  createdAt: string
  updatedAt: string
  schedule: WeeklyPlanSchedule
}

const TRACKED_MUSCLES = new Set<MuscleName>(MUSCLE_GROUPS.flatMap((group) => [...group.muscles]))

function normalizeTargets(value: unknown): WeeklyPlanMuscleTarget[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<MuscleName>()

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []

    const muscle = 'muscle' in entry ? entry.muscle : undefined
    const targetSets = 'targetSets' in entry ? entry.targetSets : undefined

    if (
      typeof muscle !== 'string' ||
      !TRACKED_MUSCLES.has(muscle as MuscleName) ||
      seen.has(muscle as MuscleName) ||
      typeof targetSets !== 'number' ||
      !Number.isInteger(targetSets) ||
      targetSets < 1
    ) {
      return []
    }

    seen.add(muscle as MuscleName)
    return [{ muscle: muscle as MuscleName, targetSets }]
  })
}

function normalizeExercises(value: unknown): WeeklyPlanExercise[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()

  return value
    .flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return []

      const exerciseId = 'exerciseId' in entry ? entry.exerciseId : undefined
      const plannedSets = 'plannedSets' in entry ? entry.plannedSets : undefined
      const order = 'order' in entry ? entry.order : undefined

      if (
        typeof exerciseId !== 'string' ||
        !isExerciseId(exerciseId) ||
        seen.has(exerciseId) ||
        typeof plannedSets !== 'number' ||
        !Number.isInteger(plannedSets) ||
        plannedSets < 1 ||
        typeof order !== 'number' ||
        !Number.isInteger(order) ||
        order < 0
      ) {
        return []
      }

      seen.add(exerciseId)
      return [
        {
          exerciseId,
          plannedSets,
          order,
        },
      ]
    })
    .sort((left, right) => left.order - right.order)
}

function mapRows(rows: WeeklyPlanRow[]): CloudWeeklyPlan[] {
  return rows.map((row, index) => ({
    id: row.id,
    name: `训练计划${index + 1}`,
    schemaVersion: row.schema_version,
    startDate: row.start_date,
    targets: normalizeTargets(row.targets),
    exercises: normalizeExercises(row.exercises),
    schedule: normalizeWeeklyPlanSchedule(row.schedule, row.start_date),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

export async function listWeeklyPlans(userId: string): Promise<CloudWeeklyPlan[]> {
  if (!supabase) throw new Error('尚未配置 Supabase')

  const { data, error } = await supabase
    .from('weekly_plans')
    .select('id,start_date,schema_version,targets,exercises,schedule,created_at,updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) throw error

  return mapRows((data ?? []) as WeeklyPlanRow[])
}

export async function createWeeklyPlan(
  userId: string,
  content: WeeklyPlanDraftContent,
  schedule: WeeklyPlanSchedule,
): Promise<string> {
  if (!supabase) throw new Error('尚未配置 Supabase')

  const { data, error } = await supabase
    .from('weekly_plans')
    .insert({
      user_id: userId,
      start_date: content.startDate,
      schema_version: WEEKLY_PLAN_SCHEMA_VERSION,
      targets: content.targets,
      exercises: content.exercises,
      schedule,
    })
    .select('id')
    .single()

  if (error) throw error

  return (data as { id: string }).id
}

export async function updateWeeklyPlan(
  userId: string,
  planId: string,
  content: WeeklyPlanDraftContent,
  schedule: WeeklyPlanSchedule,
): Promise<void> {
  if (!supabase) throw new Error('尚未配置 Supabase')

  const { error } = await supabase
    .from('weekly_plans')
    .update({
      start_date: content.startDate,
      schema_version: WEEKLY_PLAN_SCHEMA_VERSION,
      targets: content.targets,
      exercises: content.exercises,
      schedule,
    })
    .eq('user_id', userId)
    .eq('id', planId)

  if (error) throw error
}

export async function updateWeeklyPlanSchedule(
  userId: string,
  planId: string,
  schedule: WeeklyPlanSchedule,
): Promise<void> {
  if (!supabase) throw new Error('尚未配置 Supabase')

  const { error } = await supabase
    .from('weekly_plans')
    .update({ schedule })
    .eq('user_id', userId)
    .eq('id', planId)

  if (error) throw error
}
