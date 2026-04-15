import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { watch } from 'vue'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './style.css'
import App from './App.vue'
import router from './router'
import { useTimeEntriesStore } from './stores/timeEntries'
import { useThemeStore } from './stores/theme'

const app = createApp(App)
const pinia = createPinia()

function setTabFavicon(isAnyProjectActive: boolean) {
	const favicon = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
	if (!favicon) {
		return
	}

	favicon.href = isAnyProjectActive ? '/task-clock.svg' : '/task-clock-inactive.svg'
}

const timeEntriesStore = useTimeEntriesStore(pinia)
const themeStore = useThemeStore(pinia)

themeStore.initialize()
void timeEntriesStore.loadEntries()

watch(
	() => timeEntriesStore.entries.some((entry) => !entry.endAt),
	(isAnyProjectActive) => {
		setTabFavicon(isAnyProjectActive)
	},
	{ immediate: true },
)

app.use(pinia)
app.use(router)
app.mount('#app')
