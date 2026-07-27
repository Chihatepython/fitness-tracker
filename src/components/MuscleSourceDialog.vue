<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { EXERCISE_NAMES } from '@/database'
import { usePageScrollLock } from '@/composables/usePageScrollLock'
import {
  formatWeightedSetCount,
  type MuscleName,
  type MuscleSourceContribution,
} from '@/domain/trainingStats'

const ANIMATION_MS = 200

const props = defineProps<{
  muscle?: MuscleName
  sources: MuscleSourceContribution[]
  total: number
  dateRange: string
}>()

const emit = defineEmits<{
  close: []
}>()

const dialog = ref<HTMLDialogElement>()
const isClosing = ref(false)
let closeTimer: number | undefined
const { lockPageScroll, unlockPageScroll } = usePageScrollLock()

async function openDialog(): Promise<void> {
  await nextTick()

  if (!dialog.value || dialog.value.open) return

  isClosing.value = false
  lockPageScroll()

  try {
    dialog.value.showModal()
  } catch (error: unknown) {
    unlockPageScroll()
    throw error
  }
}

function requestClose(): void {
  if (!dialog.value?.open || isClosing.value) return

  isClosing.value = true
  const closeDelay = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 0
    : ANIMATION_MS

  closeTimer = window.setTimeout(() => {
    dialog.value?.close()
    isClosing.value = false
    unlockPageScroll()
    emit('close')
  }, closeDelay)
}

function handleDialogClick(event: MouseEvent): void {
  if (event.target === event.currentTarget) requestClose()
}

watch(
  () => props.muscle,
  (muscle) => {
    if (muscle) void openDialog()
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  if (closeTimer !== undefined) window.clearTimeout(closeTimer)
  if (dialog.value?.open) dialog.value.close()
  unlockPageScroll()
})
</script>

<template>
  <dialog
    ref="dialog"
    class="muscle-source-dialog"
    :class="{ closing: isClosing }"
    @cancel.prevent="requestClose"
    @click="handleDialogClick"
  >
    <div v-if="muscle" class="muscle-source-content">
      <header class="muscle-source-header">
        <div>
          <p class="muscle-source-eyebrow">训练来源</p>
          <h2>{{ muscle }}</h2>
          <span>{{ dateRange }}</span>
        </div>
        <button type="button" aria-label="关闭训练来源" @click="requestClose">×</button>
      </header>

      <div class="muscle-source-summary">
        <span>加权组数</span>
        <strong>{{ formatWeightedSetCount(total) }}</strong>
      </div>

      <ul class="muscle-source-list">
        <li v-for="source in sources" :key="source.exerciseId">
          <div>
            <strong>{{ EXERCISE_NAMES[source.exerciseId] }}</strong>
            <span>
              {{ source.setCount }} 组 × 每组 {{ formatWeightedSetCount(source.weightPerSet) }}
            </span>
          </div>
          <strong>{{ formatWeightedSetCount(source.weightedSetCount) }} 组</strong>
        </li>
      </ul>
    </div>
  </dialog>
</template>

<style scoped>
.muscle-source-dialog {
  position: fixed;
  inset: auto 0 0;
  width: min(100%, 680px);
  max-width: none;
  max-height: min(72dvh, 640px);
  margin: 0 auto;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: 24px 24px 0 0;
  outline: none;
  background: #f8faf5;
  color: #17211a;
  box-shadow: 0 -18px 60px rgb(13 31 20 / 24%);
}

.muscle-source-dialog::backdrop {
  background: rgb(11 22 15 / 48%);
  backdrop-filter: blur(2px);
}

.muscle-source-dialog[open] {
  animation: muscle-source-slide-in 200ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.muscle-source-dialog[open]::backdrop {
  animation: muscle-source-backdrop-in 200ms ease-out both;
}

.muscle-source-dialog.closing {
  animation: muscle-source-slide-out 200ms cubic-bezier(0.4, 0, 1, 1) both;
}

.muscle-source-dialog.closing::backdrop {
  animation: muscle-source-backdrop-out 200ms ease-in both;
}

@keyframes muscle-source-slide-in {
  from {
    transform: translateY(100%);
  }

  to {
    transform: translateY(0);
  }
}

@keyframes muscle-source-slide-out {
  from {
    transform: translateY(0);
  }

  to {
    transform: translateY(100%);
  }
}

@keyframes muscle-source-backdrop-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes muscle-source-backdrop-out {
  from {
    opacity: 1;
  }

  to {
    opacity: 0;
  }
}

.muscle-source-content {
  max-height: min(72dvh, 640px);
  padding: 22px 20px calc(24px + env(safe-area-inset-bottom));
  overflow-y: auto;
  overscroll-behavior: contain;
}

.muscle-source-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.muscle-source-eyebrow {
  margin-bottom: 5px;
  color: #718078;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.muscle-source-header h2 {
  margin-bottom: 5px;
  font-size: 1.4rem;
  letter-spacing: -0.03em;
}

.muscle-source-header span {
  color: #718078;
  font-size: 0.8rem;
  font-weight: 700;
}

.muscle-source-header button {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  place-items: center;
  padding: 0 0 2px;
  border: 1px solid #d5ddd1;
  border-radius: 50%;
  outline: none;
  background: #fff;
  color: #536158;
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.muscle-source-header button:active {
  background: #fff;
  color: #536158;
}

.muscle-source-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20px;
  padding: 14px 16px;
  border-radius: 14px;
  background: #e5eddf;
  color: #46634d;
  font-weight: 800;
}

.muscle-source-summary strong {
  font-size: 1.15rem;
  font-variant-numeric: tabular-nums;
}

.muscle-source-list {
  overflow: hidden;
  margin: 14px 0 0;
  padding: 0;
  border: 1px solid #e0e5dc;
  border-radius: 16px;
  background: #fff;
  list-style: none;
}

.muscle-source-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 15px 16px;
}

.muscle-source-list li + li {
  border-top: 1px solid #edf0ea;
}

.muscle-source-list li > div {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.muscle-source-list li > div strong {
  overflow: hidden;
  font-size: 0.9rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.muscle-source-list li span {
  color: #718078;
  font-size: 0.78rem;
}

.muscle-source-list li > strong {
  flex: 0 0 auto;
  color: #234a31;
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  .muscle-source-dialog[open],
  .muscle-source-dialog[open]::backdrop {
    animation: none;
  }
}
</style>
