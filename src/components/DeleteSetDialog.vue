<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

import { EXERCISE_NAMES, type TrainingSet } from '@/database'
import { formatWeight } from '@/domain/trainingStats'

const props = defineProps<{
  trainingSet?: TrainingSet
  isDeleting: boolean
  error: string
}>()

const emit = defineEmits<{
  cancel: []
  confirm: []
}>()

const dialog = ref<HTMLDialogElement>()

watch(
  () => props.trainingSet,
  async (trainingSet) => {
    await nextTick()

    if (trainingSet && !dialog.value?.open) {
      dialog.value?.showModal()
    } else if (!trainingSet && dialog.value?.open) {
      dialog.value.close()
    }
  },
  { flush: 'post' },
)
</script>

<template>
  <dialog ref="dialog" class="delete-dialog" @cancel.prevent="emit('cancel')">
    <div v-if="trainingSet" class="delete-confirmation">
      <header>
        <p class="delete-dialog-eyebrow">确认操作</p>
        <h2>删除这组记录？</h2>
      </header>

      <div class="delete-record-summary">
        <strong>{{ EXERCISE_NAMES[trainingSet.exerciseId] }}</strong>
        <span>
          {{ formatWeight(trainingSet.weightKg) }} kg × {{ trainingSet.reps }} · RIR
          {{ trainingSet.rir }}
        </span>
      </div>

      <p v-if="error" class="delete-error" role="alert">{{ error }}</p>

      <footer class="delete-actions">
        <button type="button" :disabled="isDeleting" @click="emit('cancel')">Cancel</button>
        <button
          class="confirm-delete-button"
          type="button"
          :disabled="isDeleting"
          @click="emit('confirm')"
        >
          {{ isDeleting ? '删除中…' : '删除' }}
        </button>
      </footer>
    </div>
  </dialog>
</template>

<style scoped>
.delete-dialog {
  width: min(calc(100% - 40px), 420px);
  margin: auto;
  padding: 0;
  border: 0;
  border-radius: 22px;
  background: #f8faf5;
  color: #17211a;
  box-shadow: 0 24px 80px rgb(13 31 20 / 30%);
}

.delete-dialog::backdrop {
  background: rgb(11 22 15 / 55%);
  backdrop-filter: blur(3px);
}

.delete-confirmation {
  padding: 24px;
}

.delete-confirmation h2 {
  margin-bottom: 0;
  font-size: 1.35rem;
  letter-spacing: -0.03em;
}

.delete-dialog-eyebrow {
  margin-bottom: 5px;
  color: #718078;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.delete-record-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 20px;
  padding: 16px;
  border: 1px solid #e0e5dc;
  border-radius: 14px;
  background: #fff;
}

.delete-record-summary strong {
  font-size: 0.9rem;
}

.delete-record-summary span {
  flex-shrink: 0;
  color: #617067;
  font-size: 0.84rem;
  font-variant-numeric: tabular-nums;
}

.delete-error {
  margin: 14px 0 0;
  color: #a52d2d;
  font-size: 0.82rem;
}

.delete-actions {
  display: grid;
  grid-template-columns: 1fr 1.25fr;
  gap: 10px;
  margin-top: 22px;
}

.delete-actions button {
  min-height: 46px;
  border: 1px solid #d5ddd1;
  border-radius: 12px;
  background: #fff;
  color: #536158;
  font-weight: 800;
  cursor: pointer;
}

.delete-actions button:disabled {
  cursor: wait;
  opacity: 0.65;
}

.delete-actions .confirm-delete-button {
  border-color: #a83232;
  background: #a83232;
  color: #fff;
}

@media (max-width: 390px) {
  .delete-record-summary {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }
}
</style>
