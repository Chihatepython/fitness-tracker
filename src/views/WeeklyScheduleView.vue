<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, RouterLink, useRoute, useRouter } from 'vue-router'

import WeeklyPlanMenu from '@/components/WeeklyPlanMenu.vue'
import WeeklyPlanSteps from '@/components/WeeklyPlanSteps.vue'
import { useSupabaseAuth } from '@/composables/useSupabaseAuth'
import { EXERCISES, type ExerciseId } from '@/database'
import type { WeeklyPlanDayCard, WeeklyPlanSchedule } from '@/domain/weeklyPlan'
import {
  listWeeklyPlans,
  updateWeeklyPlanSchedule,
  type CloudWeeklyPlan,
} from '@/services/weeklyPlans'
import {
  createEmptyWeeklyPlanSchedule,
  createWeeklyPlanDayCard,
  normalizeWeeklyPlanSchedule,
  reconcileWeeklyPlanSchedule,
} from '@/services/weeklyPlanSchedule'

const PLAN_DAYS = ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'] as const
const HOLD_TO_LIFT_MS = 450
const HOVER_TO_SWAP_MS = 500
const HOLD_MOVE_TOLERANCE_PX = 10

const route = useRoute()
const router = useRouter()
const plan = ref<CloudWeeklyPlan>()
const cloudPlans = ref<CloudWeeklyPlan[]>([])
const schedule = ref<WeeklyPlanSchedule>()
const selectedCardId = ref<string>()
const isLoading = ref(true)
const isSaving = ref(false)
const isDirty = ref(false)
const isConfirmingClear = ref(false)
const errorMessage = ref('')
const savedMessage = ref('')
const { initialize: initializeAuth, session } = useSupabaseAuth()
let clearConfirmationTimer: number | undefined
let scheduleLoadVersion = 0
const weekdaySlots = ref<HTMLElement>()
const liftedSlot = ref<{ index: number; x: number; y: number; origin: string }>()
const previewSlot = ref<{ index: number; x: number; y: number }>()
const skipSwapMotion = ref(false)
let press: {
  pointerId: number
  index: number
  startX: number
  startY: number
  x: number
  y: number
  cancelled: boolean
} | undefined
let hoverIndex: number | undefined
let liftTimer: number | undefined
let swapTimer: number | undefined
let suppressSlotClick = false

const exerciseById = new Map(EXERCISES.map((exercise) => [exercise.id, exercise]))

const plannedSetsByExercise = computed<Partial<Record<ExerciseId, number>>>(() =>
  Object.fromEntries(
    (plan.value?.exercises ?? []).map((exercise) => [exercise.exerciseId, exercise.plannedSets]),
  ),
)

const selectedCard = computed(() =>
  schedule.value?.cards.find((card) => card.id === selectedCardId.value),
)

const allocatedSetsByExercise = computed<Partial<Record<ExerciseId, number>>>(() => {
  const totals: Partial<Record<ExerciseId, number>> = {}

  for (const card of schedule.value?.cards ?? []) {
    for (const exercise of card.exercises) {
      totals[exercise.exerciseId] = (totals[exercise.exerciseId] ?? 0) + exercise.sets
    }
  }

  return totals
})

const remainingExercises = computed(() =>
  (plan.value?.exercises ?? [])
    .map((plannedExercise) => ({
      plannedExercise,
      definition: exerciseById.get(plannedExercise.exerciseId),
      remaining:
        plannedExercise.plannedSets -
        (allocatedSetsByExercise.value[plannedExercise.exerciseId] ?? 0),
    }))
    .filter(
      (item): item is typeof item & { definition: NonNullable<typeof item.definition> } =>
        Boolean(item.definition) && item.remaining > 0,
    )
    .sort((left, right) => left.plannedExercise.order - right.plannedExercise.order),
)

const totalPlannedSets = computed(() =>
  (plan.value?.exercises ?? []).reduce((total, exercise) => total + exercise.plannedSets, 0),
)

const totalAllocatedSets = computed(() =>
  Object.values(allocatedSetsByExercise.value).reduce((total, sets) => total + (sets ?? 0), 0),
)

function getExercise(exerciseId: ExerciseId) {
  return exerciseById.get(exerciseId)
}

function getPartLabel(bodyPart: string): string {
  return bodyPart === '手臂' ? '臂' : bodyPart
}

function getCardSetCount(card: WeeklyPlanDayCard): number {
  return card.exercises.reduce((total, exercise) => total + exercise.sets, 0)
}

function getCardForWeekday(index: number): WeeklyPlanDayCard | undefined {
  const cardId = schedule.value?.weekdayCardIds[index]
  return cardId ? schedule.value?.cards.find((card) => card.id === cardId) : undefined
}

function markChanged(message: string): void {
  if (!schedule.value) return

  schedule.value.updatedAt = Date.now()
  isDirty.value = true
  isConfirmingClear.value = false
  savedMessage.value = message
}

function createCard(weekdayIndex?: number): void {
  if (!schedule.value) return

  const usedNumbers = schedule.value.cards.flatMap((card) => {
    const match = /^训练日(\d+)$/.exec(card.name)
    return match ? [Number(match[1])] : []
  })
  const nextNumber = Math.max(0, ...usedNumbers) + 1
  const card = createWeeklyPlanDayCard(nextNumber)
  schedule.value.cards.push(card)
  if (weekdayIndex !== undefined) schedule.value.weekdayCardIds[weekdayIndex] = card.id
  selectedCardId.value = card.id
  markChanged('未保存')
}

function handleWeekdaySlotClick(targetIndex: number, event: MouseEvent): void {
  if (event.detail > 0 && suppressSlotClick) {
    suppressSlotClick = false
    return
  }
  if (!schedule.value) return

  const targetId = schedule.value.weekdayCardIds[targetIndex] ?? null
  if (targetId) {
    selectedCardId.value = targetId
    return
  }

  createCard(targetIndex)
}

function getSlotBounds(index: number): DOMRect | undefined {
  return weekdaySlots.value?.querySelector(`[data-weekday-index="${index}"]`)?.getBoundingClientRect()
}

function pointerInSlot(bounds: DOMRect | undefined, x: number, y: number): boolean {
  return !!bounds && x >= bounds.left && x < bounds.right && y >= bounds.top && y < bounds.bottom
}

function startWeekdayPress(index: number, event: PointerEvent): void {
  if (!event.isPrimary || event.button !== 0 || press) return
  suppressSlotClick = false
  if (isSaving.value || !getCardForWeekday(index)) return

  const button = event.currentTarget as HTMLButtonElement
  button.setPointerCapture(event.pointerId)
  skipSwapMotion.value = false
  press = {
    pointerId: event.pointerId,
    index,
    startX: event.clientX,
    startY: event.clientY,
    x: event.clientX,
    y: event.clientY,
    cancelled: false,
  }
  liftTimer = window.setTimeout(() => {
    const current = press
    const bounds = getSlotBounds(index)
    if (!current || current.cancelled || !bounds || !pointerInSlot(bounds, current.x, current.y)) return

    suppressSlotClick = true
    liftedSlot.value = {
      index,
      x: current.x - current.startX,
      y: current.y - current.startY,
      origin: `${current.startX - bounds.left}px ${current.startY - bounds.top}px`,
    }
  }, HOLD_TO_LIFT_MS)
}

function updateSwapHover(x: number, y: number): void {
  const sourceIndex = liftedSlot.value?.index
  if (sourceIndex === undefined) return
  const targetIndex = PLAN_DAYS.findIndex((_, index) =>
    index !== sourceIndex && pointerInSlot(getSlotBounds(index), x, y),
  )
  const nextHover = targetIndex < 0 ? undefined : targetIndex
  if (hoverIndex === nextHover) return

  hoverIndex = nextHover
  window.clearTimeout(swapTimer)
  previewSlot.value = undefined
  if (nextHover === undefined) return

  swapTimer = window.setTimeout(() => {
    const source = getSlotBounds(sourceIndex)
    const target = getSlotBounds(nextHover)
    if (!press || !source || !target || hoverIndex !== nextHover ||
        !pointerInSlot(target, press.x, press.y)) return

    previewSlot.value = {
      index: nextHover,
      x: source.left - target.left,
      y: source.top - target.top,
    }
  }, HOVER_TO_SWAP_MS)
}

function moveWeekdayPress(event: PointerEvent): void {
  if (!press || press.pointerId !== event.pointerId) return
  press.x = event.clientX
  press.y = event.clientY
  if (!liftedSlot.value) {
    if (Math.hypot(press.x - press.startX, press.y - press.startY) > HOLD_MOVE_TOLERANCE_PX ||
        !pointerInSlot(getSlotBounds(press.index), press.x, press.y)) {
      press.cancelled = true
      window.clearTimeout(liftTimer)
    }
    return
  }

  liftedSlot.value.x = press.x - press.startX
  liftedSlot.value.y = press.y - press.startY
  updateSwapHover(press.x, press.y)
}

function resetWeekdayDrag(): void {
  window.clearTimeout(liftTimer)
  window.clearTimeout(swapTimer)
  press = undefined
  hoverIndex = undefined
  liftedSlot.value = undefined
  previewSlot.value = undefined
}

function finishWeekdayPress(event: PointerEvent): void {
  if (!press || press.pointerId !== event.pointerId) return
  const targetIndex = previewSlot.value?.index
  const sourceIndex = press.index
  suppressSlotClick ||= press.cancelled || !pointerInSlot(getSlotBounds(sourceIndex), event.clientX, event.clientY)
  if (event.type === 'pointerup' && targetIndex !== undefined &&
      pointerInSlot(getSlotBounds(targetIndex), event.clientX, event.clientY)) {
    const assignments = schedule.value?.weekdayCardIds
    const sourceId = assignments?.[sourceIndex]
    if (assignments && sourceId) {
      skipSwapMotion.value = true
      assignments[sourceIndex] = assignments[targetIndex] ?? null
      assignments[targetIndex] = sourceId
      selectedCardId.value = sourceId
      markChanged('未保存')
    }
  }
  resetWeekdayDrag()
}

function getWeekdaySlotStyle(index: number): Record<string, string> | undefined {
  const lifted = liftedSlot.value
  if (lifted?.index === index) {
    return {
      transform: `translate3d(${lifted.x}px, ${lifted.y}px, 0) scale(1.13)`,
      transformOrigin: lifted.origin,
    }
  }
  const preview = previewSlot.value
  if (preview?.index === index) {
    return { transform: `translate3d(${preview.x}px, ${preview.y}px, 0)` }
  }
}

function addExerciseSet(exerciseId: ExerciseId): void {
  if (!selectedCard.value) return

  const plannedSets = plannedSetsByExercise.value[exerciseId] ?? 0
  const allocatedSets = allocatedSetsByExercise.value[exerciseId] ?? 0
  if (allocatedSets >= plannedSets) return

  const existing = selectedCard.value.exercises.find(
    (exercise) => exercise.exerciseId === exerciseId,
  )
  if (existing) existing.sets += 1
  else selectedCard.value.exercises.push({ exerciseId, sets: 1 })

  markChanged('未保存')
}

function removeExerciseSet(exerciseId: ExerciseId): void {
  if (!selectedCard.value) return

  const exerciseIndex = selectedCard.value.exercises.findIndex(
    (exercise) => exercise.exerciseId === exerciseId,
  )
  if (exerciseIndex < 0) return

  const exercise = selectedCard.value.exercises[exerciseIndex]!
  if (exercise.sets > 1) exercise.sets -= 1
  else selectedCard.value.exercises.splice(exerciseIndex, 1)

  markChanged('未保存')
}

function handleClear(): void {
  if (!plan.value) return
  resetWeekdayDrag()

  if (!isConfirmingClear.value) {
    isConfirmingClear.value = true
    window.clearTimeout(clearConfirmationTimer)
    clearConfirmationTimer = window.setTimeout(() => {
      isConfirmingClear.value = false
    }, 3000)
    return
  }

  window.clearTimeout(clearConfirmationTimer)
  const emptySchedule = createEmptyWeeklyPlanSchedule(plan.value.startDate)
  const firstCard = createWeeklyPlanDayCard(1)
  emptySchedule.cards.push(firstCard)
  emptySchedule.weekdayCardIds[0] = firstCard.id
  schedule.value = emptySchedule
  selectedCardId.value = firstCard.id
  markChanged('未保存')
}

async function handleSave(): Promise<void> {
  if (!plan.value || !schedule.value) return

  isSaving.value = true
  errorMessage.value = ''

  try {
    await initializeAuth()
    const userId = session.value?.user.id
    if (!userId) throw new Error('请先在主页登录云同步账户')

    await updateWeeklyPlanSchedule(userId, plan.value.id, schedule.value)
    plan.value.schedule = normalizeWeeklyPlanSchedule(schedule.value, plan.value.startDate)
    isDirty.value = false
    savedMessage.value = '已保存'
  } catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : '无法保存训练安排'
  } finally {
    isSaving.value = false
  }
}

async function loadSchedule(planId: unknown): Promise<void> {
  const version = ++scheduleLoadVersion
  resetWeekdayDrag()
  isLoading.value = true
  errorMessage.value = ''
  savedMessage.value = ''
  isDirty.value = false
  isConfirmingClear.value = false
  window.clearTimeout(clearConfirmationTimer)
  plan.value = undefined
  schedule.value = undefined
  selectedCardId.value = undefined

  try {
    if (typeof planId !== 'string' || !planId) throw new Error('没有指定要安排的云端计划')

    await initializeAuth()
    const userId = session.value?.user.id
    if (!userId) throw new Error('请先在主页登录云同步账户')

    const plans = await listWeeklyPlans(userId)
    if (version !== scheduleLoadVersion) return
    cloudPlans.value = plans
    const selectedPlan = plans.find((item) => item.id === planId)
    if (!selectedPlan) throw new Error('找不到这个云端计划')

    plan.value = selectedPlan
    schedule.value = reconcileWeeklyPlanSchedule(
      normalizeWeeklyPlanSchedule(selectedPlan.schedule, selectedPlan.startDate),
      Object.fromEntries(
        selectedPlan.exercises.map((exercise) => [exercise.exerciseId, exercise.plannedSets]),
      ),
    )

    if (!schedule.value.cards.length) {
      const firstCard = createWeeklyPlanDayCard(1)
      schedule.value.cards.push(firstCard)
      schedule.value.weekdayCardIds[0] = firstCard.id
      selectedCardId.value = firstCard.id
      isDirty.value = true
      savedMessage.value = '未保存'
    } else {
      const firstAssignedCardId = schedule.value.weekdayCardIds.find(Boolean)
      selectedCardId.value = firstAssignedCardId ?? schedule.value.cards[0]?.id
      savedMessage.value = '已保存'
    }
  } catch (error: unknown) {
    if (version === scheduleLoadVersion) {
      errorMessage.value = error instanceof Error ? error.message : '读取云端安排失败'
    }
  } finally {
    if (version === scheduleLoadVersion) isLoading.value = false
  }
}

function selectCloudPlan(id: string): void {
  if (id !== route.query.plan) {
    void router.push({ name: 'weekly-schedule', query: { plan: id } })
  }
}

function startNewPlan(): void {
  void router.push({ name: 'weekly-plan', query: { new: '1' } })
}

function canLeaveSchedule(): boolean {
  return !isSaving.value &&
    (!isDirty.value || window.confirm('当前训练日安排尚未保存，离开后这些修改会丢失。继续吗？'))
}

watch(() => route.query.plan, (id) => {
  if (route.name === 'weekly-schedule') void loadSchedule(id)
}, { immediate: true })

onBeforeRouteUpdate((to, from) => to.query.plan === from.query.plan || canLeaveSchedule())
onBeforeRouteLeave(canLeaveSchedule)
onBeforeUnmount(() => {
  scheduleLoadVersion += 1
  resetWeekdayDrag()
  window.clearTimeout(clearConfirmationTimer)
})
</script>

<template>
  <main class="schedule-page">
    <header class="schedule-header">
      <RouterLink
        class="back-link"
        :to="{ name: 'weekly-plan', query: plan ? { plan: plan.id } : {} }"
        aria-label="返回七天训练计划"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m15 5-7 7 7 7" />
        </svg>
      </RouterLink>
      <h1>七天训练计划</h1>
      <WeeklyPlanMenu
        :name="plan?.name ?? '云端计划'"
        :active-id="plan?.id"
        :plans="cloudPlans"
        :disabled="isLoading || isSaving"
        @select="selectCloudPlan"
        @create="startNewPlan"
      />
    </header>

    <WeeklyPlanSteps
      class="schedule-step-switcher"
      step="schedule"
      :plan-id="plan?.id"
      :status="isLoading ? '读取中…' : isSaving ? '保存中…' : errorMessage ? '出错' : savedMessage || '—'"
      :status-tone="errorMessage ? 'error' : isLoading || isSaving ? undefined : isDirty ? 'dirty' : savedMessage === '已保存' ? 'saved' : undefined"
    >
      <button
        class="clear-schedule-button"
        :class="{ confirming: isConfirmingClear }"
        type="button"
        :disabled="isLoading || isSaving || !plan"
        @click="handleClear"
      >
        {{ isConfirmingClear ? '确认清空' : '清空安排' }}
      </button>
      <button
        class="save-schedule-button"
        type="button"
        :disabled="isLoading || isSaving || !isDirty"
        @click="handleSave"
      >
        {{ isSaving ? '保存中' : '保存' }}
      </button>
    </WeeklyPlanSteps>

    <p v-if="errorMessage" class="page-state error" role="alert">{{ errorMessage }}</p>
    <p v-else-if="isLoading" class="page-state">正在读取云端计划…</p>
    <section v-else-if="!plan" class="empty-state">
      <strong>没有可用的云端计划</strong>
      <span>返回七天训练计划后重新选择。</span>
      <RouterLink to="/plan">去制定计划</RouterLink>
    </section>
    <section v-else-if="plan.exercises.length === 0" class="empty-state">
      <strong>计划中还没有动作</strong>
      <span>至少加入一个动作后，才能分配训练日。</span>
      <RouterLink :to="{ name: 'weekly-plan', query: { plan: plan.id } }">返回添加动作</RouterLink>
    </section>

    <template v-else-if="schedule">
      <section class="week-board" aria-label="七日训练安排">
        <div class="weekday-labels" aria-hidden="true">
          <span v-for="day in PLAN_DAYS" :key="day">{{ day }}</span>
        </div>
        <div
          ref="weekdaySlots"
          class="weekday-slots"
          :class="{ 'swap-settled': skipSwapMotion }"
          @pointermove="moveWeekdayPress"
          @pointerup="finishWeekdayPress"
          @pointercancel="finishWeekdayPress"
          @lostpointercapture="finishWeekdayPress"
        >
          <div
            v-for="(day, index) in PLAN_DAYS"
            :key="day"
            class="weekday-cell"
            :data-weekday-index="index"
          >
            <button
              type="button"
              class="weekday-slot"
              :class="{
                occupied: getCardForWeekday(index),
                selected: getCardForWeekday(index)?.id === selectedCardId,
                lifted: liftedSlot?.index === index,
                'swap-preview': previewSlot?.index === index,
              }"
              :style="getWeekdaySlotStyle(index)"
              :aria-label="`${day}${getCardForWeekday(index)?.name ?? '未安排'}`"
              @pointerdown="startWeekdayPress(index, $event)"
              @contextmenu.prevent
              @click="handleWeekdaySlotClick(index, $event)"
            >
              <template v-if="getCardForWeekday(index)">
                <div class="slot-set-count">
                  <span>{{ getCardSetCount(getCardForWeekday(index)!) }}组</span>
                </div>
                <div class="slot-exercise-list">
                  <small
                    v-for="exercise in getCardForWeekday(index)?.exercises"
                    :key="exercise.exerciseId"
                  >
                    {{ getExercise(exercise.exerciseId)?.name }}
                  </small>
                  <small v-if="!getCardForWeekday(index)?.exercises.length">暂无动作</small>
                </div>
              </template>
              <span v-else class="slot-plus">＋</span>
            </button>
          </div>
        </div>
      </section>

      <section class="schedule-workspace">
        <article class="day-detail">
          <header>
            <div>
              <span>训练日详情</span>
              <h2>{{ selectedCard?.name }}</h2>
            </div>
            <strong>{{ selectedCard ? getCardSetCount(selectedCard) : 0 }}组</strong>
          </header>

          <div v-if="selectedCard?.exercises.length" class="day-exercise-list">
            <div
              v-for="exercise in selectedCard.exercises"
              :key="exercise.exerciseId"
              class="day-exercise-row"
            >
              <span class="part-badge">{{ getPartLabel(getExercise(exercise.exerciseId)?.bodyPart ?? '') }}</span>
              <strong>{{ getExercise(exercise.exerciseId)?.name }}</strong>
              <span>{{ exercise.sets }}组</span>
              <button
                type="button"
                :aria-label="`${getExercise(exercise.exerciseId)?.name}移除一组`"
                @click="removeExerciseSet(exercise.exerciseId)"
              >
                −
              </button>
            </div>
          </div>
          <p v-else class="detail-empty">从下方动作池点击加入，每次加入一组。</p>
        </article>

        <aside class="analysis-placeholder">
          <span>数据分析</span>
          <div aria-hidden="true">
            <i></i><i></i><i></i><i></i>
          </div>
          <p>预留区域</p>
        </aside>
      </section>

      <section class="action-pool" aria-labelledby="action-pool-title">
        <header class="section-heading">
          <div>
            <h2 id="action-pool-title">待分配动作</h2>
            <p>点击动作，为“{{ selectedCard?.name }}”加入一组</p>
          </div>
          <strong>{{ totalPlannedSets - totalAllocatedSets }}组</strong>
        </header>

        <div v-if="remainingExercises.length" class="action-pool-grid">
          <button
            v-for="item in remainingExercises"
            :key="item.plannedExercise.exerciseId"
            type="button"
            @click="addExerciseSet(item.plannedExercise.exerciseId)"
          >
            <span>{{ getPartLabel(item.definition.bodyPart) }}</span>
            <strong>{{ item.definition.name }}</strong>
            <em>剩余 {{ item.remaining }}组</em>
            <i aria-hidden="true">＋</i>
          </button>
        </div>
        <div v-else class="pool-complete">全部计划组数均已分配</div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.schedule-page {
  min-height: 100svh;
  padding: max(14px, env(safe-area-inset-top)) 2.5% max(28px, env(safe-area-inset-bottom));
  background: #f0f3ec;
  color: #18251d;
}

button,
a {
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.schedule-header {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 5px;
  width: 95%;
  margin: 0 auto 12px;
}

.schedule-step-switcher {
  width: 95%;
  margin: 0 auto 8px;
}

.back-link {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: var(--radius-circle);
  color: #46634d;
}

.back-link svg {
  width: 25px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.2;
}

.schedule-header h1,
.section-heading h2,
.section-heading p {
  margin: 0;
}

.schedule-header h1 {
  overflow: hidden;
  font-size: var(--text-title);
  letter-spacing: -0.035em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clear-schedule-button,
.save-schedule-button {
  min-height: 34px;
  padding: 0 9px;
  border: 0;
  border-radius: var(--radius-pill);
  font-size: var(--text-micro);
  font-weight: 800;
  white-space: nowrap;
}

.clear-schedule-button {
  background: #f4e7e3;
  color: #a25b55;
}

.clear-schedule-button.confirming {
  background: #a25b55;
  color: #fff;
}

.save-schedule-button {
  background: #52765b;
  color: #fff;
}

.clear-schedule-button:disabled,
.save-schedule-button:disabled {
  opacity: 0.5;
}

.week-board,
.action-pool {
  width: 95%;
  margin: 0 auto;
}

.week-board {
  padding: 9px 10px 12px;
  border-radius: var(--radius-panel);
  background: rgb(255 255 255 / 76%);
  box-shadow: 0 8px 24px rgb(45 62 48 / 6%);
}

.section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 10px;
}

.section-heading h2 {
  font-size: var(--text-title);
}

.section-heading p {
  margin-top: 2px;
  color: #89958e;
  font-size: var(--text-micro);
  font-weight: 650;
}

.section-heading > strong {
  color: #55705c;
  font-size: var(--text-caption);
}

.weekday-labels,
.weekday-slots {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}

.weekday-labels {
  margin: 0 0 5px;
  color: #7b8980;
  font-size: clamp(0.5rem, 2.1vw, var(--text-micro));
  font-weight: 800;
  text-align: center;
}

.weekday-cell {
  min-width: 0;
  height: clamp(90px, 21svh, 128px);
}

.weekday-slot {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 2px;
  padding: 7px 3px;
  overflow: hidden;
  border: 1px dashed #ced8ce;
  border-radius: var(--radius-control);
  background: #f5f7f2;
  color: #a0aaa3;
  cursor: pointer;
  transition: transform 210ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.weekday-slot.occupied {
  border-style: solid;
  border-color: #d9e2d6;
  background: #eef4ea;
  color: #46634d;
  touch-action: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.weekday-slot.swap-preview {
  z-index: 1;
}

.weekday-slot.lifted {
  z-index: 2;
  border-color: #63816a;
  box-shadow: 0 8px 18px rgb(45 62 48 / 24%);
  cursor: grabbing;
  transition: none;
}

.weekday-slots.swap-settled .weekday-slot {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .weekday-slot { transition: none; }
}

.weekday-slot.selected {
  border-color: #63816a;
  box-shadow: inset 0 0 0 1px #63816a;
}

.weekday-slot span,
.weekday-slot small,
.slot-exercise-list {
  max-width: 100%;
}

.slot-set-count {
  width: 100%;
  height: 25px;
  flex: 0 0 25px;
  display: grid;
  place-items: center;
}

.slot-set-count span {
  font-size: clamp(var(--text-micro), 2.25vw, var(--text-caption));
  font-weight: 850;
  white-space: nowrap;
}

.slot-exercise-list {
  width: 100%;
  display: grid;
  align-content: start;
  gap: 1px;
  overflow: hidden;
}

.weekday-slot small {
  display: block;
  width: 100%;
  overflow: hidden;
  color: #75847a;
  font-size: clamp(0.5rem, 1.75vw, var(--text-micro));
  line-height: 1.35;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slot-plus {
  margin: auto;
  font-size: var(--text-title);
  font-weight: 400;
}

.schedule-workspace {
  width: 95%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
  margin: 10px auto 18px;
}

.day-detail,
.analysis-placeholder {
  min-width: 0;
  min-height: 204px;
  padding: 11px;
  border-radius: var(--radius-panel);
  background: #fff;
  box-shadow: 0 6px 18px rgb(49 66 52 / 6%);
}

.day-detail > header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 9px;
}

.day-detail header span,
.analysis-placeholder > span {
  color: #89958e;
  font-size: var(--text-micro);
  font-weight: 700;
}

.day-detail h2 {
  margin: 1px 0 0;
  font-size: var(--text-body);
}

.day-detail header > strong {
  color: #55705c;
  font-size: var(--text-micro);
}

.day-exercise-list {
  display: grid;
}

.day-exercise-row {
  min-width: 0;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto 24px;
  align-items: center;
  gap: 4px;
  min-height: 39px;
  border-top: 1px solid #edf0eb;
}

.part-badge {
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  border-radius: var(--radius-sm);
  background: #edf3e9;
  color: #55705c;
  font-size: var(--text-micro);
  font-weight: 800;
}

.day-exercise-row > strong {
  overflow: hidden;
  font-size: clamp(var(--text-caption), 2.3vw, var(--text-body));
  text-overflow: ellipsis;
  white-space: nowrap;
}

.day-exercise-row > span:not(.part-badge) {
  color: #5d6e62;
  font-size: var(--text-micro);
  font-weight: 800;
  white-space: nowrap;
}

.day-exercise-row button {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  padding: 0 0 2px;
  border: 0;
  border-radius: var(--radius-circle);
  background: #f1f4ef;
  color: #6f7f74;
  cursor: pointer;
}

.detail-empty {
  margin: 32px 5px;
  color: #9ba59e;
  font-size: var(--text-micro);
  line-height: 1.55;
}

.analysis-placeholder {
  display: flex;
  flex-direction: column;
}

.analysis-placeholder div {
  height: 86px;
  display: flex;
  align-items: end;
  justify-content: center;
  gap: 6px;
  margin: 20px 7px 7px;
  border-bottom: 1px solid #dfe6dc;
}

.analysis-placeholder i {
  width: 13%;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  background: #e7ede3;
}

.analysis-placeholder i:nth-child(1) { height: 36%; }
.analysis-placeholder i:nth-child(2) { height: 62%; }
.analysis-placeholder i:nth-child(3) { height: 48%; }
.analysis-placeholder i:nth-child(4) { height: 78%; }

.analysis-placeholder p {
  margin: 5px 0 0;
  color: #a0aaa3;
  font-size: var(--text-micro);
  text-align: center;
}

.action-pool {
  padding-bottom: 24px;
}

.action-pool-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 9px;
}

.action-pool-grid button {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  align-items: center;
  gap: 1px 6px;
  min-height: 62px;
  padding: 8px 8px;
  border: 0;
  border-radius: var(--radius-card);
  background: #fff;
  color: #213027;
  text-align: left;
  box-shadow: 0 4px 12px rgb(48 67 52 / 5%);
  cursor: pointer;
}

.action-pool-grid button > span {
  grid-row: 1 / 3;
  display: grid;
  width: 25px;
  height: 25px;
  place-items: center;
  border-radius: var(--radius-sm);
  background: #edf3e9;
  color: #55705c;
  font-size: var(--text-micro);
  font-weight: 800;
}

.action-pool-grid strong {
  min-width: 0;
  align-self: end;
  overflow: hidden;
  font-size: clamp(var(--text-caption), 2.7vw, var(--text-body));
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-pool-grid em {
  align-self: start;
  color: #8b978f;
  font-size: var(--text-micro);
  font-style: normal;
  font-weight: 700;
}

.action-pool-grid i {
  grid-column: 3;
  grid-row: 1 / 3;
  color: #6d826f;
  font-size: var(--text-control);
  font-style: normal;
}

.pool-complete,
.page-state,
.empty-state {
  color: #7d8981;
  text-align: center;
}

.pool-complete {
  margin-top: 10px;
  padding: 24px;
  border: 1px dashed #cbd5ca;
  border-radius: var(--radius-card);
  font-size: var(--text-caption);
  font-weight: 700;
}

.page-state,
.empty-state {
  width: 90%;
  margin: 56px auto;
}

.page-state.error {
  color: #a8534f;
}

.empty-state {
  display: grid;
  justify-items: center;
  gap: 8px;
}

.empty-state strong {
  color: #26372b;
}

.empty-state span {
  font-size: var(--text-caption);
}

.empty-state a {
  margin-top: 4px;
  padding: 9px 15px;
  border-radius: var(--radius-pill);
  background: #55705c;
  color: #fff;
  font-size: var(--text-caption);
  font-weight: 800;
  text-decoration: none;
}

@media (min-width: 720px) {
  .schedule-page > *,
  .schedule-header,
  .week-board,
  .schedule-workspace,
  .action-pool {
    max-width: 720px;
  }

  .schedule-page > * {
    margin-left: auto;
    margin-right: auto;
  }
}
</style>
