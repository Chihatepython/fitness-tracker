<script setup lang="ts">
import { RouterLink } from 'vue-router'

defineProps<{
  step: 'plan' | 'schedule'
  planId?: string
  scheduleUnavailableReason?: string
}>()
</script>

<template>
  <div class="weekly-plan-steps">
    <nav class="step-selector" aria-label="七天训练计划步骤">
      <span v-if="step === 'plan'" class="step-option" aria-current="step">① 目标与动作</span>
      <RouterLink
        v-else
        class="step-option"
        :to="{ name: 'weekly-plan', query: planId ? { plan: planId } : {} }"
      >
        ① 目标与动作
      </RouterLink>

      <span v-if="step === 'schedule'" class="step-option" aria-current="step">② 训练日安排</span>
      <RouterLink
        v-else-if="planId && !scheduleUnavailableReason"
        class="step-option"
        :to="{ name: 'weekly-schedule', query: { plan: planId } }"
      >
        ② 训练日安排
      </RouterLink>
      <button
        v-else
        class="step-option"
        type="button"
        disabled
        :aria-describedby="scheduleUnavailableReason ? 'weekly-plan-step-hint' : undefined"
      >
        ② 训练日安排
      </button>
    </nav>
    <p v-if="scheduleUnavailableReason" id="weekly-plan-step-hint" class="step-hint">
      {{ scheduleUnavailableReason }}
    </p>
  </div>
</template>

<style scoped>
.step-selector {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 3px;
  border-radius: var(--radius-control);
  background: #fff;
  box-shadow: inset 0 0 0 1px #e1e8df;
}

.step-option {
  display: grid;
  min-height: 36px;
  place-items: center;
  padding: 4px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: #52695a;
  font: inherit;
  font-size: var(--text-caption);
  font-weight: 700;
  text-align: center;
  text-decoration: none;
}

.step-option[aria-current='step'] {
  background: #e3ecdf;
  color: #36513e;
}

.step-option:disabled {
  color: #718078;
  opacity: 0.6;
}

.step-option:focus-visible {
  outline: 2px solid #46634d;
  outline-offset: -2px;
}

.step-hint {
  margin: 4px 0 0;
  color: #68766d;
  font-size: var(--text-micro);
  text-align: center;
}
</style>
