<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'

import MuscleSourceDialog from '@/components/MuscleSourceDialog.vue'
import MuscleVolumeTable from '@/components/MuscleVolumeTable.vue'
import {
  TRAINING_PERIODS,
  type MuscleName,
  type MuscleTrainingSnapshot,
  type MuscleTrainingSources,
} from '@/domain/trainingStats'

const SHOW_TODAY_COLUMN_KEY = 'fitness-tracker:show-today-muscle-column'
const SHOW_REGION_COLUMN_KEY = 'fitness-tracker:show-muscle-region-column'
const CAROUSEL_DURATION_MS = 220
const HORIZONTAL_GESTURE_THRESHOLD_PX = 7
const SWIPE_DISTANCE_RATIO = 0.22
const SWIPE_VELOCITY_PX_PER_MS = 0.5

type SlidePosition = -1 | 0 | 1
type GestureAxis = 'pending' | 'horizontal' | 'vertical'
type MuscleSourceScope = 'period' | 'today'

interface MuscleCarouselSlide {
  position: SlidePosition
  snapshot: MuscleTrainingSnapshot
}

const props = defineProps<{
  totals: Record<MuscleName, number>
  sources: MuscleTrainingSources
  todayTotals: Record<MuscleName, number>
  todaySources: MuscleTrainingSources
  trainingSetCount: number
  periodIndex: number
  weekOffset: number
  dateRange: string
  olderSnapshot?: MuscleTrainingSnapshot
  newerSnapshot?: MuscleTrainingSnapshot
  isLoading: boolean
  isLoadingToday: boolean
  error: string
}>()

const emit = defineEmits<{
  changePeriod: [periodIndex: number]
  changeWeek: [weekDelta: number]
}>()

const carouselViewport = ref<HTMLElement>()
const selectedMuscle = ref<MuscleName>()
const selectedMuscleSourceScope = ref<MuscleSourceScope>('period')
const showTodayColumn = ref(localStorage.getItem(SHOW_TODAY_COLUMN_KEY) === 'true')
const showRegionColumn = ref(localStorage.getItem(SHOW_REGION_COLUMN_KEY) !== 'false')
const viewportHeight = ref(0)
const dragOffset = ref(0)
const transitionEnabled = ref(false)
const isDragging = ref(false)
const isAnimating = ref(false)
const slideHeights = ref<Partial<Record<SlidePosition, number>>>({})

let resizeObserver: ResizeObserver | undefined
let activePointerId: number | undefined
let gestureAxis: GestureAxis = 'pending'
let gestureStartX = 0
let gestureStartY = 0
let gestureStartTime = 0
let animationTimer: number | undefined
let suppressTableClickUntil = 0

const selectedPeriod = computed(() => TRAINING_PERIODS[props.periodIndex]!)
const currentSnapshot = computed<MuscleTrainingSnapshot>(() => ({
  periodIndex: props.periodIndex,
  weekOffset: props.weekOffset,
  dateRange: props.dateRange,
  totals: props.totals,
  sources: props.sources,
  trainingSetCount: props.trainingSetCount,
}))
const carouselSlides = computed<MuscleCarouselSlide[]>(() => {
  const slides: MuscleCarouselSlide[] = []

  if (props.olderSnapshot) {
    slides.push({ position: -1, snapshot: props.olderSnapshot })
  }

  slides.push({ position: 0, snapshot: currentSnapshot.value })

  if (props.newerSnapshot) {
    slides.push({ position: 1, snapshot: props.newerSnapshot })
  }

  return slides
})
const selectedMuscleSources = computed(() => {
  if (!selectedMuscle.value) return []

  return selectedMuscleSourceScope.value === 'today'
    ? props.todaySources[selectedMuscle.value]
    : props.sources[selectedMuscle.value]
})
const selectedMuscleTotal = computed(() => {
  if (!selectedMuscle.value) return 0

  return selectedMuscleSourceScope.value === 'today'
    ? props.todayTotals[selectedMuscle.value]
    : props.totals[selectedMuscle.value]
})
const selectedMuscleDateRange = computed(() =>
  selectedMuscleSourceScope.value === 'today' ? '今天' : props.dateRange,
)
const carouselStyle = computed(() =>
  viewportHeight.value > 0 ? { height: `${viewportHeight.value}px` } : undefined,
)

function handlePeriodChange(event: Event): void {
  if (isDragging.value || isAnimating.value) return

  emit('changePeriod', Number((event.target as HTMLSelectElement).value))
}

function toggleTodayColumn(): void {
  showTodayColumn.value = !showTodayColumn.value
  localStorage.setItem(SHOW_TODAY_COLUMN_KEY, String(showTodayColumn.value))
}

function toggleRegionColumn(): void {
  showRegionColumn.value = !showRegionColumn.value
  localStorage.setItem(SHOW_REGION_COLUMN_KEY, String(showRegionColumn.value))
}

function handleTableToggle(position: SlidePosition): void {
  if (position === 0 && !isDragging.value && !isAnimating.value) toggleTodayColumn()
}

function handleRegionToggle(position: SlidePosition): void {
  if (position === 0 && !isDragging.value && !isAnimating.value) toggleRegionColumn()
}

function handleMuscleSelection(
  position: SlidePosition,
  muscle: MuscleName,
  sourceScope: MuscleSourceScope,
): void {
  if (
    position !== 0 ||
    isDragging.value ||
    isAnimating.value ||
    Date.now() < suppressTableClickUntil
  ) {
    return
  }

  selectedMuscleSourceScope.value = sourceScope
  selectedMuscle.value = muscle
}

function getSlideStyle(position: SlidePosition): Record<string, string> {
  return {
    transform: `translate3d(calc(${position * 100}% + ${dragOffset.value}px), 0, 0)`,
    transition: transitionEnabled.value
      ? `transform ${CAROUSEL_DURATION_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`
      : 'none',
  }
}

function measureSlides(): void {
  const viewport = carouselViewport.value

  if (!viewport) return

  const nextHeights: Partial<Record<SlidePosition, number>> = {}

  for (const slide of viewport.querySelectorAll<HTMLElement>('[data-slide-position]')) {
    const position = Number(slide.dataset.slidePosition) as SlidePosition
    nextHeights[position] = slide.offsetHeight
  }

  slideHeights.value = nextHeights

  if (!isDragging.value && !isAnimating.value && nextHeights[0]) {
    viewportHeight.value = nextHeights[0]
  }
}

function observeSlides(): void {
  const viewport = carouselViewport.value

  if (!viewport || !resizeObserver) return

  resizeObserver.disconnect()

  for (const slide of viewport.querySelectorAll<HTMLElement>('[data-slide-position]')) {
    resizeObserver.observe(slide)
  }

  measureSlides()
}

function getTargetPosition(offset: number): SlidePosition | undefined {
  if (offset > 0 && props.olderSnapshot) return -1
  if (offset < 0 && props.newerSnapshot) return 1

  return undefined
}

function updateViewportHeightForOffset(offset: number): void {
  const currentHeight = slideHeights.value[0]
  const targetPosition = getTargetPosition(offset)
  const targetHeight = targetPosition === undefined ? undefined : slideHeights.value[targetPosition]
  const viewportWidth = carouselViewport.value?.clientWidth ?? 0

  if (!currentHeight || !targetHeight || !viewportWidth) return

  const progress = Math.min(Math.abs(offset) / viewportWidth, 1)
  viewportHeight.value = currentHeight + (targetHeight - currentHeight) * progress
}

function clearAnimationTimer(): void {
  if (animationTimer === undefined) return

  window.clearTimeout(animationTimer)
  animationTimer = undefined
}

function finishAtCurrentSlide(): void {
  transitionEnabled.value = true
  isAnimating.value = true
  dragOffset.value = 0

  if (slideHeights.value[0]) viewportHeight.value = slideHeights.value[0]

  clearAnimationTimer()
  animationTimer = window.setTimeout(() => {
    transitionEnabled.value = false
    isAnimating.value = false
    animationTimer = undefined
  }, CAROUSEL_DURATION_MS)
}

function navigateToSlide(position: Exclude<SlidePosition, 0>): void {
  if (isAnimating.value) return

  const targetSnapshot = position === -1 ? props.olderSnapshot : props.newerSnapshot
  const weekDelta = position === -1 ? 1 : -1

  if (!targetSnapshot) {
    emit('changeWeek', weekDelta)
    return
  }

  const viewportWidth = carouselViewport.value?.clientWidth ?? 0

  if (!viewportWidth) {
    emit('changeWeek', weekDelta)
    return
  }

  transitionEnabled.value = true
  isAnimating.value = true
  dragOffset.value = position === -1 ? viewportWidth : -viewportWidth

  if (slideHeights.value[position]) viewportHeight.value = slideHeights.value[position]!

  clearAnimationTimer()
  animationTimer = window.setTimeout(() => {
    emit('changeWeek', weekDelta)

    void nextTick().then(() => {
      transitionEnabled.value = false
      dragOffset.value = 0
      isAnimating.value = false
      animationTimer = undefined
      observeSlides()
    })
  }, CAROUSEL_DURATION_MS)
}

function handleArrowNavigation(position: Exclude<SlidePosition, 0>): void {
  if (props.isLoading || isDragging.value || isAnimating.value) return

  navigateToSlide(position)
}

function handlePointerDown(event: PointerEvent): void {
  if (
    event.button !== 0 ||
    isAnimating.value ||
    !selectedPeriod.value.canNavigateWeeks ||
    (!props.olderSnapshot && !props.newerSnapshot)
  ) {
    return
  }

  activePointerId = event.pointerId
  gestureAxis = 'pending'
  gestureStartX = event.clientX
  gestureStartY = event.clientY
  gestureStartTime = performance.now()
  transitionEnabled.value = false
  carouselViewport.value?.setPointerCapture(event.pointerId)
}

function handlePointerMove(event: PointerEvent): void {
  if (event.pointerId !== activePointerId) return

  const horizontalDistance = event.clientX - gestureStartX
  const verticalDistance = event.clientY - gestureStartY

  if (gestureAxis === 'pending') {
    if (
      Math.abs(horizontalDistance) < HORIZONTAL_GESTURE_THRESHOLD_PX &&
      Math.abs(verticalDistance) < HORIZONTAL_GESTURE_THRESHOLD_PX
    ) {
      return
    }

    gestureAxis =
      Math.abs(horizontalDistance) > Math.abs(verticalDistance) ? 'horizontal' : 'vertical'
  }

  if (gestureAxis !== 'horizontal') return

  event.preventDefault()
  isDragging.value = true

  const hasTarget = getTargetPosition(horizontalDistance) !== undefined
  const nextOffset = hasTarget ? horizontalDistance : horizontalDistance * 0.18

  dragOffset.value = nextOffset
  updateViewportHeightForOffset(nextOffset)
}

function releasePointer(event: PointerEvent): void {
  if (carouselViewport.value?.hasPointerCapture(event.pointerId)) {
    carouselViewport.value.releasePointerCapture(event.pointerId)
  }

  activePointerId = undefined
}

function handlePointerUp(event: PointerEvent): void {
  if (event.pointerId !== activePointerId) return

  const wasHorizontalGesture = gestureAxis === 'horizontal'
  const offset = dragOffset.value
  const elapsedTime = Math.max(performance.now() - gestureStartTime, 1)
  const velocity = Math.abs(offset) / elapsedTime
  const viewportWidth = carouselViewport.value?.clientWidth ?? 0
  const targetPosition = getTargetPosition(offset)
  const shouldNavigate =
    targetPosition !== undefined &&
    (Math.abs(offset) >= viewportWidth * SWIPE_DISTANCE_RATIO ||
      velocity >= SWIPE_VELOCITY_PX_PER_MS)

  releasePointer(event)
  gestureAxis = 'pending'

  if (!wasHorizontalGesture) return

  suppressTableClickUntil = Date.now() + 350
  isDragging.value = false

  if (shouldNavigate && targetPosition !== undefined && targetPosition !== 0) {
    navigateToSlide(targetPosition)
  } else {
    finishAtCurrentSlide()
  }
}

function handlePointerCancel(event: PointerEvent): void {
  if (event.pointerId !== activePointerId) return

  const wasHorizontalGesture = gestureAxis === 'horizontal'

  releasePointer(event)
  gestureAxis = 'pending'
  isDragging.value = false

  if (wasHorizontalGesture) finishAtCurrentSlide()
}

onMounted(() => {
  resizeObserver = new ResizeObserver(measureSlides)
  observeSlides()
})

watch(
  [carouselSlides, showTodayColumn, showRegionColumn],
  async () => {
    selectedMuscle.value = undefined
    await nextTick()
    observeSlides()
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  clearAnimationTimer()
  resizeObserver?.disconnect()
})
</script>

<template>
  <section class="dashboard-card spaced-dashboard-card" aria-labelledby="muscle-title">
    <div class="section-heading">
      <div class="muscle-title-row">
        <h2 id="muscle-title">肌束训练量</h2>
      </div>
      <div class="muscle-control-row">
        <span v-if="!isLoading" class="set-count">已训练 {{ trainingSetCount }} 组</span>
        <select
          class="period-select"
          :value="periodIndex"
          :disabled="isLoading || isAnimating"
          aria-label="选择肌束训练量统计周期"
          @change="handlePeriodChange"
        >
          <option v-for="(period, index) in TRAINING_PERIODS" :key="period.id" :value="index">
            {{ period.label }}
          </option>
        </select>
      </div>
      <div class="period-date-navigation">
        <button
          v-if="selectedPeriod.canNavigateWeeks"
          class="period-arrow-button period-arrow-button--previous"
          type="button"
          :disabled="isLoading || isAnimating"
          aria-label="查看上一个肌束统计周"
          @click="handleArrowNavigation(-1)"
        >
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
            <path d="m15 5-7 7 7 7" />
          </svg>
        </button>
        <span class="date-range">{{ dateRange }}</span>
        <button
          v-if="selectedPeriod.canNavigateWeeks"
          class="period-arrow-button period-arrow-button--next"
          type="button"
          :disabled="isLoading || isAnimating || weekOffset === 0"
          aria-label="查看下一个肌束统计周"
          @click="handleArrowNavigation(1)"
        >
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
            <path d="m9 5 7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>

    <div
      ref="carouselViewport"
      class="muscle-carousel"
      :class="{ 'is-dragging': isDragging, 'is-animating': transitionEnabled }"
      :style="carouselStyle"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerCancel"
    >
      <div
        v-for="slide in carouselSlides"
        :key="`${slide.position}:${slide.snapshot.periodIndex}:${slide.snapshot.weekOffset}`"
        class="muscle-carousel-slide"
        :class="{ 'is-current': slide.position === 0 }"
        :data-slide-position="slide.position"
        :style="getSlideStyle(slide.position)"
        :aria-hidden="slide.position === 0 ? undefined : true"
      >
        <MuscleVolumeTable
          :totals="slide.snapshot.totals"
          :today-totals="todayTotals"
          :show-today-column="showTodayColumn"
          :show-region-column="showRegionColumn"
          :is-loading="slide.position === 0 && isLoading"
          :is-loading-today="isLoadingToday"
          :error="slide.position === 0 ? error : ''"
          @select-muscle="handleMuscleSelection(slide.position, $event, 'period')"
          @select-today-muscle="handleMuscleSelection(slide.position, $event, 'today')"
          @toggle-today-column="handleTableToggle(slide.position)"
          @toggle-region-column="handleRegionToggle(slide.position)"
        />
      </div>
    </div>

    <p v-if="error" class="section-error" role="alert">{{ error }}</p>
  </section>

  <MuscleSourceDialog
    :muscle="selectedMuscle"
    :sources="selectedMuscleSources"
    :total="selectedMuscleTotal"
    :date-range="selectedMuscleDateRange"
    @close="selectedMuscle = undefined"
  />
</template>

<style scoped>
.section-heading {
  position: relative;
  display: block;
}

.muscle-title-row,
.muscle-control-row {
  display: flex;
  align-items: center;
}

.muscle-title-row {
  justify-content: flex-start;
}

.muscle-control-row {
  min-height: 28px;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
}

.set-count {
  padding: 6px 10px;
  border-radius: 999px;
  background: #e5eddf;
  color: #46634d;
  font-size: 0.78rem;
  font-weight: 800;
}

.period-date-navigation {
  position: relative;
  display: grid;
  min-height: 30px;
  grid-template-columns: 30px 150px 30px;
  align-items: center;
  column-gap: 10px;
  justify-content: center;
  margin-top: 6px;
}

.period-date-navigation .date-range {
  grid-column: 2;
  margin-top: 0;
  font-size: 0.88rem;
  text-align: center;
  white-space: nowrap;
}

.period-arrow-button {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: #46634d;
  line-height: 1;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.period-arrow-button svg {
  display: block;
  width: 30px;
  height: 30px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.25;
}

.period-arrow-button--previous {
  grid-column: 1;
}

.period-arrow-button--next {
  grid-column: 3;
}

.period-arrow-button:disabled {
  cursor: default;
  opacity: 0.35;
}

.muscle-carousel {
  position: relative;
  overflow: hidden;
  width: 100%;
  min-height: 1px;
  touch-action: pan-y;
  transition: height 0ms;
}

.muscle-carousel.is-animating {
  transition-duration: 220ms;
  transition-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);
}

.muscle-carousel.is-dragging {
  cursor: grabbing;
  user-select: none;
}

.muscle-carousel-slide {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  width: 100%;
  pointer-events: none;
  will-change: transform;
}

.muscle-carousel-slide.is-current {
  pointer-events: auto;
}
</style>
