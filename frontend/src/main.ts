import './assets/main.css'

console.log(`[blueprintgen] commit: ${__GIT_COMMIT__} — built: ${__BUILD_TIME__}`)
import 'primeicons/primeicons.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import Tooltip from 'primevue/tooltip'

import mermaid from 'mermaid'
import elkLayouts from '@mermaid-js/layout-elk'
import App from './App.vue'
import router from './router'

mermaid.registerLayoutLoaders(elkLayouts)

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

const app = createApp(App)

app.use(pinia)
app.use(router)
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: '.dark',
    },
  },
})
app.use(ToastService)
app.use(ConfirmationService)
app.directive('tooltip', Tooltip)

app.mount('#app')
