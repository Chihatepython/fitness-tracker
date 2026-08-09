import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import './assets/app.css'
import { openFitnessDatabase } from './database'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')

void openFitnessDatabase().catch((error: unknown) => {
  console.error('无法打开本地数据库', error)
})

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch((error: unknown) => {
        console.error('无法启用离线访问', error)
      })
  })
}
