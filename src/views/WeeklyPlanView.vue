<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'

import WeeklyPlanMenu from '@/components/WeeklyPlanMenu.vue'
import WeeklyPlanSteps from '@/components/WeeklyPlanSteps.vue'
import { useSupabaseAuth } from '@/composables/useSupabaseAuth'
import { EXERCISES, type ExerciseId } from '@/database'
import { MUSCLE_GROUPS, type MuscleName, type MuscleRegion } from '@/domain/trainingStats'
import type {
  WeeklyPlanDraftContent,
  WeeklyPlanExercise,
  WeeklyPlanMuscleTarget,
  WeeklyPlanSchedule,
} from '@/domain/weeklyPlan'
import {
  createWeeklyPlan,
  listWeeklyPlans,
  updateWeeklyPlan,
  type CloudWeeklyPlan,
} from '@/services/weeklyPlans'
import {
  createEmptyWeeklyPlanSchedule,
  normalizeWeeklyPlanSchedule,
  reconcileWeeklyPlanSchedule,
} from '@/services/weeklyPlanSchedule'

const PLAN_PARTS = ['肩', '胸', '背', '手臂', '腿'] as const
const BOARD_PARTS = [...PLAN_PARTS, '全部'] as const
const PART_REGIONS: Record<PlanPart, readonly MuscleRegion[]> = {
  肩: ['肩'],
  胸: ['胸'],
  背: ['背'],
  手臂: ['屈肘', '伸肘', '前臂'],
  腿: ['腿'],
}
type PlanPart = (typeof PLAN_PARTS)[number]
type BoardPart = (typeof BOARD_PARTS)[number]
type ExerciseScope = 'related' | 'all'
type MuscleBoardSlidePosition = -1 | 0 | 1
type MuscleBoardGestureAxis = 'pending' | 'horizontal' | 'vertical'

interface MuscleBoardSlide {
  position: MuscleBoardSlidePosition
  part: BoardPart
  muscles: MuscleName[]
}

const MUSCLE_BOARD_ANIMATION_MS = 220
const MUSCLE_BOARD_GESTURE_THRESHOLD_PX = 7
const MUSCLE_BOARD_SWIPE_DISTANCE_RATIO = 0.22
const MUSCLE_BOARD_SWIPE_VELOCITY_PX_PER_MS = 0.5
const MUSCLE_BOARD_PEEK_WIDTH = 16
const MUSCLE_BOARD_ROW_STEP = 43
const MUSCLE_BOARD_MIN_VISIBLE_ROWS = 2
// Table heading + two muscle rows + top and bottom borders.
const MUSCLE_BOARD_PEEK_HEIGHT = 36 + MUSCLE_BOARD_MIN_VISIBLE_ROWS * MUSCLE_BOARD_ROW_STEP + 2

const selectedPart = ref<BoardPart>('肩')
const selectedExercisePart = ref<PlanPart>('肩')
const exerciseScope = ref<ExerciseScope>('related')
const startDate = ref(getUpcomingMonday())
const targets = ref<WeeklyPlanMuscleTarget[]>([])
const plannedSets = ref<Partial<Record<ExerciseId, number>>>({})
const activeSchedule = ref<WeeklyPlanSchedule>(createEmptyWeeklyPlanSchedule(startDate.value))
const isLoading = ref(true)
const isSaving = ref(false)
const isDirty = ref(false)
const isConfirmingClear = ref(false)
const targetDialog = ref<HTMLDialogElement>()
const editingMuscle = ref<MuscleName>()
const editingTargetSets = ref(4)
const statusMessage = ref('')
const errorMessage = ref('')
const cloudErrorMessage = ref('')
const cloudPlans = ref<CloudWeeklyPlan[]>([])
const activeCloudPlanId = ref<string>()
const isLoadingCloudPlans = ref(false)
const { initialize: initializeAuth, session } = useSupabaseAuth()
const route = useRoute()
const router = useRouter()
let isUnmounting = false
let clearConfirmationTimer: number | undefined
const muscleBoardViewport = ref<HTMLElement>()
const muscleBoardViewportHeight = ref(0)
const muscleBoardDragOffset = ref(0)
const muscleBoardTransitionEnabled = ref(false)
const isMuscleBoardDragging = ref(false)
const isMuscleBoardAnimating = ref(false)
const muscleBoardSlideHeights = ref<Partial<Record<MuscleBoardSlidePosition, number>>>({})

let muscleBoardResizeObserver: ResizeObserver | undefined
let muscleBoardPointerId: number | undefined
let muscleBoardGestureAxis: MuscleBoardGestureAxis = 'pending'
let muscleBoardStartX = 0
let muscleBoardStartY = 0
let muscleBoardStartTime = 0
let muscleBoardAnimationTimer: number | undefined
let suppressMuscleClickUntil = 0

const canonicalMuscleOrder = new Map<MuscleName, number>(
  MUSCLE_GROUPS.flatMap((group) => [...group.muscles]).map((muscle, index) => [muscle, index]),
)
const muscleToPlanPart = new Map<MuscleName, PlanPart>(
  PLAN_PARTS.flatMap((part) => getMusclesForPart(part).map((muscle) => [muscle, part] as const)),
)

const selectedPartMuscles = computed(() => getMusclesForPart(selectedPart.value))
const selectedExerciseMuscles = computed(() => new Set<string>(getMusclesForPart(selectedExercisePart.value)))
const muscleRowLimits = ref<Partial<Record<BoardPart, number>>>({})
const visibleMuscleRows = computed(
  () => muscleRowLimits.value[selectedPart.value] ?? selectedPartMuscles.value.length,
)
let rowResize: { pointerId: number; startY: number; startRows: number; part: BoardPart } | undefined

function setVisibleMuscleRows(part: BoardPart, count: number): void {
  const total = getMusclesForPart(part).length
  const limit = Math.max(Math.min(MUSCLE_BOARD_MIN_VISIBLE_ROWS, total), Math.min(count, total))
  if (limit !== muscleRowLimits.value[part]) muscleRowLimits.value[part] = limit
}

function startMuscleRowResize(event: PointerEvent): void {
  if (!event.isPrimary || event.button !== 0 || rowResize || isMuscleBoardAnimating.value) return
  const grip = event.currentTarget as HTMLElement
  grip.setPointerCapture(event.pointerId)
  rowResize = {
    pointerId: event.pointerId,
    startY: event.clientY,
    startRows: visibleMuscleRows.value,
    part: selectedPart.value,
  }
}

function moveMuscleRowResize(event: PointerEvent): void {
  if (rowResize?.pointerId !== event.pointerId) return
  const rowDelta = Math.round((event.clientY - rowResize.startY) / MUSCLE_BOARD_ROW_STEP)
  setVisibleMuscleRows(rowResize.part, rowResize.startRows + rowDelta)
}

function endMuscleRowResize(event: PointerEvent): void {
  if (rowResize?.pointerId === event.pointerId) rowResize = undefined
}

function handleMuscleRowResizeKey(event: KeyboardEvent): void {
  if (rowResize || isMuscleBoardAnimating.value) return
  const total = selectedPartMuscles.value.length
  let count = visibleMuscleRows.value
  if (event.key === 'Home') count = MUSCLE_BOARD_MIN_VISIBLE_ROWS
  else if (event.key === 'End') count = total
  else if (event.key === 'ArrowUp' || event.key === 'ArrowRight') count += 1
  else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') count -= 1
  else return
  event.preventDefault()
  setVisibleMuscleRows(selectedPart.value, count)
}

const muscleBoardSlides = computed<MuscleBoardSlide[]>(() => {
  const currentIndex = BOARD_PARTS.indexOf(selectedPart.value)
  const slides: MuscleBoardSlide[] = []
  const previousPart = BOARD_PARTS[currentIndex - 1]
  const nextPart = BOARD_PARTS[currentIndex + 1]

  if (previousPart) slides.push({ position: -1, part: previousPart, muscles: getMusclesForPart(previousPart) })
  slides.push({ position: 0, part: selectedPart.value, muscles: selectedPartMuscles.value })
  if (nextPart) slides.push({ position: 1, part: nextPart, muscles: getMusclesForPart(nextPart) })

  return slides
})
const muscleBoardViewportStyle = computed(() =>
  muscleBoardViewportHeight.value > 0
    ? { height: `${muscleBoardViewportHeight.value}px` }
    : undefined,
)

const targetByMuscle = computed(
  () =>
    Object.fromEntries(
      targets.value.map((target) => [target.muscle, target.targetSets]),
    ) as Partial<Record<MuscleName, number>>,
)

const muscleTotals = computed(() => {
  const totals = Object.fromEntries(
    MUSCLE_GROUPS.flatMap((group) => group.muscles.map((muscle) => [muscle, 0])),
  ) as Record<MuscleName, number>

  for (const exercise of EXERCISES) {
    const setCount = plannedSets.value[exercise.id] ?? 0
    if (!setCount) continue

    for (const [muscle, weight] of Object.entries(exercise.muscleWeights ?? {})) {
      if (!(muscle in totals)) continue
      totals[muscle as MuscleName] += setCount * weight
    }
  }

  return totals
})

const partProgress = computed(() =>
  BOARD_PARTS.map((part) => {
    let reached = 0
    let planned = 0

    for (const muscle of getMusclesForPart(part)) {
      const target = getTargetSets(muscle)
      if (target === undefined) continue

      planned += 1
      if (muscleTotals.value[muscle] >= target) reached += 1
    }

    return { part, reached, planned }
  }),
)

const visibleExercises = computed(() => {
  if (exerciseScope.value === 'all') return EXERCISES

  return EXERCISES.filter((exercise) => exercise.bodyPart === selectedExercisePart.value)
})

function groupExercisesByPart(exercises: readonly (typeof EXERCISES)[number][]) {
  return PLAN_PARTS.flatMap((part) => {
    const partExercises = exercises.filter((exercise) => exercise.bodyPart === part)

    return partExercises.length ? [{ part, exercises: partExercises }] : []
  })
}

const exerciseSections = computed(() => {
  const planned = visibleExercises.value.filter((exercise) => getExerciseSetCount(exercise.id) > 0)
  const unplanned = visibleExercises.value.filter(
    (exercise) => getExerciseSetCount(exercise.id) === 0,
  )

  return [
    {
      key: 'planned',
      label: '已安排',
      emptyLabel: '还没有安排动作',
      count: planned.length,
      setCount: planned.reduce(
        (total, exercise) => total + getExerciseSetCount(exercise.id),
        0,
      ),
      groups: groupExercisesByPart(planned),
    },
    {
      key: 'unplanned',
      label: '未安排',
      emptyLabel: '当前范围内的动作均已安排',
      count: unplanned.length,
      setCount: 0,
      groups: groupExercisesByPart(unplanned),
    },
  ] as const
})

const activeCloudPlan = computed(() =>
  cloudPlans.value.find((plan) => plan.id === activeCloudPlanId.value),
)

const scheduleUnavailableReason = computed(() => {
  if (isLoading.value || cloudErrorMessage.value) return undefined
  if (!activeCloudPlanId.value) return '请先保存新计划'
  if (isDirty.value) return '请先保存当前修改'
  if (isSaving.value) return '正在保存计划…'
  return undefined
})

function getMusclesForPart(part: BoardPart): MuscleName[] {
  if (part === '全部') return MUSCLE_GROUPS.flatMap((group) => [...group.muscles])

  const regions = new Set<MuscleRegion>(PART_REGIONS[part])

  return MUSCLE_GROUPS.filter((group) => regions.has(group.region)).flatMap((group) => [
    ...group.muscles,
  ])
}

function getUpcomingMonday(): string {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  const day = date.getDay()
  const daysUntilMonday = day === 1 ? 0 : day === 0 ? 1 : 8 - day
  date.setDate(date.getDate() + daysUntilMonday)

  return toLocalDateString(date)
}

function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function formatSetCount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '')
}

function getExerciseSetCount(exerciseId: ExerciseId): number {
  return plannedSets.value[exerciseId] ?? 0
}

function getTargetSets(muscle: MuscleName): number | undefined {
  return targetByMuscle.value[muscle]
}

function hasTarget(muscle: MuscleName): boolean {
  return getTargetSets(muscle) !== undefined
}

function getEffectLabel(exercise: (typeof EXERCISES)[number]): string {
  const selectedMuscleSet = selectedExerciseMuscles.value
  const effects = Object.entries(exercise.muscleWeights ?? {}).sort(
    ([leftMuscle, leftWeight], [rightMuscle, rightWeight]) =>
      Number(selectedMuscleSet.has(rightMuscle)) - Number(selectedMuscleSet.has(leftMuscle)) ||
      rightWeight - leftWeight,
  )

  return effects
    .slice(0, 4)
    .map(([muscle, weight]) => `${muscle}${weight}`)
    .join(' · ')
}

function applyBoardPart(part: BoardPart): void {
  selectedPart.value = part
  if (part !== '全部') selectedExercisePart.value = part
}

function selectPlanPart(part: BoardPart): void {
  if (rowResize || part === selectedPart.value || isMuscleBoardAnimating.value) return

  const currentIndex = BOARD_PARTS.indexOf(selectedPart.value)
  const targetIndex = BOARD_PARTS.indexOf(part)
  const distance = targetIndex - currentIndex

  if (Math.abs(distance) === 1) {
    navigateMuscleBoard(distance < 0 ? -1 : 1)
    return
  }

  applyBoardPart(part)
}

function getMuscleBoardSlideStyle(position: MuscleBoardSlidePosition): Record<string, string> {
  const offset = muscleBoardDragOffset.value
  const viewportWidth = muscleBoardViewport.value?.clientWidth ?? 0
  const isIncoming = position !== 0 && position === getMuscleBoardTargetPosition(offset)
  const progress = isIncoming && viewportWidth ? Math.min(Math.abs(offset) / viewportWidth, 1) : 0
  const remaining = position === 0 ? 0 : 1 - progress
  const slideHeight = muscleBoardSlideHeights.value[position] ?? 0
  const peekScale = slideHeight ? Math.min(MUSCLE_BOARD_PEEK_HEIGHT / slideHeight, 1) : 1
  const scale = 1 - (1 - peekScale) * remaining
  // Align the inner edge of the scaled 80%-wide card with the viewport's peek strip.
  const peekX = viewportWidth * (0.5 + 0.4 * peekScale) - MUSCLE_BOARD_PEEK_WIDTH
  const x = position * peekX * remaining + (isIncoming ? 0 : offset)
  const y = ((muscleBoardViewportHeight.value - slideHeight) / 2) * remaining

  return {
    transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
    visibility: position !== 0 && (!viewportWidth || !slideHeight) ? 'hidden' : 'visible',
    '--plan-card-content-opacity': position === 0 ? '1' : String(progress),
  }
}

function measureMuscleBoardSlides(): void {
  const viewport = muscleBoardViewport.value
  if (!viewport) return

  const nextHeights: Partial<Record<MuscleBoardSlidePosition, number>> = {}

  for (const slide of viewport.querySelectorAll<HTMLElement>('[data-muscle-board-position]')) {
    const position = Number(slide.dataset.muscleBoardPosition) as MuscleBoardSlidePosition
    nextHeights[position] = slide.offsetHeight
  }

  muscleBoardSlideHeights.value = nextHeights

  if (!isMuscleBoardDragging.value && !isMuscleBoardAnimating.value && nextHeights[0]) {
    muscleBoardViewportHeight.value = nextHeights[0]
  }
}

function observeMuscleBoardSlides(): void {
  const viewport = muscleBoardViewport.value
  if (!viewport || !muscleBoardResizeObserver) return

  muscleBoardResizeObserver.disconnect()
  for (const slide of viewport.querySelectorAll<HTMLElement>('[data-muscle-board-position]')) {
    muscleBoardResizeObserver.observe(slide)
  }
  measureMuscleBoardSlides()
}

function getMuscleBoardTargetPosition(
  offset: number,
): Exclude<MuscleBoardSlidePosition, 0> | undefined {
  const currentIndex = BOARD_PARTS.indexOf(selectedPart.value)

  if (offset > 0 && currentIndex > 0) return -1
  if (offset < 0 && currentIndex < BOARD_PARTS.length - 1) return 1
  return undefined
}

function updateMuscleBoardHeightForOffset(offset: number): void {
  const currentHeight = muscleBoardSlideHeights.value[0]
  const targetPosition = getMuscleBoardTargetPosition(offset)
  const targetHeight =
    targetPosition === undefined ? undefined : muscleBoardSlideHeights.value[targetPosition]
  const viewportWidth = muscleBoardViewport.value?.clientWidth ?? 0

  if (!currentHeight || !viewportWidth) return

  const progress = Math.min(Math.abs(offset) / viewportWidth, 1)
  muscleBoardViewportHeight.value =
    currentHeight + ((targetHeight ?? currentHeight) - currentHeight) * progress
}

function clearMuscleBoardAnimationTimer(): void {
  if (muscleBoardAnimationTimer === undefined) return
  window.clearTimeout(muscleBoardAnimationTimer)
  muscleBoardAnimationTimer = undefined
}

function finishMuscleBoardAtCurrentSlide(): void {
  muscleBoardTransitionEnabled.value = true
  isMuscleBoardAnimating.value = true
  muscleBoardDragOffset.value = 0

  const currentHeight = muscleBoardSlideHeights.value[0]
  if (currentHeight) muscleBoardViewportHeight.value = currentHeight

  clearMuscleBoardAnimationTimer()
  muscleBoardAnimationTimer = window.setTimeout(() => {
    muscleBoardTransitionEnabled.value = false
    isMuscleBoardAnimating.value = false
    muscleBoardAnimationTimer = undefined
  }, MUSCLE_BOARD_ANIMATION_MS)
}

function navigateMuscleBoard(position: Exclude<MuscleBoardSlidePosition, 0>): void {
  if (isMuscleBoardAnimating.value) return

  const currentIndex = BOARD_PARTS.indexOf(selectedPart.value)
  const targetPart = BOARD_PARTS[currentIndex + position]
  const viewportWidth = muscleBoardViewport.value?.clientWidth ?? 0

  if (!targetPart || !viewportWidth) return

  muscleBoardTransitionEnabled.value = true
  isMuscleBoardAnimating.value = true
  muscleBoardDragOffset.value = position === -1 ? viewportWidth : -viewportWidth

  const targetHeight = muscleBoardSlideHeights.value[position]
  if (targetHeight) muscleBoardViewportHeight.value = targetHeight

  clearMuscleBoardAnimationTimer()
  muscleBoardAnimationTimer = window.setTimeout(() => {
    muscleBoardTransitionEnabled.value = false
    muscleBoardDragOffset.value = 0
    applyBoardPart(targetPart)

    void nextTick().then(() => {
      isMuscleBoardAnimating.value = false
      muscleBoardAnimationTimer = undefined
      observeMuscleBoardSlides()
    })
  }, MUSCLE_BOARD_ANIMATION_MS)
}

function handleMuscleBoardPointerDown(event: PointerEvent): void {
  if (rowResize || event.button !== 0 || !event.isPrimary || isMuscleBoardAnimating.value) return

  muscleBoardPointerId = event.pointerId
  muscleBoardGestureAxis = 'pending'
  muscleBoardStartX = event.clientX
  muscleBoardStartY = event.clientY
  muscleBoardStartTime = performance.now()
  muscleBoardTransitionEnabled.value = false
}

function handleMuscleBoardPointerMove(event: PointerEvent): void {
  if (event.pointerId !== muscleBoardPointerId) return

  const horizontalDistance = event.clientX - muscleBoardStartX
  const verticalDistance = event.clientY - muscleBoardStartY

  if (muscleBoardGestureAxis === 'pending') {
    if (
      Math.abs(horizontalDistance) < MUSCLE_BOARD_GESTURE_THRESHOLD_PX &&
      Math.abs(verticalDistance) < MUSCLE_BOARD_GESTURE_THRESHOLD_PX
    ) {
      return
    }

    muscleBoardGestureAxis =
      Math.abs(horizontalDistance) > Math.abs(verticalDistance) ? 'horizontal' : 'vertical'
    if (muscleBoardGestureAxis === 'horizontal') {
      muscleBoardViewport.value?.setPointerCapture(event.pointerId)
    }
  }

  if (muscleBoardGestureAxis !== 'horizontal') return

  event.preventDefault()
  isMuscleBoardDragging.value = true

  const hasTarget = getMuscleBoardTargetPosition(horizontalDistance) !== undefined
  const width = muscleBoardViewport.value?.clientWidth ?? 0
  const distance = Math.abs(horizontalDistance)
  const nextOffset =
    Math.sign(horizontalDistance) *
    (hasTarget ? Math.min(distance, width) : Math.min(distance * 0.18, 24))
  muscleBoardDragOffset.value = nextOffset
  updateMuscleBoardHeightForOffset(nextOffset)
}

function releaseMuscleBoardPointer(event: PointerEvent): void {
  if (muscleBoardViewport.value?.hasPointerCapture(event.pointerId)) {
    muscleBoardViewport.value.releasePointerCapture(event.pointerId)
  }
  muscleBoardPointerId = undefined
}

function handleMuscleBoardPointerUp(event: PointerEvent): void {
  if (event.pointerId !== muscleBoardPointerId) return

  const wasHorizontalGesture = muscleBoardGestureAxis === 'horizontal'
  const offset = muscleBoardDragOffset.value
  const elapsedTime = Math.max(performance.now() - muscleBoardStartTime, 1)
  const velocity = Math.abs(offset) / elapsedTime
  const viewportWidth = muscleBoardViewport.value?.clientWidth ?? 0
  const targetPosition = getMuscleBoardTargetPosition(offset)
  const shouldNavigate =
    targetPosition !== undefined &&
    (Math.abs(offset) >= viewportWidth * MUSCLE_BOARD_SWIPE_DISTANCE_RATIO ||
      velocity >= MUSCLE_BOARD_SWIPE_VELOCITY_PX_PER_MS)

  releaseMuscleBoardPointer(event)
  muscleBoardGestureAxis = 'pending'

  if (!wasHorizontalGesture) return

  suppressMuscleClickUntil = Date.now() + 350
  isMuscleBoardDragging.value = false

  if (shouldNavigate && targetPosition !== undefined) navigateMuscleBoard(targetPosition)
  else finishMuscleBoardAtCurrentSlide()
}

function handleMuscleBoardPointerCancel(event: PointerEvent): void {
  if (event.pointerId !== muscleBoardPointerId) return

  const wasHorizontalGesture = muscleBoardGestureAxis === 'horizontal'
  releaseMuscleBoardPointer(event)
  muscleBoardGestureAxis = 'pending'
  isMuscleBoardDragging.value = false

  if (wasHorizontalGesture) finishMuscleBoardAtCurrentSlide()
}

function handleMuscleBoardPointerLeave(event: PointerEvent): void {
  if (!muscleBoardViewport.value?.hasPointerCapture(event.pointerId)) {
    handleMuscleBoardPointerCancel(event)
  }
}

function handleMuscleRowClick(position: MuscleBoardSlidePosition, muscle: MuscleName): void {
  if (
    position !== 0 ||
    isMuscleBoardDragging.value ||
    isMuscleBoardAnimating.value ||
    Date.now() < suppressMuscleClickUntil
  ) {
    return
  }
  openTargetEditor(muscle)
}

function getDraftExercises(): WeeklyPlanExercise[] {
  return EXERCISES.flatMap((exercise, index) => {
    const setCount = plannedSets.value[exercise.id] ?? 0

    return setCount > 0 ? [{ exerciseId: exercise.id, plannedSets: setCount, order: index }] : []
  })
}

function getCurrentPlanContent(): WeeklyPlanDraftContent {
  return {
    startDate: startDate.value,
    targets: targets.value.map((target) => ({ ...target })),
    exercises: getDraftExercises(),
  }
}

function markPlanChanged(): void {
  isConfirmingClear.value = false
  isDirty.value = true
  statusMessage.value = '未保存'
}

function changeExerciseSets(exerciseId: ExerciseId, delta: number): void {
  plannedSets.value = {
    ...plannedSets.value,
    [exerciseId]: Math.max(0, Math.min(99, getExerciseSetCount(exerciseId) + delta)),
  }
  markPlanChanged()
}

function openTargetEditor(muscle: MuscleName): void {
  editingMuscle.value = muscle
  editingTargetSets.value = getTargetSets(muscle) ?? 4
  targetDialog.value?.showModal()
}

function closeTargetEditor(): void {
  targetDialog.value?.close()
  editingMuscle.value = undefined
}

function changeEditingTarget(delta: number): void {
  editingTargetSets.value = Math.max(1, Math.min(99, editingTargetSets.value + delta))
}

function saveMuscleTarget(): void {
  const muscle = editingMuscle.value
  if (!muscle) return

  const nextTarget: WeeklyPlanMuscleTarget = {
    muscle,
    targetSets: editingTargetSets.value,
  }
  targets.value = [...targets.value.filter((target) => target.muscle !== muscle), nextTarget].sort(
    (left, right) =>
      (canonicalMuscleOrder.get(left.muscle) ?? 0) - (canonicalMuscleOrder.get(right.muscle) ?? 0),
  )
  closeTargetEditor()
  markPlanChanged()
}

function removeMuscleTarget(): void {
  const muscle = editingMuscle.value
  if (!muscle) return

  targets.value = targets.value.filter((target) => target.muscle !== muscle)
  closeTargetEditor()
  markPlanChanged()
}

async function handleSave(): Promise<void> {
  isSaving.value = true
  statusMessage.value = ''
  errorMessage.value = ''
  cloudErrorMessage.value = ''

  try {
    await initializeAuth()
    const userId = session.value?.user.id
    if (!userId) throw new Error('请先在「我的」登录云同步账户')

    const content = getCurrentPlanContent()
    const schedule = reconcileWeeklyPlanSchedule(
      activeSchedule.value,
      Object.fromEntries(
        content.exercises.map((exercise) => [exercise.exerciseId, exercise.plannedSets]),
      ),
    )
    activeSchedule.value = schedule

    if (activeCloudPlanId.value) {
      await updateWeeklyPlan(userId, activeCloudPlanId.value, content, schedule)
      await loadCloudPlans()
      statusMessage.value = '已保存'
    } else {
      const createdPlanId = await createWeeklyPlan(userId, content, schedule)
      await loadCloudPlans()
      activeCloudPlanId.value = createdPlanId
      await setActivePlanRoute(createdPlanId)
      statusMessage.value = '已保存'
    }
    isDirty.value = false
  } catch (error: unknown) {
    cloudErrorMessage.value = error instanceof Error ? error.message : '无法保存云端计划'
  } finally {
    isSaving.value = false
  }
}

async function loadCloudPlans(): Promise<void> {
  isLoadingCloudPlans.value = true
  cloudErrorMessage.value = ''

  try {
    await initializeAuth()
    const userId = session.value?.user.id
    if (!userId) throw new Error('请先在「我的」登录云同步账户')

    cloudPlans.value = await listWeeklyPlans(userId)
  } catch (error: unknown) {
    cloudErrorMessage.value = error instanceof Error ? error.message : '无法读取云端计划'
  } finally {
    isLoadingCloudPlans.value = false
  }
}

function selectCloudPlan(id: string): void {
  const plan = cloudPlans.value.find((item) => item.id === id)
  if (plan) void openCloudPlan(plan)
}

async function openCloudPlan(plan: CloudWeeklyPlan): Promise<void> {
  if (plan.id === activeCloudPlanId.value) return

  if (
    isDirty.value &&
    !window.confirm('当前修改尚未保存，切换计划会丢失这些修改。继续吗？')
  ) {
    return
  }

  activeCloudPlanId.value = plan.id
  startDate.value = plan.startDate
  targets.value = plan.targets.map((target) => ({ ...target }))
  plannedSets.value = Object.fromEntries(
    plan.exercises.map((exercise) => [exercise.exerciseId, exercise.plannedSets]),
  )
  activeSchedule.value = reconcileWeeklyPlanSchedule(
    normalizeWeeklyPlanSchedule(plan.schedule, plan.startDate),
    Object.fromEntries(
      plan.exercises.map((exercise) => [exercise.exerciseId, exercise.plannedSets]),
    ),
  )
  isConfirmingClear.value = false
  isDirty.value = false
  errorMessage.value = ''
  cloudErrorMessage.value = ''
  statusMessage.value = '已保存'
  await setActivePlanRoute(plan.id)
}

async function startNewPlan(): Promise<void> {
  if (isDirty.value && !window.confirm('当前修改尚未保存，新建计划会丢失这些修改。继续吗？')) {
    return
  }

  activeCloudPlanId.value = undefined
  startDate.value = getUpcomingMonday()
  targets.value = []
  plannedSets.value = {}
  activeSchedule.value = createEmptyWeeklyPlanSchedule(startDate.value)
  isConfirmingClear.value = false
  isDirty.value = true
  errorMessage.value = ''
  cloudErrorMessage.value = ''
  statusMessage.value = '新计划未保存'
  await setActivePlanRoute()
}

function handleClear(): void {
  if (!isConfirmingClear.value) {
    isConfirmingClear.value = true
    window.clearTimeout(clearConfirmationTimer)
    clearConfirmationTimer = window.setTimeout(() => {
      isConfirmingClear.value = false
    }, 3000)
    return
  }

  window.clearTimeout(clearConfirmationTimer)
  isConfirmingClear.value = false
  plannedSets.value = {}
  targets.value = []
  activeSchedule.value = createEmptyWeeklyPlanSchedule(startDate.value)
  markPlanChanged()
}

async function setActivePlanRoute(planId?: string): Promise<void> {
  const currentPlanId = typeof route.query.plan === 'string' ? route.query.plan : undefined
  if (currentPlanId === planId && route.query.new === undefined) return

  await router.replace({
    name: 'weekly-plan',
    query: planId ? { plan: planId } : {},
  })
}

async function initializePlan(): Promise<void> {
  const entryPath = route.fullPath
  isLoading.value = true
  errorMessage.value = ''
  cloudErrorMessage.value = ''

  try {
    await loadCloudPlans()
    if (cloudErrorMessage.value || isUnmounting || route.fullPath !== entryPath) return

    const requestedPlanId = typeof route.query.plan === 'string' ? route.query.plan : undefined
    const requestedPlan = cloudPlans.value.find((plan) => plan.id === requestedPlanId)
    const latestPlan = cloudPlans.value.at(-1)

    if (route.query.new === '1') {
      await startNewPlan()
    } else if (requestedPlan) {
      await openCloudPlan(requestedPlan)
    } else if (latestPlan) {
      // A bare /plan is the tab entry. Explicit Step ① links include the plan ID.
      if (route.query.plan === undefined) {
        const planned = Object.fromEntries(
          latestPlan.exercises.map((exercise) => [exercise.exerciseId, exercise.plannedSets]),
        )
        const schedule = reconcileWeeklyPlanSchedule(latestPlan.schedule, planned)
        const hasAssignedSets = schedule.cards.some(
          (card) => schedule.weekdayCardIds.includes(card.id) && card.exercises.length > 0,
        )

        if (hasAssignedSets) {
          await router.replace({ name: 'weekly-schedule', query: { plan: latestPlan.id } })
          return
        }
      }

      await openCloudPlan(latestPlan)
    } else {
      await startNewPlan()
      // An untouched empty form is not an unsaved edit.
      isDirty.value = false
    }
  } catch (error: unknown) {
    cloudErrorMessage.value = error instanceof Error ? error.message : '无法读取云端计划'
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  muscleBoardResizeObserver = new ResizeObserver(measureMuscleBoardSlides)
  await initializePlan()
  if (isUnmounting) return
  await nextTick()
  observeMuscleBoardSlides()
})

watch(
  muscleBoardSlides,
  async () => {
    await nextTick()
    observeMuscleBoardSlides()
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  isUnmounting = true
  window.clearTimeout(clearConfirmationTimer)
  clearMuscleBoardAnimationTimer()
  muscleBoardResizeObserver?.disconnect()
})

onBeforeRouteLeave(() =>
  !isDirty.value || window.confirm('当前计划还有未保存修改，离开后这些修改会丢失。继续吗？'),
)
</script>

<template>
  <main class="plan-shell">
    <section class="plan-fixed-panel" aria-label="固定的计划工具栏和肌束看板">
      <header class="plan-page-header">
        <RouterLink class="plan-back-link" to="/" aria-label="返回主页">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </RouterLink>
        <h1>七天训练计划</h1>
        <WeeklyPlanMenu
          :name="activeCloudPlan?.name ?? '新计划'"
          :active-id="activeCloudPlanId"
          :plans="cloudPlans"
          :loading="isLoadingCloudPlans"
          :error="cloudErrorMessage"
          :disabled="isLoading || isSaving"
          @open="loadCloudPlans"
          @select="selectCloudPlan"
          @create="startNewPlan"
        />
      </header>

      <WeeklyPlanSteps
        class="plan-step-switcher"
        step="plan"
        :plan-id="!isLoading && !cloudErrorMessage ? activeCloudPlanId : undefined"
        :schedule-unavailable-reason="scheduleUnavailableReason"
        :status="isLoading ? '读取中…' : cloudErrorMessage ? '出错' : isSaving ? '保存中…' : isDirty ? '未保存' : statusMessage || '已保存'"
        :status-tone="cloudErrorMessage ? 'error' : isLoading || isSaving ? undefined : isDirty ? 'dirty' : 'saved'"
      >
        <button
          class="clear-plan-button"
          :class="{ confirming: isConfirmingClear }"
          type="button"
          :disabled="isLoading || isSaving || Boolean(cloudErrorMessage)"
          @click="handleClear"
        >
          {{ isConfirmingClear ? '确认清空' : '清空' }}
        </button>
        <button
          class="save-plan-button"
          type="button"
          :disabled="isLoading || isSaving || !isDirty || Boolean(cloudErrorMessage)"
          @click="handleSave"
        >
          {{ isSaving ? '保存中…' : '保存' }}
        </button>
      </WeeklyPlanSteps>

      <section
        v-if="!isLoading && !cloudErrorMessage"
        class="plan-muscle-board"
        aria-label="肌束目标看板"
      >
        <nav class="plan-part-selector" aria-label="选择目标部位">
          <button
            v-for="{ part, reached, planned } in partProgress"
            :key="part"
            type="button"
            :data-part="part"
            :aria-pressed="selectedPart === part"
            @click="selectPlanPart(part)"
          >
            <span>{{ part }}</span>
            <span v-if="planned">{{ reached }}/{{ planned }}</span>
            <span v-else>未设置</span>
          </button>
        </nav>

        <div class="plan-muscle-board-frame">
          <div
            ref="muscleBoardViewport"
            class="plan-muscle-card-viewport"
            :class="{
              'is-dragging': isMuscleBoardDragging,
              'is-animating': muscleBoardTransitionEnabled,
            }"
            :style="muscleBoardViewportStyle"
            aria-live="polite"
            @pointerdown="handleMuscleBoardPointerDown"
            @pointermove="handleMuscleBoardPointerMove"
            @pointerup="handleMuscleBoardPointerUp"
            @pointercancel="handleMuscleBoardPointerCancel"
            @pointerleave="handleMuscleBoardPointerLeave"
          >
            <div
              v-for="slide in muscleBoardSlides"
              :key="`${slide.position}:${slide.part}`"
              class="plan-muscle-card-slide"
              :class="{ 'is-current': slide.position === 0 }"
              :data-muscle-board-position="slide.position"
              :style="getMuscleBoardSlideStyle(slide.position)"
              :aria-hidden="slide.position === 0 ? undefined : true"
              :inert="slide.position !== 0"
            >
              <section
                class="plan-muscle-table-card"
                :data-part="slide.part"
                :aria-label="`${slide.part}肌束计划`"
              >
                <header class="plan-muscle-table-heading">
                  <span>肌束</span>
                  <span>已安排</span>
                  <span>计划</span>
                </header>
                <div class="plan-muscle-table-rows">
                  <button
                    v-for="muscle in slide.muscles.slice(0, muscleRowLimits[slide.part])"
                    :key="muscle"
                    class="plan-muscle-table-row"
                    :data-part="slide.part === '全部' ? muscleToPlanPart.get(muscle) : undefined"
                    type="button"
                    :aria-label="
                      hasTarget(muscle)
                        ? `${muscle}，已安排${formatSetCount(muscleTotals[muscle])}组，计划${getTargetSets(muscle)}组，点击修改计划`
                        : `${muscle}，已安排${formatSetCount(muscleTotals[muscle])}组，尚未设置计划，点击设置`
                    "
                    @click="handleMuscleRowClick(slide.position, muscle)"
                  >
                    <strong>{{ muscle }}</strong>
                    <span>{{ formatSetCount(muscleTotals[muscle]) }}</span>
                    <span :class="{ unset: !hasTarget(muscle) }">
                      {{ getTargetSets(muscle) ?? '—' }}
                    </span>
                  </button>
                </div>
              </section>
              <div
                v-if="slide.part !== '全部' && slide.muscles.length > MUSCLE_BOARD_MIN_VISIBLE_ROWS"
                class="plan-muscle-row-grip"
                :data-part="slide.part"
                role="slider"
                :tabindex="slide.position === 0 ? 0 : -1"
                aria-label="调整肌束看板显示行数"
                aria-orientation="vertical"
                :aria-valuemin="MUSCLE_BOARD_MIN_VISIBLE_ROWS"
                :aria-valuemax="slide.muscles.length"
                :aria-valuenow="muscleRowLimits[slide.part] ?? slide.muscles.length"
                :aria-valuetext="`显示 ${muscleRowLimits[slide.part] ?? slide.muscles.length} / ${slide.muscles.length} 条肌束`"
                title="上下拖动调整显示行数"
                @pointerdown.stop="startMuscleRowResize"
                @pointermove.stop="moveMuscleRowResize"
                @pointerup.stop="endMuscleRowResize"
                @pointercancel.stop="endMuscleRowResize"
                @lostpointercapture="endMuscleRowResize"
                @keydown="handleMuscleRowResizeKey"
              >
                <span class="plan-muscle-row-grip-icon" aria-hidden="true">
                  <svg viewBox="0 0 16 16"><path d="m5 6 3-3 3 3M5 10l3 3 3-3" /></svg>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </section>

    <section class="plan-action-section" aria-labelledby="plan-actions-title">
      <header class="plan-action-heading">
        <h2 id="plan-actions-title">动作计划</h2>
        <div class="exercise-scope-selector" aria-label="动作显示范围">
          <button
            type="button"
            :aria-pressed="exerciseScope === 'related'"
            @click="exerciseScope = 'related'"
          >
            {{ selectedPart === '全部' ? selectedExercisePart : '当前部位' }}
          </button>
          <button
            type="button"
            :aria-pressed="exerciseScope === 'all'"
            @click="exerciseScope = 'all'"
          >
            全部
          </button>
        </div>
      </header>

      <p v-if="cloudErrorMessage || errorMessage" class="plan-error" role="alert">
        {{ cloudErrorMessage || errorMessage }}
      </p>
      <p v-else-if="isLoading" class="plan-state" role="status">正在读取云端计划…</p>

      <div v-else-if="!cloudErrorMessage" class="plan-action-sections">
        <section
          v-for="section in exerciseSections"
          :key="section.key"
          class="plan-exercise-section"
          :aria-labelledby="`exercise-section-${section.key}`"
        >
          <header class="plan-exercise-section-heading">
            <h3 :id="`exercise-section-${section.key}`">{{ section.label }}</h3>
            <span v-if="section.key === 'planned'">
              {{ section.count }} 个动作，共 {{ section.setCount }} 组
            </span>
            <span v-else>{{ section.count }} 个动作</span>
          </header>

          <p v-if="section.groups.length === 0" class="plan-exercise-empty">
            {{ section.emptyLabel }}
          </p>

          <div v-for="group in section.groups" :key="group.part" class="plan-exercise-group">
            <div class="plan-exercise-part-heading">
              <span>{{ group.part }}</span>
              <i aria-hidden="true"></i>
            </div>

            <div class="plan-action-list">
              <article
                v-for="exercise in group.exercises"
                :key="exercise.id"
                class="plan-action-row"
                :class="{ active: getExerciseSetCount(exercise.id) > 0 }"
              >
                <div class="plan-action-copy">
                  <strong>{{ exercise.name }}</strong>
                  <span>{{ getEffectLabel(exercise) }}</span>
                </div>
                <div class="plan-set-stepper" :aria-label="`${exercise.name}计划组数`">
                  <button
                    type="button"
                    aria-label="减少一组"
                    :disabled="getExerciseSetCount(exercise.id) === 0"
                    @click="changeExerciseSets(exercise.id, -1)"
                  >
                    −
                  </button>
                  <span>{{ getExerciseSetCount(exercise.id) }}组</span>
                  <button
                    type="button"
                    aria-label="增加一组"
                    @click="changeExerciseSets(exercise.id, 1)"
                  >
                    +
                  </button>
                </div>
              </article>
            </div>
          </div>
        </section>
      </div>
    </section>

    <dialog
      ref="targetDialog"
      class="target-dialog"
      aria-labelledby="target-dialog-title"
      @click.self="closeTargetEditor"
      @cancel="closeTargetEditor"
    >
      <div v-if="editingMuscle" class="target-dialog-content">
        <header>
          <div>
            <p>七天目标</p>
            <h2 id="target-dialog-title">{{ editingMuscle }}</h2>
          </div>
          <button type="button" aria-label="关闭" @click="closeTargetEditor">×</button>
        </header>

        <p class="target-dialog-hint">圆环中的每一段代表 1 组</p>

        <div class="target-stepper" aria-label="目标组数">
          <button
            type="button"
            aria-label="目标减少一组"
            :disabled="editingTargetSets <= 1"
            @click="changeEditingTarget(-1)"
          >
            −
          </button>
          <strong>{{ editingTargetSets }}<small>组</small></strong>
          <button type="button" aria-label="目标增加一组" @click="changeEditingTarget(1)">+</button>
        </div>

        <footer>
          <button
            v-if="hasTarget(editingMuscle)"
            class="remove-target-button"
            type="button"
            @click="removeMuscleTarget"
          >
            取消目标
          </button>
          <button class="confirm-target-button" type="button" @click="saveMuscleTarget">
            确定
          </button>
        </footer>
      </div>
    </dialog>
  </main>
</template>

<style scoped>
.plan-shell {
  width: min(100%, 680px);
  min-height: 100vh;
  margin: 0 auto;
  padding: 0 14px calc(var(--app-tab-bar-clearance) + 20px);
}

.plan-fixed-panel {
  position: sticky;
  top: 0;
  z-index: 10;
  margin: 0 -14px;
  padding: calc(6px + env(safe-area-inset-top)) 14px 10px;
  background: rgb(238 241 235 / 96%);
  box-shadow: 0 9px 18px rgb(48 67 52 / 8%);
  backdrop-filter: blur(18px);
}

.plan-page-header {
  display: grid;
  min-height: 46px;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
}

.plan-page-header h1 {
  margin: 0;
  overflow: hidden;
  font-size: var(--text-title);
  letter-spacing: -0.025em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-back-link {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  color: #46634d;
}

.plan-back-link svg {
  width: 29px;
  height: 29px;
  fill: none;
  stroke: currentcolor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.clear-plan-button,
.save-plan-button {
  min-height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--radius-pill);
  font-size: var(--text-caption);
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;
}

.clear-plan-button { background: #f5e7e4; color: #a75a55; }
.clear-plan-button.confirming { background: #a75a55; color: #fff; }
.save-plan-button { background: #52765b; color: #fff; }
.clear-plan-button:disabled,
.save-plan-button:disabled { opacity: 0.6; cursor: default; }

.plan-muscle-board {
  min-width: 0;
}

.plan-step-switcher {
  margin: 5px 0 8px;
}

.plan-part-selector {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  margin-bottom: 9px;
  padding: 3px;
  border-radius: var(--radius-control);
  background: #fff;
  box-shadow: inset 0 0 0 1px #e1e8df;
}

.plan-part-selector button {
  --part-accent: #7d8d3e;
  --part-soft: #f0f4d3;
  display: grid;
  min-width: 0;
  min-height: 38px;
  align-items: center;
  gap: 1px;
  padding: 4px 2px;
  border: 0;
  border-radius: var(--radius-pill);
  background: #fff;
  color: #718078;
  font-size: var(--text-caption);
  line-height: 1.05;
  cursor: pointer;
}

.plan-part-selector button span:last-child {
  overflow: hidden;
  font-size: var(--text-micro);
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-part-selector button[data-part='胸'] {
  --part-accent: #a86e63;
  --part-soft: #f4e6e1;
}

.plan-part-selector button[data-part='背'] {
  --part-accent: #507f73;
  --part-soft: #e0eeea;
}

.plan-part-selector button[data-part='手臂'] {
  --part-accent: #7d6b90;
  --part-soft: #ece7f1;
}

.plan-part-selector button[data-part='腿'] {
  --part-accent: #8b754d;
  --part-soft: #f0eadb;
}

.plan-part-selector button[data-part='全部'] {
  --part-accent: #46634d;
  --part-soft: #e3ecdf;
}

.plan-part-selector button[aria-pressed='true'] {
  background: var(--part-soft);
  color: var(--part-accent);
  font-weight: 800;
}

.plan-muscle-board-frame {
  --plan-card-inset: 10%;
  position: relative;
}

.plan-muscle-row-grip {
  position: absolute;
  z-index: 1;
  right: calc(var(--plan-card-inset) - 22px);
  bottom: -16px;
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 50%;
  cursor: ns-resize;
  touch-action: none;
  user-select: none;
  opacity: var(--plan-card-content-opacity);
}

.plan-muscle-card-viewport.is-animating .plan-muscle-row-grip {
  transition: opacity var(--plan-slide-motion);
}

.plan-muscle-row-grip-icon {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--plan-accent) 42%, transparent);
  border-radius: 50%;
  background: var(--plan-soft);
  color: color-mix(in srgb, var(--plan-accent) 70%, #263128);
  box-shadow: 0 2px 5px rgb(48 67 52 / 15%);
}

.plan-muscle-row-grip-icon svg {
  width: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
}

.plan-muscle-row-grip:focus-visible .plan-muscle-row-grip-icon {
  outline: 2px solid #46634d;
  outline-offset: 2px;
}

.plan-muscle-card-viewport {
  --plan-slide-motion: 220ms cubic-bezier(0.22, 0.61, 0.36, 1);
  position: relative;
  width: 100%;
  min-height: 1px;
  box-sizing: content-box;
  padding-bottom: 14px;
  overflow: hidden;
  touch-action: pan-y;
  transition: height 0ms;
}

.plan-muscle-card-viewport.is-animating {
  transition: height var(--plan-slide-motion);
}

.plan-muscle-card-viewport.is-dragging {
  cursor: grabbing;
  user-select: none;
}

.plan-muscle-card-slide {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  width: 100%;
  pointer-events: none;
  transform-origin: center;
  will-change: transform;
}

.plan-muscle-card-slide.is-current {
  pointer-events: auto;
}

.plan-muscle-card-viewport.is-animating .plan-muscle-card-slide {
  transition: transform var(--plan-slide-motion);
}

.plan-muscle-table-card,
.plan-muscle-row-grip,
.plan-muscle-table-row[data-part] {
  --plan-accent: #7d8d3e;
  --plan-soft: #f1f6d8;
}

.plan-muscle-table-card {
  width: 80%;
  margin-inline: auto;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--plan-accent) 18%, transparent);
  border-radius: var(--radius-card);
  background: var(--plan-soft);
  color: #263128;
  box-shadow: 0 5px 14px rgb(48 67 52 / 6%);
  user-select: none;
}

.plan-muscle-table-card > * {
  opacity: var(--plan-card-content-opacity);
}

.plan-muscle-card-viewport.is-animating .plan-muscle-table-card > * {
  transition: opacity var(--plan-slide-motion);
}

:is(.plan-muscle-table-card, .plan-muscle-row-grip, .plan-muscle-table-row)[data-part='胸'] {
  --plan-accent: #a86e63;
  --plan-soft: #f6ebe8;
}

:is(.plan-muscle-table-card, .plan-muscle-row-grip, .plan-muscle-table-row)[data-part='背'] {
  --plan-accent: #507f73;
  --plan-soft: #e8f1ed;
}

:is(.plan-muscle-table-card, .plan-muscle-row-grip, .plan-muscle-table-row)[data-part='手臂'] {
  --plan-accent: #7d6b90;
  --plan-soft: #f1eef5;
}

:is(.plan-muscle-table-card, .plan-muscle-row-grip, .plan-muscle-table-row)[data-part='腿'] {
  --plan-accent: #8b754d;
  --plan-soft: #f0eadb;
}

.plan-muscle-table-card[data-part='全部'] {
  --plan-accent: #46634d;
  --plan-soft: #eef3ed;
}

.plan-muscle-table-card[data-part='全部'] .plan-muscle-table-rows {
  max-height: min(43svh, 370px);
  overflow-y: auto;
}

.plan-muscle-table-card[data-part='全部'] .plan-muscle-table-row {
  background: var(--plan-soft);
}

.plan-muscle-table-heading,
.plan-muscle-table-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 58px 48px;
  align-items: center;
  column-gap: 5px;
  padding: 0 11px;
}

.plan-muscle-table-heading {
  min-height: 36px;
  color: #68766d;
  font-size: var(--text-caption);
  font-weight: 800;
}

.plan-muscle-table-heading span:not(:first-child) {
  text-align: right;
}

.plan-muscle-table-row {
  width: 100%;
  min-height: 43px;
  border: 0;
  border-top: 1px solid color-mix(in srgb, var(--plan-accent) 14%, transparent);
  background: transparent;
  color: inherit;
  font-size: var(--text-body);
  text-align: left;
  cursor: pointer;
}

.plan-muscle-table-row strong {
  overflow: hidden;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-muscle-table-row span {
  color: #294733;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.plan-muscle-table-row span:last-child {
  color: var(--plan-accent);
}

.plan-muscle-table-row span.unset {
  color: #8c978f;
}

.plan-action-section {
  padding-top: 16px;
}

.plan-action-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.plan-action-heading h2 {
  margin: 0;
  font-size: var(--text-title);
  letter-spacing: -0.025em;
}

.exercise-scope-selector {
  display: inline-flex;
  padding: 3px;
  border-radius: var(--radius-pill);
  background: #fff;
}

.exercise-scope-selector button {
  min-height: 32px;
  padding: 0 11px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: #718078;
  font-size: var(--text-caption);
  font-weight: 700;
  cursor: pointer;
}

.exercise-scope-selector button[aria-pressed='true'] {
  background: #e3ecdf;
  color: #46634d;
}

.plan-action-sections {
  display: grid;
  gap: 22px;
}

.plan-exercise-section {
  min-width: 0;
}

.plan-exercise-section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin: 0 2px 8px;
  color: #8d9891;
}

.plan-exercise-section-heading h3 {
  margin: 0;
  font-size: var(--text-body);
  font-weight: 800;
}

.plan-exercise-section-heading span,
.plan-exercise-empty {
  color: #a0aaa3;
  font-size: var(--text-micro);
  font-weight: 700;
}

.plan-exercise-empty {
  margin: 12px 2px;
}

.plan-exercise-group + .plan-exercise-group {
  margin-top: 12px;
}

.plan-exercise-part-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 2px 7px;
  color: #a0aaa3;
  font-size: var(--text-caption);
  font-weight: 700;
}

.plan-exercise-part-heading i {
  height: 1px;
  flex: 1;
  background: #dce2dc;
}

.plan-action-list {
  display: grid;
  gap: 8px;
}

.plan-action-row {
  display: grid;
  min-height: 68px;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 9px 10px 9px 12px;
  border-radius: var(--radius-card);
  background: #fff;
  box-shadow: 0 4px 11px rgb(48 67 52 / 7%);
}

.plan-action-row.active {
  background: #f5f9f2;
}

.plan-action-copy {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.plan-action-copy strong,
.plan-action-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-action-copy strong {
  font-size: var(--text-body);
}

.plan-action-copy span {
  color: #718078;
  font-size: var(--text-micro);
}

.plan-set-stepper {
  display: grid;
  grid-template-columns: 38px 38px 38px;
  align-items: center;
  gap: 1px;
}

.plan-set-stepper button {
  display: grid;
  width: 38px;
  height: 40px;
  place-items: center;
  padding: 0 0 2px;
  border: 0;
  border-radius: var(--radius-circle);
  background: #eef3eb;
  color: #46634d;
  font-size: var(--text-title);
  cursor: pointer;
}

.plan-set-stepper button:disabled {
  cursor: default;
  opacity: 0.35;
}

.plan-set-stepper span {
  text-align: center;
  font-size: var(--text-caption);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.plan-state,
.plan-error {
  margin: 18px 0;
  font-size: var(--text-body);
  text-align: center;
}

.plan-state {
  color: #718078;
}

.plan-error {
  color: #a52d2d;
}

.target-dialog {
  width: min(calc(100% - 28px), 420px);
  max-width: none;
  margin: auto;
  padding: 0;
  border: 0;
  border-radius: var(--radius-modal);
  background: #fff;
  color: #17211a;
  box-shadow: 0 22px 58px rgb(31 54 37 / 24%);
}

.target-dialog::backdrop {
  background: rgb(20 33 24 / 38%);
  backdrop-filter: blur(2px);
}

.target-dialog-content {
  padding: 18px;
}

.target-dialog-content header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.target-dialog-content header p {
  margin: 0 0 3px;
  color: #718078;
  font-size: var(--text-caption);
  font-weight: 700;
}

.target-dialog-content header h2 {
  margin: 0;
  font-size: var(--text-title);
}

.target-dialog-content header button {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  padding: 0 0 3px;
  border: 0;
  border-radius: var(--radius-circle);
  background: #eef3eb;
  color: #46634d;
  font-size: var(--text-display);
  cursor: pointer;
}

.target-dialog-hint {
  margin: 18px 0 10px;
  color: #718078;
  font-size: var(--text-caption);
  text-align: center;
}

.target-stepper {
  display: grid;
  grid-template-columns: 48px minmax(90px, 1fr) 48px;
  align-items: center;
  gap: 10px;
}

.target-stepper button {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  padding: 0 0 3px;
  border: 0;
  border-radius: var(--radius-circle);
  background: #eef3eb;
  color: #46634d;
  font-size: var(--text-display);
  cursor: pointer;
}

.target-stepper button:disabled {
  cursor: default;
  opacity: 0.35;
}

.target-stepper strong {
  text-align: center;
  font-size: var(--text-icon-lg);
  font-variant-numeric: tabular-nums;
}

.target-stepper small {
  margin-left: 4px;
  color: #718078;
  font-size: var(--text-body);
}

.target-dialog-content footer {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 20px;
}

.target-dialog-content footer button {
  min-height: 46px;
  border: 0;
  border-radius: var(--radius-control);
  font-weight: 800;
  cursor: pointer;
}

.remove-target-button {
  background: #f5e7e4;
  color: #a75a55;
}

.confirm-target-button {
  grid-column: 2;
  background: #52765b;
  color: #fff;
}

.target-dialog-content footer .confirm-target-button:only-child {
  grid-column: 1 / -1;
}

.plan-back-link:focus-visible,
.clear-plan-button:focus-visible,
.save-plan-button:focus-visible,
.plan-muscle-table-row:focus-visible,
.plan-part-selector button:focus-visible,
.exercise-scope-selector button:focus-visible,
.plan-set-stepper button:focus-visible,
.target-dialog button:focus-visible {
  outline: 3px solid rgb(70 99 77 / 22%);
  outline-offset: 2px;
}

@media (min-width: 600px) {
  .plan-muscle-board-frame {
    --plan-card-inset: max(10%, calc((100% - 440px) / 2));
  }

  .plan-fixed-panel {
    padding-top: 18px;
  }

  .plan-muscle-table-card {
    width: min(80%, 440px);
  }
}

@media (max-width: 380px) {
  .plan-shell {
    padding-inline: 10px;
  }

  .plan-fixed-panel {
    margin-inline: -10px;
    padding-inline: 10px;
  }

  .plan-page-header {
    grid-template-columns: 40px minmax(0, 1fr) auto;
    gap: 3px;
  }

  .plan-back-link {
    width: 40px;
  }

  .clear-plan-button,
  .save-plan-button {
    padding-inline: 9px;
  }

  .plan-set-stepper {
    grid-template-columns: 34px 36px 34px;
  }

  .plan-set-stepper button {
    width: 34px;
  }
}
</style>
