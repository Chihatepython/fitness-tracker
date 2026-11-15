import { WEEKLY_PLAN_DRAFT_STORE_NAME, isExerciseId, openFitnessDatabase } from '@/database'
import { MUSCLE_GROUPS, type MuscleName } from '@/domain/trainingStats'
import {
  WEEKLY_PLAN_DRAFT_ID,
  WEEKLY_PLAN_SCHEMA_VERSION,
  type WeeklyPlanDraft,
  type WeeklyPlanDraftContent,
} from '@/domain/weeklyPlan'

export const WEEKLY_PLAN_DRAFT_CHANGED_EVENT = 'fitness-weekly-plan-draft-changed'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TRACKED_MUSCLES = new Set<MuscleName>(MUSCLE_GROUPS.flatMap((group) => [...group.muscles]))

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year!, month! - 1, day)

  return date.getFullYear() === year && date.getMonth() === month! - 1 && date.getDate() === day
}

function validateContent(content: WeeklyPlanDraftContent): void {
  if (!isValidDate(content.startDate)) throw new Error('计划开始日期无效')

  const targetMuscles = new Set<MuscleName>()

  for (const target of content.targets) {
    if (!TRACKED_MUSCLES.has(target.muscle)) throw new Error(`未知肌束：${target.muscle}`)
    if (targetMuscles.has(target.muscle)) throw new Error(`肌束目标重复：${target.muscle}`)
    if (!Number.isInteger(target.targetSets) || target.targetSets < 1) {
      throw new Error(`${target.muscle}的目标组数必须是正整数`)
    }

    targetMuscles.add(target.muscle)
  }

  const exerciseIds = new Set<string>()
  const exerciseOrders = new Set<number>()

  for (const exercise of content.exercises) {
    if (!isExerciseId(exercise.exerciseId)) throw new Error('计划中包含未知动作')
    if (exerciseIds.has(exercise.exerciseId)) throw new Error('同一个动作不能重复加入计划')
    if (!Number.isInteger(exercise.plannedSets) || exercise.plannedSets < 1) {
      throw new Error('动作计划组数必须是正整数')
    }
    if (!Number.isInteger(exercise.order) || exercise.order < 0) {
      throw new Error('动作排序无效')
    }
    if (exerciseOrders.has(exercise.order)) throw new Error('动作排序不能重复')

    exerciseIds.add(exercise.exerciseId)
    exerciseOrders.add(exercise.order)
  }
}

function dispatchDraftChanged(): void {
  window.dispatchEvent(new Event(WEEKLY_PLAN_DRAFT_CHANGED_EVENT))
}

export async function getWeeklyPlanDraft(): Promise<WeeklyPlanDraft | undefined> {
  const database = await openFitnessDatabase()

  return new Promise<WeeklyPlanDraft | undefined>((resolve, reject) => {
    const transaction = database.transaction(WEEKLY_PLAN_DRAFT_STORE_NAME, 'readonly')
    const request = transaction.objectStore(WEEKLY_PLAN_DRAFT_STORE_NAME).get(WEEKLY_PLAN_DRAFT_ID)

    request.onsuccess = () => {
      const storedDraft = request.result as
        | (Omit<WeeklyPlanDraft, 'schemaVersion'> & { schemaVersion?: number })
        | undefined

      if (!storedDraft) {
        resolve(undefined)
        return
      }

      resolve({
        ...storedDraft,
        schemaVersion: WEEKLY_PLAN_SCHEMA_VERSION,
        targets:
          storedDraft.schemaVersion === WEEKLY_PLAN_SCHEMA_VERSION ? storedDraft.targets : [],
      })
    }
    request.onerror = () => reject(request.error)
  })
}

export async function saveWeeklyPlanDraftLocally(
  content: WeeklyPlanDraftContent,
): Promise<WeeklyPlanDraft> {
  validateContent(content)

  const database = await openFitnessDatabase()
  const existingDraft = await getWeeklyPlanDraft()
  const now = Date.now()
  const draft: WeeklyPlanDraft = {
    id: WEEKLY_PLAN_DRAFT_ID,
    schemaVersion: WEEKLY_PLAN_SCHEMA_VERSION,
    startDate: content.startDate,
    targets: content.targets.map((target) => ({ ...target })),
    exercises: content.exercises
      .map((exercise) => ({ ...exercise }))
      .sort((left, right) => left.order - right.order),
    createdAt: existingDraft?.createdAt ?? now,
    updatedAt: now,
  }

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(WEEKLY_PLAN_DRAFT_STORE_NAME, 'readwrite')

    transaction.objectStore(WEEKLY_PLAN_DRAFT_STORE_NAME).put(draft)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })

  dispatchDraftChanged()
  return draft
}

export async function clearWeeklyPlanDraft(): Promise<void> {
  const database = await openFitnessDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(WEEKLY_PLAN_DRAFT_STORE_NAME, 'readwrite')

    transaction.objectStore(WEEKLY_PLAN_DRAFT_STORE_NAME).delete(WEEKLY_PLAN_DRAFT_ID)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })

  dispatchDraftChanged()
}
