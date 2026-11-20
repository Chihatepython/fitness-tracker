<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { EXERCISE_NAMES, type TrainingSet } from '@/database'
import type { TodayWorkout } from '@/domain/todayWorkout'
import { formatWeight } from '@/domain/trainingStats'

const props = defineProps<{
  workout: TodayWorkout
  trainingSetCount: number
  isLoading: boolean
  error: string
  deleteMode: boolean
  planWarning?: string
}>()

const emit = defineEmits<{
  toggleDeleteMode: []
  requestDelete: [trainingSet: TrainingSet]
  addPlannedSet: [exerciseId: TrainingSet['exerciseId']]
}>()

const expandedExerciseIds = ref(new Set<TrainingSet['exerciseId']>())
const exerciseGroups = computed(() =>
  props.workout.groups.map((group) => {
    const name = EXERCISE_NAMES[group.exerciseId]
    const suffixStart = name.search(/[-－–—（(]/u)

    return {
      ...group,
      name,
      nameMain: suffixStart > 0 ? name.slice(0, suffixStart).trimEnd() : name,
      nameSuffix: suffixStart > 0 ? name.slice(suffixStart) : '',
    }
  }),
)

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
    expandedExerciseIds.value = new Set(
      exerciseGroups.value
        .filter((group) => group.trainingSets.length)
        .map((group) => group.exerciseId),
    )
  },
)

watch(exerciseGroups, (groups) => {
  const availableExerciseIds = new Set(
    groups.filter((group) => group.trainingSets.length).map((group) => group.exerciseId),
  )
  expandedExerciseIds.value = new Set(
    [...expandedExerciseIds.value].filter((exerciseId) => availableExerciseIds.has(exerciseId)),
  )
})
</script>

<template>
  <section class="dashboard-section" aria-labelledby="today-title">
    <header class="dashboard-section-heading">
      <h2 id="today-title">训练明细</h2>
    </header>

    <div class="dashboard-card">
      <div v-if="!isLoading" class="today-heading-actions">
        <div class="today-counts">
          <span class="training-count"
            >已训练 <b>{{ trainingSetCount }}</b> 组</span
          >
          <span v-if="workout.hasPlan" class="training-count plan-progress">
            计划内 <b>{{ workout.completedCount }}</b> / {{ workout.plannedCount }} 组
          </span>
        </div>
        <button
          v-if="trainingSetCount"
          class="delete-mode-button"
          type="button"
          :aria-label="deleteMode ? '关闭删除模式' : '开启删除模式'"
          :aria-pressed="deleteMode"
          @click="emit('toggleDeleteMode')"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <p v-if="planWarning" class="today-plan-warning" role="status">{{ planWarning }}</p>
      <p v-if="isLoading" class="records-status">正在读取记录…</p>
      <p v-else-if="error" class="records-status records-error" role="alert">
        {{ error }}
      </p>
      <ul v-else-if="exerciseGroups.length" class="record-list">
        <li v-for="group in exerciseGroups" :key="group.exerciseId" class="exercise-group">
          <div class="exercise-summary">
            <span class="exercise-copy">
              <span v-if="group.planned" class="training-count exercise-set-count plan-progress">
                <b>{{ Math.min(group.trainingSets.length, group.planned) }}</b> /
                {{ group.planned }} 组
                <span v-if="group.trainingSets.length > group.planned" class="extra-label">
                  · 加练 {{ group.trainingSets.length - group.planned }}
                </span>
              </span>
              <span v-else class="training-count exercise-set-count">
                <b>{{ group.trainingSets.length }}</b> 组
                <span v-if="workout.hasPlan" class="extra-label">· 计划外</span>
              </span>
              <strong class="exercise-name"
                >{{ group.nameMain }}<br v-if="group.nameSuffix" />{{ group.nameSuffix }}</strong
              >
            </span>

            <button
              v-if="group.trainingSets.length"
              class="exercise-toggle"
              type="button"
              :aria-label="`${isGroupExpanded(group.exerciseId) ? '收起' : '展开'}${group.name}训练组详情`"
              :aria-expanded="isGroupExpanded(group.exerciseId)"
              :aria-controls="`exercise-details-${group.exerciseId}`"
              @click="toggleGroup(group.exerciseId)"
            ></button>

            <span
              class="set-sequence"
              @click="group.trainingSets.length && toggleGroup(group.exerciseId)"
            >
              <span
                v-for="(trainingSet, index) in group.trainingSets"
                :key="trainingSet.id"
                class="set-stack"
                :class="{ 'set-stack--extra': workout.hasPlan && index >= group.planned }"
                :aria-label="`${formatWeight(trainingSet.weightKg)}公斤，${trainingSet.reps}次`"
              >
                <b>{{ formatWeight(trainingSet.weightKg) }}</b>
                <small>{{ trainingSet.reps }}</small>
              </span>
              <button
                v-for="slot in Math.max(0, group.planned - group.trainingSets.length)"
                :key="`pending-${slot}`"
                class="set-stack set-stack--pending"
                type="button"
                :aria-label="`记录${group.name}计划第${group.trainingSets.length + slot}组`"
                @click.stop="emit('addPlannedSet', group.exerciseId)"
              >
                ＋
              </button>
            </span>
          </div>

          <div
            v-if="group.trainingSets.length"
            v-show="isGroupExpanded(group.exerciseId)"
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
    </div>
  </section>
</template>

<style scoped>
.today-heading-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.today-counts {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.today-plan-warning {
  margin: 8px 0 0;
  font-size: var(--text-caption);
}

.delete-mode-button {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  padding: 0 0 2px;
  border: 1px solid #d5ddd1;
  border-radius: var(--radius-circle);
  background: #fff;
  font-size: var(--text-title);
  line-height: 1;
  cursor: pointer;
}

.delete-mode-button[aria-pressed='true'] {
  border-color: #e3a8a8;
  background: #fde8e8;
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
  border-radius: var(--radius-card);
  background: #f7f9f5;
  text-align: center;
}

.record-list {
  display: grid;
  gap: 8px;
  margin-bottom: 0;
  padding: 0;
  list-style: none;
}

.exercise-group {
  min-width: 0;
  overflow: hidden;
  border: 1px solid #e4e9e1;
  border-radius: var(--radius-card);
  background: #f7f9f5;
}

.exercise-summary {
  position: relative;
  display: grid;
  width: 100%;
  min-height: 72px;
  grid-template-columns: minmax(126px, 0.9fr) minmax(0, 1.35fr);
  align-items: center;
  gap: 6px;
  padding: 9px 12px;
  border: 0;
  background: transparent;
  text-align: left;
  font: inherit;
}

.exercise-toggle {
  position: absolute;
  inset: 0;
  width: 100%;
  padding: 0;
  border: 0;
  border-radius: inherit;
  background: transparent;
  cursor: pointer;
}

.exercise-toggle:focus-visible {
  outline: 3px solid rgb(70 99 77 / 25%);
  outline-offset: -4px;
}

.exercise-toggle ~ .set-sequence {
  cursor: pointer;
}

.exercise-copy {
  display: flex;
  min-width: 0;
  align-self: stretch;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
}

.exercise-name {
  font-size: var(--text-body);
  line-height: 1.25;
}

.exercise-set-count {
  line-height: 1.15;
}

.set-sequence {
  position: relative;
  z-index: 1;
  display: flex;
  min-width: 0;
  justify-content: flex-end;
  justify-content: safe flex-end;
  gap: 5px;
  overflow-x: auto;
  font-variant-numeric: tabular-nums;
  scrollbar-width: none;
}

.set-sequence::-webkit-scrollbar {
  display: none;
}

.set-stack {
  display: grid;
  width: auto;
  min-width: 31px;
  flex: 0 0 auto;
  place-items: center;
  gap: 2px;
  padding: 4px 3px;
  border-radius: var(--radius-sm);
  background: #e9f0e5;
}

.set-stack--extra {
  background: #f5ebdb;
}

.set-stack--pending {
  min-height: 44px;
  border: 1px dashed #8ca7c3;
  background: #e3ecf7;
  font-size: var(--text-control);
  font-weight: 800;
  cursor: pointer;
}

.set-stack b {
  font-size: var(--text-body);
  font-weight: 800;
  white-space: nowrap;
}

.set-stack small {
  width: 100%;
  padding-top: 2px;
  border-top: 1px solid #d9e2d4;
  font-size: var(--text-caption);
  font-weight: 700;
  text-align: center;
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
  font-size: var(--text-body);
}

.set-detail-row.has-delete-action {
  grid-template-columns: 52px 1fr 55px 34px;
}

.set-detail-row strong {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.rir-value {
  min-width: 46px;
}

.delete-record-button {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  padding: 0;
  border: 1px solid #ecc5c5;
  border-radius: var(--radius-sm);
  background: #fff1f1;
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
  border-radius: var(--radius-card);
  background: #f7f9f5;
  text-align: center;
}

.records-empty h3 {
  margin-bottom: 7px;
  font-size: var(--text-body);
}

.records-empty p {
  margin-bottom: 0;
  font-size: var(--text-body);
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

  .exercise-toggle {
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
