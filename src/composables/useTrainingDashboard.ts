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
  type MuscleTrainingSnapshot,
} from '@/domain/trainingStats'

export function useTrainingDashboard() {
  const todaySets = ref<TrainingSet[]>([])
  const isLoadingTodaySets = ref(true)
  const todaySetsError = ref('')

  const muscleTrainingTotals = ref(createEmptyMuscleTrainingTotals())
  const muscleTrainingSources = ref(createEmptyMuscleTrainingSources())
  const muscleTrainingSetCount = ref(0)
  const isLoadingMuscleTrainingTotals = ref(true)
  const isRefreshingMuscleTrainingTotals = ref(false)
  const muscleTrainingTotalsError = ref('')
  const selectedMuscleTrainingPeriodIndex = ref(0)
  const muscleTrainingPeriodWeekOffset = ref(0)
  const olderMuscleTrainingSnapshot = ref<MuscleTrainingSnapshot>()
  const newerMuscleTrainingSnapshot = ref<MuscleTrainingSnapshot>()
  const muscleTrainingSnapshotCache = new Map<string, MuscleTrainingSnapshot>()
  const pendingMuscleTrainingSnapshots = new Map<string, Promise<MuscleTrainingSnapshot>>()
  let muscleTrainingSnapshotCacheVersion = 0

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

  function getMuscleTrainingSnapshotKey(periodIndex: number, weekOffset: number): string {
    return `${periodIndex}:${weekOffset}`
  }

  async function getMuscleTrainingSnapshot(
    periodIndex: number,
    weekOffset: number,
  ): Promise<MuscleTrainingSnapshot> {
    const period = TRAINING_PERIODS[periodIndex]

    if (!period) throw new Error('无法识别肌束训练量统计周期')

    const dateRange = getTrainingPeriodDateRange(period, weekOffset)
    const trainingSets = await getTrainingSetsByDateRange(
      dateRange.startDate,
      dateRange.endDate,
    )
    const result = calculateMuscleTraining(trainingSets)

    return {
      periodIndex,
      weekOffset,
      dateRange: `${formatDisplayDate(dateRange.startDate)}—${formatDisplayDate(dateRange.endDate)}`,
      totals: result.totals,
      sources: result.sources,
      trainingSetCount: trainingSets.length,
    }
  }

  async function getCachedMuscleTrainingSnapshot(
    periodIndex: number,
    weekOffset: number,
  ): Promise<MuscleTrainingSnapshot> {
    const key = getMuscleTrainingSnapshotKey(periodIndex, weekOffset)
    const cachedSnapshot = muscleTrainingSnapshotCache.get(key)

    if (cachedSnapshot) return cachedSnapshot

    const pendingSnapshot = pendingMuscleTrainingSnapshots.get(key)

    if (pendingSnapshot) return pendingSnapshot

    const cacheVersion = muscleTrainingSnapshotCacheVersion
    const snapshotRequest = getMuscleTrainingSnapshot(periodIndex, weekOffset)
      .then((snapshot) => {
        if (cacheVersion === muscleTrainingSnapshotCacheVersion) {
          muscleTrainingSnapshotCache.set(key, snapshot)
        }

        return snapshot
      })
      .finally(() => {
        if (pendingMuscleTrainingSnapshots.get(key) === snapshotRequest) {
          pendingMuscleTrainingSnapshots.delete(key)
        }
      })

    pendingMuscleTrainingSnapshots.set(key, snapshotRequest)

    return snapshotRequest
  }

  function updateAdjacentMuscleTrainingSnapshots(snapshot: MuscleTrainingSnapshot): void {
    const period = TRAINING_PERIODS[snapshot.periodIndex]

    if (!period?.canNavigateWeeks) {
      olderMuscleTrainingSnapshot.value = undefined
      newerMuscleTrainingSnapshot.value = undefined
      return
    }

    olderMuscleTrainingSnapshot.value = muscleTrainingSnapshotCache.get(
      getMuscleTrainingSnapshotKey(snapshot.periodIndex, snapshot.weekOffset + 1),
    )
    newerMuscleTrainingSnapshot.value =
      snapshot.weekOffset > 0
        ? muscleTrainingSnapshotCache.get(
            getMuscleTrainingSnapshotKey(snapshot.periodIndex, snapshot.weekOffset - 1),
          )
        : undefined
  }

  function preloadAdjacentMuscleTrainingSnapshots(snapshot: MuscleTrainingSnapshot): void {
    const period = TRAINING_PERIODS[snapshot.periodIndex]

    if (!period?.canNavigateWeeks) return

    const adjacentWeekOffsets = [snapshot.weekOffset + 1]

    if (snapshot.weekOffset > 0) adjacentWeekOffsets.push(snapshot.weekOffset - 1)

    for (const weekOffset of adjacentWeekOffsets) {
      void getCachedMuscleTrainingSnapshot(snapshot.periodIndex, weekOffset)
        .then(() => {
          if (
            selectedMuscleTrainingPeriodIndex.value === snapshot.periodIndex &&
            muscleTrainingPeriodWeekOffset.value === snapshot.weekOffset
          ) {
            updateAdjacentMuscleTrainingSnapshots(snapshot)
          }
        })
        .catch(() => {
          // The current table remains usable if an adjacent preload fails.
        })
    }
  }

  function clearMuscleTrainingSnapshotCache(): void {
    muscleTrainingSnapshotCacheVersion += 1
    muscleTrainingSnapshotCache.clear()
    pendingMuscleTrainingSnapshots.clear()
    olderMuscleTrainingSnapshot.value = undefined
    newerMuscleTrainingSnapshot.value = undefined
  }

  function applyMuscleTrainingSnapshot(
    snapshot: MuscleTrainingSnapshot,
  ): void {
    muscleTrainingSnapshotCache.set(
      getMuscleTrainingSnapshotKey(snapshot.periodIndex, snapshot.weekOffset),
      snapshot,
    )
    selectedMuscleTrainingPeriodIndex.value = snapshot.periodIndex
    muscleTrainingPeriodWeekOffset.value = snapshot.weekOffset
    muscleTrainingTotals.value = snapshot.totals
    muscleTrainingSources.value = snapshot.sources
    muscleTrainingSetCount.value = snapshot.trainingSetCount
    updateAdjacentMuscleTrainingSnapshots(snapshot)
    preloadAdjacentMuscleTrainingSnapshots(snapshot)
  }

  async function loadMuscleTrainingTotals(): Promise<void> {
    isLoadingMuscleTrainingTotals.value = true
    muscleTrainingTotalsError.value = ''
    clearMuscleTrainingSnapshotCache()

    try {
      const snapshot = await getCachedMuscleTrainingSnapshot(
        selectedMuscleTrainingPeriodIndex.value,
        muscleTrainingPeriodWeekOffset.value,
      )

      applyMuscleTrainingSnapshot(snapshot)
    } catch (error: unknown) {
      muscleTrainingTotalsError.value =
        error instanceof Error ? error.message : '无法读取肌束训练量'
    } finally {
      isLoadingMuscleTrainingTotals.value = false
    }
  }

  async function refreshMuscleTrainingTotals(
    periodIndex: number,
    weekOffset: number,
  ): Promise<void> {
    if (isRefreshingMuscleTrainingTotals.value || isLoadingMuscleTrainingTotals.value) return

    isRefreshingMuscleTrainingTotals.value = true
    muscleTrainingTotalsError.value = ''

    try {
      const snapshot = await getCachedMuscleTrainingSnapshot(periodIndex, weekOffset)

      applyMuscleTrainingSnapshot(snapshot)
    } catch (error: unknown) {
      muscleTrainingTotalsError.value =
        error instanceof Error ? error.message : '无法读取肌束训练量'
    } finally {
      isRefreshingMuscleTrainingTotals.value = false
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
    const cachedSnapshot = muscleTrainingSnapshotCache.get(
      getMuscleTrainingSnapshotKey(periodIndex, 0),
    )

    if (cachedSnapshot) {
      applyMuscleTrainingSnapshot(cachedSnapshot)
      return
    }

    void refreshMuscleTrainingTotals(periodIndex, 0)
  }

  function changeMuscleTrainingPeriodWeek(weekDelta: number): void {
    if (!selectedMuscleTrainingPeriod.value.canNavigateWeeks) return

    const nextWeekOffset = Math.max(
      0,
      muscleTrainingPeriodWeekOffset.value + weekDelta,
    )

    if (nextWeekOffset === muscleTrainingPeriodWeekOffset.value) return

    const cachedSnapshot = muscleTrainingSnapshotCache.get(
      getMuscleTrainingSnapshotKey(
        selectedMuscleTrainingPeriodIndex.value,
        nextWeekOffset,
      ),
    )

    if (cachedSnapshot) {
      applyMuscleTrainingSnapshot(cachedSnapshot)
      return
    }

    void refreshMuscleTrainingTotals(selectedMuscleTrainingPeriodIndex.value, nextWeekOffset)
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
  }
}
