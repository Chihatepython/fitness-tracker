<script setup lang="ts">
import { computed, ref } from 'vue'

import MuscleSourceDialog from '@/components/MuscleSourceDialog.vue'
import {
  MUSCLE_GROUPS,
  TRAINING_PERIODS,
  formatWeightedSetCount,
  type MuscleName,
  type MuscleTrainingSources,
} from '@/domain/trainingStats'

const props = defineProps<{
  totals: Record<MuscleName, number>
  sources: MuscleTrainingSources
  periodIndex: number
  weekOffset: number
  dateRange: string
  isLoading: boolean
  error: string
}>()

const emit = defineEmits<{
  changePeriod: [periodIndex: number]
  changeWeek: [weekDelta: number]
}>()

const selectedMuscle = ref<MuscleName>()
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
</script>

<template>
  <section class="dashboard-card spaced-dashboard-card" aria-labelledby="muscle-title">
    <div class="section-heading">
      <div>
        <p class="eyebrow">训练分布</p>
        <h2 id="muscle-title">肌束训练量</h2>
        <div class="period-date-navigation">
          <button
            v-if="selectedPeriod.canNavigateWeeks"
            type="button"
            :disabled="isLoading"
            aria-label="查看上一个肌束统计周"
            @click="emit('changeWeek', 1)"
          >
            ‹
          </button>
          <span class="date-range">{{ dateRange }}</span>
          <button
            v-if="selectedPeriod.canNavigateWeeks"
            type="button"
            :disabled="isLoading || weekOffset === 0"
            aria-label="查看下一个肌束统计周"
            @click="emit('changeWeek', -1)"
          >
            ›
          </button>
        </div>
      </div>
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
                :disabled="isLoading"
                @click="selectedMuscle = muscle"
              >
                {{ isLoading ? '—' : formatWeightedSetCount(totals[muscle]) }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else-if="isLoading" class="muscle-table-status">正在计算训练量…</p>
    <p v-else-if="!error" class="muscle-table-status">所选时间段暂无肌束训练量</p>
    <p v-if="error" class="section-error" role="alert">{{ error }}</p>
  </section>

  <MuscleSourceDialog
    :muscle="selectedMuscle"
    :sources="selectedMuscleSources"
    :total="selectedMuscleTotal"
    :date-range="dateRange"
    @close="selectedMuscle = undefined"
  />
</template>

<style scoped>
.period-date-navigation {
  display: flex;
  min-height: 24px;
  align-items: center;
  gap: 5px;
  margin-top: 6px;
}

.period-date-navigation .date-range {
  margin-top: 0;
}

.period-date-navigation button {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  padding: 0 0 2px;
  border: 1px solid #d5ddd1;
  border-radius: 7px;
  outline: none;
  background: #fff;
  color: #46634d;
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.period-date-navigation button:disabled {
  cursor: default;
  opacity: 0.35;
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
</style>
