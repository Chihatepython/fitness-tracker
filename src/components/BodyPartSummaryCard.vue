<script setup lang="ts">
import { computed } from 'vue'

import { type BodyPart } from '@/database'
import { BODY_PART_DISPLAY_PRIORITY, TRAINING_PERIODS } from '@/domain/trainingStats'

const props = defineProps<{
  counts: Record<BodyPart, number>
  periodIndex: number
  dateRange: string
  isLoading: boolean
  error: string
}>()

const emit = defineEmits<{
  changePeriod: [periodIndex: number]
}>()

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
        <span class="date-range">{{ dateRange }}</span>
      </div>
      <select
        class="period-select"
        :value="periodIndex"
        :disabled="isLoading"
        aria-label="选择统计周期"
        @change="handlePeriodChange"
      >
        <option v-for="(period, index) in TRAINING_PERIODS" :key="period.dayCount" :value="index">
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
