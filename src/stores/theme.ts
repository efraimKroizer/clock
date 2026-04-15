import { defineStore } from 'pinia'

type ThemeMode = 'light' | 'dark'

type ThemeVariables = Record<string, string>

type EditablePalette = {
  panelStrong: string
  rowBg: string
  tableHeadBg: string
  accent: string
  danger: string
  textMain: string
}

interface ThemeState {
  mode: ThemeMode
  customPalette: Record<ThemeMode, EditablePalette>
}

interface StoredThemeSettings {
  mode?: ThemeMode
  customPalette?: Partial<Record<ThemeMode, Partial<EditablePalette>>>
}

const STORAGE_KEY = 'clock-theme-settings-v1'

const editableToCssVar: Record<keyof EditablePalette, string> = {
  panelStrong: '--panel-strong',
  rowBg: '--row-bg',
  tableHeadBg: '--table-head-bg',
  accent: '--accent',
  danger: '--danger',
  textMain: '--text-main',
}

const baseThemeVariables: Record<ThemeMode, ThemeVariables> = {
  light: {
    '--bg-top': '#f2ead9',
    '--bg-bottom': '#d8e8ef',
    '--bg-blob-1': 'rgba(11, 110, 79, 0.12)',
    '--bg-blob-2': 'rgba(241, 136, 5, 0.17)',
    '--panel': '#fcfbfa',
    '--panel-strong': '#ffffff',
    '--row-bg': '#ffffff',
    '--field-bg': '#ffffff',
    '--table-bg': '#ffffff',
    '--table-head-bg': '#f6fbfd',
    '--details-bg': '#fbfdff',
    '--secondary-bg': '#f9fcff',
    '--modal-bg': '#ffffff',
    '--text-main': '#1f2a32',
    '--text-soft': '#5a6b76',
    '--accent': '#2abf92',
    '--accent-2': '#f18805',
    '--danger': '#ff7078',
    '--on-accent': '#ffffff',
    '--on-danger': '#ffffff',
    '--border': 'rgba(31, 42, 50, 0.12)',
    '--shadow': '0 10px 30px rgba(27, 39, 51, 0.12)',
    '--overlay-bg': 'rgba(16, 29, 37, 0.38)',
  },
  dark: {
    '--bg-top': '#18232d',
    '--bg-bottom': '#0f151c',
    '--bg-blob-1': 'rgba(42, 191, 146, 0.18)',
    '--bg-blob-2': 'rgba(241, 136, 5, 0.13)',
    '--panel': 'rgba(21, 30, 39, 0.86)',
    '--panel-strong': '#1d2833',
    '--row-bg': '#1d2833',
    '--field-bg': '#18212b',
    '--table-bg': '#19232d',
    '--table-head-bg': '#21303c',
    '--details-bg': '#243342',
    '--secondary-bg': '#22313e',
    '--modal-bg': '#1d2833',
    '--text-main': '#edf3f8',
    '--text-soft': '#adc0cd',
    '--accent': '#4fd8ad',
    '--accent-2': '#f2a74c',
    '--danger': '#ff7f86',
    '--on-accent': '#082018',
    '--on-danger': '#ffffff',
    '--border': 'rgba(219, 232, 241, 0.16)',
    '--shadow': '0 12px 36px rgba(4, 9, 13, 0.45)',
    '--overlay-bg': 'rgba(4, 10, 16, 0.62)',
  },
}

const defaultCustomPalette: Record<ThemeMode, EditablePalette> = {
  light: {
    panelStrong: baseThemeVariables.light['--panel-strong'] ?? '#ffffff',
    rowBg: baseThemeVariables.light['--row-bg'] ?? '#ffffff',
    tableHeadBg: baseThemeVariables.light['--table-head-bg'] ?? '#f6fbfd',
    accent: baseThemeVariables.light['--accent'] ?? '#2abf92',
    danger: baseThemeVariables.light['--danger'] ?? '#ff7078',
    textMain: baseThemeVariables.light['--text-main'] ?? '#1f2a32',
  },
  dark: {
    panelStrong: baseThemeVariables.dark['--panel-strong'] ?? '#1d2833',
    rowBg: baseThemeVariables.dark['--row-bg'] ?? '#1d2833',
    tableHeadBg: baseThemeVariables.dark['--table-head-bg'] ?? '#21303c',
    accent: baseThemeVariables.dark['--accent'] ?? '#4fd8ad',
    danger: baseThemeVariables.dark['--danger'] ?? '#ff7f86',
    textMain: baseThemeVariables.dark['--text-main'] ?? '#edf3f8',
  },
}

function isHexColor(value: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim())
}

function hexToRgba(hex: string, alpha: number): string {
  const full = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex
  const r = parseInt(full.slice(1, 3), 16)
  const g = parseInt(full.slice(3, 5), 16)
  const b = parseInt(full.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function normalizeToHex(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  if (isHexColor(trimmed)) {
    return trimmed.toLowerCase()
  }

  const context = document.createElement('canvas').getContext('2d')
  if (!context) {
    return null
  }

  context.fillStyle = '#000000'
  context.fillStyle = trimmed
  const normalized = context.fillStyle

  return isHexColor(normalized) ? normalized.toLowerCase() : null
}

function safeParseSettings(rawValue: string | null): StoredThemeSettings | null {
  if (!rawValue) {
    return null
  }

  try {
    const parsed = JSON.parse(rawValue) as StoredThemeSettings
    return parsed
  } catch {
    return null
  }
}

function getPreferredMode(): ThemeMode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export const useThemeStore = defineStore('theme', {
  state: (): ThemeState => ({
    mode: 'light',
    customPalette: {
      light: { ...defaultCustomPalette.light },
      dark: { ...defaultCustomPalette.dark },
    },
  }),

  getters: {
    activePalette(state): EditablePalette {
      return state.customPalette[state.mode]
    },
  },

  actions: {
    initialize() {
      const parsed = safeParseSettings(window.localStorage.getItem(STORAGE_KEY))

      this.mode = parsed?.mode ?? getPreferredMode()

      this.customPalette.light = {
        ...defaultCustomPalette.light,
        ...(parsed?.customPalette?.light ?? {}),
      }

      this.customPalette.dark = {
        ...defaultCustomPalette.dark,
        ...(parsed?.customPalette?.dark ?? {}),
      }

      this.applyTheme()
      this.syncPaletteFromDom()
      this.save()
    },

    setMode(mode: ThemeMode) {
      this.mode = mode
      this.applyTheme()
      this.syncPaletteFromDom()
      this.save()
    },

    toggleMode() {
      this.setMode(this.mode === 'light' ? 'dark' : 'light')
    },

    setColor(key: keyof EditablePalette, value: string) {
      this.customPalette[this.mode][key] = value
      this.applyTheme()
      this.save()
    },

    resetCurrentPalette() {
      this.customPalette[this.mode] = {
        ...defaultCustomPalette[this.mode],
      }
      this.applyTheme()
      this.syncPaletteFromDom()
      this.save()
    },

    syncPaletteFromDom() {
      const root = document.documentElement

      for (const [key, cssVar] of Object.entries(editableToCssVar) as Array<
        [keyof EditablePalette, string]
      >) {
        const inlineValue = root.style.getPropertyValue(cssVar).trim()
        const computedValue = getComputedStyle(root).getPropertyValue(cssVar).trim()
        const normalized = normalizeToHex(inlineValue || computedValue)

        if (normalized) {
          this.customPalette[this.mode][key] = normalized
        }
      }
    },

    applyTheme() {
      const root = document.documentElement
      const base = baseThemeVariables[this.mode]

      root.dataset.theme = this.mode

      for (const [cssVar, value] of Object.entries(base)) {
        root.style.setProperty(cssVar, value)
      }

      for (const [key, cssVar] of Object.entries(editableToCssVar) as Array<
        [keyof EditablePalette, string]
      >) {
        root.style.setProperty(cssVar, this.customPalette[this.mode][key])
      }

      // Derive semi-transparent --panel from the solid --panel-strong color so both update together
      const panelStrongHex = this.customPalette[this.mode].panelStrong
      if (isHexColor(panelStrongHex)) {
        root.style.setProperty('--panel', hexToRgba(panelStrongHex, 0.86))
      }

      root.style.setProperty('color-scheme', this.mode)
    },

    save() {
      const payload: StoredThemeSettings = {
        mode: this.mode,
        customPalette: this.customPalette,
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    },
  },
})

export type { ThemeMode, EditablePalette }