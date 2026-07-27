import { computed, onMounted, ref } from 'vue'

import {
  deleteTrainingSet,
  getAllTrainingSets,
  getTrainingSetsByDate,
  getTrainingSetsByDateRange,
  type TrainingSet,
} from '@/database'
import {
  TRAINING_PERIODS,
  buildTrainingCalendarDays,
  calculateBodyPartDayCounts,
  calculateMuscleTraining,
  createEmptyBodyPartCounts,
  createEmptyMuscleTrainingSources,
  createEmptyMuscleTrainingTotals,
  formatDisplayDate,
  getCurrentWeekMondayOffset,
  getLocalDate,
  type TrainingCalendarDay,
} from '@/domain/trainingStats'

export function useTrainingDashboard() {
  const todaySets = ref<TrainingSet[]>([])
  const isLoadingTodaySets = ref(true)
  const todaySetsError = ref('')

  const bodyPartDayCounts = ref(createEmptyBodyPartCounts())
  const isLoadingBodyPartCounts = ref(true)
  const bodyPartCountsError = ref('')
  const selectedTrainingPeriodIndex = ref(0)

  const muscleTrainingTotals = ref(createEmptyMuscleTrainingTotals())
  const muscleTrainingSources = ref(createEmptyMuscleTrainingSources())
  const isLoadingMuscleTrainingTotals = ref(true)
  const muscleTrainingTotalsError = ref('')
  const selectedMuscleTrainingPeriodIndex = ref(0)

  const trainingCalendarDays = ref<TrainingCalendarDay[]>(buildTrainingCalendarDays([]))
  const isLoadingTrainingCalendar = ref(true)
  const trainingCalendarError = ref('')

  const isDeleting = ref(false)
  const deleteError = ref('')
  const isExporting = ref(false)
  const exportStatus = ref('')
  const exportError = ref('')

  const selectedTrainingPeriod = computed(
    () => TRAINING_PERIODS[selectedTrainingPeriodIndex.value]!,
  )
  const trainingPeriodStartDate = computed(() =>
    getLocalDate(-(selectedTrainingPeriod.value.dayCount - 1)),
  )
  const trainingPeriodEndDate = computed(() => getLocalDate())
  const trainingPeriodRangeLabel = computed(
    () =>
      `${formatDisplayDate(trainingPeriodStartDate.value)}—${formatDisplayDate(trainingPeriodEndDate.value)}`,
  )

  const selectedMuscleTrainingPeriod = computed(
    () => TRAINING_PERIODS[selectedMuscleTrainingPeriodIndex.value]!,
  )
  const muscleTrainingPeriodStartDate = computed(() =>
    getLocalDate(-(selectedMuscleTrainingPeriod.value.dayCount - 1)),
  )
  const muscleTrainingPeriodEndDate = computed(() => getLocalDate())
  const muscleTrainingPeriodRangeLabel = computed(
    () =>
      `${formatDisplayDate(muscleTrainingPeriodStartDate.value)}—${formatDisplayDate(muscleTrainingPeriodEndDate.value)}`,
  )

  const currentWeekMondayOffset = getCurrentWeekMondayOffset()
  const calendarStartDate = getLocalDate(currentWeekMondayOffset - 7)
  const calendarEndDate = getLocalDate(currentWeekMondayOffset + 6)

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

  async function loadBodyPartDayCounts(): Promise<void> {
    isLoadingBodyPartCounts.value = true
    bodyPartCountsError.value = ''

    try {
      const trainingSets = await getTrainingSetsByDateRange(
        trainingPeriodStartDate.value,
        trainingPeriodEndDate.value,
      )

      bodyPartDayCounts.value = calculateBodyPartDayCounts(trainingSets)
    } catch (error: unknown) {
      bodyPartCountsError.value =
        error instanceof Error ? error.message : '无法读取训练部位统计'
    } finally {
      isLoadingBodyPartCounts.value = false
    }
  }

  async function loadMuscleTrainingTotals(): Promise<void> {
    isLoadingMuscleTrainingTotals.value = true
    muscleTrainingTotalsError.value = ''

    try {
      const trainingSets = await getTrainingSetsByDateRange(
        muscleTrainingPeriodStartDate.value,
        muscleTrainingPeriodEndDate.value,
      )
      const result = calculateMuscleTraining(trainingSets)

      muscleTrainingTotals.value = result.totals
      muscleTrainingSources.value = result.sources
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
      const trainingSets = await getTrainingSetsByDateRange(calendarStartDate, calendarEndDate)

      trainingCalendarDays.value = buildTrainingCalendarDays(trainingSets)
    } catch (error: unknown) {
      trainingCalendarError.value =
        error instanceof Error ? error.message : '无法读取训练日历'
    } finally {
      isLoadingTrainingCalendar.value = false
    }
  }

  function changeTrainingPeriod(periodIndex: number): void {
    selectedTrainingPeriodIndex.value = periodIndex
    void loadBodyPartDayCounts()
  }

  function changeMuscleTrainingPeriod(periodIndex: number): void {
    selectedMuscleTrainingPeriodIndex.value = periodIndex
    void loadMuscleTrainingTotals()
  }

  function refreshAfterSetAdded(): void {
    void loadTodaySets()
    void loadBodyPartDayCounts()
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
      await Promise.all([
        loadBodyPartDayCounts(),
        loadMuscleTrainingTotals(),
        loadTrainingCalendar(),
      ])

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

  onMounted(() => {
    void loadTodaySets()
    void loadBodyPartDayCounts()
    void loadMuscleTrainingTotals()
    void loadTrainingCalendar()
  })

  return {
    todaySets,
    isLoadingTodaySets,
    todaySetsError,
    bodyPartDayCounts,
    isLoadingBodyPartCounts,
    bodyPartCountsError,
    selectedTrainingPeriodIndex,
    trainingPeriodRangeLabel,
    muscleTrainingTotals,
    muscleTrainingSources,
    isLoadingMuscleTrainingTotals,
    muscleTrainingTotalsError,
    selectedMuscleTrainingPeriodIndex,
    muscleTrainingPeriodRangeLabel,
    trainingCalendarDays,
    isLoadingTrainingCalendar,
    trainingCalendarError,
    isDeleting,
    deleteError,
    isExporting,
    exportStatus,
    exportError,
    changeTrainingPeriod,
    changeMuscleTrainingPeriod,
    refreshAfterSetAdded,
    clearDeleteError,
    removeTrainingSet,
    exportTrainingRecords,
  }
}
