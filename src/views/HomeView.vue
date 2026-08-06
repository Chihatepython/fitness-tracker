<script setup lang="ts">
import { ref } from 'vue'

import AddSetDialog from '@/components/AddSetDialog.vue'
import DeleteSetDialog from '@/components/DeleteSetDialog.vue'
import MuscleVolumeCard from '@/components/MuscleVolumeCard.vue'
import TodayRecordsCard from '@/components/TodayRecordsCard.vue'
import TrainingCalendarCard from '@/components/TrainingCalendarCard.vue'
import { useTrainingDashboard } from '@/composables/useTrainingDashboard'
import { type TrainingSet } from '@/database'

const DELETE_MODE_KEY = 'fitness-tracker:delete-mode'

const addSetDialog = ref<InstanceType<typeof AddSetDialog>>()
const deleteMode = ref(localStorage.getItem(DELETE_MODE_KEY) === 'true')
const pendingDeleteSet = ref<TrainingSet>()

const {
  todaySets,
  isLoadingTodaySets,
  todaySetsError,
  muscleTrainingTotals,
  muscleTrainingSources,
  muscleTrainingSetCount,
  todayMuscleTrainingTotals,
  isLoadingMuscleTrainingTotals,
  muscleTrainingTotalsError,
  selectedMuscleTrainingPeriodIndex,
  muscleTrainingPeriodWeekOffset,
  muscleTrainingPeriodRangeLabel,
  trainingCalendarDays,
  isLoadingTrainingCalendar,
  trainingCalendarError,
  isDeleting,
  deleteError,
  isExporting,
  exportStatus,
  exportError,
  changeMuscleTrainingPeriod,
  changeMuscleTrainingPeriodWeek,
  refreshAfterSetAdded,
  clearDeleteError,
  removeTrainingSet,
  exportTrainingRecords,
} = useTrainingDashboard()

function toggleDeleteMode(): void {
  deleteMode.value = !deleteMode.value
  localStorage.setItem(DELETE_MODE_KEY, String(deleteMode.value))
}

function requestDelete(trainingSet: TrainingSet): void {
  pendingDeleteSet.value = trainingSet
  clearDeleteError()
}

function closeDeleteDialog(): void {
  if (isDeleting.value) return

  pendingDeleteSet.value = undefined
  clearDeleteError()
}

async function confirmDelete(): Promise<void> {
  if (!pendingDeleteSet.value) return

  const wasDeleted = await removeTrainingSet(pendingDeleteSet.value.id)

  if (wasDeleted) pendingDeleteSet.value = undefined
}
</script>

<template>
  <main class="home-shell">
    <TrainingCalendarCard
      :days="trainingCalendarDays"
      :is-loading="isLoadingTrainingCalendar"
      :error="trainingCalendarError"
    />

    <MuscleVolumeCard
      :totals="muscleTrainingTotals"
      :sources="muscleTrainingSources"
      :today-totals="todayMuscleTrainingTotals"
      :training-set-count="muscleTrainingSetCount"
      :period-index="selectedMuscleTrainingPeriodIndex"
      :week-offset="muscleTrainingPeriodWeekOffset"
      :date-range="muscleTrainingPeriodRangeLabel"
      :is-loading="isLoadingMuscleTrainingTotals"
      :is-loading-today="isLoadingTodaySets"
      :error="muscleTrainingTotalsError"
      @change-period="changeMuscleTrainingPeriod"
      @change-week="changeMuscleTrainingPeriodWeek"
    />

    <TodayRecordsCard
      :training-sets="todaySets"
      :is-loading="isLoadingTodaySets"
      :error="todaySetsError"
      :delete-mode="deleteMode"
      @toggle-delete-mode="toggleDeleteMode"
      @request-delete="requestDelete"
    />

    <section class="export-section" aria-label="数据导出">
      <button
        class="export-button"
        type="button"
        :disabled="isExporting"
        @click="exportTrainingRecords"
      >
        {{ isExporting ? '导出中…' : '导出 JSON' }}
      </button>
      <p v-if="exportStatus" class="export-status" role="status">{{ exportStatus }}</p>
      <p v-if="exportError" class="export-error" role="alert">{{ exportError }}</p>
    </section>

    <button class="add-set-button" type="button" aria-label="添加一组" @click="addSetDialog?.open()">
      +
    </button>

    <AddSetDialog ref="addSetDialog" @saved="refreshAfterSetAdded" />

    <DeleteSetDialog
      :training-set="pendingDeleteSet"
      :is-deleting="isDeleting"
      :error="deleteError"
      @cancel="closeDeleteDialog"
      @confirm="confirmDelete"
    />
  </main>
</template>

<style scoped>
.home-shell {
  width: min(100%, 680px);
  min-height: 100vh;
  margin: 0 auto;
  padding: 28px 14px calc(120px + env(safe-area-inset-bottom));
}

.export-section {
  margin-top: 24px;
}

.export-button {
  width: 100%;
  min-height: 48px;
  border: 1px solid #d5ddd1;
  border-radius: 14px;
  background: #fff;
  color: #46634d;
  font-weight: 800;
  cursor: pointer;
}

.export-button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.export-button:focus-visible {
  outline: 3px solid rgb(70 99 77 / 22%);
  outline-offset: 2px;
}

.export-status,
.export-error {
  margin: 10px 2px 0;
  font-size: 0.82rem;
  text-align: center;
}

.export-status {
  color: #46634d;
}

.export-error {
  color: #a52d2d;
}

.add-set-button {
  position: fixed;
  right: max(22px, calc((100vw - 680px) / 2 + 22px));
  bottom: calc(24px + env(safe-area-inset-bottom));
  display: grid;
  width: 58px;
  height: 58px;
  place-items: center;
  padding: 0 0 5px;
  border: 0;
  border-radius: 50%;
  background: #d9f36a;
  color: #18311f;
  box-shadow: 0 12px 28px rgb(31 62 40 / 24%);
  font-size: 2rem;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
}

.add-set-button:hover {
  background: #e3f889;
}

.add-set-button:focus-visible {
  outline: 3px solid #183f2b;
  outline-offset: 3px;
}

@media (min-width: 600px) {
  .home-shell {
    padding-top: 44px;
  }
}
</style>
