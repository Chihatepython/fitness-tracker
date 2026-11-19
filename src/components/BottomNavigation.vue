<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'

const route = useRoute()
const tabs = [
  { id: 'today', label: '今天', to: 'home' },
  { id: 'plan', label: '计划', to: 'weekly-plan' },
  { id: 'data', label: '数据', to: 'training-data' },
  { id: 'me', label: '我的', to: 'profile' },
] as const
</script>

<template>
  <nav class="bottom-navigation" aria-label="主导航">
    <RouterLink
      v-for="tab in tabs"
      :key="tab.id"
      v-slot="{ href, navigate }"
      :to="route.meta.tab === tab.id ? route.fullPath : { name: tab.to }"
      custom
    >
      <a
        :href="href"
        :aria-current="route.meta.tab === tab.id ? 'page' : undefined"
        @click="navigate"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <template v-if="tab.id === 'today'">
            <path d="M6 5v14M9 7v10M15 7v10M18 5v14M9 12h6M3 10v4m18-4v4" />
          </template>
          <template v-else-if="tab.id === 'plan'">
            <path d="m3 6 1.5 1.5L7 5m-4 7 1.5 1.5L7 11m-4 7 1.5 1.5L7 17M11 6h9m-9 6h9m-9 6h9" />
          </template>
          <template v-else-if="tab.id === 'data'">
            <path d="M4 4v16h16M8 16v-4m5 4V8m5 8V5" />
          </template>
          <template v-else>
            <circle cx="12" cy="8" r="3.25" />
            <path d="M5 20v-1a7 5 0 0 1 14 0v1" />
          </template>
        </svg>
        <span>{{ tab.label }}</span>
      </a>
    </RouterLink>
  </nav>
</template>

<style scoped>
.bottom-navigation {
  position: fixed;
  z-index: 20;
  right: max(14px, env(safe-area-inset-right, 0px));
  bottom: var(--app-tab-bar-bottom);
  left: max(14px, env(safe-area-inset-left, 0px));
  display: grid;
  max-width: 440px;
  height: var(--app-tab-bar-height);
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 3px;
  margin: 0 auto;
  padding: 4px;
  border: 1px solid rgb(255 255 255 / 94%);
  border-radius: var(--radius-pill);
  background: #fafcf9;
  box-shadow:
    0 4px 16px rgb(31 62 40 / 12%),
    0 1px 2px rgb(31 62 40 / 7%);
}

@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
  .bottom-navigation {
    background: rgb(250 252 249 / 80%);
    -webkit-backdrop-filter: blur(20px) saturate(145%);
    backdrop-filter: blur(20px) saturate(145%);
  }
}

@media (prefers-reduced-transparency: reduce) {
  .bottom-navigation {
    background: #fafcf9;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}

.bottom-navigation a {
  display: grid;
  min-height: 46px;
  place-content: center;
  justify-items: center;
  gap: 2px;
  border-radius: var(--radius-pill);
  color: #58685e;
  font-size: var(--text-caption);
  font-weight: 700;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}

.bottom-navigation a[aria-current='page'] {
  background: #e1eddf;
  color: #35533e;
}

.bottom-navigation a:focus-visible {
  outline: 2px solid #46634d;
  outline-offset: -2px;
}

.bottom-navigation svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}
</style>
