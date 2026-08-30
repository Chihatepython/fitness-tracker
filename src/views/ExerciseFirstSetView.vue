<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import FirstSetTrendChart from '@/components/FirstSetTrendChart.vue'
import { EXERCISES, getAllTrainingSets, type TrainingSet } from '@/database'
import {
  analyzeFirstSetPerformance,
  FIRST_SET_EXERCISE_IDS,
  isFirstSetExerciseId,
  type FirstSetExerciseId,
} from '@/domain/firstSetPerformance'
import { formatWeight } from '@/domain/trainingStats'

const route = useRoute()
const trainingSets = ref<TrainingSet[]>([])
const isLoading = ref(true)
const loadError = ref('')

const supportedExercises = EXERCISES.filter((exercise) => isFirstSetExerciseId(exercise.id))

const selectedExerciseId = computed<FirstSetExerciseId>(() => {
  const exerciseId = route.params.exerciseId

  return typeof exerciseId === 'string' && isFirstSetExerciseId(exerciseId)
    ? exerciseId
    : FIRST_SET_EXERCISE_IDS[0]
})

const selectedExercise = computed(
  () => supportedExercises.find((exercise) => exercise.id === selectedExerciseId.value)!,
)

const analysis = computed(() =>
  analyzeFirstSetPerformance(trainingSets.value, selectedExerciseId.value),
)

const newestFirstRecords = computed(() => [...analysis.value.records].reverse())

const hasComparableTrend = computed(() => {
  let previousWeight: number | undefined
  let segmentPointCount = 0

  for (const record of analysis.value.validRecords) {
    segmentPointCount = record.mainWeightKg === previousWeight ? segmentPointCount + 1 : 1
    previousWeight = record.mainWeightKg

    if (segmentPointCount >= 4) return true
  }

  return false
})

function formatDisplayDate(date: string): string {
  const [, month, day] = date.split('-')

  return `${Number(month)}月${Number(day)}日`
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
  <main class="first-set-shell">
    <header class="first-set-page-header">
      <RouterLink class="first-set-back" to="/performance" aria-label="返回训练表现">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </RouterLink>
      <div>
        <span>训练表现</span>
        <h1>首组表现</h1>
      </div>
    </header>

    <nav class="exercise-selector" aria-label="选择动作">
      <RouterLink
        v-for="exercise in supportedExercises"
        :key="exercise.id"
        :to="{ name: 'exercise-first-set', params: { exerciseId: exercise.id } }"
        :aria-current="selectedExerciseId === exercise.id ? 'page' : undefined"
      >
        {{ exercise.name === '蝴蝶机反向飞鸟' ? '反向飞鸟' : exercise.name }}
      </RouterLink>
    </nav>

    <p v-if="loadError" class="first-set-error" role="alert">{{ loadError }}</p>
    <p v-else-if="isLoading" class="first-set-state" role="status">正在读取训练记录…</p>

    <template v-else>
      <section class="dashboard-card first-set-analysis-card" aria-labelledby="trend-title">
        <header class="first-set-analysis-heading">
          <div>
            <p>主力重量首组次数</p>
            <h2 id="trend-title">{{ selectedExercise.name }}</h2>
          </div>
          <span>{{ analysis.validRecords.length }} 个有效点</span>
        </header>

        <p v-if="!analysis.validRecords.length" class="first-set-state">
          暂时没有符合条件的训练记录
        </p>
        <template v-else>
          <FirstSetTrendChart :records="analysis.validRecords" />
          <p v-if="!hasComparableTrend" class="trend-note">
            同一重量还不足 4 个点，暂时只显示散点，不判断趋势。
          </p>
        </template>
      </section>

      <section class="dashboard-card first-set-record-card" aria-labelledby="record-title">
        <header class="first-set-record-heading">
          <h2 id="record-title">训练记录</h2>
          <span>全部记录</span>
        </header>

        <p v-if="!newestFirstRecords.length" class="first-set-state">这个动作还没有训练记录</p>
        <div v-else class="first-set-table-scroll">
          <table class="first-set-table">
            <thead>
              <tr>
                <th scope="col">日期</th>
                <th scope="col">主力组</th>
                <th scope="col">RIR</th>
                <th scope="col">前置</th>
                <th scope="col">状态</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="record in newestFirstRecords" :key="record.date">
                <td>{{ formatDisplayDate(record.date) }}</td>
                <td class="main-set-value">
                  {{ formatWeight(record.mainWeightKg) }}kg × {{ record.reps }}
                </td>
                <td>{{ record.rir }}</td>
                <td>
                  {{ record.priorSetCount === undefined ? '—' : `${record.priorSetCount}组` }}
                </td>
                <td :class="record.isValid ? 'valid-status' : 'invalid-status'">
                  {{ record.isValid ? '有效' : record.invalidReason }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.first-set-shell {
  width: min(100%, 680px);
  min-height: 100vh;
  margin: 0 auto;
  padding: 20px 14px calc(48px + env(safe-area-inset-bottom));
}

.first-set-page-header {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  min-height: 52px;
  align-items: center;
}

.first-set-page-header span {
  color: #7a867d;
  font-size: 0.72rem;
  font-weight: 700;
}

.first-set-page-header h1 {
  margin: 1px 0 0;
  font-size: 1.35rem;
  letter-spacing: -0.03em;
}

.first-set-back {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  color: #46634d;
}

.first-set-back svg {
  width: 30px;
  height: 30px;
  fill: none;
  stroke: currentcolor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.exercise-selector {
  display: flex;
  gap: 7px;
  margin: 14px 0;
  padding-bottom: 4px;
  overflow-x: auto;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
}

.exercise-selector::-webkit-scrollbar {
  display: none;
}

.exercise-selector a {
  min-height: 36px;
  flex: 0 0 auto;
  padding: 0 13px;
  border: 1px solid #d5ddd2;
  border-radius: 999px;
  background: #f7f9f5;
  color: #738078;
  font-size: 0.78rem;
  font-weight: 800;
  line-height: 34px;
  text-decoration: none;
  white-space: nowrap;
}

.exercise-selector a[aria-current='page'] {
  border-color: #9db4a2;
  background: #e4eee1;
  color: #315941;
}

.first-set-analysis-card,
.first-set-record-card {
  overflow: hidden;
}

.first-set-record-card {
  margin-top: 24px;
}

.first-set-analysis-heading,
.first-set-record-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.first-set-analysis-heading p {
  margin: 0 0 3px;
  color: #7a867d;
  font-size: 0.72rem;
  font-weight: 700;
}

.first-set-analysis-heading h2,
.first-set-record-heading h2 {
  margin: 0;
  font-size: 1.15rem;
  letter-spacing: -0.025em;
}

.first-set-analysis-heading > span {
  padding: 5px 9px;
  border-radius: 999px;
  background: #e8f1e4;
  color: #42634b;
  font-size: 0.72rem;
  font-weight: 800;
  white-space: nowrap;
}

.first-set-record-heading {
  align-items: center;
}

.first-set-record-heading > span {
  color: #879188;
  font-size: 0.72rem;
  font-weight: 700;
}

.trend-note {
  margin: 4px 0 0;
  color: #7a867d;
  font-size: 0.72rem;
  text-align: center;
}

.first-set-table-scroll {
  margin: 0 -14px -14px;
  overflow-x: auto;
}

.first-set-table {
  width: 100%;
  min-width: 520px;
  border-collapse: collapse;
}

.first-set-table th,
.first-set-table td {
  padding: 10px 9px;
  border-top: 1px solid #e5eae3;
  font-size: 0.75rem;
  text-align: left;
  white-space: nowrap;
}

.first-set-table th {
  background: #f0f4ed;
  color: #69776e;
  font-weight: 800;
}

.first-set-table th:first-child,
.first-set-table td:first-child {
  padding-left: 14px;
}

.first-set-table th:last-child,
.first-set-table td:last-child {
  padding-right: 14px;
}

.first-set-table td {
  color: #526057;
  font-weight: 650;
}

.first-set-table .main-set-value {
  color: #294c36;
  font-weight: 850;
}

.valid-status {
  color: #3d7149 !important;
}

.invalid-status {
  color: #9a6449 !important;
}

.first-set-state {
  margin: 0;
  padding: 42px 16px;
  border: 1px dashed #d5ddd1;
  border-radius: 14px;
  color: #7a867d;
  font-size: 0.85rem;
  text-align: center;
}

.first-set-error {
  margin: 0;
  padding: 20px 12px;
  color: #a52d2d;
  font-size: 0.85rem;
  text-align: center;
}

@media (min-width: 600px) {
  .first-set-shell {
    padding-top: 36px;
  }
}
</style>
