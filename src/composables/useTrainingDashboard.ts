import { computed, onMounted, ref } from 'vue'

import {
  deleteTrainingSet,
  getAllTrainingSets,
  getTrainingSetsByDate,
  getTrainingSetsByDateRange,
  parseTrainingSetImport,
  replaceAllTrainingSets,
  type TrainingSet,
} from '@/database'
import {
  TRAINING_PERIODS,
  buildTrainingCalendarDays,
  calculateMuscleTraining,
  createEmptyMuscleTrainingSources,
  createEmptyMuscleTrainingTotals,
  formatDisplayDate,
  getLocalDate,
  getTrainingCalendarRange,
  getTrainingPeriodDateRange,
  type TrainingCalendarDay,
} from '@/domain/trainingStats'

export function useTrainingDashboard() {
  const todaySets = ref<TrainingSet[]>([])
  const isLoadingTodaySets = ref(true)
  const todaySetsError = ref('')

  const muscleTrainingTotals = ref(createEmptyMuscleTrainingTotals())
  const muscleTrainingSources = ref(createEmptyMuscleTrainingSources())
  const muscleTrainingSetCount = ref(0)
  const isLoadingMuscleTrainingTotals = ref(true)
  const muscleTrainingTotalsError = ref('')
  const selectedMuscleTrainingPeriodIndex = ref(0)
  const muscleTrainingPeriodWeekOffset = ref(0)

  const trainingCalendarRange = getTrainingCalendarRange()
  const trainingCalendarDays = ref<TrainingCalendarDay[]>(
    buildTrainingCalendarDays([], trainingCalendarRange),
  )
  const isLoadingTrainingCalendar = ref(true)
  const trainingCalendarError = ref('')

  const isDeleting = ref(false)
  const deleteError = ref('')
  const isExporting = ref(false)
  const exportStatus = ref('')
  const exportError = ref('')
  const isImporting = ref(false)
  const importStatus = ref('')
  const importError = ref('')

  const selectedMuscleTrainingPeriod = computed(
    () => TRAINING_PERIODS[selectedMuscleTrainingPeriodIndex.value]!,
  )
  const todayMuscleTrainingTotals = computed(
    () => calculateMuscleTraining(todaySets.value).totals,
  )
  const muscleTrainingPeriodDateRange = computed(() =>
    getTrainingPeriodDateRange(
      selectedMuscleTrainingPeriod.value,
      muscleTrainingPeriodWeekOffset.value,
    ),
  )
  const muscleTrainingPeriodRangeLabel = computed(
    () =>
      `${formatDisplayDate(muscleTrainingPeriodDateRange.value.startDate)}—${formatDisplayDate(muscleTrainingPeriodDateRange.value.endDate)}`,
  )

  async function loadTodaySets(): Promise<void> {
    isLoadingTodaySets.value = true
    todaySetsError.value = ''

    try {
      todaySets.value = await getTrainingSetsByDate(getLocalDate())
    } catch (error: unknown) {
      todaySetsError.value = error instanceof Error ? error.message : '无法读取今日记录'
    } finally {
      isLoadingTodaySets.value = false
    }
  }

  async function loadMuscleTrainingTotals(): Promise<void> {
    isLoadingMuscleTrainingTotals.value = true
    muscleTrainingTotalsError.value = ''

    try {
      const trainingSets = await getTrainingSetsByDateRange(
        muscleTrainingPeriodDateRange.value.startDate,
        muscleTrainingPeriodDateRange.value.endDate,
      )
      const result = calculateMuscleTraining(trainingSets)

      muscleTrainingTotals.value = result.totals
      muscleTrainingSources.value = result.sources
      muscleTrainingSetCount.value = trainingSets.length
    } catch (error: unknown) {
      muscleTrainingTotalsError.value =
        error instanceof Error ? error.message : '无法读取肌束训练量'
    } finally {
      isLoadingMuscleTrainingTotals.value = false
    }
  }

  async function loadTrainingCalendar(): Promise<void> {
    isLoadingTrainingCalendar.value = true
    trainingCalendarError.value = ''

    try {
      const trainingSets = await getTrainingSetsByDateRange(
        trainingCalendarRange.startDate,
        trainingCalendarRange.endDate,
      )

      trainingCalendarDays.value = buildTrainingCalendarDays(trainingSets, trainingCalendarRange)
    } catch (error: unknown) {
      trainingCalendarError.value =
        error instanceof Error ? error.message : '无法读取训练日历'
    } finally {
      isLoadingTrainingCalendar.value = false
    }
  }

  function changeMuscleTrainingPeriod(periodIndex: number): void {
    selectedMuscleTrainingPeriodIndex.value = periodIndex
    muscleTrainingPeriodWeekOffset.value = 0
    void loadMuscleTrainingTotals()
  }

  function changeMuscleTrainingPeriodWeek(weekDelta: number): void {
    if (!selectedMuscleTrainingPeriod.value.canNavigateWeeks) return

    muscleTrainingPeriodWeekOffset.value = Math.max(
      0,
      muscleTrainingPeriodWeekOffset.value + weekDelta,
    )
    void loadMuscleTrainingTotals()
  }

  function refreshAfterSetAdded(): void {
    void loadTodaySets()
    void loadMuscleTrainingTotals()
    void loadTrainingCalendar()
  }

  function clearDeleteError(): void {
    deleteError.value = ''
  }

  async function removeTrainingSet(trainingSetId: string): Promise<boolean> {
    isDeleting.value = true
    deleteError.value = ''

    try {
      await deleteTrainingSet(trainingSetId)
      todaySets.value = todaySets.value.filter(
        (trainingSet) => trainingSet.id !== trainingSetId,
      )
      await Promise.all([loadMuscleTrainingTotals(), loadTrainingCalendar()])

      return true
    } catch (error: unknown) {
      deleteError.value = error instanceof Error ? error.message : '删除记录失败'
      return false
    } finally {
      isDeleting.value = false
    }
  }

  async function exportTrainingRecords(): Promise<void> {
    if (isExporting.value) return

    isExporting.value = true
    exportStatus.value = ''
    exportError.value = ''

    try {
      const trainingSets = await getAllTrainingSets()
      const fileContent = JSON.stringify(trainingSets, null, 2)
      const fileBlob = new Blob([fileContent], { type: 'application/json;charset=utf-8' })
      const downloadUrl = URL.createObjectURL(fileBlob)
      const downloadLink = document.createElement('a')

      downloadLink.href = downloadUrl
      downloadLink.download = `fitness-training-records-${getLocalDate()}.json`
      document.body.append(downloadLink)
      downloadLink.click()
      downloadLink.remove()
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0)

      exportStatus.value = `已导出 ${trainingSets.length} 条训练记录`
    } catch (error: unknown) {
      exportError.value = error instanceof Error ? error.message : '导出训练记录失败'
    } finally {
      isExporting.value = false
    }
  }

  function areTrainingSetsEqual(left: TrainingSet, right: TrainingSet): boolean {
    return (
      left.id === right.id &&
      left.date === right.date &&
      left.exerciseId === right.exerciseId &&
      left.weightKg === right.weightKg &&
      left.reps === right.reps &&
      left.rir === right.rir &&
      (left.createdAt ?? null) === (right.createdAt ?? null)
    )
  }

  async function importTrainingRecords(file: File): Promise<void> {
    if (isImporting.value) return

    isImporting.value = true
    importStatus.value = ''
    importError.value = ''

    try {
      const fileValue = JSON.parse(await file.text()) as unknown
      const importedTrainingSets = parseTrainingSetImport(fileValue)
      const currentTrainingSets = await getAllTrainingSets()
      const currentById = new Map(currentTrainingSets.map((trainingSet) => [trainingSet.id, trainingSet]))
      const importedById = new Map(
        importedTrainingSets.map((trainingSet) => [trainingSet.id, trainingSet]),
      )
      const importedOnlyCount = importedTrainingSets.filter(
        (trainingSet) => !currentById.has(trainingSet.id),
      ).length
      const currentOnlyCount = currentTrainingSets.filter(
        (trainingSet) => !importedById.has(trainingSet.id),
      ).length
      const changedCount = importedTrainingSets.filter((trainingSet) => {
        const currentTrainingSet = currentById.get(trainingSet.id)

        return currentTrainingSet && !areTrainingSetsEqual(currentTrainingSet, trainingSet)
      }).length
      const shouldImport = window.confirm(
        [
          `文件中有 ${importedTrainingSets.length} 条记录，当前网页有 ${currentTrainingSets.length} 条。`,
          `文件新增：${importedOnlyCount} 条`,
          `当前独有且将被删除：${currentOnlyCount} 条`,
          `相同 ID 但内容不同：${changedCount} 条`,
          '',
          '继续后将用文件中的记录完全覆盖当前网页数据。是否继续？',
        ].join('\n'),
      )

      if (!shouldImport) {
        importStatus.value = '已取消导入，现有数据没有变化'
        return
      }

      await replaceAllTrainingSets(importedTrainingSets)
      await Promise.all([loadTodaySets(), loadMuscleTrainingTotals(), loadTrainingCalendar()])
      importStatus.value = `已导入 ${importedTrainingSets.length} 条训练记录`
    } catch (error: unknown) {
      importError.value =
        error instanceof SyntaxError
          ? 'JSON 文件格式无效'
          : error instanceof Error
            ? error.message
            : '导入训练记录失败'
    } finally {
      isImporting.value = false
    }
  }

  onMounted(() => {
    void loadTodaySets()
    void loadMuscleTrainingTotals()
    void loadTrainingCalendar()
  })

  return {
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
  }
}
