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
  getTrainingPeriodDateRange,
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
  const trainingPeriodWeekOffset = ref(0)

  const muscleTrainingTotals = ref(createEmptyMuscleTrainingTotals())
  const muscleTrainingSources = ref(createEmptyMuscleTrainingSources())
  const isLoadingMuscleTrainingTotals = ref(true)
  const muscleTrainingTotalsError = ref('')
  const selectedMuscleTrainingPeriodIndex = ref(0)
  const muscleTrainingPeriodWeekOffset = ref(0)

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
  const trainingPeriodDateRange = computed(() =>
    getTrainingPeriodDateRange(
      selectedTrainingPeriod.value,
      trainingPeriodWeekOffset.value,
    ),
  )
  const trainingPeriodRangeLabel = computed(
    () =>
      `${formatDisplayDate(trainingPeriodDateRange.value.startDate)}—${formatDisplayDate(trainingPeriodDateRange.value.endDate)}`,
  )

  const selectedMuscleTrainingPeriod = computed(
    () => TRAINING_PERIODS[selectedMuscleTrainingPeriodIndex.value]!,
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
        trainingPeriodDateRange.value.startDate,
        trainingPeriodDateRange.value.endDate,
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
        muscleTrainingPeriodDateRange.value.startDate,
        muscleTrainingPeriodDateRange.value.endDate,
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
    trainingPeriodWeekOffset.value = 0
    void loadBodyPartDayCounts()
  }

  function changeTrainingPeriodWeek(weekDelta: number): void {
    if (!selectedTrainingPeriod.value.canNavigateWeeks) return

    trainingPeriodWeekOffset.value = Math.max(0, trainingPeriodWeekOffset.value + weekDelta)
    void loadBodyPartDayCounts()
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
    trainingPeriodWeekOffset,
    trainingPeriodRangeLabel,
    muscleTrainingTotals,
    muscleTrainingSources,
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
    changeTrainingPeriod,
    changeTrainingPeriodWeek,
    changeMuscleTrainingPeriod,
    changeMuscleTrainingPeriodWeek,
    refreshAfterSetAdded,
    clearDeleteError,
    removeTrainingSet,
    exportTrainingRecords,
  }
}
