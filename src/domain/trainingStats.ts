import {
  EXERCISES,
  EXERCISE_BODY_PARTS,
  EXERCISE_NAMES,
  type BodyPart,
  type TrainingSet,
} from '@/database'

export const CALENDAR_WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const
export const TRAINING_PERIODS = [
  { id: 'rolling7', label: '最近 7 天', dayCount: 7, mode: 'rolling', canNavigateWeeks: true },
  {
    id: 'calendarWeek',
    label: '自然周',
    dayCount: 7,
    mode: 'calendarWeek',
    canNavigateWeeks: true,
  },
  { id: 'rolling14', label: '最近 2 周', dayCount: 14, mode: 'rolling', canNavigateWeeks: false },
  { id: 'rolling28', label: '最近 4 周', dayCount: 28, mode: 'rolling', canNavigateWeeks: false },
] as const

export type TrainingPeriod = (typeof TRAINING_PERIODS)[number]

export interface TrainingPeriodDateRange {
  startDate: string
  endDate: string
}

const BODY_PART_PRIORITY: readonly BodyPart[] = ['腿', '背', '胸', '肩', '手臂']
export type MuscleRegion = '肩' | '屈肘' | '伸肘' | '前臂' | '背' | '胸' | '腿'

export const MUSCLE_GROUPS = [
  { region: '肩', muscles: ['三角肌前束', '三角肌中束', '三角肌后束'] },
  { region: '屈肘', muscles: ['肱二头肌长头', '肱二头肌短头', '肱肌'] },
  { region: '伸肘', muscles: ['肱三头肌长头', '肱三头肌外侧头', '肱三头肌内侧头'] },
  { region: '前臂', muscles: ['肱桡肌', '前臂伸肌群'] },
  { region: '背', muscles: ['背阔肌', '中背', '斜方肌上束', '外旋肌', '竖脊肌'] },
  { region: '胸', muscles: ['上胸', '中胸', '下胸'] },
  {
    region: '腿',
    muscles: [
      '股四头肌',
      '腘绳肌',
      '臀大肌',
      '臀中肌',
      '内收肌群',
      '腓肠肌',
      '比目鱼肌',
      '胫骨前肌',
    ],
  },
] as const satisfies ReadonlyArray<{ region: MuscleRegion; muscles: readonly string[] }>

export type MuscleName = (typeof MUSCLE_GROUPS)[number]['muscles'][number]

export interface TrainingCalendarDay {
  date: string
  dayOfMonth: number
  bodyPart?: BodyPart
  isToday: boolean
  isFuture: boolean
}

export interface TrainingCalendarRange {
  startDate: string
  endDate: string
  firstDayOffset: number
  dayCount: number
}

export interface MuscleSourceContribution {
  exerciseId: TrainingSet['exerciseId']
  setCount: number
  weightPerSet: number
  weightedSetCount: number
}

export type MuscleTrainingSources = Record<MuscleName, MuscleSourceContribution[]>

export interface MuscleTrainingResult {
  totals: Record<MuscleName, number>
  sources: MuscleTrainingSources
}

export interface MuscleTrainingSnapshot extends MuscleTrainingResult {
  periodIndex: number
  weekOffset: number
  dateRange: string
  trainingSetCount: number
}

const TRACKED_MUSCLE_NAMES = new Set<string>(
  MUSCLE_GROUPS.flatMap((group) => [...group.muscles]),
)

export function getLocalDate(dayOffset = 0): string {
  const currentDate = new Date()
  currentDate.setHours(12, 0, 0, 0)
  currentDate.setDate(currentDate.getDate() + dayOffset)

  const year = currentDate.getFullYear()
  const month = String(currentDate.getMonth() + 1).padStart(2, '0')
  const day = String(currentDate.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function getCurrentWeekMondayOffset(): number {
  const dayOfWeek = new Date().getDay()

  return dayOfWeek === 0 ? -6 : 1 - dayOfWeek
}

export function getTrainingCalendarRange(): TrainingCalendarRange {
  const today = new Date()
  today.setHours(12, 0, 0, 0)

  const historyBoundary = new Date(today)
  const currentDayOfMonth = historyBoundary.getDate()

  historyBoundary.setDate(1)
  historyBoundary.setMonth(historyBoundary.getMonth() - 2)

  const lastDayOfHistoryMonth = new Date(
    historyBoundary.getFullYear(),
    historyBoundary.getMonth() + 1,
    0,
  ).getDate()

  historyBoundary.setDate(Math.min(currentDayOfMonth, lastDayOfHistoryMonth))

  const boundaryDayOfWeek = historyBoundary.getDay()
  const boundaryMondayOffset = boundaryDayOfWeek === 0 ? -6 : 1 - boundaryDayOfWeek

  historyBoundary.setDate(historyBoundary.getDate() + boundaryMondayOffset)

  const firstDayOffset = Math.round(
    (historyBoundary.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  )
  const lastDayOffset = getCurrentWeekMondayOffset() + 6

  return {
    startDate: getLocalDate(firstDayOffset),
    endDate: getLocalDate(lastDayOffset),
    firstDayOffset,
    dayCount: lastDayOffset - firstDayOffset + 1,
  }
}

export function getTrainingPeriodDateRange(
  period: TrainingPeriod,
  weekOffset = 0,
): TrainingPeriodDateRange {
  const safeWeekOffset = period.canNavigateWeeks ? Math.max(0, weekOffset) : 0
  const weekDayOffset = safeWeekOffset * 7

  if (period.mode === 'calendarWeek') {
    const mondayOffset = getCurrentWeekMondayOffset() - weekDayOffset

    return {
      startDate: getLocalDate(mondayOffset),
      endDate: getLocalDate(mondayOffset + 6),
    }
  }

  const endDayOffset = -weekDayOffset

  return {
    startDate: getLocalDate(endDayOffset - (period.dayCount - 1)),
    endDate: getLocalDate(endDayOffset),
  }
}

export function formatDisplayDate(date: string): string {
  const [, month, day] = date.split('-')

  return `${Number(month)}月${Number(day)}日`
}

export function formatWeight(weightKg: number): string {
  return Number.isInteger(weightKg) ? String(weightKg) : String(Number(weightKg.toFixed(2)))
}

export function formatWeightedSetCount(setCount: number): string {
  return Number.isInteger(setCount) ? String(setCount) : String(Number(setCount.toFixed(2)))
}

export function createEmptyBodyPartCounts(): Record<BodyPart, number> {
  return {
    手臂: 0,
    肩: 0,
    背: 0,
    胸: 0,
    腿: 0,
  }
}

export function createEmptyMuscleTrainingTotals(): Record<MuscleName, number> {
  return Object.fromEntries(
    MUSCLE_GROUPS.flatMap((group) => group.muscles.map((muscle) => [muscle, 0])),
  ) as Record<MuscleName, number>
}

export function createEmptyMuscleTrainingSources(): MuscleTrainingSources {
  return Object.fromEntries(
    MUSCLE_GROUPS.flatMap((group) => group.muscles.map((muscle) => [muscle, []])),
  ) as unknown as MuscleTrainingSources
}

function getBodyPartCountsByDate(
  trainingSets: TrainingSet[],
): Map<string, Record<BodyPart, number>> {
  const countsByDate = new Map<string, Record<BodyPart, number>>()

  for (const trainingSet of trainingSets) {
    const dateCounts = countsByDate.get(trainingSet.date) ?? createEmptyBodyPartCounts()
    const bodyPart = EXERCISE_BODY_PARTS[trainingSet.exerciseId]

    dateCounts[bodyPart] += 1
    countsByDate.set(trainingSet.date, dateCounts)
  }

  return countsByDate
}

function getDominantBodyPart(
  dateCounts?: Record<BodyPart, number>,
): BodyPart | undefined {
  if (!dateCounts) return undefined

  let dominantBodyPart: BodyPart | undefined
  let highestSetCount = 0

  for (const bodyPart of BODY_PART_PRIORITY) {
    if (dateCounts[bodyPart] > highestSetCount) {
      dominantBodyPart = bodyPart
      highestSetCount = dateCounts[bodyPart]
    }
  }

  return dominantBodyPart
}

export function buildTrainingCalendarDays(
  trainingSets: TrainingSet[],
  range = getTrainingCalendarRange(),
): TrainingCalendarDay[] {
  const countsByDate = getBodyPartCountsByDate(trainingSets)
  const today = getLocalDate()

  return Array.from({ length: range.dayCount }, (_, index) => {
    const date = getLocalDate(range.firstDayOffset + index)
    const dayOfMonth = Number(date.slice(8, 10))
    const isFuture = date > today

    return {
      date,
      dayOfMonth,
      bodyPart: isFuture ? undefined : getDominantBodyPart(countsByDate.get(date)),
      isToday: date === today,
      isFuture,
    }
  })
}

export function getCalendarDayAriaLabel(calendarDay: TrainingCalendarDay): string {
  if (calendarDay.isFuture) return `${calendarDay.date}，未来日期`

  const trainingLabel = calendarDay.bodyPart ? `训练${calendarDay.bodyPart}` : '休息'

  return `${calendarDay.date}，${trainingLabel}`
}

export function calculateMuscleTraining(trainingSets: TrainingSet[]): MuscleTrainingResult {
  const totals = createEmptyMuscleTrainingTotals()
  const sources = createEmptyMuscleTrainingSources()

  for (const trainingSet of trainingSets) {
    const exercise = EXERCISES.find((item) => item.id === trainingSet.exerciseId)

    if (!exercise) continue

    for (const [muscleName, weight] of Object.entries(exercise.muscleWeights)) {
      if (!TRACKED_MUSCLE_NAMES.has(muscleName)) continue

      const trackedMuscleName = muscleName as MuscleName
      const existingSource = sources[trackedMuscleName].find(
        (source) => source.exerciseId === exercise.id,
      )

      totals[trackedMuscleName] += weight

      if (existingSource) {
        existingSource.setCount += 1
        existingSource.weightedSetCount += weight
      } else {
        sources[trackedMuscleName].push({
          exerciseId: exercise.id,
          setCount: 1,
          weightPerSet: weight,
          weightedSetCount: weight,
        })
      }
    }
  }

  for (const muscleSources of Object.values(sources)) {
    muscleSources.sort(
      (left, right) =>
        right.weightedSetCount - left.weightedSetCount ||
        EXERCISE_NAMES[left.exerciseId].localeCompare(EXERCISE_NAMES[right.exerciseId], 'zh-CN'),
    )
  }

  return { totals, sources }
}
