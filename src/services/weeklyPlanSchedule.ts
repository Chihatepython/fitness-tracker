import { isExerciseId, type ExerciseId } from '@/database'
import {
  WEEKLY_PLAN_SCHEDULE_SCHEMA_VERSION,
  type WeeklyPlanDayCard,
  type WeeklyPlanDayExercise,
  type WeeklyPlanSchedule,
} from '@/domain/weeklyPlan'

const STORAGE_KEY = 'fitness-tracker:weekly-plan-schedule:v1'
const WEEKDAY_COUNT = 7

function createCardId(): string {
  return crypto.randomUUID()
}

function normalizeExercise(value: unknown): WeeklyPlanDayExercise | undefined {
  if (!value || typeof value !== 'object') return undefined

  const exerciseId = 'exerciseId' in value ? value.exerciseId : undefined
  const sets = 'sets' in value ? value.sets : undefined

  if (
    typeof exerciseId !== 'string' ||
    !isExerciseId(exerciseId) ||
    typeof sets !== 'number' ||
    !Number.isInteger(sets) ||
    sets < 1
  ) {
    return undefined
  }

  return { exerciseId, sets }
}

function normalizeCard(value: unknown, index: number): WeeklyPlanDayCard | undefined {
  if (!value || typeof value !== 'object') return undefined

  const id = 'id' in value ? value.id : undefined
  const name = 'name' in value ? value.name : undefined
  const rawExercises = 'exercises' in value ? value.exercises : undefined

  if (typeof id !== 'string' || !id || !Array.isArray(rawExercises)) return undefined

  const exerciseIds = new Set<string>()
  const exercises = rawExercises.flatMap((exercise) => {
    const normalized = normalizeExercise(exercise)
    if (!normalized || exerciseIds.has(normalized.exerciseId)) return []

    exerciseIds.add(normalized.exerciseId)
    return [normalized]
  })

  return {
    id,
    name: typeof name === 'string' && name.trim() ? name.trim() : `训练日${index + 1}`,
    exercises,
  }
}

export function createEmptyWeeklyPlanSchedule(sourceStartDate: string): WeeklyPlanSchedule {
  return {
    schemaVersion: WEEKLY_PLAN_SCHEDULE_SCHEMA_VERSION,
    sourceStartDate,
    cards: [],
    weekdayCardIds: Array.from({ length: WEEKDAY_COUNT }, () => null),
    updatedAt: Date.now(),
  }
}

export function createWeeklyPlanDayCard(sequence: number): WeeklyPlanDayCard {
  return {
    id: createCardId(),
    name: `训练日${sequence}`,
    exercises: [],
  }
}

export function loadWeeklyPlanSchedule(sourceStartDate: string): WeeklyPlanSchedule {
  const rawValue = localStorage.getItem(STORAGE_KEY)
  if (!rawValue) return createEmptyWeeklyPlanSchedule(sourceStartDate)

  try {
    const value = JSON.parse(rawValue) as unknown
    if (!value || typeof value !== 'object') return createEmptyWeeklyPlanSchedule(sourceStartDate)

    const storedStartDate = 'sourceStartDate' in value ? value.sourceStartDate : undefined
    if (storedStartDate !== sourceStartDate) return createEmptyWeeklyPlanSchedule(sourceStartDate)

    const rawCards = 'cards' in value ? value.cards : undefined
    const rawAssignments = 'weekdayCardIds' in value ? value.weekdayCardIds : undefined
    const cards = Array.isArray(rawCards)
      ? rawCards.flatMap((card, index) => {
          const normalized = normalizeCard(card, index)
          return normalized ? [normalized] : []
        })
      : []
    const cardIds = new Set(cards.map((card) => card.id))
    const weekdayCardIds = Array.from({ length: WEEKDAY_COUNT }, (_, index) => {
      const cardId = Array.isArray(rawAssignments) ? rawAssignments[index] : null
      return typeof cardId === 'string' && cardIds.has(cardId) ? cardId : null
    })

    return {
      schemaVersion: WEEKLY_PLAN_SCHEDULE_SCHEMA_VERSION,
      sourceStartDate,
      cards,
      weekdayCardIds,
      updatedAt:
        'updatedAt' in value && typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
    }
  } catch {
    return createEmptyWeeklyPlanSchedule(sourceStartDate)
  }
}

export function reconcileWeeklyPlanSchedule(
  schedule: WeeklyPlanSchedule,
  plannedSets: Readonly<Partial<Record<ExerciseId, number>>>,
): WeeklyPlanSchedule {
  const allocatedSets: Partial<Record<ExerciseId, number>> = {}
  const cards = schedule.cards.map((card) => ({
    ...card,
    exercises: card.exercises.flatMap((exercise) => {
      const planned = plannedSets[exercise.exerciseId] ?? 0
      const allocated = allocatedSets[exercise.exerciseId] ?? 0
      const allowedSets = Math.min(exercise.sets, Math.max(0, planned - allocated))

      if (!allowedSets) return []

      allocatedSets[exercise.exerciseId] = allocated + allowedSets
      return [{ ...exercise, sets: allowedSets }]
    }),
  }))

  return {
    ...schedule,
    cards,
    weekdayCardIds: schedule.weekdayCardIds.map((cardId) =>
      cardId && cards.some((card) => card.id === cardId) ? cardId : null,
    ),
  }
}

export function saveWeeklyPlanSchedule(schedule: WeeklyPlanSchedule): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...schedule,
      schemaVersion: WEEKLY_PLAN_SCHEDULE_SCHEMA_VERSION,
      updatedAt: Date.now(),
    }),
  )
}
