<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import AddSetDialog from '@/components/AddSetDialog.vue'
import {
  EXERCISE_BODY_PARTS,
  EXERCISE_NAMES,
  deleteTrainingSet,
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
const trainingCalendarDays = ref<TrainingCalendarDay[]>(buildTrainingCalendarDays([]))
const isLoadingTrainingCalendar = ref(true)
const trainingCalendarError = ref('')
const sortedBodyParts = computed(() =>
  [...BODY_PART_DISPLAY_PRIORITY].sort((left, right) => {
    const countDifference = bodyPartDayCounts.value[right] - bodyPartDayCounts.value[left]

    return countDifference || BODY_PART_DISPLAY_PRIORITY.indexOf(left) - BODY_PART_DISPLAY_PRIORITY.indexOf(right)
  }),
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
    await Promise.all([loadBodyPartDayCounts(), loadTrainingCalendar()])
  } catch (error: unknown) {
    deleteError.value = error instanceof Error ? error.message : '删除记录失败'
  } finally {
    isDeleting.value = false
  }
}

onMounted(() => {
  void loadTodaySets()
  void loadBodyPartDayCounts()
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
        </div>
      </div>

      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <h3>还没有训练数据</h3>
        <p>完成第一次训练后，这里会显示最近 7 天各肌束的加权训练组数。</p>
      </div>
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

    <button class="add-set-button" type="button" aria-label="添加一组" @click="addSetDialog?.open()">
      +
    </button>

    <AddSetDialog ref="addSetDialog" @saved="refreshAfterSetAdded" />

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
  background: #f4f6f0;
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

button {
  font: inherit;
}

.home-shell {
  width: min(100%, 680px);
  min-height: 100vh;
  margin: 0 auto;
  padding: 28px 20px calc(120px + env(safe-area-inset-bottom));
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

.training-calendar-section h2 {
  margin: 0 0 12px;
  font-size: 1.25rem;
  letter-spacing: -0.025em;
}

.training-calendar-card {
  padding: 18px;
  border: 1px solid #e0e5dc;
  border-radius: 24px;
  background: #fff;
  color: #17211a;
  box-shadow: 0 8px 24px rgb(24 63 43 / 6%);
}

.calendar-weekdays,
.calendar-grid {
  display: grid;
  margin: 0;
  padding: 0;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
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
  background: #f4f6f0;
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
  margin-top: 34px;
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
  border: 1px solid #e0e5dc;
  border-radius: 18px;
  background: #fff;
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

.empty-state {
  margin-top: 16px;
  padding: 32px 24px;
  border: 1px dashed #c8d1c5;
  border-radius: 20px;
  background: rgb(255 255 255 / 54%);
  text-align: center;
}

.empty-icon {
  display: flex;
  width: 64px;
  height: 64px;
  margin: 0 auto 18px;
  align-items: end;
  justify-content: center;
  gap: 5px;
  padding: 14px;
  border-radius: 18px;
  background: #e5eddf;
}

.empty-icon span {
  width: 7px;
  border-radius: 4px 4px 2px 2px;
  background: #66836d;
}

.empty-icon span:nth-child(1) {
  height: 17px;
}

.empty-icon span:nth-child(2) {
  height: 29px;
}

.empty-icon span:nth-child(3) {
  height: 22px;
}

.empty-state h3 {
  margin-bottom: 8px;
  font-size: 1rem;
}

.empty-state p {
  max-width: 370px;
  margin: 0 auto;
  color: #718078;
  font-size: 0.88rem;
  line-height: 1.65;
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
  border: 1px solid #e0e5dc;
  border-radius: 18px;
  background: #fff;
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
  border: 1px solid #e0e5dc;
  border-radius: 18px;
  background: #fff;
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
  border-radius: 18px;
  background: rgb(255 255 255 / 54%);
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
