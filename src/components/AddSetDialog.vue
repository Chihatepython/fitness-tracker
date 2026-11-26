<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import ExerciseWeightsDialog from '@/components/ExerciseWeightsDialog.vue'
import { usePageScrollLock } from '@/composables/usePageScrollLock'
import { vSegmentHighlight } from '@/directives/segmentHighlight'
import { getLocalDate } from '@/domain/trainingStats'
import {
  EXERCISES,
  addTrainingSet,
  createTrainingSetId,
  getAllTrainingSets,
  type BodyPart,
  type ExerciseId,
  type TrainingSet,
} from '@/database'

const DEFAULT_EXERCISE_ID = EXERCISES[0].id
const BODY_PART_FILTER_LABELS: Readonly<Record<BodyPart, string>> = {
  手臂: '臂',
  肩: '肩',
  背: '背',
  胸: '胸',
  腿: '腿',
}
const bodyPartOptions = [
  '肩',
  '胸',
  '背',
  '腿',
  '手臂',
] as const satisfies ReadonlyArray<BodyPart>

type MuscleWeightEntry = {
  muscle: string
  weight: number
}

type NumericField = 'weightKg' | 'reps' | 'rir'
type AddSetPanelMode = 'classic' | 'alternate'

const numericFields = [
  { field: 'weightKg', label: '重量', unit: 'kg' },
  { field: 'reps', label: '次数', unit: '次' },
  { field: 'rir', label: 'RIR', unit: '' },
] as const

const ADD_SET_PANEL_MODE_KEY = 'fitness-tracker:add-set-panel-mode'

const keypadDigits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

const dialog = ref<HTMLDialogElement>()
const date = ref('')
const exerciseId = ref<ExerciseId>(DEFAULT_EXERCISE_ID)
const weightKg = ref('')
const reps = ref('')
const rir = ref('')
const activeNumericField = ref<NumericField>('weightKg')
const shouldReplaceActiveValue = ref(true)
const errorMessage = ref('')
const isSaving = ref(false)
const isWeightsDialogOpen = ref(false)
const activePanelMode = ref<AddSetPanelMode>(getSavedPanelMode())
const selectedBodyPart = ref<BodyPart>(EXERCISES[0].bodyPart)
const trainingHistory = ref<TrainingSet[]>([])
const emit = defineEmits<{ saved: [] }>()
const { lockPageScroll, unlockPageScroll } = usePageScrollLock()

const selectedMuscleWeights = computed<MuscleWeightEntry[]>(() => {
  const selectedExercise = EXERCISES.find((exercise) => exercise.id === exerciseId.value)

  return Object.entries(selectedExercise?.muscleWeights ?? {})
    .map(([muscle, weight]) => ({ muscle, weight }))
    .sort((left, right) => right.weight - left.weight)
})

const selectedExerciseName = computed(
  () => EXERCISES.find((exercise) => exercise.id === exerciseId.value)?.name ?? '',
)

const activePanelNumber = computed(() => (activePanelMode.value === 'classic' ? 1 : 2))

const exerciseOptions = computed(() => {
  if (activePanelMode.value === 'classic') return EXERCISES

  return EXERCISES.filter((exercise) => exercise.bodyPart === selectedBodyPart.value)
})

const availableBodyParts = computed(
  () => new Set<BodyPart>(EXERCISES.map((exercise) => exercise.bodyPart)),
)

const currentExerciseHistory = computed(() =>
  trainingHistory.value
    .map((trainingSet, index) => ({ trainingSet, index }))
    .filter(({ trainingSet }) => trainingSet.exerciseId === exerciseId.value)
    .sort((left, right) => {
      const leftTime = left.trainingSet.createdAt ?? new Date(left.trainingSet.date).getTime()
      const rightTime = right.trainingSet.createdAt ?? new Date(right.trainingSet.date).getTime()

      return rightTime - leftTime || right.index - left.index
    })
    .map(({ trainingSet }) => trainingSet),
)

const numericRows = computed(() =>
  numericFields.map((row) => {
    const values = [...new Set(currentExerciseHistory.value.map((set) => set[row.field]))]
    return { ...row, history: [values[0], values[1], values[2]] }
  }),
)

function prefillNumericFields(set?: TrainingSet): void {
  weightKg.value = set ? String(set.weightKg) : ''
  reps.value = set ? String(set.reps) : ''
  rir.value = set ? String(set.rir) : ''
  shouldReplaceActiveValue.value = true
}

function prefillFromSelectedDate(): void {
  const sameDaySet = currentExerciseHistory.value.find((set) => set.date === date.value)
  prefillNumericFields(sameDaySet)
  activeNumericField.value = sameDaySet ? 'reps' : 'weightKg'
}

watch([exerciseId, date], () => {
  if (!dialog.value?.open) return

  prefillFromSelectedDate()
  if (activeNumericField.value === 'weightKg') focusNumericField('weightKg')
})

function getSavedPanelMode(): AddSetPanelMode {
  try {
    return localStorage.getItem(ADD_SET_PANEL_MODE_KEY) === 'alternate' ? 'alternate' : 'classic'
  } catch {
    return 'classic'
  }
}

function switchPanel(): void {
  activePanelMode.value = activePanelMode.value === 'classic' ? 'alternate' : 'classic'

  if (activePanelMode.value === 'alternate') {
    const currentExercise = EXERCISES.find((exercise) => exercise.id === exerciseId.value)
    if (currentExercise) selectedBodyPart.value = currentExercise.bodyPart
  }

  try {
    localStorage.setItem(ADD_SET_PANEL_MODE_KEY, activePanelMode.value)
  } catch {
    // 浏览器禁用本地存储时，本次打开期间仍然可以正常切换。
  }
}

function selectBodyPart(bodyPart: BodyPart): void {
  if (!availableBodyParts.value.has(bodyPart)) return

  selectedBodyPart.value = bodyPart

  const currentExercise = EXERCISES.find((exercise) => exercise.id === exerciseId.value)
  if (currentExercise?.bodyPart === bodyPart) return

  const firstExercise = EXERCISES.find((exercise) => exercise.bodyPart === bodyPart)
  if (firstExercise) exerciseId.value = firstExercise.id
}

async function open(preselectedExerciseId?: ExerciseId): Promise<void> {
  if (dialog.value?.open) return

  const today = getLocalDate()
  const preselected = EXERCISES.find((exercise) => exercise.id === preselectedExerciseId)

  date.value = today
  exerciseId.value = preselected?.id ?? DEFAULT_EXERCISE_ID
  selectedBodyPart.value = preselected?.bodyPart ?? EXERCISES[0].bodyPart
  trainingHistory.value = []
  prefillNumericFields()
  activeNumericField.value = 'weightKg'
  errorMessage.value = ''
  isWeightsDialogOpen.value = false

  try {
    const allTrainingSets = await getAllTrainingSets()
    trainingHistory.value = allTrainingSets
    const lastTrainingSet = preselected
      ? undefined
      : allTrainingSets.filter((set) => set.date === today).at(-1)

    if (lastTrainingSet) {
      exerciseId.value = lastTrainingSet.exerciseId
      selectedBodyPart.value =
        EXERCISES.find((exercise) => exercise.id === lastTrainingSet.exerciseId)?.bodyPart ??
        EXERCISES[0].bodyPart
    }
    prefillFromSelectedDate()
  } catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : '读取上一组记录失败'
  }

  const dialogElement = dialog.value

  if (!dialogElement || dialogElement.open) return

  lockPageScroll()

  try {
    dialogElement.showModal()
    focusNumericField(activeNumericField.value)
  } catch (error: unknown) {
    unlockPageScroll()
    throw error
  }
}

function close(): void {
  if (isSaving.value) return

  isWeightsDialogOpen.value = false
  dialog.value?.close()
  unlockPageScroll()
}

function getNumericValue(field: NumericField): string {
  if (field === 'weightKg') return weightKg.value
  if (field === 'reps') return reps.value

  return rir.value
}

function getActiveValue(): string {
  return getNumericValue(activeNumericField.value)
}

function setActiveValue(value: string): void {
  if (activeNumericField.value === 'weightKg') {
    weightKg.value = value
  } else if (activeNumericField.value === 'reps') {
    reps.value = value
  } else {
    rir.value = value
  }
}

function activateNumericField(field: NumericField): void {
  activeNumericField.value = field
  shouldReplaceActiveValue.value = true
}

function focusNumericField(field: NumericField): void {
  void nextTick(() => {
    if (!dialog.value?.open || activeNumericField.value !== field) return

    dialog.value.querySelector<HTMLInputElement>(`input[data-numeric-field="${field}"]`)
      ?.focus({ preventScroll: true })
  })
}

function fillHistoricalValue(field: NumericField, value: number | undefined): void {
  if (value === undefined) return
  activateNumericField(field)
  setActiveValue(String(value))
  focusNumericField(field)
}

function isHistoryValueSelected(field: NumericField, value: number | undefined): boolean {
  const current = getNumericValue(field)
  return value !== undefined && current !== '' && Number(current) === value
}

function enterDigit(digit: string): void {
  const currentValue = getActiveValue()

  setActiveValue(
    shouldReplaceActiveValue.value || currentValue === '0' ? digit : currentValue + digit,
  )
  shouldReplaceActiveValue.value = false
}

function enterDecimalPoint(): void {
  if (activeNumericField.value !== 'weightKg') return

  if (shouldReplaceActiveValue.value) {
    setActiveValue('0.')
    shouldReplaceActiveValue.value = false
    return
  }

  const currentValue = getActiveValue()
  if (!currentValue.includes('.')) setActiveValue(currentValue ? `${currentValue}.` : '0.')
}

function clearActiveValue(): void {
  setActiveValue('')
  shouldReplaceActiveValue.value = false
}

async function save(): Promise<void> {
  errorMessage.value = ''

  if (!weightKg.value || !reps.value || !rir.value) {
    errorMessage.value = '请填写重量、次数和 RIR'
    return
  }

  isSaving.value = true

  try {
    await addTrainingSet({
      id: createTrainingSetId(),
      date: date.value,
      exerciseId: exerciseId.value,
      weightKg: Number(weightKg.value),
      reps: Number(reps.value),
      rir: Number(rir.value),
    })

    emit('saved')
    isWeightsDialogOpen.value = false
    dialog.value?.close()
    unlockPageScroll()
  } catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : '保存训练组失败'
  } finally {
    isSaving.value = false
  }
}

defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" class="set-dialog" @cancel.prevent="close" @close="unlockPageScroll">
    <form class="set-form" @submit.prevent="save">
      <header class="dialog-header">
        <h2>添加一组</h2>
        <div class="dialog-header-actions">
          <button
            class="panel-switch-button"
            type="button"
            :aria-label="`切换到面板 ${activePanelNumber === 1 ? 2 : 1}`"
            :title="`当前为面板 ${activePanelNumber}`"
            @click="switchPanel"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="7" width="12" height="12" rx="2.5" />
              <path d="M8 7V5.5A2.5 2.5 0 0 1 10.5 3h8A2.5 2.5 0 0 1 21 5.5v8a2.5 2.5 0 0 1-2.5 2.5H16" />
            </svg>
            <span>{{ activePanelNumber }}</span>
          </button>
          <button class="close-button" type="button" aria-label="关闭" @click="close">×</button>
        </div>
      </header>

      <section :key="activePanelMode" class="panel-content" :data-panel="activePanelMode">
        <label v-if="activePanelMode === 'classic'">
          <span>日期</span>
          <input v-model="date" type="date" required />
        </label>

        <label v-else class="alternate-input">
          <span>日期</span>
          <input v-model="date" type="date" required />
        </label>

        <div class="exercise-field">
          <label v-if="activePanelMode === 'classic'" for="exercise-select">动作</label>
          <div v-else class="alternate-exercise-heading">
            <div v-segment-highlight class="segmented-control body-part-filter" role="group" aria-label="按部位筛选动作">
              <button
                v-for="bodyPart in bodyPartOptions"
                :key="bodyPart"
                type="button"
                :aria-pressed="selectedBodyPart === bodyPart"
                :disabled="!availableBodyParts.has(bodyPart)"
                @click="selectBodyPart(bodyPart)"
              >
                {{ BODY_PART_FILTER_LABELS[bodyPart] }}
              </button>
            </div>
          </div>
          <div v-if="activePanelMode === 'classic'" class="exercise-control-row">
            <select id="exercise-select" v-model="exerciseId" required>
              <option v-for="exercise in exerciseOptions" :key="exercise.id" :value="exercise.id">
                {{ exercise.bodyPart }} - {{ exercise.name }}
              </option>
            </select>
            <button type="button" aria-label="查看当前动作详情" @click="isWeightsDialogOpen = true">
              i
            </button>
          </div>
          <div v-else class="alternate-exercise-control">
            <label class="alternate-input">
              <span>动作</span>
              <select v-model="exerciseId" required>
                <option v-for="exercise in exerciseOptions" :key="exercise.id" :value="exercise.id">
                  {{ exercise.bodyPart }} - {{ exercise.name }}
                </option>
              </select>
            </label>
            <button
              class="alternate-exercise-info"
              type="button"
              aria-label="查看当前动作详情"
              @click="isWeightsDialogOpen = true"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
                <path d="M5.5 6.5H8v6h2.5" stroke-linecap="round" stroke-linejoin="round" />
                <circle cx="8" cy="3.5" r="1" fill="currentColor" stroke="none" />
              </svg>
            </button>
          </div>
        </div>

        <div v-if="activePanelMode === 'classic'" class="field-row">
          <label :class="{ 'active-field': activeNumericField === 'weightKg' }">
            <span>重量（kg）</span>
            <input
              v-model="weightKg"
              data-numeric-field="weightKg"
              type="text"
              inputmode="none"
              placeholder="0"
              readonly
              required
              @focus="activateNumericField('weightKg')"
              @click="activateNumericField('weightKg')"
            />
          </label>

          <label :class="{ 'active-field': activeNumericField === 'reps' }">
            <span>次数</span>
            <input
              v-model="reps"
              data-numeric-field="reps"
              type="text"
              inputmode="none"
              placeholder="0"
              readonly
              required
              @focus="activateNumericField('reps')"
              @click="activateNumericField('reps')"
            />
          </label>

          <label :class="{ 'active-field': activeNumericField === 'rir' }">
            <span>RIR</span>
            <input
              v-model="rir"
              data-numeric-field="rir"
              type="text"
              inputmode="none"
              placeholder="0"
              readonly
              required
              @focus="activateNumericField('rir')"
              @click="activateNumericField('rir')"
            />
          </label>
        </div>
        <div v-else class="field-row alternate-fields">
          <div v-for="row in numericRows" :key="row.field" class="alternate-field-row">
            <label
              class="alternate-input"
              :class="{ 'is-active': activeNumericField === row.field }"
            >
              <span>{{ row.label }}</span>
              <input
                :value="getNumericValue(row.field)"
                :data-numeric-field="row.field"
                type="text"
                inputmode="none"
                placeholder="0"
                readonly
                required
                @focus="activateNumericField(row.field)"
                @click="activateNumericField(row.field)"
              />
              <span v-if="row.field === 'weightKg'" class="alternate-input-unit" aria-hidden="true">
                kg
              </span>
            </label>
            <button
              v-for="(value, index) in row.history"
              :key="index"
              class="history-value"
              type="button"
              :disabled="value === undefined"
              :aria-pressed="isHistoryValueSelected(row.field, value)"
              :aria-label="value === undefined ? `${row.label}暂无历史值` : `填入${row.label} ${value} ${row.unit}`.trim()"
              @click="fillHistoricalValue(row.field, value)"
            >
              {{ value ?? '—' }}
            </button>
          </div>
        </div>

        <p v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</p>

        <div class="number-keypad" aria-label="数字键盘">
          <button
            v-for="digit in keypadDigits"
            :key="digit"
            type="button"
            @click="enterDigit(digit)"
          >
            {{ digit }}
          </button>
          <button
            class="decimal-key"
            type="button"
            :disabled="activeNumericField !== 'weightKg'"
            aria-label="小数点"
            @click="enterDecimalPoint"
          >
            .
          </button>
          <button type="button" @click="enterDigit('0')">0</button>
          <button class="clear-key" type="button" @click="clearActiveValue">清空</button>
        </div>

        <footer class="dialog-actions">
          <button class="cancel-button" type="button" :disabled="isSaving" @click="close">
            Cancel
          </button>
          <button class="save-button" type="submit" :disabled="isSaving">
            {{ isSaving ? '保存中…' : 'OK' }}
          </button>
        </footer>
      </section>
    </form>
  </dialog>

  <ExerciseWeightsDialog
    :is-open="isWeightsDialogOpen"
    :exercise-id="exerciseId"
    :exercise-name="selectedExerciseName"
    :weights="selectedMuscleWeights"
    @close="isWeightsDialogOpen = false"
  />
</template>

<style scoped>
.set-dialog {
  --text-primary: #17211a;
  --text-secondary: #536158;
  --input-surface: #fff;
  --input-border: #d5ddd1;
  --input-active-border: #3f704e;
  --input-active-surface: #f5faef;
  --input-focus-ring: rgb(63 112 78 / 13%);
  --history-surface: #e5eddf;
  --compact-control-height: 38px;
  width: min(calc(100% - 32px), 520px);
  max-height: calc(100dvh - 32px);
  margin: auto;
  padding: 0;
  border: 0;
  border-radius: var(--radius-modal);
  background: #f8faf5;
  color: var(--text-primary);
  box-shadow: 0 24px 80px rgb(13 31 20 / 30%);
  -webkit-tap-highlight-color: transparent;
}

.set-dialog :deep(*) {
  -webkit-tap-highlight-color: transparent;
}

.set-dialog::backdrop {
  background: rgb(11 22 15 / 55%);
  backdrop-filter: blur(3px);
}

.set-form {
  padding: 24px;
}

.dialog-header {
  position: relative;
  min-height: 36px;
  margin-bottom: 24px;
}

.dialog-header h2 {
  margin: 0;
  font-size: var(--text-display);
  letter-spacing: -0.03em;
}

.dialog-header-actions {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-switch-button {
  position: relative;
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  padding: 0;
  border: 1px solid #dce3d8;
  border-radius: var(--radius-circle);
  outline: none;
  background: #fff;
  color: #52675a;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.panel-switch-button svg {
  width: 19px;
  height: 19px;
  fill: none;
  stroke: currentcolor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.panel-switch-button span {
  position: absolute;
  right: -2px;
  bottom: -2px;
  display: grid;
  width: 15px;
  height: 15px;
  place-items: center;
  border: 2px solid #f8faf5;
  border-radius: var(--radius-circle);
  background: #315e40;
  color: #fff;
  font-size: var(--text-micro);
  font-weight: 800;
  line-height: 1;
}

.close-button {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  padding: 0 0 3px;
  border: 1px solid #dce3d8;
  border-radius: var(--radius-circle);
  background: #fff;
  color: #617067;
  font-size: var(--text-display);
  cursor: pointer;
}

label {
  display: grid;
  gap: 8px;
  color: var(--text-secondary);
  font-size: var(--text-body);
  font-weight: 700;
}

label + label,
.field-row {
  margin-top: 16px;
}

.exercise-field {
  margin-top: 16px;
}

.exercise-field > label {
  margin-bottom: 8px;
}

.alternate-exercise-heading {
  display: flex;
  min-height: 32px;
  align-items: center;
  justify-content: flex-end;
  margin-bottom: 8px;
}

.body-part-filter {
  --segment-track-height: var(--compact-control-height);
  width: min(100%, 202px);
}

.body-part-filter button {
  padding-inline: 2px;
  font-size: var(--text-body);
  font-weight: 600;
}

/* Extend each segment's hit area without making the track look taller. */
.body-part-filter button::after {
  position: absolute;
  inset: -6px 0;
  content: '';
}

.exercise-control-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 48px;
  gap: 8px;
}

.exercise-control-row button {
  display: grid;
  width: 21px;
  height: 21px;
  align-self: center;
  justify-self: center;
  place-items: center;
  padding: 0;
  border: 1px solid #8b978f;
  border-radius: var(--radius-circle);
  outline: none;
  background: transparent;
  color: #657169;
  font-size: var(--text-caption);
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.exercise-control-row button:focus,
.exercise-control-row button:active {
  border-color: #8b978f;
  background: transparent;
  color: #657169;
}

.exercise-control-row button:disabled {
  cursor: default;
  opacity: 0.4;
}

input,
select {
  width: 100%;
  min-height: 48px;
  padding: 11px 12px;
  border: 1px solid var(--input-border);
  border-radius: var(--radius-control);
  outline: none;
  background: var(--input-surface);
  color: var(--text-primary);
  font: inherit;
  font-size: var(--text-control);
}

input:focus,
select:focus {
  border-color: var(--input-active-border);
  box-shadow: 0 0 0 3px var(--input-focus-ring);
}

input[readonly] {
  cursor: pointer;
  caret-color: transparent;
}

.active-field span {
  color: #285b39;
}

.active-field input {
  border-color: var(--input-active-border);
  background: var(--input-active-surface);
  box-shadow: 0 0 0 3px var(--input-focus-ring);
}

.field-row {
  display: grid;
  grid-template-columns: 1.35fr 1fr 0.8fr;
  gap: 10px;
}

.alternate-fields {
  grid-template-columns: minmax(0, 1fr);
}

.alternate-field-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.alternate-input,
.history-value,
.alternate-exercise-info {
  position: relative;
  isolation: isolate;
  height: 48px;
}

.alternate-input {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding-inline: 9px;
  font-size: var(--text-body);
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.alternate-exercise-control {
  display: flex;
  align-items: center;
  gap: 6px;
}

.alternate-exercise-info {
  display: grid;
  flex: 0 0 var(--compact-control-height);
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.alternate-exercise-info svg {
  width: 20px;
  height: 20px;
}

/* Keep the same visible height and hit area for fields and history buttons. */
.alternate-input::before,
.history-value::before,
.alternate-exercise-info::before {
  position: absolute;
  inset: calc((48px - var(--compact-control-height)) / 2) 0;
  z-index: -1;
  border: 1px solid var(--input-border);
  border-radius: var(--radius-control);
  content: '';
  pointer-events: none;
}

.alternate-input::before,
.alternate-exercise-info::before {
  background: var(--input-surface);
}

.alternate-input:is(.is-active, :focus-within)::before {
  border-color: var(--input-active-border);
  background: var(--input-active-surface);
  box-shadow: 0 0 0 3px var(--input-focus-ring);
}

.alternate-input :is(input, select) {
  flex: 1;
  width: 0;
  min-width: 0;
  min-height: 0;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  color: var(--text-primary);
  font-size: var(--text-control);
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.alternate-input input[readonly] {
  font-size: 1.0625rem;
  font-weight: 500;
}

.alternate-input input[type='date']::-webkit-date-and-time-value {
  text-align: right;
}

.alternate-input select {
  text-align-last: right;
  text-overflow: ellipsis;
}

.alternate-input input::placeholder {
  color: var(--text-secondary);
  opacity: 1;
}

.alternate-input-unit {
  font-size: var(--text-body);
  font-weight: 400;
}

.history-value {
  flex: 0 0 56px;
  width: 56px;
  padding-inline: 4px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--text-control);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.history-value[aria-pressed='true'] {
  color: var(--text-primary);
}

.history-value::before {
  background: var(--history-surface);
}

.history-value[aria-pressed='true']::before {
  border-color: var(--input-active-border);
  background: var(--input-active-surface);
}

.history-value:disabled {
  opacity: 0.55;
  cursor: default;
}

.history-value:disabled::before {
  background: transparent;
}

.error-message {
  margin: 16px 0 0;
  color: #a52d2d;
  font-size: var(--text-body);
}

.number-keypad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 18px;
}

.number-keypad button {
  min-height: 42px;
  padding: 6px;
  border: 1px solid #d5ddd1;
  border-radius: var(--radius-control);
  background: #fff;
  color: #26372c;
  font-size: var(--text-control);
  font-weight: 750;
  cursor: pointer;
  touch-action: manipulation;
}

.number-keypad button:disabled {
  background: #edf0eb;
  color: #a7afa8;
  cursor: not-allowed;
}

.number-keypad .clear-key {
  background: var(--history-surface);
  color: #365640;
  font-size: var(--text-body);
}

.dialog-actions {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 10px;
  margin-top: 18px;
}

.dialog-actions button {
  min-height: 48px;
  border-radius: var(--radius-control);
  font-weight: 800;
  cursor: pointer;
}

.dialog-actions button:disabled {
  cursor: wait;
  opacity: 0.65;
}

.cancel-button {
  border: 1px solid #d5ddd1;
  background: #fff;
  color: #536158;
}

.save-button {
  border: 0;
  background: #183f2b;
  color: #fff;
}

@media (max-width: 430px) {
  .set-dialog {
    width: 100%;
    max-width: none;
    max-height: calc(100dvh - 24px);
    margin: auto 0 0;
    border-radius: var(--radius-modal) var(--radius-modal) 0 0;
  }

  .set-form {
    padding: 22px 20px calc(22px + env(safe-area-inset-bottom));
  }
}
</style>
