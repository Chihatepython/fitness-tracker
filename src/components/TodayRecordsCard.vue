<script setup lang="ts">
import { EXERCISE_NAMES, type TrainingSet } from '@/database'
import { formatWeight } from '@/domain/trainingStats'

defineProps<{
  trainingSets: TrainingSet[]
  isLoading: boolean
  error: string
  deleteMode: boolean
}>()

const emit = defineEmits<{
  toggleDeleteMode: []
  requestDelete: [trainingSet: TrainingSet]
}>()
</script>

<template>
  <section class="dashboard-card spaced-dashboard-card" aria-labelledby="today-title">
    <div class="section-heading">
      <h2 id="today-title">训练明细</h2>
    </div>

    <div v-if="!isLoading" class="today-heading-actions">
      <span class="set-count">已训练 {{ trainingSets.length }} 组</span>
      <button
        v-if="trainingSets.length"
        class="delete-mode-button"
        type="button"
        :aria-label="deleteMode ? '关闭删除模式' : '开启删除模式'"
        :aria-pressed="deleteMode"
        @click="emit('toggleDeleteMode')"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>

    <p v-if="isLoading" class="records-status">正在读取记录…</p>
    <p v-else-if="error" class="records-status records-error" role="alert">
      {{ error }}
    </p>
    <ul v-else-if="trainingSets.length" class="record-list">
      <li
        v-for="trainingSet in trainingSets"
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
          @click="emit('requestDelete', trainingSet)"
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
</template>

<style scoped>
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
  justify-content: space-between;
  margin-top: 8px;
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

.delete-mode-button[aria-pressed='true'] {
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

@media (max-width: 390px) {
  .record-item {
    align-items: flex-start;
    flex-direction: column;
    gap: 7px;
  }
}
</style>
