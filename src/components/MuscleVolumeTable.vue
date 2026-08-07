<script setup lang="ts">
import { computed } from 'vue'

import {
  MUSCLE_GROUPS,
  formatWeightedSetCount,
  type MuscleName,
} from '@/domain/trainingStats'

const props = defineProps<{
  totals: Record<MuscleName, number>
  todayTotals: Record<MuscleName, number>
  showTodayColumn: boolean
  isLoading?: boolean
  isLoadingToday: boolean
  error?: string
}>()

const emit = defineEmits<{
  selectMuscle: [muscle: MuscleName]
  toggleTodayColumn: []
}>()

const visibleMuscleGroups = computed(() =>
  MUSCLE_GROUPS.map((group) => ({
    region: group.region,
    muscles: group.muscles.filter((muscle) => props.totals[muscle] > 0),
  })).filter((group) => group.muscles.length > 0),
)
</script>

<template>
  <div class="muscle-table-content">
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
            <th class="muscle-number-heading" scope="col">
              <span v-if="showTodayColumn">区间加权</span>
              <button
                v-else
                class="muscle-column-toggle"
                type="button"
                aria-label="显示今日新增列"
                :aria-expanded="false"
                @click="emit('toggleTodayColumn')"
              >
                <span>区间加权</span>
                <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
                  <path d="m9 5 7 7-7 7" />
                </svg>
              </button>
            </th>
            <th v-if="showTodayColumn" class="muscle-number-heading" scope="col">
              <button
                class="muscle-column-toggle"
                type="button"
                aria-label="隐藏今日新增列"
                :aria-expanded="true"
                @click="emit('toggleTodayColumn')"
              >
                <span>今日新增</span>
                <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
                  <path d="m15 5-7 7 7 7" />
                </svg>
              </button>
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
                @click="emit('selectMuscle', muscle)"
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
  </div>
</template>

<style scoped>
.muscle-table-content {
  padding-top: 8px;
}

.muscle-table-wrapper {
  overflow: hidden;
  border: 1px solid #e4e9e1;
  border-radius: 16px;
  background: #f7f9f5;
}

.muscle-table-status {
  margin: 8px 0 0;
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

.muscle-table.show-today-column .muscle-total-column {
  width: 24%;
}

.muscle-table.show-today-column .muscle-today-column {
  width: 20%;
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
  position: relative;
  text-align: right;
}

.muscle-column-toggle {
  position: relative;
  display: flex;
  width: 100%;
  min-height: 24px;
  align-items: center;
  justify-content: flex-end;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: inherit;
  white-space: nowrap;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.muscle-column-toggle svg {
  position: absolute;
  right: -16px;
  display: block;
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.25;
}

.muscle-column-toggle:focus-visible {
  outline: 2px solid rgb(70 99 77 / 28%);
  outline-offset: 2px;
}

.muscle-table thead th:last-child {
  padding-right: 20px;
  padding-left: 6px;
}

.muscle-table.show-today-column thead .muscle-number-heading:not(:last-child) {
  padding-right: 6px;
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
  right: 20px;
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
  padding-right: 6px;
  padding-left: 6px;
  color: #234a31;
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
  font-weight: 800;
  text-align: right;
}

.muscle-table td.muscle-total:last-child {
  padding-right: 20px;
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
