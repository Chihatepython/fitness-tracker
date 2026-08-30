<script setup lang="ts">
import { computed } from 'vue'

import type { FirstSetPerformanceRecord } from '@/domain/firstSetPerformance'
import { formatWeight } from '@/domain/trainingStats'

const props = defineProps<{
  records: FirstSetPerformanceRecord[]
}>()

const CHART_HEIGHT = 238
const MARGIN = { top: 25, right: 18, bottom: 38, left: 38 }
const POINT_SPACING = 58

interface ChartPoint extends FirstSetPerformanceRecord {
  x: number
  y: number
}

const chartWidth = computed(() =>
  Math.max(348, MARGIN.left + MARGIN.right + (props.records.length - 1) * POINT_SPACING),
)

const yMin = computed(() =>
  props.records.length
    ? Math.max(0, Math.min(...props.records.map((record) => record.reps)) - 1)
    : 0,
)

const yMax = computed(() =>
  props.records.length ? Math.max(...props.records.map((record) => record.reps)) + 1 : 1,
)

const yTicks = computed(() => {
  const range = yMax.value - yMin.value
  const step = Math.max(1, Math.ceil(range / 5))
  const ticks: number[] = []

  for (let tick = yMin.value; tick <= yMax.value; tick += step) ticks.push(tick)
  if (ticks.at(-1) !== yMax.value) ticks.push(yMax.value)

  return ticks
})

function getX(index: number): number {
  if (props.records.length <= 1) return chartWidth.value / 2

  return MARGIN.left + index * POINT_SPACING
}

function getY(reps: number): number {
  const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom

  return MARGIN.top + ((yMax.value - reps) / (yMax.value - yMin.value)) * plotHeight
}

const points = computed<ChartPoint[]>(() =>
  props.records.map((record, index) => ({
    ...record,
    x: getX(index),
    y: getY(record.reps),
  })),
)

const comparableSegments = computed(() => {
  const segments: ChartPoint[][] = []
  let currentSegment: ChartPoint[] = []

  for (const point of points.value) {
    const previousPoint = currentSegment.at(-1)

    if (previousPoint && previousPoint.mainWeightKg !== point.mainWeightKg) {
      if (currentSegment.length >= 4) segments.push(currentSegment)
      currentSegment = []
    }

    currentSegment.push(point)
  }

  if (currentSegment.length >= 4) segments.push(currentSegment)

  return segments
})

function getSegmentPoints(segment: ChartPoint[]): string {
  return segment.map((point) => `${point.x},${point.y}`).join(' ')
}

function isWeightSegmentStart(index: number): boolean {
  return index === 0 || points.value[index - 1]!.mainWeightKg !== points.value[index]!.mainWeightKg
}

function formatShortDate(date: string): string {
  const [, month, day] = date.split('-')

  return `${Number(month)}/${Number(day)}`
}
</script>

<template>
  <div class="first-set-chart-scroll">
    <svg
      class="first-set-chart"
      :width="chartWidth"
      :height="CHART_HEIGHT"
      :viewBox="`0 0 ${chartWidth} ${CHART_HEIGHT}`"
      role="img"
      aria-label="主力重量首组次数趋势"
    >
      <rect
        :x="MARGIN.left"
        :y="MARGIN.top"
        :width="chartWidth - MARGIN.left - MARGIN.right"
        :height="CHART_HEIGHT - MARGIN.top - MARGIN.bottom"
        rx="10"
        class="chart-frame"
      />

      <g v-for="tick in yTicks" :key="tick">
        <line
          :x1="MARGIN.left"
          :x2="chartWidth - MARGIN.right"
          :y1="getY(tick)"
          :y2="getY(tick)"
          class="chart-grid-line"
        />
        <text :x="MARGIN.left - 9" :y="getY(tick) + 4" text-anchor="end" class="chart-axis-text">
          {{ tick }}
        </text>
      </g>

      <polyline
        v-for="(segment, index) in comparableSegments"
        :key="`${segment[0]!.date}-${index}`"
        :points="getSegmentPoints(segment)"
        class="chart-trend-line"
      />

      <g v-for="(point, index) in points" :key="`${point.date}-${point.mainWeightKg}`">
        <circle :cx="point.x" :cy="point.y" r="5" class="chart-point" />
        <text :x="point.x" :y="point.y - 10" text-anchor="middle" class="chart-value-text">
          {{ point.reps }}
        </text>
        <text :x="point.x" :y="CHART_HEIGHT - 14" text-anchor="middle" class="chart-axis-text">
          {{ formatShortDate(point.date) }}
        </text>
        <text
          v-if="isWeightSegmentStart(index)"
          :x="point.x"
          :y="MARGIN.top - 10"
          text-anchor="middle"
          class="chart-weight-text"
        >
          {{ formatWeight(point.mainWeightKg) }}kg
        </text>
      </g>

      <text
        x="11"
        :y="MARGIN.top + (CHART_HEIGHT - MARGIN.top - MARGIN.bottom) / 2"
        :transform="`rotate(-90 11 ${MARGIN.top + (CHART_HEIGHT - MARGIN.top - MARGIN.bottom) / 2})`"
        text-anchor="middle"
        class="chart-axis-title"
      >
        首组次数
      </text>
    </svg>
  </div>
</template>

<style scoped>
.first-set-chart-scroll {
  overflow-x: auto;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
}

.first-set-chart {
  display: block;
  min-width: 100%;
}

.chart-frame {
  fill: #f8faf6;
  stroke: #dfe6dc;
}

.chart-grid-line {
  stroke: #e5eae2;
  stroke-width: 1;
}

.chart-trend-line {
  fill: none;
  stroke: #4f7c5b;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.4;
}

.chart-point {
  fill: #4f7c5b;
  stroke: #4f7c5b;
  stroke-width: 2;
}

.chart-axis-text,
.chart-axis-title,
.chart-value-text,
.chart-weight-text {
  fill: #7b887f;
  font-size: 10px;
}

.chart-axis-title {
  font-weight: 700;
}

.chart-value-text {
  fill: #314d39;
  font-size: 11px;
  font-weight: 800;
}

.chart-weight-text {
  fill: #45634d;
  font-size: 10px;
  font-weight: 800;
}
</style>
