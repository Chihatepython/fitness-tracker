import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { openFitnessDatabase } from './database'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')

void openFitnessDatabase().catch((error: unknown) => {
  console.error('无法打开本地数据库', error)
})
