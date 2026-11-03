<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { EXERCISE_NAMES, type TrainingSet } from '@/database'
import { formatWeight } from '@/domain/trainingStats'

const props = defineProps<{
  trainingSets: TrainingSet[]
  isLoading: boolean
  error: string
  deleteMode: boolean
}>()

const emit = defineEmits<{
  toggleDeleteMode: []
  requestDelete: [trainingSet: TrainingSet]
}>()

interface ExerciseGroup {
  exerciseId: TrainingSet['exerciseId']
  trainingSets: TrainingSet[]
}

const expandedExerciseIds = ref(new Set<TrainingSet['exerciseId']>())

const exerciseGroups = computed<ExerciseGroup[]>(() => {
  const groups = new Map<TrainingSet['exerciseId'], ExerciseGroup>()

  for (const trainingSet of props.trainingSets) {
    const existingGroup = groups.get(trainingSet.exerciseId)
    if (existingGroup) {
      existingGroup.trainingSets.push(trainingSet)
      continue
    }

    groups.set(trainingSet.exerciseId, {
      exerciseId: trainingSet.exerciseId,
      trainingSets: [trainingSet],
    })
  }

  return [...groups.values()]
})

function isGroupExpanded(exerciseId: TrainingSet['exerciseId']): boolean {
  return expandedExerciseIds.value.has(exerciseId)
}

function toggleGroup(exerciseId: TrainingSet['exerciseId']): void {
  const nextExpandedExerciseIds = new Set(expandedExerciseIds.value)

  if (nextExpandedExerciseIds.has(exerciseId)) {
    nextExpandedExerciseIds.delete(exerciseId)
  } else {
    nextExpandedExerciseIds.add(exerciseId)
  }

  expandedExerciseIds.value = nextExpandedExerciseIds
}

watch(
  () => props.deleteMode,
  (deleteMode) => {
    if (!deleteMode) return
    expandedExerciseIds.value = new Set(exerciseGroups.value.map((group) => group.exerciseId))
  },
)

watch(exerciseGroups, (groups) => {
  const availableExerciseIds = new Set(groups.map((group) => group.exerciseId))
  expandedExerciseIds.value = new Set(
    [...expandedExerciseIds.value].filter((exerciseId) => availableExerciseIds.has(exerciseId)),
  )
})
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
      <li v-for="group in exerciseGroups" :key="group.exerciseId" class="exercise-group">
        <button
          class="exercise-summary"
          type="button"
          :aria-expanded="isGroupExpanded(group.exerciseId)"
          :aria-controls="`exercise-details-${group.exerciseId}`"
          @click="toggleGroup(group.exerciseId)"
        >
          <span class="exercise-copy">
            <span class="exercise-set-count">{{ group.trainingSets.length }}组</span>
            <strong>{{ EXERCISE_NAMES[group.exerciseId] }}</strong>
          </span>

          <span class="set-sequence">
            <span
              v-for="trainingSet in group.trainingSets"
              :key="trainingSet.id"
              class="set-stack"
              :aria-label="`${formatWeight(trainingSet.weightKg)}公斤，${trainingSet.reps}次`"
            >
              <b>{{ formatWeight(trainingSet.weightKg) }}</b>
              <small>{{ trainingSet.reps }}</small>
            </span>
          </span>

          <svg
            class="summary-chevron"
            :class="{ 'is-expanded': isGroupExpanded(group.exerciseId) }"
            aria-hidden="true"
            viewBox="0 0 24 24"
          >
            <path d="m7 10 5 5 5-5" />
          </svg>
        </button>

        <div
          v-if="isGroupExpanded(group.exerciseId)"
          :id="`exercise-details-${group.exerciseId}`"
          class="set-details"
        >
          <div
            v-for="(trainingSet, trainingSetIndex) in group.trainingSets"
            :key="trainingSet.id"
            class="set-detail-row"
            :class="{ 'has-delete-action': deleteMode }"
          >
            <span>第 {{ trainingSetIndex + 1 }} 组</span>
            <strong>{{ formatWeight(trainingSet.weightKg) }} kg × {{ trainingSet.reps }}</strong>
            <span class="rir-value">RIR {{ trainingSet.rir }}</span>
            <button
              v-if="deleteMode"
              class="delete-record-button"
              type="button"
              :aria-label="`删除${EXERCISE_NAMES[trainingSet.exerciseId]}第${trainingSetIndex + 1}组`"
              @click="emit('requestDelete', trainingSet)"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />
              </svg>
            </button>
          </div>
        </div>
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

.exercise-group + .exercise-group {
  border-top: 1px solid #edf0ea;
}

.exercise-summary {
  display: grid;
  width: 100%;
  min-height: 72px;
  grid-template-columns: minmax(126px, 0.9fr) minmax(0, 1.35fr) 14px;
  align-items: center;
  gap: 6px;
  padding: 9px 12px;
  border: 0;
  background: transparent;
  color: #17211a;
  text-align: left;
  font: inherit;
  cursor: pointer;
}

.exercise-copy {
  display: flex;
  min-width: 0;
  align-self: stretch;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 3px;
}

.exercise-copy strong {
  font-size: 0.92rem;
  line-height: 1.25;
}

.exercise-set-count {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 999px;
  background: #edf3e9;
  color: #526b57;
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1.15;
  white-space: nowrap;
}

.set-sequence {
  display: flex;
  min-width: 0;
  justify-content: flex-end;
  gap: 5px;
  overflow-x: auto;
  color: #46634d;
  font-variant-numeric: tabular-nums;
  scrollbar-width: none;
}

.set-sequence::-webkit-scrollbar {
  display: none;
}

.set-stack {
  display: grid;
  width: 31px;
  min-width: 31px;
  place-items: center;
  gap: 2px;
  padding: 4px 3px;
  border-radius: 8px;
  background: #e9f0e5;
}

.set-stack b {
  font-size: 0.86rem;
  font-weight: 800;
}

.set-stack small {
  width: 100%;
  padding-top: 2px;
  border-top: 1px solid #d9e2d4;
  color: #26352c;
  font-size: 0.75rem;
  font-weight: 700;
  text-align: center;
}

.summary-chevron {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: #718078;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
  transition: transform 160ms ease;
}

.summary-chevron.is-expanded {
  transform: rotate(180deg);
}

.exercise-summary:focus-visible {
  outline: 3px solid rgb(70 99 77 / 20%);
  outline-offset: -3px;
}

.set-details {
  padding: 0 12px 10px 18px;
  background: #fff;
}

.set-detail-row {
  display: grid;
  min-height: 42px;
  grid-template-columns: 52px 1fr 55px;
  align-items: center;
  gap: 6px;
  border-top: 1px solid #edf0ea;
  color: #718078;
  font-size: 0.8rem;
}

.set-detail-row.has-delete-action {
  grid-template-columns: 52px 1fr 55px 34px;
}

.set-detail-row strong {
  color: #26352c;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.rir-value {
  min-width: 46px;
  color: #718078;
}

.delete-record-button {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  padding: 0;
  border: 1px solid #ecc5c5;
  border-radius: 9px;
  background: #fff1f1;
  color: #ad3535;
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
  .exercise-summary {
    grid-template-columns: 1fr 14px;
  }

  .set-sequence {
    grid-column: 1 / -1;
    grid-row: 2;
    justify-content: flex-start;
  }

  .summary-chevron {
    grid-column: 2;
    grid-row: 1;
  }

  .set-detail-row {
    grid-template-columns: 48px 1fr 50px;
  }

  .set-detail-row.has-delete-action {
    grid-template-columns: 48px 1fr 50px 32px;
  }
}
</style>
