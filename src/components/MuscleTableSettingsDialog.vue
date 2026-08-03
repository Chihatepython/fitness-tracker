<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { usePageScrollLock } from '@/composables/usePageScrollLock'

const ANIMATION_MS = 200

const props = defineProps<{
  open: boolean
  showTodayColumn: boolean
}>()

const emit = defineEmits<{
  close: []
  toggleTodayColumn: []
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
  () => props.open,
  (open) => {
    if (open) {
      void openDialog()
    } else if (dialog.value?.open && !isClosing.value) {
      dialog.value.close()
      unlockPageScroll()
    }
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
    class="muscle-table-settings-dialog"
    :class="{ closing: isClosing }"
    @cancel.prevent="requestClose"
    @click="handleDialogClick"
  >
    <div class="muscle-table-settings-content">
      <header>
        <h2>表格设置</h2>
        <button type="button" aria-label="关闭表格设置" @click="requestClose">×</button>
      </header>

      <button
        class="muscle-table-setting-option"
        type="button"
        :aria-pressed="showTodayColumn"
        @click="emit('toggleTodayColumn')"
      >
        <span>显示今日新增</span>
        <strong>{{ showTodayColumn ? '已开启' : '已关闭' }}</strong>
      </button>
    </div>
  </dialog>
</template>

<style scoped>
.muscle-table-settings-dialog {
  position: fixed;
  inset: auto 0 0;
  width: min(100%, 680px);
  max-width: none;
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

.muscle-table-settings-dialog::backdrop {
  background: rgb(11 22 15 / 48%);
  backdrop-filter: blur(2px);
}

.muscle-table-settings-dialog[open] {
  animation: table-settings-slide-in 200ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.muscle-table-settings-dialog[open]::backdrop {
  animation: table-settings-backdrop-in 200ms ease-out both;
}

.muscle-table-settings-dialog.closing {
  animation: table-settings-slide-out 200ms cubic-bezier(0.4, 0, 1, 1) both;
}

.muscle-table-settings-dialog.closing::backdrop {
  animation: table-settings-backdrop-out 200ms ease-in both;
}

.muscle-table-settings-content {
  padding: 22px 20px calc(24px + env(safe-area-inset-bottom));
}

.muscle-table-settings-content header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.muscle-table-settings-content h2 {
  margin: 0;
  font-size: 1.4rem;
  letter-spacing: -0.03em;
}

.muscle-table-settings-content header button {
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

.muscle-table-setting-option {
  display: flex;
  width: 100%;
  min-height: 54px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 20px;
  padding: 14px 16px;
  border: 1px solid #d9e0d6;
  border-radius: 14px;
  background: #fff;
  color: #405047;
  font: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.muscle-table-setting-option span {
  font-size: 0.92rem;
  font-weight: 800;
}

.muscle-table-setting-option strong {
  flex: 0 0 auto;
  color: #718078;
  font-size: 0.78rem;
}

.muscle-table-setting-option[aria-pressed='true'] {
  border: 2px solid #6f8f75;
  padding: 13px 15px;
  background: #f0f6ee;
  color: #234a31;
}

.muscle-table-setting-option[aria-pressed='true'] strong {
  color: #46634d;
}

@keyframes table-settings-slide-in {
  from {
    transform: translateY(100%);
  }

  to {
    transform: translateY(0);
  }
}

@keyframes table-settings-slide-out {
  from {
    transform: translateY(0);
  }

  to {
    transform: translateY(100%);
  }
}

@keyframes table-settings-backdrop-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes table-settings-backdrop-out {
  from {
    opacity: 1;
  }

  to {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .muscle-table-settings-dialog[open],
  .muscle-table-settings-dialog[open]::backdrop {
    animation: none;
  }
}
</style>
