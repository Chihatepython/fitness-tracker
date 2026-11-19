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
      <span class="training-count">加权组数</span>
    </header>
    <div class="dashboard-card">
      <p v-if="isLoading" class="muscle-empty" role="status">正在读取记录…</p>
      <p v-else-if="error" class="muscle-empty muscle-error" role="alert">{{ error }}</p>
      <p v-else-if="!rows.length" class="muscle-empty">今天还没有肌束训练量</p>
      <div v-else class="table-frame">
        <table>
          <thead>
            <tr>
              <th scope="col">肌束</th>
              <th scope="col">已完成</th>
              <th scope="col">计划</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.muscle"
              class="muscle-region-colors"
              :data-region="row.region"
            >
              <th scope="row">{{ row.muscle }}</th>
              <td class="completed">
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
              <td class="planned">{{ row.planned ? formatWeightedSetCount(row.planned) : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.table-frame {
  overflow: hidden;
  border: 1px solid #e4e9e1;
  border-radius: var(--radius-card);
  background: #f7f9f5;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-body);
  font-variant-numeric: tabular-nums;
}

thead {
  background: #eef3eb;
  color: #65736b;
  font-size: var(--text-caption);
}

th,
td {
  padding: 8px 10px;
  text-align: right;
}

th:first-child {
  text-align: left;
}

tbody tr {
  border-top: 1px solid var(--muscle-row-divider, #e4e9e1);
  background: var(--muscle-region-fill);
}

tbody th {
  color: #405047;
  font-weight: 600;
}

.completed,
.planned {
  font-weight: 800;
  white-space: nowrap;
}

.completed {
  color: #234a31;
}
.planned {
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
