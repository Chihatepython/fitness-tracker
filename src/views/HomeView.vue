<script setup lang="ts">
import { computed, ref } from 'vue'

import AddSetDialog from '@/components/AddSetDialog.vue'
import DeleteSetDialog from '@/components/DeleteSetDialog.vue'
import MuscleVolumeCard from '@/components/MuscleVolumeCard.vue'
import TodayRecordsCard from '@/components/TodayRecordsCard.vue'
import TrainingCalendarCard from '@/components/TrainingCalendarCard.vue'
import { useTrainingDashboard } from '@/composables/useTrainingDashboard'
import { type TrainingSet } from '@/database'

const DELETE_MODE_KEY = 'fitness-tracker:delete-mode'

const addSetDialog = ref<InstanceType<typeof AddSetDialog>>()
const importFileInput = ref<HTMLInputElement>()
const deleteMode = ref(localStorage.getItem(DELETE_MODE_KEY) === 'true')
const pendingDeleteSet = ref<TrainingSet>()
const isCheckingUpdate = ref(false)
const isUpdateAvailable = ref(false)
const updateStatus = ref('')
const updateError = ref('')

const updateButtonLabel = computed(() => {
  if (isUpdateAvailable.value) return '立即更新'
  return isCheckingUpdate.value ? '检查中…' : '检查更新'
})

const {
  todaySets,
  isLoadingTodaySets,
  todaySetsError,
  muscleTrainingTotals,
  muscleTrainingSources,
  muscleTrainingSetCount,
  todayMuscleTrainingTotals,
  todayMuscleTrainingSources,
  muscleLastTrainedHours,
  isLoadingMuscleTrainingTotals,
  muscleTrainingTotalsError,
  selectedMuscleTrainingPeriodIndex,
  muscleTrainingPeriodWeekOffset,
  muscleTrainingPeriodRangeLabel,
  olderMuscleTrainingSnapshot,
  newerMuscleTrainingSnapshot,
  trainingCalendarDays,
  isLoadingTrainingCalendar,
  trainingCalendarError,
  isDeleting,
  deleteError,
  isExporting,
  exportStatus,
  exportError,
  isImporting,
  importStatus,
  importError,
  changeMuscleTrainingPeriod,
  changeMuscleTrainingPeriodWeek,
  refreshAfterSetAdded,
  clearDeleteError,
  removeTrainingSet,
  exportTrainingRecords,
  importTrainingRecords,
} = useTrainingDashboard()

function openImportFilePicker(): void {
  if (isImporting.value || isExporting.value) return

  if (importFileInput.value) {
    importFileInput.value.value = ''
    importFileInput.value.click()
  }
}

async function handleImportFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) return

  await importTrainingRecords(file)
  input.value = ''
}

function getPageAssetUrls(pageDocument: Document, baseUrl: string): string[] {
  return Array.from(
    pageDocument.querySelectorAll<HTMLScriptElement | HTMLLinkElement>(
      'script[type="module"][src], link[rel="stylesheet"][href]',
    ),
  ).map((element) => {
    const assetPath = element.getAttribute(element instanceof HTMLScriptElement ? 'src' : 'href')
    return assetPath ? new URL(assetPath, baseUrl).href : ''
  })
}

async function applyAvailableUpdate(): Promise<void> {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
      await registration?.update()
    } catch (error) {
      console.warn('无法单独更新离线缓存，将直接重新加载页面', error)
    }
  }

  window.location.reload()
}

async function checkForUpdate(): Promise<void> {
  if (isUpdateAvailable.value) {
    await applyAvailableUpdate()
    return
  }

  isCheckingUpdate.value = true
  updateStatus.value = ''
  updateError.value = ''

  try {
    const latestPageUrl = new URL(import.meta.env.BASE_URL, window.location.origin)
    latestPageUrl.searchParams.set('update-check', Date.now().toString())

    const response = await fetch(latestPageUrl, {
      cache: 'no-store',
      headers: { Accept: 'text/html' },
    })

    if (!response.ok) throw new Error(`更新检查失败（${response.status}）`)

    const latestPageDocument = new DOMParser().parseFromString(await response.text(), 'text/html')
    const currentAssets = getPageAssetUrls(document, window.location.href)
    const latestAssets = getPageAssetUrls(latestPageDocument, latestPageUrl.href)

    if (!latestAssets.length) throw new Error('没有读取到最新版本信息')

    isUpdateAvailable.value = currentAssets.join('|') !== latestAssets.join('|')
    updateStatus.value = isUpdateAvailable.value
      ? '发现新版本，点击“立即更新”完成更新'
      : '已是最新版本'
  } catch (error) {
    updateError.value = error instanceof Error ? error.message : '检查更新失败，请确认网络连接'
  } finally {
    isCheckingUpdate.value = false
  }
}

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
      :today-sources="todayMuscleTrainingSources"
      :last-trained-hours="muscleLastTrainedHours"
      :training-set-count="muscleTrainingSetCount"
      :period-index="selectedMuscleTrainingPeriodIndex"
      :week-offset="muscleTrainingPeriodWeekOffset"
      :date-range="muscleTrainingPeriodRangeLabel"
      :older-snapshot="olderMuscleTrainingSnapshot"
      :newer-snapshot="newerMuscleTrainingSnapshot"
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

    <section class="export-section" aria-label="数据导入与导出">
      <button
        class="export-button"
        type="button"
        :disabled="isExporting || isImporting"
        @click="exportTrainingRecords"
      >
        {{ isExporting ? '导出中…' : '导出 JSON' }}
      </button>
      <p v-if="exportStatus" class="export-status" role="status">{{ exportStatus }}</p>
      <p v-if="exportError" class="export-error" role="alert">{{ exportError }}</p>

      <button
        class="export-button import-button"
        type="button"
        :disabled="isImporting || isExporting"
        @click="openImportFilePicker"
      >
        {{ isImporting ? '导入中…' : '导入 JSON' }}
      </button>
      <input
        ref="importFileInput"
        class="import-file-input"
        type="file"
        accept=".json,application/json"
        @change="handleImportFileChange"
      />
      <p v-if="importStatus" class="export-status" role="status">{{ importStatus }}</p>
      <p v-if="importError" class="export-error" role="alert">{{ importError }}</p>

      <button
        class="export-button update-button"
        type="button"
        :disabled="isCheckingUpdate || isImporting || isExporting"
        @click="checkForUpdate"
      >
        {{ updateButtonLabel }}
      </button>
      <p v-if="updateStatus" class="export-status" role="status">{{ updateStatus }}</p>
      <p v-if="updateError" class="export-error" role="alert">{{ updateError }}</p>
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

.import-button {
  margin-top: 10px;
}

.update-button {
  margin-top: 10px;
}

.import-file-input {
  display: none;
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
