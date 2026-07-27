<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import AddSetDialog from '@/components/AddSetDialog.vue'
import {
  EXERCISES,
  EXERCISE_BODY_PARTS,
  EXERCISE_NAMES,
  deleteTrainingSet,
  getAllTrainingSets,
  getTrainingSetsByDate,
  getTrainingSetsByDateRange,
  type BodyPart,
  type TrainingSet,
} from '@/database'

const DELETE_MODE_KEY = 'fitness-tracker:delete-mode'
const BODY_PART_PRIORITY: readonly BodyPart[] = ['腿', '背', '胸', '肩', '手臂']
const BODY_PART_DISPLAY_PRIORITY: readonly BodyPart[] = ['肩', '手臂', '背', '胸', '腿']
const CALENDAR_DAY_COUNT = 14
const CALENDAR_WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const
const TRAINING_PERIODS = [
  { label: '最近 7 天', dayCount: 7 },
  { label: '最近 2 周', dayCount: 14 },
  { label: '最近 4 周', dayCount: 28 },
] as const
const MUSCLE_SOURCE_ANIMATION_MS = 200
type MuscleRegion = '肩' | '屈肘' | '伸肘' | '前臂' | '背' | '胸' | '腿'

const MUSCLE_GROUPS = [
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

type MuscleName = (typeof MUSCLE_GROUPS)[number]['muscles'][number]

interface MuscleSourceContribution {
  exerciseId: TrainingSet['exerciseId']
  setCount: number
  weightPerSet: number
  weightedSetCount: number
}

type MuscleTrainingSources = Record<MuscleName, MuscleSourceContribution[]>

const TRACKED_MUSCLE_NAMES = new Set<string>(
  MUSCLE_GROUPS.flatMap((group) => [...group.muscles]),
)

interface TrainingCalendarDay {
  date: string
  dayOfMonth: number
  bodyPart?: BodyPart
  isToday: boolean
  isFuture: boolean
}

const today = new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'long',
}).format(new Date())

const addSetDialog = ref<InstanceType<typeof AddSetDialog>>()
const todaySets = ref<TrainingSet[]>([])
const isLoadingTodaySets = ref(true)
const todaySetsError = ref('')
const deleteMode = ref(localStorage.getItem(DELETE_MODE_KEY) === 'true')
const deleteDialog = ref<HTMLDialogElement>()
const pendingDeleteSet = ref<TrainingSet>()
const isDeleting = ref(false)
const deleteError = ref('')
const bodyPartDayCounts = ref(createEmptyBodyPartCounts())
const isLoadingBodyPartCounts = ref(true)
const bodyPartCountsError = ref('')
const selectedTrainingPeriodIndex = ref(0)
const muscleTrainingTotals = ref(createEmptyMuscleTrainingTotals())
const muscleTrainingSources = ref(createEmptyMuscleTrainingSources())
const isLoadingMuscleTrainingTotals = ref(true)
const muscleTrainingTotalsError = ref('')
const selectedMuscleTrainingPeriodIndex = ref(0)
const muscleSourceDialog = ref<HTMLDialogElement>()
const selectedMuscle = ref<MuscleName>()
const isClosingMuscleSourceDialog = ref(false)
const trainingCalendarDays = ref<TrainingCalendarDay[]>(buildTrainingCalendarDays([]))
const isLoadingTrainingCalendar = ref(true)
const trainingCalendarError = ref('')
const isExporting = ref(false)
const exportStatus = ref('')
const exportError = ref('')
let muscleSourceScrollPosition = 0
const sortedBodyParts = computed(() =>
  [...BODY_PART_DISPLAY_PRIORITY].sort((left, right) => {
    const countDifference = bodyPartDayCounts.value[right] - bodyPartDayCounts.value[left]

    return countDifference || BODY_PART_DISPLAY_PRIORITY.indexOf(left) - BODY_PART_DISPLAY_PRIORITY.indexOf(right)
  }),
)
const visibleMuscleGroups = computed(() =>
  MUSCLE_GROUPS.map((group) => ({
    region: group.region,
    muscles: group.muscles.filter((muscle) => muscleTrainingTotals.value[muscle] > 0),
  })).filter((group) => group.muscles.length > 0),
)
const selectedTrainingPeriod = computed(
  () => TRAINING_PERIODS[selectedTrainingPeriodIndex.value]!,
)
const trainingPeriodStartDate = computed(() =>
  getLocalDate(-(selectedTrainingPeriod.value.dayCount - 1)),
)
const trainingPeriodEndDate = computed(() => getLocalDate())
const trainingPeriodRangeLabel = computed(
  () =>
    `${formatDisplayDate(trainingPeriodStartDate.value)}—${formatDisplayDate(trainingPeriodEndDate.value)}`,
)
const selectedMuscleTrainingPeriod = computed(
  () => TRAINING_PERIODS[selectedMuscleTrainingPeriodIndex.value]!,
)
const muscleTrainingPeriodStartDate = computed(() =>
  getLocalDate(-(selectedMuscleTrainingPeriod.value.dayCount - 1)),
)
const muscleTrainingPeriodEndDate = computed(() => getLocalDate())
const muscleTrainingPeriodRangeLabel = computed(
  () =>
    `${formatDisplayDate(muscleTrainingPeriodStartDate.value)}—${formatDisplayDate(muscleTrainingPeriodEndDate.value)}`,
)
const selectedMuscleSources = computed(() =>
  selectedMuscle.value ? muscleTrainingSources.value[selectedMuscle.value] : [],
)
const selectedMuscleTotal = computed(() =>
  selectedMuscle.value ? muscleTrainingTotals.value[selectedMuscle.value] : 0,
)

const currentWeekMondayOffset = getCurrentWeekMondayOffset()
const calendarStartDate = getLocalDate(currentWeekMondayOffset - 7)
const calendarEndDate = getLocalDate(currentWeekMondayOffset + 6)

function getLocalDate(dayOffset = 0): string {
  const currentDate = new Date()
  currentDate.setHours(12, 0, 0, 0)
  currentDate.setDate(currentDate.getDate() + dayOffset)

  const year = currentDate.getFullYear()
  const month = String(currentDate.getMonth() + 1).padStart(2, '0')
  const day = String(currentDate.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getCurrentWeekMondayOffset(): number {
  const dayOfWeek = new Date().getDay()

  return dayOfWeek === 0 ? -6 : 1 - dayOfWeek
}

function formatDisplayDate(date: string): string {
  const [, month, day] = date.split('-')

  return `${Number(month)}月${Number(day)}日`
}

function createEmptyBodyPartCounts(): Record<BodyPart, number> {
  return {
    手臂: 0,
    肩: 0,
    背: 0,
    胸: 0,
    腿: 0,
  }
}

function createEmptyMuscleTrainingTotals(): Record<MuscleName, number> {
  return Object.fromEntries(
    MUSCLE_GROUPS.flatMap((group) => group.muscles.map((muscle) => [muscle, 0])),
  ) as Record<MuscleName, number>
}

function createEmptyMuscleTrainingSources(): MuscleTrainingSources {
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

function getDominantBodyPart(dateCounts?: Record<BodyPart, number>): BodyPart | undefined {
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

function buildTrainingCalendarDays(trainingSets: TrainingSet[]): TrainingCalendarDay[] {
  const countsByDate = getBodyPartCountsByDate(trainingSets)
  const today = getLocalDate()
  const firstCalendarDayOffset = getCurrentWeekMondayOffset() - 7

  return Array.from({ length: CALENDAR_DAY_COUNT }, (_, index) => {
    const date = getLocalDate(firstCalendarDayOffset + index)
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

function getCalendarDayAriaLabel(calendarDay: TrainingCalendarDay): string {
  if (calendarDay.isFuture) return `${calendarDay.date}，未来日期`

  const trainingLabel = calendarDay.bodyPart ? `训练${calendarDay.bodyPart}` : '休息'

  return `${calendarDay.date}，${trainingLabel}`
}

function formatWeight(weightKg: number): string {
  return Number.isInteger(weightKg) ? String(weightKg) : String(Number(weightKg.toFixed(2)))
}

function formatWeightedSetCount(setCount: number): string {
  return Number.isInteger(setCount) ? String(setCount) : String(Number(setCount.toFixed(2)))
}

async function exportTrainingRecords(): Promise<void> {
  if (isExporting.value) return

  isExporting.value = true
  exportStatus.value = ''
  exportError.value = ''

  try {
    const trainingSets = await getAllTrainingSets()
    const fileContent = JSON.stringify(trainingSets, null, 2)
    const fileBlob = new Blob([fileContent], { type: 'application/json;charset=utf-8' })
    const downloadUrl = URL.createObjectURL(fileBlob)
    const downloadLink = document.createElement('a')

    downloadLink.href = downloadUrl
    downloadLink.download = `fitness-training-records-${getLocalDate()}.json`
    document.body.append(downloadLink)
    downloadLink.click()
    downloadLink.remove()
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0)

    exportStatus.value = `已导出 ${trainingSets.length} 条训练记录`
  } catch (error: unknown) {
    exportError.value = error instanceof Error ? error.message : '导出训练记录失败'
  } finally {
    isExporting.value = false
  }
}

async function loadTodaySets(): Promise<void> {
  isLoadingTodaySets.value = true
  todaySetsError.value = ''

  try {
    todaySets.value = await getTrainingSetsByDate(getLocalDate())
  } catch (error: unknown) {
    todaySetsError.value = error instanceof Error ? error.message : '无法读取今日记录'
  } finally {
    isLoadingTodaySets.value = false
  }
}

async function loadBodyPartDayCounts(): Promise<void> {
  isLoadingBodyPartCounts.value = true
  bodyPartCountsError.value = ''

  try {
    const trainingSets = await getTrainingSetsByDateRange(
      trainingPeriodStartDate.value,
      trainingPeriodEndDate.value,
    )
    const countsByDate = getBodyPartCountsByDate(trainingSets)

    const result = createEmptyBodyPartCounts()

    for (const dateCounts of countsByDate.values()) {
      const dominantBodyPart = getDominantBodyPart(dateCounts)

      if (dominantBodyPart) result[dominantBodyPart] += 1
    }

    bodyPartDayCounts.value = result
  } catch (error: unknown) {
    bodyPartCountsError.value = error instanceof Error ? error.message : '无法读取训练部位统计'
  } finally {
    isLoadingBodyPartCounts.value = false
  }
}

function changeTrainingPeriod(): void {
  void loadBodyPartDayCounts()
}

async function loadMuscleTrainingTotals(): Promise<void> {
  isLoadingMuscleTrainingTotals.value = true
  muscleTrainingTotalsError.value = ''

  try {
    const trainingSets = await getTrainingSetsByDateRange(
      muscleTrainingPeriodStartDate.value,
      muscleTrainingPeriodEndDate.value,
    )
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

    muscleTrainingTotals.value = totals
    muscleTrainingSources.value = sources
  } catch (error: unknown) {
    muscleTrainingTotalsError.value =
      error instanceof Error ? error.message : '无法读取肌束训练量'
  } finally {
    isLoadingMuscleTrainingTotals.value = false
  }
}

function changeMuscleTrainingPeriod(): void {
  void loadMuscleTrainingTotals()
}

function lockPageScroll(): void {
  muscleSourceScrollPosition = window.scrollY
  document.body.style.top = `-${muscleSourceScrollPosition}px`
  document.body.classList.add('muscle-source-scroll-locked')
}

function unlockPageScroll(): void {
  document.body.classList.remove('muscle-source-scroll-locked')
  document.body.style.removeProperty('top')
  window.scrollTo(0, muscleSourceScrollPosition)
}

function openMuscleSourceDialog(muscle: MuscleName): void {
  const dialog = muscleSourceDialog.value

  if (!dialog || dialog.open) return

  selectedMuscle.value = muscle
  isClosingMuscleSourceDialog.value = false
  lockPageScroll()
  dialog.showModal()
}

function closeMuscleSourceDialog(): void {
  const dialog = muscleSourceDialog.value

  if (!dialog?.open || isClosingMuscleSourceDialog.value) return

  isClosingMuscleSourceDialog.value = true
  const closeDelay = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 0
    : MUSCLE_SOURCE_ANIMATION_MS

  window.setTimeout(() => {
    dialog.close()
    selectedMuscle.value = undefined
    isClosingMuscleSourceDialog.value = false
    unlockPageScroll()
  }, closeDelay)
}

function handleMuscleSourceDialogClick(event: MouseEvent): void {
  if (event.target === event.currentTarget) closeMuscleSourceDialog()
}

async function loadTrainingCalendar(): Promise<void> {
  isLoadingTrainingCalendar.value = true
  trainingCalendarError.value = ''

  try {
    const trainingSets = await getTrainingSetsByDateRange(calendarStartDate, calendarEndDate)

    trainingCalendarDays.value = buildTrainingCalendarDays(trainingSets)
  } catch (error: unknown) {
    trainingCalendarError.value = error instanceof Error ? error.message : '无法读取训练日历'
  } finally {
    isLoadingTrainingCalendar.value = false
  }
}

function refreshAfterSetAdded(): void {
  void loadTodaySets()
  void loadBodyPartDayCounts()
  void loadMuscleTrainingTotals()
  void loadTrainingCalendar()
}

function toggleDeleteMode(): void {
  deleteMode.value = !deleteMode.value
  localStorage.setItem(DELETE_MODE_KEY, String(deleteMode.value))
}

function requestDelete(trainingSet: TrainingSet): void {
  pendingDeleteSet.value = trainingSet
  deleteError.value = ''
  deleteDialog.value?.showModal()
}

function closeDeleteDialog(): void {
  if (isDeleting.value) return

  deleteDialog.value?.close()
  pendingDeleteSet.value = undefined
  deleteError.value = ''
}

async function confirmDelete(): Promise<void> {
  if (!pendingDeleteSet.value) return

  const trainingSetId = pendingDeleteSet.value.id
  isDeleting.value = true
  deleteError.value = ''

  try {
    await deleteTrainingSet(trainingSetId)
    deleteDialog.value?.close()
    pendingDeleteSet.value = undefined
    todaySets.value = todaySets.value.filter((trainingSet) => trainingSet.id !== trainingSetId)
    await Promise.all([
      loadBodyPartDayCounts(),
      loadMuscleTrainingTotals(),
      loadTrainingCalendar(),
    ])
  } catch (error: unknown) {
    deleteError.value = error instanceof Error ? error.message : '删除记录失败'
  } finally {
    isDeleting.value = false
  }
}

onMounted(() => {
  void loadTodaySets()
  void loadBodyPartDayCounts()
  void loadMuscleTrainingTotals()
  void loadTrainingCalendar()
})
</script>

<template>
  <main class="home-shell">
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ today }}</p>
        <h1>训练记录</h1>
      </div>
      <div class="avatar" aria-hidden="true">练</div>
    </header>

    <section class="training-calendar-section" aria-labelledby="calendar-title">
      <h2 id="calendar-title">训练日历</h2>

      <div class="training-calendar-card">
        <p v-if="isLoadingTrainingCalendar" class="calendar-status">正在读取训练记录…</p>
        <p
          v-else-if="trainingCalendarError"
          class="calendar-status calendar-error"
          role="alert"
        >
          {{ trainingCalendarError }}
        </p>
        <div v-else>
          <ol class="calendar-weekdays" aria-hidden="true">
            <li v-for="weekday in CALENDAR_WEEKDAYS" :key="weekday">{{ weekday }}</li>
          </ol>
          <ol class="calendar-grid">
            <li
              v-for="calendarDay in trainingCalendarDays"
              :key="calendarDay.date"
              class="calendar-day"
              :class="{ today: calendarDay.isToday, future: calendarDay.isFuture }"
              :data-body-part="calendarDay.bodyPart"
            >
              <time
                :datetime="calendarDay.date"
                :aria-label="getCalendarDayAriaLabel(calendarDay)"
              >
                <strong>{{ calendarDay.dayOfMonth }}</strong>
              </time>
              <span class="calendar-body-part">
                {{ calendarDay.isFuture ? '—' : (calendarDay.bodyPart ?? '') }}
              </span>
            </li>
          </ol>
        </div>
      </div>
    </section>

    <section class="summary-section" aria-labelledby="summary-title">
      <div class="section-heading">
        <div>
          <h2 id="summary-title">主训练部位</h2>
          <span class="date-range">{{ trainingPeriodRangeLabel }}</span>
        </div>
        <select
          v-model.number="selectedTrainingPeriodIndex"
          class="period-select"
          :disabled="isLoadingBodyPartCounts"
          aria-label="选择统计周期"
          @change="changeTrainingPeriod"
        >
          <option v-for="(period, index) in TRAINING_PERIODS" :key="period.dayCount" :value="index">
            {{ period.label }}
          </option>
        </select>
      </div>

      <div class="body-part-list">
        <article v-for="bodyPart in sortedBodyParts" :key="bodyPart" class="body-part-row">
          <span>{{ bodyPart }}</span>
          <strong>{{ isLoadingBodyPartCounts ? '—' : bodyPartDayCounts[bodyPart] }}</strong>
        </article>
      </div>
      <p v-if="bodyPartCountsError" class="summary-error" role="alert">
        {{ bodyPartCountsError }}
      </p>
    </section>

    <section class="muscle-section" aria-labelledby="muscle-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">训练分布</p>
          <h2 id="muscle-title">肌束训练量</h2>
          <span class="date-range">{{ muscleTrainingPeriodRangeLabel }}</span>
        </div>
        <select
          v-model.number="selectedMuscleTrainingPeriodIndex"
          class="period-select"
          :disabled="isLoadingMuscleTrainingTotals"
          aria-label="选择肌束训练量统计周期"
          @change="changeMuscleTrainingPeriod"
        >
          <option v-for="(period, index) in TRAINING_PERIODS" :key="period.dayCount" :value="index">
            {{ period.label }}
          </option>
        </select>
      </div>

      <div v-if="visibleMuscleGroups.length" class="muscle-table-wrapper">
        <table class="muscle-table">
          <colgroup>
            <col class="muscle-body-part-column" />
            <col class="muscle-name-column" />
            <col class="muscle-total-column" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">区域</th>
              <th scope="col">细分肌肉</th>
              <th scope="col">加权组数</th>
            </tr>
          </thead>
          <tbody v-for="group in visibleMuscleGroups" :key="group.region">
            <tr v-for="(muscle, index) in group.muscles" :key="muscle">
              <th
                v-if="index === 0"
                class="muscle-body-part"
                :data-region="group.region"
                :rowspan="group.muscles.length"
                scope="rowgroup"
              >
                {{ group.region }}
              </th>
              <td class="muscle-name">{{ muscle }}</td>
              <td class="muscle-total">
                <button
                  class="muscle-total-button"
                  type="button"
                  :aria-label="`查看${muscle}的训练来源`"
                  :disabled="isLoadingMuscleTrainingTotals"
                  @click="openMuscleSourceDialog(muscle)"
                >
                  {{
                    isLoadingMuscleTrainingTotals
                      ? '—'
                      : formatWeightedSetCount(muscleTrainingTotals[muscle])
                  }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else-if="isLoadingMuscleTrainingTotals" class="muscle-table-status">
        正在计算训练量…
      </p>
      <p v-else-if="!muscleTrainingTotalsError" class="muscle-table-status">
        所选时间段暂无肌束训练量
      </p>
      <p v-if="muscleTrainingTotalsError" class="summary-error" role="alert">
        {{ muscleTrainingTotalsError }}
      </p>
    </section>

    <section class="today-section" aria-labelledby="today-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">训练明细</p>
          <h2 id="today-title">今日记录</h2>
        </div>
        <div v-if="!isLoadingTodaySets" class="today-heading-actions">
          <span class="set-count">{{ todaySets.length }} 组</span>
          <button
            v-if="todaySets.length"
            class="delete-mode-button"
            type="button"
            :aria-label="deleteMode ? '关闭删除模式' : '开启删除模式'"
            :aria-pressed="deleteMode"
            @click="toggleDeleteMode"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </div>

      <p v-if="isLoadingTodaySets" class="records-status">正在读取记录…</p>
      <p v-else-if="todaySetsError" class="records-status records-error" role="alert">
        {{ todaySetsError }}
      </p>
      <ul v-else-if="todaySets.length" class="record-list">
        <li
          v-for="trainingSet in todaySets"
          :key="trainingSet.id"
          class="record-item"
          :class="{ 'delete-enabled': deleteMode }"
        >
          <strong>{{ EXERCISE_NAMES[trainingSet.exerciseId] }}</strong>
          <div class="record-values">
            <span>{{ formatWeight(trainingSet.weightKg) }} kg × {{ trainingSet.reps }}</span>
            <span class="rir-value">RIR {{ trainingSet.rir }}</span>
          </div>
          <button
            v-if="deleteMode"
            class="delete-record-button"
            type="button"
            :aria-label="`删除${EXERCISE_NAMES[trainingSet.exerciseId]}这一组`"
            @click="requestDelete(trainingSet)"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />
            </svg>
          </button>
        </li>
      </ul>
      <div v-else class="records-empty">
        <h3>今天还没有训练记录</h3>
        <p>点击右下角的 + 添加第一组。</p>
      </div>
    </section>

    <section class="export-section" aria-label="数据导出">
      <button
        class="export-button"
        type="button"
        :disabled="isExporting"
        @click="exportTrainingRecords"
      >
        {{ isExporting ? '导出中…' : '导出 JSON' }}
      </button>
      <p v-if="exportStatus" class="export-status" role="status">{{ exportStatus }}</p>
      <p v-if="exportError" class="export-error" role="alert">{{ exportError }}</p>
    </section>

    <button class="add-set-button" type="button" aria-label="添加一组" @click="addSetDialog?.open()">
      +
    </button>

    <AddSetDialog ref="addSetDialog" @saved="refreshAfterSetAdded" />

    <dialog
      ref="muscleSourceDialog"
      class="muscle-source-dialog"
      :class="{ closing: isClosingMuscleSourceDialog }"
      @cancel.prevent="closeMuscleSourceDialog"
      @click="handleMuscleSourceDialogClick"
    >
      <div v-if="selectedMuscle" class="muscle-source-content">
        <header class="muscle-source-header">
          <div>
            <p class="muscle-source-eyebrow">训练来源</p>
            <h2>{{ selectedMuscle }}</h2>
            <span>{{ muscleTrainingPeriodRangeLabel }}</span>
          </div>
          <button type="button" aria-label="关闭训练来源" @click="closeMuscleSourceDialog">×</button>
        </header>

        <div class="muscle-source-summary">
          <span>加权组数</span>
          <strong>{{ formatWeightedSetCount(selectedMuscleTotal) }}</strong>
        </div>

        <ul class="muscle-source-list">
          <li v-for="source in selectedMuscleSources" :key="source.exerciseId">
            <div>
              <strong>{{ EXERCISE_NAMES[source.exerciseId] }}</strong>
              <span>
                {{ source.setCount }} 组 × 每组 {{ formatWeightedSetCount(source.weightPerSet) }}
              </span>
            </div>
            <strong>{{ formatWeightedSetCount(source.weightedSetCount) }} 组</strong>
          </li>
        </ul>
      </div>
    </dialog>

    <dialog ref="deleteDialog" class="delete-dialog" @cancel.prevent="closeDeleteDialog">
      <div v-if="pendingDeleteSet" class="delete-confirmation">
        <header>
          <p class="delete-dialog-eyebrow">确认操作</p>
          <h2>删除这组记录？</h2>
        </header>

        <div class="delete-record-summary">
          <strong>{{ EXERCISE_NAMES[pendingDeleteSet.exerciseId] }}</strong>
          <span>
            {{ formatWeight(pendingDeleteSet.weightKg) }} kg × {{ pendingDeleteSet.reps }} · RIR
            {{ pendingDeleteSet.rir }}
          </span>
        </div>

        <p v-if="deleteError" class="delete-error" role="alert">{{ deleteError }}</p>

        <footer class="delete-actions">
          <button type="button" :disabled="isDeleting" @click="closeDeleteDialog">Cancel</button>
          <button
            class="confirm-delete-button"
            type="button"
            :disabled="isDeleting"
            @click="confirmDelete"
          >
            {{ isDeleting ? '删除中…' : '删除' }}
          </button>
        </footer>
      </div>
    </dialog>
  </main>
</template>

<style>
:root {
  color: #17211a;
  background: #eef1eb;
  font-family:
    Inter, "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, BlinkMacSystemFont,
    "Segoe UI", sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}

body.muscle-source-scroll-locked {
  position: fixed;
  right: 0;
  left: 0;
  width: 100%;
  overflow: hidden;
}

button {
  font: inherit;
}

.home-shell {
  width: min(100%, 680px);
  min-height: 100vh;
  margin: 0 auto;
  padding: 28px 14px calc(120px + env(safe-area-inset-bottom));
}

.page-header,
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-header {
  margin-bottom: 28px;
}

.eyebrow {
  margin: 0 0 6px;
  color: #718078;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1,
h2,
h3,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 0;
  font-size: clamp(1.75rem, 7vw, 2.25rem);
  letter-spacing: -0.04em;
}

.avatar {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 1px solid #ced6ca;
  border-radius: 50%;
  background: #fff;
  color: #365640;
  font-weight: 800;
}

.training-calendar-section,
.summary-section,
.muscle-section,
.today-section {
  padding: 14px;
  border-radius: 22px;
  background: #fff;
}

.training-calendar-section h2 {
  margin: 0 0 14px;
  font-size: 1.25rem;
  letter-spacing: -0.025em;
}

.training-calendar-card {
  padding: 12px;
  border: 1px solid #e4e9e1;
  border-radius: 16px;
  background: #f7f9f5;
  color: #17211a;
}

.calendar-weekdays,
.calendar-grid {
  display: grid;
  margin: 0;
  padding: 0;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
  list-style: none;
}

.calendar-weekdays {
  margin-bottom: 8px;
  color: #718078;
  font-size: 0.64rem;
  font-weight: 700;
  text-align: center;
}

.calendar-day {
  display: flex;
  min-width: 0;
  height: 62px;
  align-items: center;
  flex-direction: column;
  justify-content: space-between;
  gap: 3px;
  padding: 6px 2px;
  border: 1px solid #edf0ea;
  border-radius: 12px;
  background: #fff;
  color: #405047;
}

.calendar-day time {
  display: block;
}

.calendar-day time strong {
  color: inherit;
  font-size: 0.92rem;
  font-variant-numeric: tabular-nums;
}

.calendar-body-part {
  font-size: 0.8rem;
  font-weight: 800;
  white-space: nowrap;
}

.calendar-day[data-body-part='肩'] {
  border-color: #d9f36a;
  background: #d9f36a;
  color: #18311f;
}

.calendar-day[data-body-part='背'] {
  background: #d1e3dd;
  color: #24463c;
}

.calendar-day[data-body-part='胸'] {
  background: #ead9d2;
  color: #5e3b31;
}

.calendar-day[data-body-part='腿'] {
  background: #e9dfbd;
  color: #564a25;
}

.calendar-day[data-body-part='手臂'] {
  background: #ded8e9;
  color: #4b3e60;
}

.calendar-day.future {
  border-color: #f0f2ed;
  background: #fafbf8;
  color: #a7afa9;
}

.calendar-day.today {
  box-shadow: 0 0 0 2px #365640;
}

.calendar-status {
  display: grid;
  min-height: 160px;
  margin: 0;
  place-items: center;
  color: #718078;
  font-size: 0.85rem;
}

.calendar-error {
  color: #a52d2d;
}

.summary-section,
.muscle-section,
.today-section {
  margin-top: 24px;
}

.section-heading h2 {
  margin-bottom: 0;
  font-size: 1.25rem;
  letter-spacing: -0.025em;
}

.date-range {
  display: block;
  margin-top: 6px;
  color: #718078;
  font-size: 0.78rem;
  font-weight: 700;
}

.period-select {
  min-height: 36px;
  flex-shrink: 0;
  padding: 0 10px;
  border: 1px solid #d5ddd1;
  border-radius: 10px;
  background: #fff;
  color: #46634d;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.period-select:disabled {
  cursor: wait;
  opacity: 0.55;
}

.period-select:focus-visible {
  outline: 3px solid rgb(70 99 77 / 22%);
  outline-offset: 2px;
}

.body-part-list {
  overflow: hidden;
  display: grid;
  margin-top: 16px;
  border: 1px solid #e4e9e1;
  border-radius: 16px;
  background: #f7f9f5;
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.body-part-row {
  display: flex;
  min-width: 0;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  padding: 14px 4px;
  text-align: center;
}

.body-part-row + .body-part-row {
  border-left: 1px solid #edf0ea;
}

.body-part-row span {
  color: #405047;
  font-size: 0.9rem;
  font-weight: 700;
}

.body-part-row strong {
  color: #234a31;
  font-size: 0.95rem;
  font-variant-numeric: tabular-nums;
}

.summary-error {
  margin: 10px 0 0;
  color: #a52d2d;
  font-size: 0.82rem;
}

.muscle-table-wrapper {
  overflow: hidden;
  margin-top: 16px;
  border: 1px solid #e4e9e1;
  border-radius: 16px;
  background: #f7f9f5;
}

.muscle-table-status {
  margin: 16px 0 0;
  padding: 28px 16px;
  border: 1px dashed #c8d1c5;
  border-radius: 16px;
  background: #f7f9f5;
  color: #718078;
  font-size: 0.86rem;
  text-align: center;
}

.muscle-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.muscle-body-part-column {
  width: 14%;
}

.muscle-name-column {
  width: 56%;
}

.muscle-total-column {
  width: 30%;
}

.muscle-table th,
.muscle-table td {
  padding: 11px 10px;
}

.muscle-table thead {
  background: #eef3eb;
}

.muscle-table thead th {
  color: #65736b;
  font-size: 0.75rem;
  font-weight: 800;
  text-align: left;
}

.muscle-table thead th:last-child {
  padding-right: 16px;
  text-align: right;
}

.muscle-table tbody + tbody tr:first-child > * {
  position: relative;
}

.muscle-table tbody tr + tr td {
  position: relative;
}

.muscle-table tbody + tbody tr:first-child > *::before,
.muscle-table tbody tr + tr td::before {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: 1px;
  background: #edf0ea;
  content: '';
  pointer-events: none;
}

.muscle-table tbody + tbody tr:first-child > *::before {
  height: 1px;
  background: #cbd5c8;
}

.muscle-table tbody + tbody tr:first-child > *:first-child::before,
.muscle-table tbody tr + tr td:first-child::before {
  left: 8px;
}

.muscle-table tbody + tbody tr:first-child > *:last-child::before,
.muscle-table tbody tr + tr td:last-child::before {
  right: 16px;
}

.muscle-body-part {
  border-right: 1px solid #edf0ea;
  background: #f1f5ee;
  color: #405047;
  font-size: 0.88rem;
  font-weight: 800;
  text-align: center;
  vertical-align: middle;
}

.muscle-body-part[data-region='肩'] {
  background: #f1f6d8;
}

.muscle-body-part[data-region='屈肘'],
.muscle-body-part[data-region='伸肘'],
.muscle-body-part[data-region='前臂'] {
  background: #f1edf5;
}

.muscle-body-part[data-region='背'] {
  background: #e8f0ed;
}

.muscle-body-part[data-region='胸'] {
  background: #f4ece8;
}

.muscle-body-part[data-region='腿'] {
  background: #f4f0e1;
}

.muscle-name {
  color: #405047;
  font-size: 0.86rem;
}

.muscle-table td.muscle-total {
  padding-right: 16px;
  color: #234a31;
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
  font-weight: 800;
  text-align: right;
}

.muscle-total-button {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  justify-content: center;
  margin: -5px -4px;
  padding: 5px 4px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-variant-numeric: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.muscle-total-button:disabled {
  cursor: wait;
}

.muscle-total-button:focus-visible {
  outline: 3px solid rgb(70 99 77 / 22%);
  outline-offset: 2px;
}

.set-count {
  padding: 6px 10px;
  border-radius: 999px;
  background: #e5eddf;
  color: #46634d;
  font-size: 0.78rem;
  font-weight: 800;
}

.today-heading-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.delete-mode-button {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  padding: 0 0 2px;
  border: 1px solid #d5ddd1;
  border-radius: 50%;
  background: #fff;
  color: #738078;
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
}

.delete-mode-button[aria-pressed="true"] {
  border-color: #e3a8a8;
  background: #fde8e8;
  color: #a52d2d;
}

.delete-mode-button:focus-visible,
.delete-record-button:focus-visible {
  outline: 3px solid rgb(165 45 45 / 22%);
  outline-offset: 2px;
}

.records-status,
.records-empty,
.record-list {
  margin-top: 16px;
}

.records-status {
  padding: 24px;
  border: 1px solid #e4e9e1;
  border-radius: 16px;
  background: #f7f9f5;
  color: #718078;
  text-align: center;
}

.records-error {
  color: #a52d2d;
}

.record-list {
  overflow: hidden;
  margin-bottom: 0;
  padding: 0;
  border: 1px solid #e4e9e1;
  border-radius: 16px;
  background: #f7f9f5;
  list-style: none;
}

.record-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
}

.record-item.delete-enabled {
  position: relative;
  padding-right: 58px;
}

.record-item + .record-item {
  border-top: 1px solid #edf0ea;
}

.record-item strong {
  font-size: 0.92rem;
}

.record-values {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 12px;
  color: #405047;
  font-size: 0.86rem;
  font-variant-numeric: tabular-nums;
}

.rir-value {
  min-width: 46px;
  color: #718078;
}

.delete-record-button {
  position: absolute;
  top: 50%;
  right: 14px;
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  padding: 0;
  border: 1px solid #ecc5c5;
  border-radius: 9px;
  background: #fff1f1;
  color: #ad3535;
  transform: translateY(-50%);
  cursor: pointer;
}

.delete-record-button svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentcolor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.records-empty {
  padding: 28px 22px;
  border: 1px dashed #c8d1c5;
  border-radius: 16px;
  background: #f7f9f5;
  text-align: center;
}

.records-empty h3 {
  margin-bottom: 7px;
  font-size: 0.95rem;
}

.records-empty p {
  margin-bottom: 0;
  color: #718078;
  font-size: 0.84rem;
}

.export-section {
  margin-top: 24px;
}

.export-button {
  width: 100%;
  min-height: 48px;
  border: 1px solid #d5ddd1;
  border-radius: 14px;
  background: #fff;
  color: #46634d;
  font-weight: 800;
  cursor: pointer;
}

.export-button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.export-button:focus-visible {
  outline: 3px solid rgb(70 99 77 / 22%);
  outline-offset: 2px;
}

.export-status,
.export-error {
  margin: 10px 2px 0;
  font-size: 0.82rem;
  text-align: center;
}

.export-status {
  color: #46634d;
}

.export-error {
  color: #a52d2d;
}

.muscle-source-dialog {
  position: fixed;
  inset: auto 0 0;
  width: min(100%, 680px);
  max-width: none;
  max-height: min(72dvh, 640px);
  margin: 0 auto;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: 24px 24px 0 0;
  outline: none;
  background: #f8faf5;
  color: #17211a;
  box-shadow: 0 -18px 60px rgb(13 31 20 / 24%);
}

.muscle-source-dialog::backdrop {
  background: rgb(11 22 15 / 48%);
  backdrop-filter: blur(2px);
}

.muscle-source-dialog[open] {
  animation: muscle-source-slide-in 200ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.muscle-source-dialog[open]::backdrop {
  animation: muscle-source-backdrop-in 200ms ease-out both;
}

.muscle-source-dialog.closing {
  animation: muscle-source-slide-out 200ms cubic-bezier(0.4, 0, 1, 1) both;
}

.muscle-source-dialog.closing::backdrop {
  animation: muscle-source-backdrop-out 200ms ease-in both;
}

@keyframes muscle-source-slide-in {
  from {
    transform: translateY(100%);
  }

  to {
    transform: translateY(0);
  }
}

@keyframes muscle-source-slide-out {
  from {
    transform: translateY(0);
  }

  to {
    transform: translateY(100%);
  }
}

@keyframes muscle-source-backdrop-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes muscle-source-backdrop-out {
  from {
    opacity: 1;
  }

  to {
    opacity: 0;
  }
}

.muscle-source-content {
  max-height: min(72dvh, 640px);
  padding: 22px 20px calc(24px + env(safe-area-inset-bottom));
  overflow-y: auto;
  overscroll-behavior: contain;
}

.muscle-source-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.muscle-source-eyebrow {
  margin-bottom: 5px;
  color: #718078;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.muscle-source-header h2 {
  margin-bottom: 5px;
  font-size: 1.4rem;
  letter-spacing: -0.03em;
}

.muscle-source-header span {
  color: #718078;
  font-size: 0.8rem;
  font-weight: 700;
}

.muscle-source-header button {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  place-items: center;
  padding: 0 0 2px;
  border: 1px solid #d5ddd1;
  border-radius: 50%;
  background: #fff;
  color: #536158;
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}

.muscle-source-header button:active {
  background: #fff;
  color: #536158;
}

.muscle-source-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20px;
  padding: 14px 16px;
  border-radius: 14px;
  background: #e5eddf;
  color: #46634d;
  font-weight: 800;
}

.muscle-source-summary strong {
  font-size: 1.15rem;
  font-variant-numeric: tabular-nums;
}

.muscle-source-list {
  overflow: hidden;
  margin: 14px 0 0;
  padding: 0;
  border: 1px solid #e0e5dc;
  border-radius: 16px;
  background: #fff;
  list-style: none;
}

.muscle-source-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 15px 16px;
}

.muscle-source-list li + li {
  border-top: 1px solid #edf0ea;
}

.muscle-source-list li > div {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.muscle-source-list li > div strong {
  overflow: hidden;
  font-size: 0.9rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.muscle-source-list li span {
  color: #718078;
  font-size: 0.78rem;
}

.muscle-source-list li > strong {
  flex: 0 0 auto;
  color: #234a31;
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  .muscle-source-dialog[open],
  .muscle-source-dialog[open]::backdrop {
    animation: none;
  }
}

.delete-dialog {
  width: min(calc(100% - 40px), 420px);
  margin: auto;
  padding: 0;
  border: 0;
  border-radius: 22px;
  background: #f8faf5;
  color: #17211a;
  box-shadow: 0 24px 80px rgb(13 31 20 / 30%);
}

.delete-dialog::backdrop {
  background: rgb(11 22 15 / 55%);
  backdrop-filter: blur(3px);
}

.delete-confirmation {
  padding: 24px;
}

.delete-confirmation h2 {
  margin-bottom: 0;
  font-size: 1.35rem;
  letter-spacing: -0.03em;
}

.delete-dialog-eyebrow {
  margin-bottom: 5px;
  color: #718078;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.delete-record-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 20px;
  padding: 16px;
  border: 1px solid #e0e5dc;
  border-radius: 14px;
  background: #fff;
}

.delete-record-summary strong {
  font-size: 0.9rem;
}

.delete-record-summary span {
  flex-shrink: 0;
  color: #617067;
  font-size: 0.84rem;
  font-variant-numeric: tabular-nums;
}

.delete-error {
  margin: 14px 0 0;
  color: #a52d2d;
  font-size: 0.82rem;
}

.delete-actions {
  display: grid;
  grid-template-columns: 1fr 1.25fr;
  gap: 10px;
  margin-top: 22px;
}

.delete-actions button {
  min-height: 46px;
  border: 1px solid #d5ddd1;
  border-radius: 12px;
  background: #fff;
  color: #536158;
  font-weight: 800;
  cursor: pointer;
}

.delete-actions button:disabled {
  cursor: wait;
  opacity: 0.65;
}

.delete-actions .confirm-delete-button {
  border-color: #a83232;
  background: #a83232;
  color: #fff;
}

@media (max-width: 390px) {
  .record-item {
    align-items: flex-start;
    flex-direction: column;
    gap: 7px;
  }

  .delete-record-summary {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }
}

.add-set-button {
  position: fixed;
  right: max(22px, calc((100vw - 680px) / 2 + 22px));
  bottom: calc(24px + env(safe-area-inset-bottom));
  display: grid;
  width: 58px;
  height: 58px;
  place-items: center;
  padding: 0 0 5px;
  border: 0;
  border-radius: 50%;
  background: #d9f36a;
  color: #18311f;
  box-shadow: 0 12px 28px rgb(31 62 40 / 24%);
  font-size: 2rem;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
}

.add-set-button:hover {
  background: #e3f889;
}

.add-set-button:focus-visible {
  outline: 3px solid #183f2b;
  outline-offset: 3px;
}

@media (min-width: 600px) {
  .home-shell {
    padding-top: 44px;
  }
}
</style>
