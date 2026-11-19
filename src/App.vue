<script setup lang="ts">
import { useRoute } from 'vue-router'

import BottomNavigation from '@/components/BottomNavigation.vue'
import { useTrainingSyncLifecycle } from '@/composables/useTrainingSync'

const route = useRoute()
useTrainingSyncLifecycle()
</script>

<template>
  <RouterView />
  <BottomNavigation v-if="route.meta.tab" />
</template>
