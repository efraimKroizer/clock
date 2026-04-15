<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useThemeStore } from '@/stores/theme'

const themeStore = useThemeStore()
const { mode, activePalette } = storeToRefs(themeStore)

const isThemePopoverOpen = ref(false)
const themeDockRef = ref<HTMLElement | null>(null)

const DISCLAIMER_KEY = 'clock-disclaimer-accepted'
const showDisclaimer = ref(false)

onMounted(() => {
  if (!localStorage.getItem(DISCLAIMER_KEY)) {
    showDisclaimer.value = true
  }
})

function acceptDisclaimer() {
  localStorage.setItem(DISCLAIMER_KEY, '1')
  showDisclaimer.value = false
}

const modeIconClass = computed(() =>
  mode.value === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun',
)

const modeAriaLabel = computed(() =>
  mode.value === 'dark' ? 'מעבר למצב בהיר' : 'מעבר למצב כהה',
)

function toggleThemePopover() {
  const nextState = !isThemePopoverOpen.value

  if (nextState) {
    themeStore.syncPaletteFromDom()
  }

  isThemePopoverOpen.value = nextState
}

function closeThemePopover() {
  isThemePopoverOpen.value = false
}

function onWindowPointerDown(event: PointerEvent) {
  if (!isThemePopoverOpen.value) {
    return
  }

  const target = event.target as Node | null
  if (target && themeDockRef.value?.contains(target)) {
    return
  }

  closeThemePopover()
}

function onWindowKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeThemePopover()
  }
}

onMounted(() => {
  window.addEventListener('pointerdown', onWindowPointerDown)
  window.addEventListener('keydown', onWindowKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('pointerdown', onWindowPointerDown)
  window.removeEventListener('keydown', onWindowKeyDown)
})
</script>

<template>
  <div class="layout" dir="rtl">
    <header class="hero">
      <div>
        <p class="hero-eyebrow">Clock</p>
        <h1>מעקב זמן עבודה לפרויקטים</h1>
        <p class="hero-sub">ניהול שעות, הערות ודוחות חודשיים. הכל נשמר מקומית בדפדפן.</p>
      </div>
      <div class="header-controls no-print">
        <nav class="main-nav">
          <RouterLink to="/">מעקב יומי</RouterLink>
          <RouterLink to="/projects">פרויקטים</RouterLink>
          <RouterLink to="/history">היסטוריה חודשית</RouterLink>
        </nav>

        <div
          ref="themeDockRef"
          class="theme-dock"
          :class="{ 'is-open': isThemePopoverOpen }"
        >
          <button
            class="theme-icon-btn theme-customize-btn"
            type="button"
            aria-label="פתח התאמת צבעים"
            title="פתח התאמת צבעים"
            @click.stop="toggleThemePopover"
          >
            <i class="fa-solid fa-sliders" aria-hidden="true"></i>
          </button>

          <button
            class="theme-icon-btn"
            type="button"
            :aria-label="modeAriaLabel"
            :title="modeAriaLabel"
            @click="themeStore.toggleMode"
          >
            <i :class="modeIconClass" aria-hidden="true"></i>
          </button>

          <section v-if="isThemePopoverOpen" class="theme-popover" @click.stop>
            <p class="theme-popover-title">התאמת צבעים</p>

            <div class="theme-colors-grid">
              <label>
                צבע פנל
                <input
                  :value="activePalette.panelStrong"
                  type="color"
                  @input="themeStore.setColor('panelStrong', ($event.target as HTMLInputElement).value)"
                />
              </label>

              <label>
                רקע שורות
                <input
                  :value="activePalette.rowBg"
                  type="color"
                  @input="themeStore.setColor('rowBg', ($event.target as HTMLInputElement).value)"
                />
              </label>

              <label>
                צבע ראשי
                <input
                  :value="activePalette.accent"
                  type="color"
                  @input="themeStore.setColor('accent', ($event.target as HTMLInputElement).value)"
                />
              </label>

              <label>
                כותרות טבלאות
                <input
                  :value="activePalette.tableHeadBg"
                  type="color"
                  @input="themeStore.setColor('tableHeadBg', ($event.target as HTMLInputElement).value)"
                />
              </label>

              <label>
                צבע אזהרה
                <input
                  :value="activePalette.danger"
                  type="color"
                  @input="themeStore.setColor('danger', ($event.target as HTMLInputElement).value)"
                />
              </label>

              <label>
                צבע טקסט
                <input
                  :value="activePalette.textMain"
                  type="color"
                  @input="themeStore.setColor('textMain', ($event.target as HTMLInputElement).value)"
                />
              </label>
            </div>

            <div class="theme-popover-actions">
              <button class="secondary" type="button" @click="themeStore.resetCurrentPalette">
                איפוס
              </button>
              <button class="secondary" type="button" @click="closeThemePopover">סגור</button>
            </div>
          </section>
        </div>
      </div>
    </header>

    <main>
      <RouterView />
    </main>

    <div v-if="showDisclaimer" class="modal-backdrop">
      <section class="modal-panel disclaimer-panel" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
        <p class="hero-eyebrow">שימו לב</p>
        <h3 id="disclaimer-title">הצהרת שימוש</h3>
        <p>
          כלי זה פותח לשימוש אישי בלבד כעזר לניהול שעות עבודה.
          הוא מסופק כמו שהוא (<strong>as-is</strong>), ללא כל אחריות מכל סוג שהוא.
        </p>
        <p>
          אין להסתמך עליו לצורך חישובים רשמיים, חוקיים או כספיים,
          ואין לבוא בכל טענה למפתח בגין שגיאות, אובדן נתונים, או כל נזק אחר.
        </p>
        <p>השימוש בכלי מהווה הסכמה לתנאים אלו.</p>
        <div class="row" style="justify-content: flex-end">
          <button class="primary" @click="acceptDisclaimer">קראתי והבנתי</button>
        </div>
      </section>
    </div>

    <footer class="app-footer">
      <p>נבנה על ידי אפרים קרויזר</p>
      <p>
        Icons by: 
        <a href="https://fontawesome.com/" target="_blank" rel="noreferrer">Font Awesome</a>
      </p>
    </footer>
  </div>
</template>
