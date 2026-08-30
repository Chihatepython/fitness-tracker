import { EXERCISE_BODY_PARTS, type ExerciseId, type TrainingSet } from '@/database'

export const FIRST_SET_EXERCISE_IDS = [
  'dumbbellShoulderPress',
  'reversePecDeck',
  'barbellRow',
  'inclineBarbellBenchPress',
] as const satisfies readonly ExerciseId[]

export type FirstSetExerciseId = (typeof FIRST_SET_EXERCISE_IDS)[number]

export interface FirstSetPerformanceRecord {
  date: string
  mainWeightKg: number
  reps: number
  rir: number
  priorSetCount?: number
  isValid: boolean
  invalidReason?: string
}

export interface FirstSetPerformanceAnalysis {
  records: FirstSetPerformanceRecord[]
  validRecords: FirstSetPerformanceRecord[]
  commonPriorSetCount?: number
}

interface CandidateRecord extends Omit<FirstSetPerformanceRecord, 'isValid'> {
  baseInvalidReason?: string
}

const MIN_BODY_PART_SETS_PER_DAY = 5
const MAX_COMPARABLE_RIR = 1
const PRIOR_SET_TOLERANCE = 2

export function isFirstSetExerciseId(exerciseId: string): exerciseId is FirstSetExerciseId {
  return FIRST_SET_EXERCISE_IDS.some((supportedId) => supportedId === exerciseId)
}

function getMainWeight(trainingSets: TrainingSet[]): number {
  const weightCounts = new Map<number, number>()

  for (const trainingSet of trainingSets) {
    weightCounts.set(trainingSet.weightKg, (weightCounts.get(trainingSet.weightKg) ?? 0) + 1)
  }

  return Array.from(weightCounts.entries()).sort(
    ([leftWeight, leftCount], [rightWeight, rightCount]) =>
      rightCount - leftCount || rightWeight - leftWeight,
  )[0]![0]
}

function getCommonPriorSetCount(priorSetCounts: number[]): number | undefined {
  if (!priorSetCounts.length) return undefined

  const sortedCounts = [...priorSetCounts].sort((left, right) => left - right)
  const median = sortedCounts[Math.floor(sortedCounts.length / 2)]!
  let bestCount = sortedCounts[0]!
  let bestScore = -1

  for (const candidateCount of new Set(sortedCounts)) {
    const score = sortedCounts.filter(
      (priorSetCount) => Math.abs(priorSetCount - candidateCount) <= PRIOR_SET_TOLERANCE,
    ).length
    const isCloserToMedian = Math.abs(candidateCount - median) < Math.abs(bestCount - median)

    if (score > bestScore || (score === bestScore && isCloserToMedian)) {
      bestCount = candidateCount
      bestScore = score
    }
  }

  return bestCount
}

export function analyzeFirstSetPerformance(
  trainingSets: TrainingSet[],
  exerciseId: FirstSetExerciseId,
): FirstSetPerformanceAnalysis {
  const targetBodyPart = EXERCISE_BODY_PARTS[exerciseId]
  const setsByDate = new Map<string, TrainingSet[]>()

  for (const trainingSet of trainingSets) {
    const daySets = setsByDate.get(trainingSet.date) ?? []
    daySets.push(trainingSet)
    setsByDate.set(trainingSet.date, daySets)
  }

  const candidates: CandidateRecord[] = []

  for (const [date, daySets] of setsByDate) {
    const exerciseSets = daySets.filter((trainingSet) => trainingSet.exerciseId === exerciseId)

    if (!exerciseSets.length) continue

    const mainWeightKg = getMainWeight(exerciseSets)
    const mainWeightSets = exerciseSets
      .filter((trainingSet) => trainingSet.weightKg === mainWeightKg)
      .sort(
        (left, right) =>
          (left.createdAt ?? Number.POSITIVE_INFINITY) -
          (right.createdAt ?? Number.POSITIVE_INFINITY),
      )
    const firstMainSet = mainWeightSets[0]!
    const bodyPartSetCount = daySets.filter(
      (trainingSet) => EXERCISE_BODY_PARTS[trainingSet.exerciseId] === targetBodyPart,
    ).length
    const hasReliableOrder =
      firstMainSet.createdAt !== undefined &&
      daySets.every((trainingSet) => trainingSet.createdAt !== undefined)
    const priorSetCount = hasReliableOrder
      ? daySets.filter((trainingSet) => trainingSet.createdAt! < firstMainSet.createdAt!).length
      : undefined
    let baseInvalidReason: string | undefined

    if (bodyPartSetCount < MIN_BODY_PART_SETS_PER_DAY) {
      baseInvalidReason = '非正式部位训练日'
    } else if (!hasReliableOrder) {
      baseInvalidReason = '无法确认训练顺序'
    } else if (firstMainSet.rir > MAX_COMPARABLE_RIR) {
      baseInvalidReason = '首组 RIR 不可比'
    }

    candidates.push({
      date,
      mainWeightKg,
      reps: firstMainSet.reps,
      rir: firstMainSet.rir,
      priorSetCount,
      baseInvalidReason,
    })
  }

  const commonPriorSetCount = getCommonPriorSetCount(
    candidates.flatMap((candidate) =>
      candidate.baseInvalidReason === undefined && candidate.priorSetCount !== undefined
        ? [candidate.priorSetCount]
        : [],
    ),
  )

  const records = candidates
    .map<FirstSetPerformanceRecord>((candidate) => {
      let invalidReason = candidate.baseInvalidReason

      if (
        invalidReason === undefined &&
        commonPriorSetCount !== undefined &&
        candidate.priorSetCount !== undefined &&
        Math.abs(candidate.priorSetCount - commonPriorSetCount) > PRIOR_SET_TOLERANCE
      ) {
        invalidReason = '动作顺序差异过大'
      }

      return {
        date: candidate.date,
        mainWeightKg: candidate.mainWeightKg,
        reps: candidate.reps,
        rir: candidate.rir,
        priorSetCount: candidate.priorSetCount,
        isValid: invalidReason === undefined,
        invalidReason,
      }
    })
    .sort((left, right) => left.date.localeCompare(right.date))

  return {
    records,
    validRecords: records.filter((record) => record.isValid),
    commonPriorSetCount,
  }
}
