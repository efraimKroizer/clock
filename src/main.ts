import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { watch } from 'vue'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './style.css'
import App from './App.vue'
import router from './router'
import { useTimeEntriesStore } from './stores/timeEntries'
import { useThemeStore } from './stores/theme'
import { useSyncStore } from './stores/sync'
import { useProjectsStore } from './stores/projects'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)

async function setupApp() {
  const timeEntriesStore = useTimeEntriesStore(pinia)
  const themeStore = useThemeStore(pinia)
  const syncStore = useSyncStore(pinia)
  const projectsStore = useProjectsStore(pinia)

  themeStore.initialize()

  if (!syncStore.isSignedIn) {
    // Not signed in – load data from local DB
    void timeEntriesStore.loadEntries()
    void projectsStore.loadProjects()
  }
  // init() sets up store references, polling, and syncs with Drive if signed in
  await syncStore.init()

  watch(
    () => timeEntriesStore.entries.some((entry) => !entry.endAt),
    (isAnyProjectActive) => {
      setTabFavicon(isAnyProjectActive)
    },
    { immediate: true },
  )
}

function setTabFavicon(isAnyProjectActive: boolean) {
  const favicon = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
  if (!favicon) {
    return
  }
  favicon.href = isAnyProjectActive ? '/task-clock.svg' : '/task-clock-inactive.svg'
}

app.use(router)

void setupApp().then(() => {
  app.mount('#app')
})
