<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useThemeStore } from '@/stores/theme'

const themeStore = useThemeStore()
const { mode, activePalette } = storeToRefs(themeStore)

const isThemePopoverOpen = ref(false)
const themeDockRef = ref<HTMLElement | null>(null)

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
</template>
