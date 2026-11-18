<script setup lang="ts">
import { RouterLink } from 'vue-router'

defineProps<{
  step: 'plan' | 'schedule'
  planId?: string
  scheduleUnavailableReason?: string
  status: string
  statusTone?: 'saved' | 'dirty' | 'error'
}>()
</script>

<template>
  <div class="weekly-plan-steps">
    <nav class="step-selector" aria-label="七天训练计划步骤">
      <span v-if="step === 'plan'" class="step-option" aria-current="step" aria-label="步骤一：目标与动作">① 目标</span>
      <RouterLink
        v-else
        class="step-option"
        aria-label="步骤一：目标与动作"
        :to="{ name: 'weekly-plan', query: planId ? { plan: planId } : {} }"
      >
        ① 目标
      </RouterLink>

      <span v-if="step === 'schedule'" class="step-option" aria-current="step" aria-label="步骤二：训练日安排">② 排期</span>
      <RouterLink
        v-else-if="planId && !scheduleUnavailableReason"
        class="step-option"
        aria-label="步骤二：训练日安排"
        :to="{ name: 'weekly-schedule', query: { plan: planId } }"
      >
        ② 排期
      </RouterLink>
      <button
        v-else
        class="step-option"
        type="button"
        aria-label="步骤二：训练日安排"
        disabled
        :aria-describedby="scheduleUnavailableReason ? 'weekly-plan-step-hint' : undefined"
      >
        ② 排期
      </button>
    </nav>
    <div class="step-actions" role="group" :aria-label="step === 'plan' ? '目标与动作操作' : '训练日安排操作'">
      <span class="step-status" :data-tone="statusTone" aria-live="polite">
        <span class="step-status-label">{{ status }}</span>
        <span v-if="statusTone === 'saved'" class="step-status-check" aria-hidden="true">✓</span>
      </span>
      <slot />
    </div>
    <p v-if="scheduleUnavailableReason" id="weekly-plan-step-hint" class="step-hint">
      {{ scheduleUnavailableReason }}
    </p>
  </div>
</template>

<style scoped>
.weekly-plan-steps {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.step-selector {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  flex: 0 1 188px;
  padding: 3px;
  border-radius: var(--radius-control);
  background: #fff;
  box-shadow: inset 0 0 0 1px #e1e8df;
}

.step-option {
  display: grid;
  min-height: 36px;
  place-items: center;
  padding: 4px 6px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: #52695a;
  font: inherit;
  font-size: var(--text-caption);
  font-weight: 700;
  text-align: center;
  text-decoration: none;
  white-space: nowrap;
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

.step-actions {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 5px;
}

.step-status {
  position: relative;
  padding: 3px 6px;
  border-radius: var(--radius-pill);
  background: #e3ecdf;
  color: #52705a;
  font-size: var(--text-micro);
  font-weight: 700;
  white-space: nowrap;
}

.step-status[data-tone='dirty'] {
  background: #f2ead9;
  color: #8b7044;
}

.step-status[data-tone='error'] {
  background: #f5e7e4;
  color: #a75a55;
}

.step-status-check {
  display: none;
}

.step-hint {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (max-width: 420px) {
  .step-status[data-tone='saved'] .step-status-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .step-status-check {
    display: inline;
  }
}

@media (max-width: 350px) {
  .step-option { padding-inline: 3px; }
  .step-actions { gap: 3px; }
}
</style>
