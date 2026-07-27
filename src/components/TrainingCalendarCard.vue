<script setup lang="ts">
import {
  CALENDAR_WEEKDAYS,
  getCalendarDayAriaLabel,
  type TrainingCalendarDay,
} from '@/domain/trainingStats'

defineProps<{
  days: TrainingCalendarDay[]
  isLoading: boolean
  error: string
}>()
</script>

<template>
  <section class="dashboard-card training-calendar-section" aria-labelledby="calendar-title">
    <h2 id="calendar-title">训练日历</h2>

    <div class="training-calendar-card">
      <p v-if="isLoading" class="calendar-status">正在读取训练记录…</p>
      <p v-else-if="error" class="calendar-status calendar-error" role="alert">
        {{ error }}
      </p>
      <div v-else>
        <ol class="calendar-weekdays" aria-hidden="true">
          <li v-for="weekday in CALENDAR_WEEKDAYS" :key="weekday">{{ weekday }}</li>
        </ol>
        <ol class="calendar-grid">
          <li
            v-for="calendarDay in days"
            :key="calendarDay.date"
            class="calendar-day"
            :class="{ today: calendarDay.isToday, future: calendarDay.isFuture }"
            :data-body-part="calendarDay.bodyPart"
          >
            <time :datetime="calendarDay.date" :aria-label="getCalendarDayAriaLabel(calendarDay)">
              <strong>{{ calendarDay.dayOfMonth }}</strong>
            </time>
            <span class="calendar-body-part">
              {{ calendarDay.isFuture ? '—' : (calendarDay.bodyPart ?? '') }}
            </span>
          </li>
        </ol>
      </div>
    </div>
  </section>
</template>

<style scoped>
.training-calendar-section h2 {
  margin: 0 0 14px;
  font-size: 1.25rem;
  letter-spacing: -0.025em;
}

.training-calendar-card {
  padding: 12px;
  border: 1px solid #e4e9e1;
  border-radius: 16px;
  background: #f7f9f5;
  color: #17211a;
}

.calendar-weekdays,
.calendar-grid {
  display: grid;
  margin: 0;
  padding: 0;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
  list-style: none;
}

.calendar-weekdays {
  margin-bottom: 8px;
  color: #718078;
  font-size: 0.64rem;
  font-weight: 700;
  text-align: center;
}

.calendar-day {
  display: flex;
  min-width: 0;
  height: 62px;
  align-items: center;
  flex-direction: column;
  justify-content: space-between;
  gap: 3px;
  padding: 6px 2px;
  border: 1px solid #edf0ea;
  border-radius: 12px;
  background: #fff;
  color: #405047;
}

.calendar-day time {
  display: block;
}

.calendar-day time strong {
  color: inherit;
  font-size: 0.92rem;
  font-variant-numeric: tabular-nums;
}

.calendar-body-part {
  font-size: 0.8rem;
  font-weight: 800;
  white-space: nowrap;
}

.calendar-day[data-body-part='肩'] {
  border-color: #d9f36a;
  background: #d9f36a;
  color: #18311f;
}

.calendar-day[data-body-part='背'] {
  background: #d1e3dd;
  color: #24463c;
}

.calendar-day[data-body-part='胸'] {
  background: #ead9d2;
  color: #5e3b31;
}

.calendar-day[data-body-part='腿'] {
  background: #e9dfbd;
  color: #564a25;
}

.calendar-day[data-body-part='手臂'] {
  background: #ded8e9;
  color: #4b3e60;
}

.calendar-day.future {
  border-color: #f0f2ed;
  background: #fafbf8;
  color: #a7afa9;
}

.calendar-day.today {
  box-shadow: 0 0 0 2px #365640;
}

.calendar-status {
  display: grid;
  min-height: 160px;
  margin: 0;
  place-items: center;
  color: #718078;
  font-size: 0.85rem;
}

.calendar-error {
  color: #a52d2d;
}
</style>
