<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { EXERCISES, type ExerciseId } from '@/database'
import type {
  WeeklyPlanDayCard,
  WeeklyPlanDraft,
  WeeklyPlanSchedule,
} from '@/domain/weeklyPlan'
import { getWeeklyPlanDraft } from '@/services/weeklyPlanDraft'
import {
  createWeeklyPlanDayCard,
  loadWeeklyPlanSchedule,
  reconcileWeeklyPlanSchedule,
  saveWeeklyPlanSchedule,
} from '@/services/weeklyPlanSchedule'

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const

const draft = ref<WeeklyPlanDraft>()
const schedule = ref<WeeklyPlanSchedule>()
const selectedCardId = ref<string>()
const isLoading = ref(true)
const errorMessage = ref('')
const savedMessage = ref('')
let savedMessageTimer: number | undefined

const exerciseById = new Map(EXERCISES.map((exercise) => [exercise.id, exercise]))

const plannedSetsByExercise = computed<Partial<Record<ExerciseId, number>>>(() =>
  Object.fromEntries(
    (draft.value?.exercises ?? []).map((exercise) => [exercise.exerciseId, exercise.plannedSets]),
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
  (draft.value?.exercises ?? [])
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
  (draft.value?.exercises ?? []).reduce((total, exercise) => total + exercise.plannedSets, 0),
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

function getCardPreview(card: WeeklyPlanDayCard): string {
  const names = card.exercises
    .slice(0, 2)
    .map((exercise) => getExercise(exercise.exerciseId)?.name)
    .filter(Boolean)

  if (!names.length) return '暂无动作'
  const remainingCount = card.exercises.length - names.length
  return `${names.join('、')}${remainingCount > 0 ? ` +${remainingCount}` : ''}`
}

function persist(message = '已保存到本地'): void {
  if (!schedule.value) return

  schedule.value.updatedAt = Date.now()
  saveWeeklyPlanSchedule(schedule.value)
  savedMessage.value = message
  window.clearTimeout(savedMessageTimer)
  savedMessageTimer = window.setTimeout(() => {
    savedMessage.value = ''
  }, 1400)
}

function createCard(): void {
  if (!schedule.value) return

  const usedNumbers = schedule.value.cards.flatMap((card) => {
    const match = /^训练日(\d+)$/.exec(card.name)
    return match ? [Number(match[1])] : []
  })
  const nextNumber = Math.max(0, ...usedNumbers) + 1
  const card = createWeeklyPlanDayCard(nextNumber)
  schedule.value.cards.push(card)
  selectedCardId.value = card.id
  persist('已新建训练日')
}

function selectCard(cardId: string): void {
  selectedCardId.value = cardId
}

function assignSelectedCardToWeekday(targetIndex: number): void {
  if (!schedule.value || !selectedCardId.value) return

  const selectedId = selectedCardId.value
  const currentIndex = schedule.value.weekdayCardIds.findIndex((cardId) => cardId === selectedId)
  const targetId = schedule.value.weekdayCardIds[targetIndex] ?? null

  if (targetId === selectedId) return

  schedule.value.weekdayCardIds[targetIndex] = selectedId
  if (currentIndex >= 0) schedule.value.weekdayCardIds[currentIndex] = targetId
  persist(currentIndex >= 0 && targetId ? '已交换训练日' : '已安排到星期')
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

  persist('已加入一组')
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

  persist('已移回动作池')
}

onMounted(async () => {
  try {
    draft.value = await getWeeklyPlanDraft()
    if (!draft.value) return

    const plannedSets = Object.fromEntries(
      draft.value.exercises.map((exercise) => [exercise.exerciseId, exercise.plannedSets]),
    ) as Partial<Record<ExerciseId, number>>
    schedule.value = reconcileWeeklyPlanSchedule(
      loadWeeklyPlanSchedule(draft.value.startDate),
      plannedSets,
    )

    if (!schedule.value.cards.length) {
      const firstCard = createWeeklyPlanDayCard(1)
      schedule.value.cards.push(firstCard)
      selectedCardId.value = firstCard.id
      persist('已创建第一个训练日')
    } else {
      selectedCardId.value = schedule.value.cards[0]?.id
      persist('')
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '读取安排失败'
  } finally {
    isLoading.value = false
  }
})
</script>

<template>
  <main class="schedule-page">
    <header class="schedule-header">
      <RouterLink class="back-link" to="/plan" aria-label="返回七天训练计划">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m15 5-7 7 7 7" />
        </svg>
      </RouterLink>
      <div>
        <h1>安排训练日</h1>
        <p>{{ totalAllocatedSets }}/{{ totalPlannedSets }} 组已分配</p>
      </div>
      <span class="save-state" aria-live="polite">{{ savedMessage }}</span>
    </header>

    <p v-if="errorMessage" class="page-state error" role="alert">{{ errorMessage }}</p>
    <p v-else-if="isLoading" class="page-state">正在读取本地计划…</p>
    <section v-else-if="!draft" class="empty-state">
      <strong>还没有七天训练计划</strong>
      <span>先设置动作与计划组数，再安排到训练日。</span>
      <RouterLink to="/plan">去制定计划</RouterLink>
    </section>
    <section v-else-if="draft.exercises.length === 0" class="empty-state">
      <strong>计划中还没有动作</strong>
      <span>至少加入一个动作后，才能分配训练日。</span>
      <RouterLink to="/plan">返回添加动作</RouterLink>
    </section>

    <template v-else-if="schedule">
      <section class="week-board" aria-labelledby="week-board-title">
        <div class="section-heading">
          <div>
            <h2 id="week-board-title">本周安排</h2>
            <p>选中训练日，再点星期槽；已有卡片时自动交换</p>
          </div>
        </div>

        <div class="weekday-labels" aria-hidden="true">
          <span v-for="weekday in WEEKDAYS" :key="weekday">{{ weekday }}</span>
        </div>
        <div class="weekday-slots">
          <button
            v-for="(weekday, index) in WEEKDAYS"
            :key="weekday"
            type="button"
            class="weekday-slot"
            :class="{
              occupied: getCardForWeekday(index),
              selected: getCardForWeekday(index)?.id === selectedCardId,
            }"
            :aria-label="`${weekday}${getCardForWeekday(index)?.name ?? '未安排'}`"
            @click="assignSelectedCardToWeekday(index)"
          >
            <template v-if="getCardForWeekday(index)">
              <strong>{{ getCardForWeekday(index)?.name.replace('训练日', '日') }}</strong>
              <span>{{ getCardSetCount(getCardForWeekday(index)!) }}组</span>
              <small>{{ getCardPreview(getCardForWeekday(index)!) }}</small>
            </template>
            <span v-else class="slot-plus">＋</span>
          </button>
        </div>
      </section>

      <nav class="day-card-strip" aria-label="选择训练日卡片">
        <button
          v-for="card in schedule.cards"
          :key="card.id"
          type="button"
          :aria-pressed="card.id === selectedCardId"
          @click="selectCard(card.id)"
        >
          <strong>{{ card.name }}</strong>
          <span>{{ getCardSetCount(card) }}组</span>
        </button>
        <button type="button" class="new-card-button" @click="createCard">＋ 训练日</button>
      </nav>

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
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  width: 95%;
  margin: 0 auto 12px;
}

.back-link {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 50%;
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
.schedule-header p,
.section-heading h2,
.section-heading p {
  margin: 0;
}

.schedule-header h1 {
  font-size: 1.14rem;
  letter-spacing: -0.035em;
}

.schedule-header p,
.save-state {
  color: #7a887f;
  font-size: 0.66rem;
  font-weight: 700;
}

.save-state {
  min-width: 62px;
  text-align: right;
}

.week-board,
.action-pool {
  width: 95%;
  margin: 0 auto;
}

.week-board {
  padding: 13px 10px 12px;
  border-radius: 24px;
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
  font-size: 0.95rem;
}

.section-heading p {
  margin-top: 2px;
  color: #89958e;
  font-size: 0.6rem;
  font-weight: 650;
}

.section-heading > strong {
  color: #55705c;
  font-size: 0.72rem;
}

.weekday-labels,
.weekday-slots {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}

.weekday-labels {
  margin: 11px 0 4px;
  color: #7b8980;
  font-size: clamp(0.5rem, 2.1vw, 0.64rem);
  font-weight: 800;
  text-align: center;
}

.weekday-slot {
  min-width: 0;
  height: clamp(90px, 21svh, 128px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 7px 3px;
  overflow: hidden;
  border: 1px dashed #ced8ce;
  border-radius: 13px;
  background: #f5f7f2;
  color: #a0aaa3;
  cursor: pointer;
}

.weekday-slot.occupied {
  border-style: solid;
  border-color: #d9e2d6;
  background: #eef4ea;
  color: #46634d;
}

.weekday-slot.selected {
  border-color: #63816a;
  box-shadow: inset 0 0 0 1px #63816a;
}

.weekday-slot strong,
.weekday-slot span,
.weekday-slot small {
  max-width: 100%;
}

.weekday-slot strong {
  font-size: clamp(0.55rem, 2.2vw, 0.7rem);
  white-space: nowrap;
}

.weekday-slot > span:not(.slot-plus) {
  font-size: clamp(0.5rem, 2vw, 0.63rem);
  font-weight: 800;
}

.weekday-slot small {
  display: -webkit-box;
  overflow: hidden;
  color: #75847a;
  font-size: clamp(0.43rem, 1.75vw, 0.53rem);
  line-height: 1.35;
  text-align: center;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.slot-plus {
  font-size: 1.2rem;
  font-weight: 400;
}

.day-card-strip {
  width: 95%;
  display: flex;
  gap: 7px;
  margin: 10px auto;
  overflow-x: auto;
  scrollbar-width: none;
}

.day-card-strip::-webkit-scrollbar {
  display: none;
}

.day-card-strip button {
  flex: 0 0 auto;
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: #fff;
  color: #718078;
  cursor: pointer;
}

.day-card-strip button[aria-pressed='true'] {
  border-color: #738d78;
  background: #e2ecdf;
  color: #36513e;
}

.day-card-strip strong {
  font-size: 0.72rem;
}

.day-card-strip span {
  font-size: 0.62rem;
  font-weight: 700;
}

.day-card-strip .new-card-button {
  border-style: dashed;
  border-color: #c9d4c9;
  background: transparent;
}

.schedule-workspace {
  width: 95%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
  margin: 0 auto 18px;
}

.day-detail,
.analysis-placeholder {
  min-width: 0;
  min-height: 204px;
  padding: 11px;
  border-radius: 19px;
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
  font-size: 0.57rem;
  font-weight: 700;
}

.day-detail h2 {
  margin: 1px 0 0;
  font-size: 0.86rem;
}

.day-detail header > strong {
  color: #55705c;
  font-size: 0.67rem;
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
  border-radius: 6px;
  background: #edf3e9;
  color: #55705c;
  font-size: 0.55rem;
  font-weight: 800;
}

.day-exercise-row > strong {
  overflow: hidden;
  font-size: clamp(0.58rem, 2.3vw, 0.69rem);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.day-exercise-row > span:not(.part-badge) {
  color: #5d6e62;
  font-size: 0.59rem;
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
  border-radius: 50%;
  background: #f1f4ef;
  color: #6f7f74;
  cursor: pointer;
}

.detail-empty {
  margin: 32px 5px;
  color: #9ba59e;
  font-size: 0.64rem;
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
  border-radius: 5px 5px 0 0;
  background: #e7ede3;
}

.analysis-placeholder i:nth-child(1) { height: 36%; }
.analysis-placeholder i:nth-child(2) { height: 62%; }
.analysis-placeholder i:nth-child(3) { height: 48%; }
.analysis-placeholder i:nth-child(4) { height: 78%; }

.analysis-placeholder p {
  margin: 5px 0 0;
  color: #a0aaa3;
  font-size: 0.62rem;
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
  border-radius: 15px;
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
  border-radius: 8px;
  background: #edf3e9;
  color: #55705c;
  font-size: 0.59rem;
  font-weight: 800;
}

.action-pool-grid strong {
  min-width: 0;
  align-self: end;
  overflow: hidden;
  font-size: clamp(0.65rem, 2.7vw, 0.77rem);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-pool-grid em {
  align-self: start;
  color: #8b978f;
  font-size: 0.57rem;
  font-style: normal;
  font-weight: 700;
}

.action-pool-grid i {
  grid-column: 3;
  grid-row: 1 / 3;
  color: #6d826f;
  font-size: 1rem;
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
  border-radius: 18px;
  font-size: 0.72rem;
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
  font-size: 0.74rem;
}

.empty-state a {
  margin-top: 4px;
  padding: 9px 15px;
  border-radius: 999px;
  background: #55705c;
  color: #fff;
  font-size: 0.72rem;
  font-weight: 800;
  text-decoration: none;
}

@media (min-width: 720px) {
  .schedule-page > *,
  .schedule-header,
  .week-board,
  .day-card-strip,
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
