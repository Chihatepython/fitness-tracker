<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'

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
const PART_REGIONS: Record<PlanPart, readonly MuscleRegion[]> = {
  肩: ['肩'],
  胸: ['胸'],
  背: ['背'],
  手臂: ['屈肘', '伸肘', '前臂'],
  腿: ['腿'],
}
type PlanPart = (typeof PLAN_PARTS)[number]
type ExerciseScope = 'related' | 'all'

const selectedPart = ref<PlanPart>('肩')
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
const isCloudListOpen = ref(false)
const isLoadingCloudPlans = ref(false)
const { initialize: initializeAuth, session } = useSupabaseAuth()
const route = useRoute()
const router = useRouter()
let clearConfirmationTimer: number | undefined
let muscleBoardPointerId: number | undefined
let muscleBoardStartX = 0
let muscleBoardStartY = 0
let suppressMuscleClickUntil = 0

const canonicalMuscleOrder = new Map<MuscleName, number>(
  MUSCLE_GROUPS.flatMap((group) => [...group.muscles]).map((muscle, index) => [muscle, index]),
)

const selectedPartMuscles = computed(() => getMusclesForPart(selectedPart.value))

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

const visibleExercises = computed(() => {
  if (exerciseScope.value === 'all') return EXERCISES

  return EXERCISES.filter((exercise) => exercise.bodyPart === selectedPart.value)
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

function getMusclesForPart(part: PlanPart): MuscleName[] {
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

function getPartProgress(part: PlanPart): { current: number; target: number } {
  const muscles = getMusclesForPart(part).filter((muscle) => hasTarget(muscle))
  const muscleSet = new Set<MuscleName>(muscles)
  const current = EXERCISES.filter((exercise) => exercise.bodyPart === part).reduce(
    (partTotal, exercise) => {
      const setCount = getExerciseSetCount(exercise.id)
      if (!setCount) return partTotal

      return (
        partTotal +
        Object.entries(exercise.muscleWeights ?? {}).reduce(
          (exerciseTotal, [muscle, weight]) =>
            muscleSet.has(muscle as MuscleName) ? exerciseTotal + setCount * weight : exerciseTotal,
          0,
        )
      )
    },
    0,
  )

  return {
    current,
    target: muscles.reduce((sum, muscle) => sum + (getTargetSets(muscle) ?? 0), 0),
  }
}

function getEffectLabel(exercise: (typeof EXERCISES)[number]): string {
  const selectedMuscleSet = new Set<string>(selectedPartMuscles.value)
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

function selectPlanPart(part: PlanPart): void {
  selectedPart.value = part
}

function handleMuscleBoardPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return

  muscleBoardPointerId = event.pointerId
  muscleBoardStartX = event.clientX
  muscleBoardStartY = event.clientY
}

function handleMuscleBoardPointerUp(event: PointerEvent): void {
  if (event.pointerId !== muscleBoardPointerId) return

  muscleBoardPointerId = undefined
  const horizontalDistance = event.clientX - muscleBoardStartX
  const verticalDistance = event.clientY - muscleBoardStartY

  if (
    Math.abs(horizontalDistance) < 42 ||
    Math.abs(horizontalDistance) <= Math.abs(verticalDistance) * 1.15
  ) {
    return
  }

  const currentIndex = PLAN_PARTS.indexOf(selectedPart.value)
  const nextIndex = Math.max(
    0,
    Math.min(PLAN_PARTS.length - 1, currentIndex + (horizontalDistance < 0 ? 1 : -1)),
  )
  const nextPart = PLAN_PARTS[nextIndex]

  if (nextIndex === currentIndex || !nextPart) return

  suppressMuscleClickUntil = Date.now() + 350
  selectedPart.value = nextPart
}

function handleMuscleBoardPointerCancel(): void {
  muscleBoardPointerId = undefined
}

function handleMuscleRowClick(muscle: MuscleName): void {
  if (Date.now() < suppressMuscleClickUntil) return
  openTargetEditor(muscle)
}

function getDraftExercises(): WeeklyPlanExercise[] {
  return EXERCISES.flatMap((exercise, index) => {
    const setCount = plannedSets.value[exercise.id] ?? 0

    return setCount > 0 ? [{ exerciseId: exercise.id, plannedSets: setCount, order: index }] : []
  })
}

function getCloudPlanSetCount(plan: CloudWeeklyPlan): number {
  return plan.exercises.reduce((total, exercise) => total + exercise.plannedSets, 0)
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
    if (!userId) throw new Error('请先在主页登录云同步账户')

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
    if (!userId) throw new Error('请先在主页登录云同步账户')

    cloudPlans.value = await listWeeklyPlans(userId)
  } catch (error: unknown) {
    cloudErrorMessage.value = error instanceof Error ? error.message : '无法读取云端计划'
  } finally {
    isLoadingCloudPlans.value = false
  }
}

async function toggleCloudPlanList(): Promise<void> {
  isCloudListOpen.value = !isCloudListOpen.value
  if (isCloudListOpen.value) await loadCloudPlans()
}

async function openCloudPlan(plan: CloudWeeklyPlan): Promise<void> {
  if (plan.id === activeCloudPlanId.value) {
    isCloudListOpen.value = false
    return
  }

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
  isCloudListOpen.value = false
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
  isCloudListOpen.value = false
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
  if (currentPlanId === planId) return

  await router.replace({
    name: 'weekly-plan',
    query: planId ? { plan: planId } : {},
  })
}

async function initializePlan(): Promise<void> {
  isLoading.value = true
  errorMessage.value = ''
  cloudErrorMessage.value = ''

  try {
    await loadCloudPlans()
    if (cloudErrorMessage.value) return

    const requestedPlanId = typeof route.query.plan === 'string' ? route.query.plan : undefined
    const requestedPlan = cloudPlans.value.find((plan) => plan.id === requestedPlanId)
    const latestPlan = cloudPlans.value.at(-1)

    if (requestedPlan) await openCloudPlan(requestedPlan)
    else if (latestPlan) await openCloudPlan(latestPlan)
    else await startNewPlan()
  } catch (error: unknown) {
    cloudErrorMessage.value = error instanceof Error ? error.message : '无法读取云端计划'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => void initializePlan())

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
        <div class="plan-header-actions">
          <button
            class="clear-plan-button"
            :class="{ confirming: isConfirmingClear }"
            type="button"
            :disabled="isLoading || Boolean(cloudErrorMessage)"
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
          <button
            class="cloud-plans-button"
            type="button"
            :aria-expanded="isCloudListOpen"
            aria-controls="cloud-plan-list"
            @click="toggleCloudPlanList"
          >
            计划
            <svg aria-hidden="true" viewBox="0 0 16 16">
              <path d="m4 6 4 4 4-4" />
            </svg>
          </button>
        </div>
      </header>

      <div
        v-if="!isLoading || cloudErrorMessage"
        class="plan-status-row"
      >
        <span class="draft-state">{{ activeCloudPlan?.name ?? '新计划' }}</span>
        <span
          class="save-status"
          :class="{ dirty: isDirty, error: cloudErrorMessage && !isCloudListOpen }"
        >
          {{ (!isCloudListOpen && cloudErrorMessage) || statusMessage || '已保存' }}
        </span>
      </div>

      <section
        v-if="isCloudListOpen"
        id="cloud-plan-list"
        class="cloud-plan-panel"
        aria-label="云端训练计划"
      >
        <header>
          <strong>云端计划</strong>
          <button type="button" class="cloud-plan-create" @click="startNewPlan">＋ 新建</button>
        </header>
        <p v-if="isLoadingCloudPlans" class="cloud-plan-state">正在读取…</p>
        <p v-else-if="cloudErrorMessage" class="cloud-plan-state error" role="alert">
          {{ cloudErrorMessage }}
        </p>
        <p v-else-if="cloudPlans.length === 0" class="cloud-plan-state">
          还没有保存到云端的训练计划
        </p>
        <div v-else class="cloud-plan-list">
          <button
            v-for="plan in cloudPlans"
            :key="plan.id"
            type="button"
            :class="{ active: plan.id === activeCloudPlanId }"
            @click="openCloudPlan(plan)"
          >
            <span>
              <strong>{{ plan.name }}</strong>
              <small>{{ plan.targets.length }} 个目标 · {{ getCloudPlanSetCount(plan) }} 组</small>
            </span>
            <svg aria-hidden="true" viewBox="0 0 20 20">
              <path d="m8 5 5 5-5 5" />
            </svg>
          </button>
        </div>
      </section>

      <section
        v-if="!isLoading && !cloudErrorMessage"
        class="plan-muscle-board"
        aria-label="肌束目标看板"
      >
        <nav class="plan-part-selector" aria-label="选择目标部位">
          <button
            v-for="part in PLAN_PARTS"
            :key="part"
            type="button"
            :data-part="part"
            :aria-pressed="selectedPart === part"
            @click="selectPlanPart(part)"
          >
            <span>{{ part }}</span>
            <span v-if="getPartProgress(part).target">
              {{ formatSetCount(getPartProgress(part).current) }}/{{ getPartProgress(part).target }}
            </span>
            <span v-else>未设置</span>
          </button>
        </nav>

        <div class="plan-muscle-card-viewport" aria-live="polite">
          <section
            class="plan-muscle-table-card"
            :data-part="selectedPart"
            :aria-label="`${selectedPart}肌束计划`"
            @pointerdown="handleMuscleBoardPointerDown"
            @pointerup="handleMuscleBoardPointerUp"
            @pointercancel="handleMuscleBoardPointerCancel"
          >
            <header class="plan-muscle-table-heading">
              <span>肌束</span>
              <span>已安排</span>
              <span>计划</span>
            </header>
            <button
              v-for="muscle in selectedPartMuscles"
              :key="muscle"
              class="plan-muscle-table-row"
              type="button"
              :aria-label="
                hasTarget(muscle)
                  ? `${muscle}，已安排${formatSetCount(muscleTotals[muscle])}组，计划${getTargetSets(muscle)}组，点击修改计划`
                  : `${muscle}，已安排${formatSetCount(muscleTotals[muscle])}组，尚未设置计划，点击设置`
              "
              @click="handleMuscleRowClick(muscle)"
            >
              <strong>{{ muscle }}</strong>
              <span>{{ formatSetCount(muscleTotals[muscle]) }}</span>
              <span :class="{ unset: !hasTarget(muscle) }">
                {{ getTargetSets(muscle) ?? '—' }}
              </span>
            </button>
          </section>
          <div class="plan-muscle-swipe-hint" aria-hidden="true"><span /></div>
        </div>
      </section>
    </section>

    <RouterLink
      v-if="activeCloudPlanId && !isDirty"
      class="schedule-entry"
      :to="{ name: 'weekly-schedule', query: { plan: activeCloudPlanId } }"
    >
      <span>
        <strong>安排到训练日</strong>
        <small>把计划组数装进训练日卡片，再分配到星期</small>
      </span>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m9 5 7 7-7 7" />
      </svg>
    </RouterLink>
    <button v-else-if="!isLoading && !cloudErrorMessage" class="schedule-entry disabled" disabled>
      <span>
        <strong>安排到训练日</strong>
        <small>{{ activeCloudPlanId ? '请先保存当前修改' : '请先保存新计划' }}</small>
      </span>
    </button>

    <section class="plan-action-section" aria-labelledby="plan-actions-title">
      <header class="plan-action-heading">
        <h2 id="plan-actions-title">动作计划</h2>
        <div class="exercise-scope-selector" aria-label="动作显示范围">
          <button
            type="button"
            :aria-pressed="exerciseScope === 'related'"
            @click="exerciseScope = 'related'"
          >
            当前部位
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
  padding: 0 14px calc(60px + env(safe-area-inset-bottom));
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

.plan-header-actions {
  display: flex;
  gap: 6px;
}

.clear-plan-button,
.save-plan-button,
.cancel-cloud-button,
.cloud-plans-button {
  min-height: 38px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--radius-pill);
  font-size: var(--text-caption);
  font-weight: 800;
  cursor: pointer;
}

.clear-plan-button {
  background: #f5e7e4;
  color: #a75a55;
}

.cancel-cloud-button {
  background: #f1ece2;
  color: #7b6748;
}

.clear-plan-button.confirming {
  background: #a75a55;
  color: #fff;
}

.save-plan-button {
  background: #52765b;
  color: #fff;
}

.save-plan-button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.cloud-plans-button {
  display: flex;
  align-items: center;
  gap: 2px;
  background: #e3ebe0;
  color: #46634d;
}

.cloud-plans-button svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentcolor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
  transition: transform 160ms ease;
}

.cloud-plans-button[aria-expanded='true'] svg {
  transform: rotate(180deg);
}

.plan-status-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  padding: 0 3px 7px;
  color: #718078;
  font-size: var(--text-caption);
  font-weight: 700;
}

.draft-state {
  padding: 3px 8px;
  border-radius: var(--radius-pill);
  background: #e3ecdf;
  color: #52705a;
  white-space: nowrap;
}

.save-status {
  padding: 3px 8px;
  border-radius: var(--radius-pill);
  background: #e3ecdf;
  color: #52705a;
  white-space: nowrap;
}

.save-status.dirty {
  background: #f2ead9;
  color: #8b7044;
}

.save-status.error {
  background: #f5e7e4;
  color: #a75a55;
}

.cloud-plan-panel {
  margin: 0 0 8px;
  padding: 10px;
  border: 1px solid #d7e0d4;
  border-radius: var(--radius-card);
  background: rgb(255 255 255 / 84%);
  box-shadow: 0 7px 20px rgb(48 67 52 / 8%);
}

.cloud-plan-panel > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px 7px;
  color: #43564a;
  font-size: var(--text-caption);
}

.cloud-plan-create {
  padding: 4px 8px;
  border: 0;
  border-radius: var(--radius-pill);
  background: #e3ebe0;
  font-size: var(--text-caption);
  font-weight: 800;
  color: #46634d;
}

.cloud-plan-list {
  display: grid;
  max-height: 178px;
  gap: 6px;
  overflow-y: auto;
}

.cloud-plan-list button {
  display: flex;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 11px;
  border: 0;
  border-radius: var(--radius-control);
  background: #eef3eb;
  color: #2d4334;
  text-align: left;
  cursor: pointer;
}

.cloud-plan-list button.active {
  box-shadow: inset 0 0 0 2px #6c9275;
}

.cloud-plan-list button > span {
  display: grid;
  gap: 2px;
}

.cloud-plan-list button strong {
  color: #2d4334;
  font-size: var(--text-body);
}

.cloud-plan-list button small {
  color: #728179;
  font-size: var(--text-caption);
  font-weight: 700;
  white-space: nowrap;
}

.cloud-plan-list button > svg {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  fill: none;
  stroke: #728179;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.cloud-plan-state {
  margin: 4px 0 2px;
  color: #718078;
  font-size: var(--text-caption);
  text-align: center;
}

.cloud-plan-state.error {
  color: #a75a55;
}

.plan-muscle-board {
  min-width: 0;
}

.plan-part-selector {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
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

.plan-part-selector button[aria-pressed='true'] {
  background: var(--part-soft);
  color: var(--part-accent);
  font-weight: 800;
}

.plan-muscle-card-viewport {
  position: relative;
  min-height: 1px;
  overflow: hidden;
}

.plan-muscle-table-card {
  --plan-accent: #7d8d3e;
  --plan-soft: #f1f6d8;
  width: 80%;
  margin-inline: auto;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--plan-accent) 18%, transparent);
  border-radius: var(--radius-card);
  background: var(--plan-soft);
  color: #263128;
  box-shadow: 0 5px 14px rgb(48 67 52 / 6%);
  touch-action: pan-y;
  user-select: none;
}

.plan-muscle-table-card[data-part='胸'] {
  --plan-accent: #a86e63;
  --plan-soft: #f6ebe8;
}

.plan-muscle-table-card[data-part='背'] {
  --plan-accent: #507f73;
  --plan-soft: #e8f1ed;
}

.plan-muscle-table-card[data-part='手臂'] {
  --plan-accent: #7d6b90;
  --plan-soft: #f1eef5;
}

.plan-muscle-table-card[data-part='腿'] {
  --plan-accent: #8b754d;
  --plan-soft: #f0eadb;
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

.plan-muscle-swipe-hint {
  position: absolute;
  inset: 0 0 0 auto;
  display: grid;
  width: 10%;
  place-items: center;
  pointer-events: none;
}

.plan-muscle-swipe-hint span {
  width: 18px;
  height: 4px;
  border-radius: var(--radius-pill);
  background: #d7dfd4;
}

.plan-action-section {
  padding-top: 16px;
}

.schedule-entry {
  display: flex;
  min-height: 62px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  padding: 10px 12px 10px 14px;
  border-radius: var(--radius-card);
  background: #e3ecdf;
  color: #36513e;
  text-decoration: none;
  box-shadow: 0 4px 12px rgb(48 67 52 / 5%);
}

button.schedule-entry {
  width: 100%;
  border: 0;
  text-align: left;
}

.schedule-entry.disabled {
  opacity: 0.58;
}

.schedule-entry span {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.schedule-entry strong {
  font-size: var(--text-body);
}

.schedule-entry small {
  overflow: hidden;
  color: #718078;
  font-size: var(--text-micro);
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.schedule-entry svg {
  width: 21px;
  flex: 0 0 auto;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
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
.cancel-cloud-button:focus-visible,
.cloud-plans-button:focus-visible,
.cloud-plan-list button:focus-visible,
.plan-muscle-table-row:focus-visible,
.plan-part-selector button:focus-visible,
.exercise-scope-selector button:focus-visible,
.plan-set-stepper button:focus-visible,
.target-dialog button:focus-visible {
  outline: 3px solid rgb(70 99 77 / 22%);
  outline-offset: 2px;
}

@media (min-width: 600px) {
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
  .save-plan-button,
  .cancel-cloud-button,
  .cloud-plans-button {
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
