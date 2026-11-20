<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId } from 'vue'

defineProps<{
  name: string
  activeId?: string
  plans: readonly { id: string; name: string }[]
  loading?: boolean
  error?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  open: []
  select: [id: string]
  create: []
}>()

const open = ref(false)
const root = ref<HTMLElement>()
const trigger = ref<HTMLButtonElement>()
const panelId = useId()

function toggle(): void {
  open.value = !open.value
  if (open.value) emit('open')
}

function close(restoreFocus = false): void {
  open.value = false
  if (restoreFocus) trigger.value?.focus()
}

function closeOutside(event: PointerEvent): void {
  if (open.value && !root.value?.contains(event.target as Node)) close()
}

onMounted(() => document.addEventListener('pointerdown', closeOutside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeOutside))
</script>

<template>
  <div ref="root" class="plan-menu" @keydown.esc.stop="close(true)">
    <button
      ref="trigger"
      class="plan-menu-trigger"
      type="button"
      :disabled="disabled"
      :aria-expanded="open"
      :aria-controls="open ? panelId : undefined"
      @click="toggle"
    >
      <span>{{ name }}</span>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
    </button>
    <section v-if="open" :id="panelId" class="plan-menu-panel" aria-label="云端训练计划">
      <header>
        <strong>云端计划</strong>
        <button type="button" class="plan-menu-add" aria-label="新建计划" :disabled="disabled" @click="close(true); emit('create')">＋</button>
      </header>
      <p v-if="loading">正在读取…</p>
      <p v-else-if="error" role="alert">{{ error }}</p>
      <p v-else-if="!plans.length">还没有保存的计划</p>
      <div v-else class="plan-menu-list">
        <button
          v-for="item in plans"
          :key="item.id"
          type="button"
          :disabled="disabled"
          :aria-current="item.id === activeId ? 'true' : undefined"
          @click="close(true); emit('select', item.id)"
        >
          {{ item.name }}
          <span v-if="item.id === activeId" aria-hidden="true">✓</span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.plan-menu { position: relative; z-index: 2; min-width: 0; }
.plan-menu-trigger, .plan-menu-add {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-pill);
  background: #e3ebe0;
  font-size: var(--text-caption);
  font-weight: 800;
  cursor: pointer;
}
.plan-menu-trigger span { max-width: min(31vw, 176px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.plan-menu-trigger svg { width: 14px; flex: 0 0 auto; fill: none; stroke: currentColor; stroke-width: 1.8; }
.plan-menu-trigger[aria-expanded='true'] svg { transform: rotate(180deg); }
.plan-menu-panel {
  position: absolute;
  inset: calc(100% + 5px) 0 auto auto;
  width: min(250px, 85vw);
  padding: 8px;
  border: 1px solid #d7e0d4;
  border-radius: var(--radius-card);
  background: #fff;
  box-shadow: 0 8px 22px rgb(48 67 52 / 14%);
}
.plan-menu-panel header, .plan-menu-list button { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.plan-menu-panel header, .plan-menu-panel p { padding: 0 4px; font-size: var(--text-caption); }
.plan-menu-add { display: grid; min-width: 34px; padding: 0; place-items: center; font-size: var(--text-body); }
.plan-menu-list { display: grid; gap: 3px; max-height: min(220px, 40vh); overflow: auto; margin-top: 5px; }
.plan-menu-list button { min-height: 36px; padding: 6px 10px; border: 0; border-radius: var(--radius-control); background: transparent; text-align: left; font: inherit; cursor: pointer; }
.plan-menu-list button[aria-current='true'] { background: #e3ecdf; font-weight: 800; }
.plan-menu button:focus-visible { outline: 2px solid #46634d; outline-offset: -2px; }
.plan-menu button:disabled { opacity: 0.6; cursor: default; }
</style>
