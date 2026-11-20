<script setup lang="ts">
import { formatWeightedSetCount } from '@/domain/trainingStats'
import type { TodayWorkout } from '@/domain/todayWorkout'

defineProps<{
  rows: TodayWorkout['muscleRows']
  isLoading: boolean
  error: string
}>()
</script>

<template>
  <section class="dashboard-section" aria-labelledby="today-muscle-title">
    <header class="dashboard-section-heading">
      <h2 id="today-muscle-title">今日肌束</h2>
    </header>
    <div class="dashboard-card">
      <p v-if="isLoading" class="muscle-empty" role="status">正在读取记录…</p>
      <p v-else-if="error" class="muscle-empty muscle-error" role="alert">{{ error }}</p>
      <p v-else-if="!rows.length" class="muscle-empty">今天还没有肌束训练量</p>
      <div v-else class="muscle-board-frame">
        <table class="muscle-board-table today-muscle-table" aria-labelledby="today-muscle-title">
          <thead>
            <tr>
              <th scope="col">肌束</th>
              <th scope="col">完成加权</th>
              <th scope="col">计划加权</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.muscle"
              class="muscle-region-colors"
              :data-region="row.region"
            >
              <th scope="row" class="muscle-board-name">{{ row.muscle }}</th>
              <td class="muscle-board-value">
                <span v-if="row.planned || !row.extra">{{
                  formatWeightedSetCount(row.completed)
                }}</span>
                <small
                  v-if="row.extra"
                  class="extra"
                  :aria-label="`额外贡献 ${formatWeightedSetCount(row.extra)} 加权组`"
                >
                  {{ row.planned ? '+' : '' }}{{ formatWeightedSetCount(row.extra) }}
                  <template v-if="!row.planned">计划外</template>
                </small>
              </td>
              <td class="muscle-board-value planned">
                {{ row.planned ? formatWeightedSetCount(row.planned) : '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.today-muscle-table th:first-child {
  text-align: left;
}

.today-muscle-table thead th:not(:first-child) {
  text-align: right;
  white-space: nowrap;
}

tbody tr {
  background: var(--muscle-region-fill);
}

tbody tr + tr {
  border-top: 1px solid var(--muscle-row-divider, #e4e9e1);
}

.today-muscle-table .muscle-board-value {
  white-space: nowrap;
}

.today-muscle-table .planned {
  color: #37597b;
}

.extra {
  margin-inline-start: 3px;
  color: #785831;
  font-size: var(--text-caption);
}

.muscle-empty {
  margin: 0;
  padding: 14px 8px;
  color: #65736b;
  font-size: var(--text-body);
  text-align: center;
}

.muscle-error {
  color: #a32e2e;
}
</style>
