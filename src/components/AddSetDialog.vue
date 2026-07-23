<script setup lang="ts">
import { ref } from 'vue'

import {
  EXERCISES,
  addTrainingSet,
  createTrainingSetId,
  getTrainingSetsByDate,
  type ExerciseId,
} from '@/database'

const DEFAULT_EXERCISE_ID = EXERCISES[0].id
const exerciseOptions = EXERCISES

type NumericField = 'weightKg' | 'reps' | 'rir'

const keypadDigits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

const dialog = ref<HTMLDialogElement>()
const date = ref('')
const exerciseId = ref<ExerciseId>(DEFAULT_EXERCISE_ID)
const weightKg = ref('')
const reps = ref('')
const rir = ref('')
const activeNumericField = ref<NumericField>('reps')
const shouldReplaceActiveValue = ref(true)
const errorMessage = ref('')
const isSaving = ref(false)
const emit = defineEmits<{ saved: [] }>()

function getLocalDate(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

async function open(): Promise<void> {
  const today = getLocalDate()

  date.value = today
  exerciseId.value = DEFAULT_EXERCISE_ID
  weightKg.value = ''
  reps.value = ''
  rir.value = ''
  activeNumericField.value = 'reps'
  shouldReplaceActiveValue.value = true
  errorMessage.value = ''

  try {
    const todayTrainingSets = await getTrainingSetsByDate(today)
    const lastTrainingSet = todayTrainingSets[todayTrainingSets.length - 1]

    if (lastTrainingSet) {
      exerciseId.value = lastTrainingSet.exerciseId
      weightKg.value = String(lastTrainingSet.weightKg)
      reps.value = String(lastTrainingSet.reps)
      rir.value = String(lastTrainingSet.rir)
    }
  } catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : '读取上一组记录失败'
  }

  dialog.value?.showModal()
}

function close(): void {
  if (!isSaving.value) dialog.value?.close()
}

function getActiveValue(): string {
  if (activeNumericField.value === 'weightKg') return weightKg.value
  if (activeNumericField.value === 'reps') return reps.value

  return rir.value
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
    dialog.value?.close()
  } catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : '保存训练组失败'
  } finally {
    isSaving.value = false
  }
}

defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" class="set-dialog" @cancel.prevent="close">
    <form class="set-form" @submit.prevent="save">
      <header class="dialog-header">
        <div>
          <p class="dialog-eyebrow">新增记录</p>
          <h2>添加一组</h2>
        </div>
        <button class="close-button" type="button" aria-label="关闭" @click="close">×</button>
      </header>

      <label>
        <span>日期</span>
        <input v-model="date" type="date" required />
      </label>

      <label>
        <span>动作</span>
        <select v-model="exerciseId" required>
          <option v-for="exercise in exerciseOptions" :key="exercise.id" :value="exercise.id">
            {{ exercise.bodyPart }} - {{ exercise.name }}
          </option>
        </select>
      </label>

      <div class="field-row">
        <label :class="{ 'active-field': activeNumericField === 'weightKg' }">
          <span>重量（kg）</span>
          <input
            v-model="weightKg"
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
    </form>
  </dialog>
</template>

<style scoped>
.set-dialog {
  width: min(calc(100% - 32px), 520px);
  max-height: calc(100dvh - 32px);
  margin: auto;
  padding: 0;
  border: 0;
  border-radius: 24px;
  background: #f8faf5;
  color: #17211a;
  box-shadow: 0 24px 80px rgb(13 31 20 / 30%);
}

.set-dialog::backdrop {
  background: rgb(11 22 15 / 55%);
  backdrop-filter: blur(3px);
}

.set-form {
  padding: 24px;
}

.dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
}

.dialog-header h2 {
  margin: 0;
  font-size: 1.5rem;
  letter-spacing: -0.03em;
}

.dialog-eyebrow {
  margin: 0 0 5px;
  color: #718078;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.close-button {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  padding: 0 0 3px;
  border: 1px solid #dce3d8;
  border-radius: 50%;
  background: #fff;
  color: #617067;
  font-size: 1.45rem;
  cursor: pointer;
}

label {
  display: grid;
  gap: 8px;
  color: #536158;
  font-size: 0.8rem;
  font-weight: 700;
}

label + label,
.field-row {
  margin-top: 16px;
}

input,
select {
  width: 100%;
  min-height: 48px;
  padding: 11px 12px;
  border: 1px solid #d5ddd1;
  border-radius: 12px;
  outline: none;
  background: #fff;
  color: #17211a;
  font: inherit;
  font-size: 1rem;
}

input:focus,
select:focus {
  border-color: #3f704e;
  box-shadow: 0 0 0 3px rgb(63 112 78 / 13%);
}

input[readonly] {
  cursor: pointer;
  caret-color: transparent;
}

.active-field span {
  color: #285b39;
}

.active-field input {
  border-color: #3f704e;
  background: #f5faef;
  box-shadow: 0 0 0 3px rgb(63 112 78 / 13%);
}

.field-row {
  display: grid;
  grid-template-columns: 1.35fr 1fr 0.8fr;
  gap: 10px;
}

.error-message {
  margin: 16px 0 0;
  color: #a52d2d;
  font-size: 0.82rem;
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
  border-radius: 10px;
  background: #fff;
  color: #26372c;
  font-size: 1.05rem;
  font-weight: 750;
  cursor: pointer;
  touch-action: manipulation;
}

.number-keypad button:active {
  background: #e8efe3;
  transform: translateY(1px);
}

.number-keypad button:disabled {
  background: #edf0eb;
  color: #a7afa8;
  cursor: not-allowed;
}

.number-keypad .clear-key {
  background: #e5eddf;
  color: #365640;
  font-size: 0.82rem;
}

.dialog-actions {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 10px;
  margin-top: 18px;
}

.dialog-actions button {
  min-height: 48px;
  border-radius: 13px;
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
    border-radius: 24px 24px 0 0;
  }

  .set-form {
    padding: 22px 20px calc(22px + env(safe-area-inset-bottom));
  }
}
</style>
