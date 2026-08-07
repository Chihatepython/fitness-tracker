<script setup lang="ts">
import { computed, ref } from 'vue'

import MuscleSourceDialog from '@/components/MuscleSourceDialog.vue'
import MuscleTableSettingsDialog from '@/components/MuscleTableSettingsDialog.vue'
import {
  MUSCLE_GROUPS,
  TRAINING_PERIODS,
  formatWeightedSetCount,
  type MuscleName,
  type MuscleTrainingSources,
} from '@/domain/trainingStats'

const SHOW_TODAY_COLUMN_KEY = 'fitness-tracker:show-today-muscle-column'

const props = defineProps<{
  totals: Record<MuscleName, number>
  sources: MuscleTrainingSources
  todayTotals: Record<MuscleName, number>
  trainingSetCount: number
  periodIndex: number
  weekOffset: number
  dateRange: string
  isLoading: boolean
  isLoadingToday: boolean
  error: string
}>()

const emit = defineEmits<{
  changePeriod: [periodIndex: number]
  changeWeek: [weekDelta: number]
}>()

const selectedMuscle = ref<MuscleName>()
const isTableSettingsOpen = ref(false)
const showTodayColumn = ref(localStorage.getItem(SHOW_TODAY_COLUMN_KEY) === 'true')
const selectedPeriod = computed(() => TRAINING_PERIODS[props.periodIndex]!)
const visibleMuscleGroups = computed(() =>
  MUSCLE_GROUPS.map((group) => ({
    region: group.region,
    muscles: group.muscles.filter((muscle) => props.totals[muscle] > 0),
  })).filter((group) => group.muscles.length > 0),
)
const selectedMuscleSources = computed(() =>
  selectedMuscle.value ? props.sources[selectedMuscle.value] : [],
)
const selectedMuscleTotal = computed(() =>
  selectedMuscle.value ? props.totals[selectedMuscle.value] : 0,
)

function handlePeriodChange(event: Event): void {
  emit('changePeriod', Number((event.target as HTMLSelectElement).value))
}

function toggleTodayColumn(): void {
  showTodayColumn.value = !showTodayColumn.value
  localStorage.setItem(SHOW_TODAY_COLUMN_KEY, String(showTodayColumn.value))
}
</script>

<template>
  <section class="dashboard-card spaced-dashboard-card" aria-labelledby="muscle-title">
    <div class="section-heading">
      <div class="muscle-title-row">
        <h2 id="muscle-title">肌束训练量</h2>
      </div>
      <div class="muscle-control-row">
        <span v-if="!isLoading" class="set-count">已训练 {{ trainingSetCount }} 组</span>
        <div class="muscle-control-actions">
          <button
            class="table-settings-button"
            type="button"
            aria-label="打开肌束表格设置"
            @click="isTableSettingsOpen = true"
          >
            <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
              <path
                d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"
              />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <select
            class="period-select"
            :value="periodIndex"
            :disabled="isLoading"
            aria-label="选择肌束训练量统计周期"
            @change="handlePeriodChange"
          >
            <option v-for="(period, index) in TRAINING_PERIODS" :key="period.id" :value="index">
              {{ period.label }}
            </option>
          </select>
        </div>
      </div>
      <div class="period-date-navigation">
        <button
          v-if="selectedPeriod.canNavigateWeeks"
          class="period-arrow-button period-arrow-button--previous"
          type="button"
          :disabled="isLoading"
          aria-label="查看上一个肌束统计周"
          @click="emit('changeWeek', 1)"
        >
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
            <path d="m15 5-7 7 7 7" />
          </svg>
        </button>
        <span class="date-range">{{ dateRange }}</span>
        <button
          v-if="selectedPeriod.canNavigateWeeks"
          class="period-arrow-button period-arrow-button--next"
          type="button"
          :disabled="isLoading || weekOffset === 0"
          aria-label="查看下一个肌束统计周"
          @click="emit('changeWeek', -1)"
        >
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
            <path d="m9 5 7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>

    <div v-if="visibleMuscleGroups.length" class="muscle-table-wrapper">
      <table class="muscle-table" :class="{ 'show-today-column': showTodayColumn }">
        <colgroup>
          <col class="muscle-body-part-column" />
          <col class="muscle-name-column" />
          <col class="muscle-total-column" />
          <col v-if="showTodayColumn" class="muscle-today-column" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">区域</th>
            <th scope="col">细分肌肉</th>
            <th class="muscle-number-heading" scope="col">区间加权</th>
            <th
              v-if="showTodayColumn"
              class="muscle-number-heading"
              scope="col"
            >
              今日新增
            </th>
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
                :disabled="isLoading"
                @click="selectedMuscle = muscle"
              >
                {{ isLoading ? '—' : formatWeightedSetCount(totals[muscle]) }}
              </button>
            </td>
            <td v-if="showTodayColumn" class="muscle-total muscle-today-total">
              {{
                isLoadingToday
                  ? '—'
                  : todayTotals[muscle] > 0
                    ? formatWeightedSetCount(todayTotals[muscle])
                    : ''
              }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else-if="isLoading" class="muscle-table-status">正在计算训练量…</p>
    <p v-else-if="!error" class="muscle-table-status">所选时间段暂无肌束训练量</p>
    <p v-if="error" class="section-error" role="alert">{{ error }}</p>
  </section>

  <MuscleTableSettingsDialog
    :open="isTableSettingsOpen"
    :show-today-column="showTodayColumn"
    @close="isTableSettingsOpen = false"
    @toggle-today-column="toggleTodayColumn"
  />

  <MuscleSourceDialog
    :muscle="selectedMuscle"
    :sources="selectedMuscleSources"
    :total="selectedMuscleTotal"
    :date-range="dateRange"
    @close="selectedMuscle = undefined"
  />
</template>

<style scoped>
.section-heading {
  position: relative;
  display: block;
}

.muscle-title-row,
.muscle-control-row,
.muscle-control-actions {
  display: flex;
  align-items: center;
}

.muscle-title-row {
  justify-content: flex-start;
}

.muscle-control-row {
  min-height: 28px;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
}

.muscle-control-actions {
  flex: 0 0 auto;
  gap: 8px;
}

.set-count {
  padding: 6px 10px;
  border-radius: 999px;
  background: #e5eddf;
  color: #46634d;
  font-size: 0.78rem;
  font-weight: 800;
}

.period-date-navigation {
  position: relative;
  display: grid;
  min-height: 30px;
  grid-template-columns: 30px 150px 30px;
  align-items: center;
  column-gap: 10px;
  justify-content: center;
  margin-top: 6px;
}

.period-date-navigation .date-range {
  grid-column: 2;
  margin-top: 0;
  font-size: 0.88rem;
  text-align: center;
  white-space: nowrap;
}

.period-arrow-button,
.table-settings-button {
  display: grid;
  place-items: center;
  outline: none;
  color: #46634d;
  line-height: 1;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.period-arrow-button {
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  background: transparent;
}

.period-arrow-button svg {
  display: block;
  width: 30px;
  height: 30px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.25;
}

.period-arrow-button--previous {
  grid-column: 1;
}

.period-arrow-button--next {
  grid-column: 3;
}

.period-arrow-button:disabled,
.table-settings-button:disabled {
  cursor: default;
  opacity: 0.35;
}

.table-settings-button {
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  background: transparent;
}

.table-settings-button svg {
  display: block;
  width: 30px;
  height: 30px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.muscle-table-wrapper {
  overflow: hidden;
  margin-top: 8px;
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

.muscle-table.show-today-column .muscle-name-column {
  width: 42%;
}

.muscle-table.show-today-column .muscle-total-column,
.muscle-table.show-today-column .muscle-today-column {
  width: 22%;
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

.muscle-table thead .muscle-number-heading {
  text-align: right;
}

.muscle-table thead th:last-child {
  padding-right: 16px;
}

.muscle-table tbody + tbody tr:first-child > *,
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
  padding-right: 10px;
  padding-left: 6px;
  color: #234a31;
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
  font-weight: 800;
  text-align: right;
}

.muscle-table td.muscle-total:last-child {
  padding-right: 16px;
}

.muscle-table td.muscle-today-total {
  color: #b4423c;
  white-space: nowrap;
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
</style>
