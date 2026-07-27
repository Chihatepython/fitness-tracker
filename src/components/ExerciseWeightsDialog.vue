<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

type MuscleWeightItem = {
  muscle: string
  weight: number
}

const props = defineProps<{
  isOpen: boolean
  exerciseName: string
  weights: MuscleWeightItem[]
}>()

const emit = defineEmits<{
  close: []
}>()

const dialog = ref<HTMLDialogElement>()

function requestClose(): void {
  if (dialog.value?.open) dialog.value.close()
  emit('close')
}

function handleDialogClick(event: MouseEvent): void {
  if (event.target === event.currentTarget) requestClose()
}

watch(
  () => props.isOpen,
  async (isOpen) => {
    await nextTick()

    if (isOpen && !dialog.value?.open) {
      dialog.value?.showModal()
    } else if (!isOpen && dialog.value?.open) {
      dialog.value.close()
    }
  },
  { flush: 'post' },
)
</script>

<template>
  <dialog
    ref="dialog"
    class="exercise-weights-dialog"
    @cancel.prevent="requestClose"
    @click="handleDialogClick"
  >
    <div class="exercise-weights-content">
      <header>
        <div>
          <h2>{{ exerciseName }}</h2>
          <p>肌肉分权</p>
        </div>
        <button type="button" aria-label="关闭肌肉分权" @click="requestClose">×</button>
      </header>

      <div class="exercise-weight-lines">
        <p v-for="item in weights" :key="item.muscle">
          <span>{{ item.muscle }}</span>
          <strong>×{{ item.weight }}</strong>
        </p>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.exercise-weights-dialog {
  width: min(calc(100% - 40px), 380px);
  margin: auto;
  padding: 0;
  border: 0;
  border-radius: 20px;
  outline: none;
  background: #f8faf5;
  color: #17211a;
  box-shadow: 0 24px 80px rgb(13 31 20 / 30%);
}

.exercise-weights-dialog::backdrop {
  background: rgb(11 22 15 / 55%);
  backdrop-filter: blur(3px);
}

.exercise-weights-content {
  padding: 22px;
}

.exercise-weights-content header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.exercise-weights-content h2 {
  margin: 0;
  font-size: 1.25rem;
  letter-spacing: -0.03em;
}

.exercise-weights-content header p {
  margin: 5px 0 0;
  color: #718078;
  font-size: 0.78rem;
  font-weight: 700;
}

.exercise-weights-content header button {
  display: grid;
  width: 34px;
  height: 34px;
  flex: none;
  place-items: center;
  padding: 0 0 2px;
  border: 1px solid #d5ddd1;
  border-radius: 50%;
  background: #fff;
  color: #536158;
  font-size: 1.3rem;
  line-height: 1;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.exercise-weight-lines {
  margin-top: 18px;
}

.exercise-weight-lines p {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 0;
  padding: 6px 2px;
  color: #536158;
  font-size: 0.9rem;
}

.exercise-weight-lines strong {
  flex: none;
  color: #214c30;
  font-variant-numeric: tabular-nums;
}
</style>
