<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router'

import { vSegmentHighlight } from '@/directives/segmentHighlight'

const props = defineProps<{
  step: 'plan' | 'schedule'
  planId?: string
  scheduleUnavailableReason?: string
  status: string
  statusTone?: 'saved' | 'dirty' | 'error'
}>()

const router = useRouter()
const previousPath = router.options.history.state.back
const previousRoute = typeof previousPath === 'string' ? router.resolve(previousPath).name : undefined
const previousStep =
  props.step === 'schedule' && previousRoute === 'weekly-plan'
    ? 0
    : props.step === 'plan' && previousRoute === 'weekly-schedule'
      ? 1
      : undefined
</script>

<template>
  <div class="weekly-plan-steps">
    <nav v-segment-highlight="previousStep" class="segmented-control step-selector" aria-label="七天训练计划步骤">
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
      <span class="status-label step-status" :data-tone="statusTone" aria-live="polite">
        <span v-if="statusTone === 'saved'" aria-hidden="true">✓</span>
        <span class="step-status-label">{{ status }}</span>
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
  flex: 0 1 188px;
}

.step-actions {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 5px;
}

.step-status {
  position: relative;
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

@media (max-width: 350px) {
  .step-status[data-tone='saved'] .step-status-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .step-option { padding-inline: 3px; }
  .step-actions { gap: 3px; }
}
</style>
