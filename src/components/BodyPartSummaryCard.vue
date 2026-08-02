<script setup lang="ts">
import { computed } from 'vue'

import { type BodyPart } from '@/database'
import { BODY_PART_DISPLAY_PRIORITY, TRAINING_PERIODS } from '@/domain/trainingStats'

const props = defineProps<{
  counts: Record<BodyPart, number>
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

const selectedPeriod = computed(() => TRAINING_PERIODS[props.periodIndex]!)

const sortedBodyParts = computed(() =>
  [...BODY_PART_DISPLAY_PRIORITY].sort((left, right) => {
    const countDifference = props.counts[right] - props.counts[left]

    return (
      countDifference ||
      BODY_PART_DISPLAY_PRIORITY.indexOf(left) - BODY_PART_DISPLAY_PRIORITY.indexOf(right)
    )
  }),
)

function handlePeriodChange(event: Event): void {
  emit('changePeriod', Number((event.target as HTMLSelectElement).value))
}
</script>

<template>
  <section class="dashboard-card spaced-dashboard-card" aria-labelledby="summary-title">
    <div class="section-heading">
      <div>
        <h2 id="summary-title">主训练部位</h2>
        <div class="period-date-navigation">
          <button
            v-if="selectedPeriod.canNavigateWeeks"
            type="button"
            :disabled="isLoading"
            aria-label="查看上一个统计周"
            @click="emit('changeWeek', 1)"
          >
            ‹
          </button>
          <span class="date-range">{{ dateRange }}</span>
          <button
            v-if="selectedPeriod.canNavigateWeeks"
            type="button"
            :disabled="isLoading || weekOffset === 0"
            aria-label="查看下一个统计周"
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
        aria-label="选择统计周期"
        @change="handlePeriodChange"
      >
        <option v-for="(period, index) in TRAINING_PERIODS" :key="period.id" :value="index">
          {{ period.label }}
        </option>
      </select>
    </div>

    <div class="body-part-list">
      <article v-for="bodyPart in sortedBodyParts" :key="bodyPart" class="body-part-row">
        <span>{{ bodyPart }}</span>
        <strong>{{ isLoading ? '—' : counts[bodyPart] }}</strong>
      </article>
    </div>
    <p v-if="error" class="section-error" role="alert">{{ error }}</p>
  </section>
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
</style>
