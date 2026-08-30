<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  EXERCISES,
  EXERCISE_BODY_PARTS,
  getAllTrainingSets,
  type BodyPart,
  type ExerciseId,
  type TrainingSet,
} from '@/database'
import { isFirstSetExerciseId } from '@/domain/firstSetPerformance'
import { formatWeight } from '@/domain/trainingStats'

const MIN_BODY_PART_SETS_PER_DAY = 5
const TRAINING_DAY_COUNT_OPTIONS = [10, 20, 30] as const
const DISPLAY_BODY_PARTS = ['肩', '手臂', '背', '胸', '腿'] as const satisfies readonly BodyPart[]
const BODY_PART_TITLES: Record<BodyPart, string> = {
  肩: '肩部',
  手臂: '手臂',
  背: '背部',
  胸: '胸部',
  腿: '腿部',
}
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const
const ALL_MUSCLES = '全部'
const ARM_MUSCLE_OPTIONS = [
  {
    label: '肱二头肌',
    muscles: ['肱二头肌长头', '肱二头肌短头', '肱肌'],
  },
  {
    label: '肱三头肌',
    muscles: ['肱三头肌长头', '肱三头肌外侧头', '肱三头肌内侧头'],
  },
  {
    label: '小臂',
    muscles: ['肱桡肌', '前臂伸肌群'],
  },
] as const

interface ComparisonRow {
  date: string
  weekday: string
  firstRecordedHour?: number
  cells: Array<{
    exerciseId: ExerciseId
    trainingSets: TrainingSet[]
  }>
}

const selectedBodyPart = ref<BodyPart>('肩')
const selectedMuscle = ref(ALL_MUSCLES)
const selectedTrainingDayCount = ref<number>(TRAINING_DAY_COUNT_OPTIONS[0])
const trainingSets = ref<TrainingSet[]>([])
const isLoading = ref(true)
const loadError = ref('')

const selectedBodyPartTitle = computed(() => BODY_PART_TITLES[selectedBodyPart.value])

const muscleOptions = computed(() => {
  if (selectedBodyPart.value === '手臂') return ARM_MUSCLE_OPTIONS

  const muscleNames: string[] = []

  for (const exercise of EXERCISES) {
    if (exercise.bodyPart !== selectedBodyPart.value) continue

    for (const [muscleName, weight] of Object.entries(exercise.muscleWeights ?? {})) {
      if (weight === 1 && !muscleNames.includes(muscleName)) muscleNames.push(muscleName)
    }
  }

  return muscleNames.map((muscleName) => ({
    label: muscleName,
    muscles: [muscleName],
  }))
})

const selectedMuscleNames = computed<ReadonlySet<string>>(() => {
  const selectedOption = muscleOptions.value.find((option) => option.label === selectedMuscle.value)

  return new Set<string>(selectedOption?.muscles ?? [])
})

const selectedBodyPartSets = computed(() =>
  trainingSets.value.filter(
    (trainingSet) => EXERCISE_BODY_PARTS[trainingSet.exerciseId] === selectedBodyPart.value,
  ),
)

const displayedDates = computed(() => {
  const setCountByDate = new Map<string, number>()

  for (const trainingSet of selectedBodyPartSets.value) {
    setCountByDate.set(trainingSet.date, (setCountByDate.get(trainingSet.date) ?? 0) + 1)
  }

  return Array.from(setCountByDate.entries())
    .filter(([, setCount]) => setCount >= MIN_BODY_PART_SETS_PER_DAY)
    .map(([date]) => date)
    .sort((left, right) => right.localeCompare(left))
    .slice(0, selectedTrainingDayCount.value)
})

const displayedExercises = computed(() => {
  const displayedDateSet = new Set(displayedDates.value)
  const usedExerciseIds = new Set(
    selectedBodyPartSets.value
      .filter((trainingSet) => displayedDateSet.has(trainingSet.date))
      .map((trainingSet) => trainingSet.exerciseId),
  )

  return EXERCISES.filter(
    (exercise) =>
      exercise.bodyPart === selectedBodyPart.value &&
      usedExerciseIds.has(exercise.id) &&
      (selectedMuscle.value === ALL_MUSCLES ||
        Object.entries(exercise.muscleWeights ?? {}).some(
          ([muscleName, weight]) => selectedMuscleNames.value.has(muscleName) && weight === 1,
        )),
  )
})

const comparisonRows = computed<ComparisonRow[]>(() => {
  const displayedDateSet = new Set(displayedDates.value)
  const rowsByDate = new Map<string, Map<ExerciseId, TrainingSet[]>>()

  for (const trainingSet of selectedBodyPartSets.value) {
    if (!displayedDateSet.has(trainingSet.date)) continue

    let setsByExercise = rowsByDate.get(trainingSet.date)

    if (!setsByExercise) {
      setsByExercise = new Map<ExerciseId, TrainingSet[]>()
      rowsByDate.set(trainingSet.date, setsByExercise)
    }

    const exerciseSets = setsByExercise.get(trainingSet.exerciseId) ?? []
    exerciseSets.push(trainingSet)
    setsByExercise.set(trainingSet.exerciseId, exerciseSets)
  }

  return displayedDates.value.map((date) => {
    const setsByExercise = rowsByDate.get(date) ?? new Map<ExerciseId, TrainingSet[]>()
    const createdAtValues = Array.from(setsByExercise.values())
      .flat()
      .flatMap((trainingSet) =>
        trainingSet.createdAt === undefined ? [] : [trainingSet.createdAt],
      )
    const firstCreatedAt = createdAtValues.length ? Math.min(...createdAtValues) : undefined

    return {
      date,
      weekday: getWeekday(date),
      firstRecordedHour:
        firstCreatedAt === undefined ? undefined : new Date(firstCreatedAt).getHours(),
      cells: displayedExercises.value.map((exercise) => ({
        exerciseId: exercise.id,
        trainingSets: setsByExercise.get(exercise.id) ?? [],
      })),
    }
  })
})

const hasComparisonData = computed(
  () => comparisonRows.value.length > 0 && displayedExercises.value.length > 0,
)

const emptyStateText = computed(() =>
  selectedMuscle.value === ALL_MUSCLES
    ? '这个部位还没有训练记录'
    : `还没有以${selectedMuscle.value}为主要目标的训练记录`,
)

function getWeekday(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const weekdayIndex = new Date(year!, month! - 1, day).getDay()

  return WEEKDAYS[weekdayIndex]!
}

function getDisplayMonth(date: string): string {
  const [, month] = date.split('-')

  return `${Number(month)}月`
}

function getDisplayDay(date: string): string {
  const [, , day] = date.split('-')

  return `${Number(day)}日`
}

function selectBodyPart(bodyPart: BodyPart): void {
  selectedBodyPart.value = bodyPart
  selectedMuscle.value = ALL_MUSCLES
}

function cycleTrainingDayCount(): void {
  const currentIndex = TRAINING_DAY_COUNT_OPTIONS.findIndex(
    (count) => count === selectedTrainingDayCount.value,
  )
  const nextIndex = (currentIndex + 1) % TRAINING_DAY_COUNT_OPTIONS.length

  selectedTrainingDayCount.value = TRAINING_DAY_COUNT_OPTIONS[nextIndex]!
}

async function loadTrainingSets(): Promise<void> {
  isLoading.value = true
  loadError.value = ''

  try {
    trainingSets.value = await getAllTrainingSets()
  } catch (error: unknown) {
    loadError.value = error instanceof Error ? error.message : '无法读取训练记录'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => void loadTrainingSets())
</script>

<template>
  <main class="performance-shell">
    <header class="performance-page-header">
      <RouterLink class="back-link" to="/" aria-label="返回主页">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </RouterLink>
      <h1>训练表现</h1>
    </header>

    <nav class="body-part-selector" aria-label="选择训练部位">
      <button
        v-for="bodyPart in DISPLAY_BODY_PARTS"
        :key="bodyPart"
        type="button"
        :aria-pressed="selectedBodyPart === bodyPart"
        @click="selectBodyPart(bodyPart)"
      >
        {{ bodyPart }}
      </button>
    </nav>

    <nav class="muscle-selector" aria-label="选择肌束">
      <button
        v-for="option in [{ label: ALL_MUSCLES }, ...muscleOptions]"
        :key="option.label"
        type="button"
        :aria-pressed="selectedMuscle === option.label"
        @click="selectedMuscle = option.label"
      >
        {{ option.label }}
      </button>
    </nav>

    <section class="dashboard-card comparison-card" aria-labelledby="comparison-title">
      <header class="comparison-heading">
        <div>
          <h2 id="comparison-title">{{ selectedBodyPartTitle }}表现对比</h2>
          <p v-if="hasComparisonData">最近 {{ comparisonRows.length }} 个训练日</p>
        </div>
        <div class="comparison-controls">
          <span v-if="displayedExercises.length > 1" class="swipe-hint">左右滑动</span>
          <button
            class="training-day-count-button"
            type="button"
            :aria-label="`当前显示最近 ${selectedTrainingDayCount} 个训练日，点击切换`"
            @click="cycleTrainingDayCount"
          >
            {{ selectedTrainingDayCount }} 个训练日
          </button>
        </div>
      </header>

      <p v-if="loadError" class="comparison-error" role="alert">{{ loadError }}</p>
      <p v-else-if="isLoading" class="comparison-state" role="status">正在读取训练记录…</p>
      <p v-else-if="!hasComparisonData" class="comparison-state">{{ emptyStateText }}</p>

      <div v-else class="comparison-table-scroll">
        <table class="comparison-table">
          <thead>
            <tr>
              <th class="date-column" scope="col">日期</th>
              <th v-for="exercise in displayedExercises" :key="exercise.id" scope="col">
                <RouterLink
                  v-if="isFirstSetExerciseId(exercise.id)"
                  class="exercise-analysis-link"
                  :to="{
                    name: 'exercise-first-set',
                    params: { exerciseId: exercise.id },
                  }"
                >
                  {{ exercise.name }}
                  <svg aria-hidden="true" viewBox="0 0 16 16">
                    <path d="m6 3 5 5-5 5" />
                  </svg>
                </RouterLink>
                <template v-else>{{ exercise.name }}</template>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in comparisonRows" :key="row.date">
              <th class="date-column" scope="row">
                <span>{{ getDisplayMonth(row.date) }}</span>
                <strong>{{ getDisplayDay(row.date) }}</strong>
                <span>{{ row.weekday }}</span>
                <span class="recorded-hour">
                  {{ row.firstRecordedHour === undefined ? '—' : `${row.firstRecordedHour}时` }}
                </span>
              </th>
              <td v-for="cell in row.cells" :key="cell.exerciseId">
                <ol v-if="cell.trainingSets.length" class="set-performance-list">
                  <li v-for="(trainingSet, setIndex) in cell.trainingSets" :key="trainingSet.id">
                    <span>{{ setIndex + 1 }}</span>
                    <strong
                      >{{ formatWeight(trainingSet.weightKg) }} kg × {{ trainingSet.reps }}</strong
                    >
                  </li>
                </ol>
                <span v-else class="empty-performance">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>

<style scoped>
.performance-shell {
  width: min(100%, 680px);
  min-height: 100vh;
  margin: 0 auto;
  padding: 20px 14px calc(48px + env(safe-area-inset-bottom));
}

.performance-page-header {
  position: relative;
  display: grid;
  min-height: 48px;
  place-items: center;
}

.performance-page-header h1 {
  margin: 0;
  font-size: 1.35rem;
  letter-spacing: -0.025em;
}

.back-link {
  position: absolute;
  left: -8px;
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  color: #46634d;
}

.back-link svg {
  width: 30px;
  height: 30px;
  fill: none;
  stroke: currentcolor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.back-link:focus-visible {
  border-radius: 50%;
  outline: 3px solid rgb(70 99 77 / 22%);
}

.body-part-selector {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 5px;
  margin: 14px 0;
  padding: 4px;
  border-radius: 15px;
  background: #dfe6dc;
}

.body-part-selector button {
  min-height: 40px;
  padding: 0 4px;
  border: 0;
  border-radius: 11px;
  background: transparent;
  color: #69756c;
  font-size: 0.88rem;
  font-weight: 800;
  cursor: pointer;
}

.body-part-selector button[aria-pressed='true'] {
  background: #fff;
  color: #315941;
  box-shadow: 0 1px 4px rgb(33 55 40 / 10%);
}

.body-part-selector button:focus-visible {
  outline: 3px solid rgb(70 99 77 / 22%);
  outline-offset: 1px;
}

.muscle-selector {
  display: flex;
  gap: 7px;
  margin: -3px 0 14px;
  padding: 1px 0 4px;
  overflow-x: auto;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
}

.muscle-selector::-webkit-scrollbar {
  display: none;
}

.muscle-selector button {
  flex: 0 0 auto;
  min-height: 34px;
  padding: 0 13px;
  border: 1px solid #d5ddd2;
  border-radius: 999px;
  background: #f7f9f5;
  color: #738078;
  font-size: 0.78rem;
  font-weight: 750;
  white-space: nowrap;
  cursor: pointer;
}

.muscle-selector button[aria-pressed='true'] {
  border-color: #9db4a2;
  background: #e4eee1;
  color: #315941;
}

.muscle-selector button:focus-visible {
  outline: 3px solid rgb(70 99 77 / 22%);
  outline-offset: 1px;
}

.comparison-card {
  overflow: hidden;
}

.comparison-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.comparison-heading h2 {
  margin: 0 0 4px;
  font-size: 1.2rem;
  letter-spacing: -0.025em;
}

.comparison-heading p,
.swipe-hint {
  margin: 0;
  color: #7a867d;
  font-size: 0.76rem;
  font-weight: 700;
}

.swipe-hint {
  padding-top: 5px;
  white-space: nowrap;
}

.comparison-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.training-day-count-button {
  min-height: 32px;
  padding: 0 11px;
  border: 1px solid #d1dbce;
  border-radius: 999px;
  background: #f5f8f3;
  color: #45634d;
  font-size: 0.76rem;
  font-weight: 800;
  white-space: nowrap;
  cursor: pointer;
}

.training-day-count-button:focus-visible {
  outline: 3px solid rgb(70 99 77 / 22%);
  outline-offset: 1px;
}

.comparison-table-scroll {
  overflow-x: auto;
  border: 1px solid #dbe3d8;
  border-radius: 15px;
  background: #fafbf8;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
}

.comparison-table {
  width: max-content;
  min-width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: auto;
}

.comparison-table th,
.comparison-table td {
  width: auto;
  border-right: 1px solid #e0e6de;
  border-bottom: 1px solid #e0e6de;
  vertical-align: top;
}

.comparison-table th:last-child,
.comparison-table td:last-child {
  border-right: 0;
}

.comparison-table tbody tr:last-child th,
.comparison-table tbody tr:last-child td {
  border-bottom: 0;
}

.comparison-table thead th {
  padding: 11px 12px;
  background: #edf2e9;
  color: #53645a;
  font-size: 0.78rem;
  line-height: 1.35;
  text-align: left;
  white-space: nowrap;
}

.exercise-analysis-link {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: inherit;
  text-decoration: none;
}

.exercise-analysis-link svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentcolor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.exercise-analysis-link:focus-visible {
  border-radius: 4px;
  outline: 3px solid rgb(70 99 77 / 22%);
  outline-offset: 2px;
}

.comparison-table .date-column {
  position: sticky;
  left: 0;
  z-index: 2;
  width: 1%;
  white-space: nowrap;
}

.comparison-table thead .date-column {
  z-index: 3;
}

.comparison-table tbody .date-column {
  padding: 12px 8px;
  background: #f4f7f1;
  color: #2f4f3a;
  text-align: center;
}

.comparison-table tbody .date-column strong,
.comparison-table tbody .date-column span {
  display: block;
}

.comparison-table tbody .date-column strong {
  margin: 3px 0;
  font-size: 0.82rem;
  white-space: nowrap;
}

.comparison-table tbody .date-column span {
  color: #829087;
  font-size: 0.7rem;
}

.comparison-table tbody .date-column .recorded-hour {
  margin-top: 4px;
  color: #53645a;
  font-weight: 800;
}

.comparison-table td {
  padding: 8px 12px;
  background: #fff;
}

.set-performance-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.set-performance-list li {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  min-height: 29px;
  align-items: center;
  gap: 4px;
  color: #294c36;
  font-size: 0.74rem;
  white-space: nowrap;
}

.set-performance-list li + li {
  border-top: 1px solid #eef1ec;
}

.set-performance-list li > span {
  color: #8a958d;
  font-size: 0.68rem;
}

.set-performance-list strong {
  font-weight: 800;
}

.empty-performance {
  display: grid;
  min-height: 58px;
  place-items: center;
  color: #abb3ad;
}

.comparison-state {
  margin: 0;
  padding: 42px 16px;
  border: 1px dashed #d5ddd1;
  border-radius: 14px;
  color: #7a867d;
  font-size: 0.85rem;
  text-align: center;
}

.comparison-error {
  margin: 0;
  padding: 20px 12px;
  color: #a52d2d;
  font-size: 0.85rem;
  text-align: center;
}

@media (min-width: 600px) {
  .performance-shell {
    padding-top: 36px;
  }
}
</style>
