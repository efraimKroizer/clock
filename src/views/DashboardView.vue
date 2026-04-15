<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useProjectsStore } from '@/stores/projects'
import { useTimeEntriesStore } from '@/stores/timeEntries'
import {
  calculateTotalMs,
  formatDateToDayKey,
  formatMsToDecimalHours,
  formatMsToHoursAndMinutes,
  summarizeByProject,
} from '@/utils/time'

const projectsStore = useProjectsStore()
const timeEntriesStore = useTimeEntriesStore()
const { projects } = storeToRefs(projectsStore)
const now = ref(new Date())
const selectedDate = ref(new Date())
const savingEntryId = ref<number | null>(null)
const editingEntryId = ref<number | null>(null)
const focusedNoteEntryId = ref<number | null>(null)
const editTimes = reactive({
  startLocal: '',
  endLocal: '',
})
const noteDraftByEntryId = reactive<Record<number, string>>({})
const entryActionMessage = ref('')
const switchDialog = reactive<{
  isOpen: boolean
  targetProjectId: number | null
  activeNames: string
}>({
  isOpen: false,
  targetProjectId: null,
  activeNames: '',
})

let timer: number | undefined

onMounted(async () => {
  await Promise.all([projectsStore.loadProjects(), timeEntriesStore.loadEntries()])

  timer = window.setInterval(() => {
    now.value = new Date()
  }, 30000)
})

onUnmounted(() => {
  if (timer) {
    window.clearInterval(timer)
  }
})

const projectsById = computed(() => {
  const map = new Map<number, string>()
  for (const project of projects.value) {
    if (project.id) {
      map.set(project.id, project.name)
    }
  }
  return map
})

const selectedDayKey = computed(() => formatDateToDayKey(selectedDate.value))
const isToday = computed(() => selectedDayKey.value === formatDateToDayKey(new Date()))
const selectedDateLabel = computed(() =>
  isToday.value
    ? `היום: ${selectedDate.value.toLocaleDateString('he-IL')}`
    : selectedDate.value.toLocaleDateString('he-IL'),
)
const selectedRows = computed(() => timeEntriesStore.entriesForDay(selectedDayKey.value))

function goToPrevDay() {
  const d = new Date(selectedDate.value)
  d.setDate(d.getDate() - 1)
  selectedDate.value = d
}

function goToNextDay() {
  if (isToday.value) return
  const d = new Date(selectedDate.value)
  d.setDate(d.getDate() + 1)
  selectedDate.value = d
}

function goToToday() {
  selectedDate.value = new Date()
}

watch(
  selectedRows,
  (rows) => {
    const rowIds = new Set<number>()

    for (const row of rows) {
      if (!row.id) {
        continue
      }

      rowIds.add(row.id)
      if (focusedNoteEntryId.value !== row.id) {
        noteDraftByEntryId[row.id] = row.note
      }
    }

    for (const key of Object.keys(noteDraftByEntryId)) {
      const id = Number(key)
      if (!rowIds.has(id)) {
        delete noteDraftByEntryId[id]
      }
    }
  },
  { immediate: true },
)

const totalTodayMs = computed(() => calculateTotalMs(selectedRows.value, now.value))

const summaryToday = computed(() => summarizeByProject(selectedRows.value, projects.value, now.value))

function formatTime(dateIso: string): string {
  return new Date(dateIso).toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toLocalInputValue(iso: string): string {
  const date = new Date(iso)
  const pad = (value: number) => `${value}`.padStart(2, '0')
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function fromLocalInputValue(value: string): string {
  return new Date(value).toISOString()
}

async function toggleProject(projectId: number, isActive: boolean) {
  if (isActive) {
    await timeEntriesStore.clockOut(projectId)
    return
  }

  const activeOtherProjectIds = Array.from(
    new Set(
      timeEntriesStore.entries
        .filter((entry) => entry.projectId !== projectId && !entry.endAt)
        .map((entry) => entry.projectId),
    ),
  )

  if (activeOtherProjectIds.length > 0) {
    switchDialog.activeNames = activeOtherProjectIds
      .map((id) => projectsById.value.get(id) ?? `#${id}`)
      .join(', ')
    switchDialog.targetProjectId = projectId
    switchDialog.isOpen = true
    return
  }

  await timeEntriesStore.clockIn(projectId)
}

function cancelSwitchProject() {
  switchDialog.isOpen = false
  switchDialog.targetProjectId = null
  switchDialog.activeNames = ''
}

async function confirmSwitchProject() {
  if (!switchDialog.targetProjectId) {
    cancelSwitchProject()
    return
  }

  const targetProjectId = switchDialog.targetProjectId
  cancelSwitchProject()
  await timeEntriesStore.switchToProject(targetProjectId)
}

async function saveNote(entryId: number | undefined, note: string) {
  if (!entryId) {
    return
  }

  savingEntryId.value = entryId
  await timeEntriesStore.updateEntryNote(entryId, note)
  noteDraftByEntryId[entryId] = note.trim()
  savingEntryId.value = null
}

function getNoteValue(entryId: number | undefined, fallback: string): string {
  if (!entryId) {
    return fallback
  }

  return noteDraftByEntryId[entryId] ?? fallback
}

function onNoteInput(entryId: number | undefined, value: string) {
  if (!entryId) {
    return
  }

  noteDraftByEntryId[entryId] = value
}

function startEditingEntry(entryId: number | undefined, startAt: string, endAt?: string) {
  if (!entryId) {
    return
  }

  editingEntryId.value = entryId
  editTimes.startLocal = toLocalInputValue(startAt)
  editTimes.endLocal = endAt ? toLocalInputValue(endAt) : ''
}

function cancelEditingEntry() {
  editingEntryId.value = null
  editTimes.startLocal = ''
  editTimes.endLocal = ''
}

async function saveEditedEntry(entryId: number | undefined) {
  if (!entryId) {
    return
  }

  entryActionMessage.value = ''
  const nextStartAt = fromLocalInputValue(editTimes.startLocal)
  const nextEndAt = editTimes.endLocal ? fromLocalInputValue(editTimes.endLocal) : undefined
  const overlappingEntries = timeEntriesStore.findOverlappingEntries(entryId, nextStartAt, nextEndAt)

  if (overlappingEntries.length > 0) {
    const shouldOverwrite = window.confirm(
      'זוהתה התנגשות: טווח השעות חופף בחלקו לשורה אחרת. האם לשמור בכל זאת?',
    )

    if (!shouldOverwrite) {
      entryActionMessage.value = 'השמירה בוטלה בגלל חפיפה בשעות'
      return
    }
  }

  try {
    await timeEntriesStore.updateEntryTimes(entryId, nextStartAt, nextEndAt)
    cancelEditingEntry()
    entryActionMessage.value = 'השעות נשמרו בהצלחה'
  } catch (error) {
    entryActionMessage.value = error instanceof Error ? error.message : 'שמירת שעות נכשלה'
  }
}

async function removeEntry(entryId: number | undefined) {
  if (!entryId) {
    return
  }

  entryActionMessage.value = ''
  await timeEntriesStore.deleteEntry(entryId)
  if (editingEntryId.value === entryId) {
    cancelEditingEntry()
  }
  entryActionMessage.value = 'השורה נמחקה'
}

function onNoteFocus(entryId: number | undefined) {
  if (!entryId) {
    return
  }

  focusedNoteEntryId.value = entryId
}

function onNoteBlur(entryId: number | undefined) {
  if (!entryId) {
    return
  }

  if (focusedNoteEntryId.value === entryId) {
    focusedNoteEntryId.value = null
  }
}

function handleNoteBlur(entryId: number | undefined, event: Event) {
  const target = event.target as HTMLTextAreaElement
  onNoteInput(entryId, target.value)
  void saveNote(entryId, target.value)
  onNoteBlur(entryId)
}
</script>

<template>
  <section class="screen grid">
    <div class="row">
      <h2>מעקב יומי</h2>
      <span class="spacer" />
      <div class="row date-nav">
        <button class="icon-btn secondary" aria-label="יום קודם" title="יום קודם" @click="goToPrevDay">
          <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
        </button>
        <p class="status muted">{{ selectedDateLabel }}</p>
        <button
          class="icon-btn secondary"
          aria-label="יום הבא"
          title="יום הבא"
          :disabled="isToday"
          @click="goToNextDay"
        >
          <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
        </button>
        <button v-if="!isToday" class="secondary" @click="goToToday">חזרה להיום</button>
      </div>
    </div>

    <div class="kpis">
      <article class="kpi">
        <p class="label">סה"כ שעות</p>
        <p class="value">{{ formatMsToHoursAndMinutes(totalTodayMs) }} שעות</p>
      </article>
      <article class="kpi">
        <p class="label">סה"כ עשרוני</p>
        <p class="value">{{ formatMsToDecimalHours(totalTodayMs) }}</p>
      </article>
      <article class="kpi">
        <p class="label">מספר שורות</p>
        <p class="value">{{ selectedRows.length }}</p>
      </article>
    </div>

    <div class="projects-grid">
      <article v-for="project in projects" :key="project.id" class="project-card">
        <h3 class="project-title">{{ project.name }}</h3>
        <p v-if="project.notes" class="muted">{{ project.notes }}</p>

        <span v-if="project.isPaused" class="muted">פרויקט מושהה</span>

        <span v-if="project.id && timeEntriesStore.isProjectActive(project.id)" class="badge-live">
          פעיל עכשיו
        </span>

        <button
          v-if="project.id && !project.isPaused"
          :class="timeEntriesStore.isProjectActive(project.id) ? 'warn' : 'primary'"
          :data-testid="`clock-toggle-${project.id}`"
          @click="toggleProject(project.id, timeEntriesStore.isProjectActive(project.id))"
        >
          {{ timeEntriesStore.isProjectActive(project.id) ? 'יציאה' : 'כניסה' }}
        </button>
      </article>
    </div>

    <section class="grid">
      <h3>סיכום לפי פרוייקט{{ isToday ? "" : ' (' + selectedDateLabel + ')' }}</h3>
      <table>
        <thead>
          <tr>
            <th>פרויקט</th>
            <th>משך</th>
            <th>שעות עשרוניות</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="summaryToday.length === 0">
            <td colspan="3">אין נתונים להצגה</td>
          </tr>
          <tr v-for="item in summaryToday" :key="item.projectId">
            <td>{{ item.projectName }}</td>
            <td>{{ formatMsToHoursAndMinutes(item.totalMs) }}</td>
            <td>{{ formatMsToDecimalHours(item.totalMs) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="grid">
      <h3>שורות כניסה ויציאה{{ isToday ? "" : ' (' + selectedDateLabel + ')' }}</h3>
      <p v-if="entryActionMessage" class="status">{{ entryActionMessage }}</p>
      <table>
        <thead>
          <tr>
            <th>פרויקט</th>
            <th>כניסה</th>
            <th>יציאה</th>
            <th>משך</th>
            <th>הערה</th>
            <th class="actions-col">פעולות</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="selectedRows.length === 0">
            <td colspan="6">עדיין אין שורות ליום זה</td>
          </tr>
          <tr v-for="entry in selectedRows" :key="entry.id">
            <td>{{ projectsById.get(entry.projectId) ?? 'פרויקט לא ידוע' }}</td>
            <td>
              <template v-if="editingEntryId === entry.id">
                <input v-model="editTimes.startLocal" type="datetime-local" />
              </template>
              <template v-else>
                {{ formatTime(entry.startAt) }}
              </template>
            </td>
            <td>
              <template v-if="editingEntryId === entry.id">
                <input v-model="editTimes.endLocal" type="datetime-local" />
              </template>
              <template v-else>
                {{ entry.endAt ? formatTime(entry.endAt) : 'פעיל' }}
              </template>
            </td>
            <td>{{ formatMsToHoursAndMinutes(calculateTotalMs([entry], now)) }}</td>
            <td>
              <textarea
                :value="getNoteValue(entry.id, entry.note)"
                :rows="focusedNoteEntryId === entry.id ? 3 : 1"
                class="note-input"
                @input="onNoteInput(entry.id, ($event.target as HTMLTextAreaElement).value)"
                @focus="onNoteFocus(entry.id)"
                @blur="handleNoteBlur(entry.id, $event)"
              />
              <small v-if="savingEntryId === entry.id">שומר...</small>
            </td>
            <td class="actions-cell">
              <div class="row">
                <button
                  v-if="editingEntryId === entry.id"
                  class="icon-btn primary"
                  aria-label="שמור שעות"
                  title="שמור שעות"
                  @click="saveEditedEntry(entry.id)"
                >
                  ✓
                </button>
                <button
                  v-if="editingEntryId === entry.id"
                  class="icon-btn secondary"
                  aria-label="בטל עריכה"
                  title="בטל עריכה"
                  @click="cancelEditingEntry"
                >
                  <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                </button>
                <button
                  v-else
                  class="icon-btn secondary"
                  aria-label="ערוך שעות"
                  title="ערוך שעות"
                  @click="startEditingEntry(entry.id, entry.startAt, entry.endAt)"
                >
                  <i class="fa-solid fa-pencil" aria-hidden="true"></i>
                </button>
                <button
                  class="icon-btn warn"
                  aria-label="מחק שורה"
                  title="מחק שורה"
                  @click="removeEntry(entry.id)"
                >
                  <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </section>

  <div v-if="switchDialog.isOpen" class="modal-backdrop" @click.self="cancelSwitchProject">
    <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="switch-title">
      <p class="hero-eyebrow">מעבר בין פרויקטים</p>
      <h3 id="switch-title">יש כרגע פרויקט פעיל</h3>
      <p class="muted">
        הפרויקטים הפעילים: {{ switchDialog.activeNames }}.
        האם לצאת מהם ולעבור לפרויקט שבחרת?
      </p>
      <div class="row">
        <button class="secondary" @click="cancelSwitchProject">ביטול</button>
        <button class="primary" @click="confirmSwitchProject">כן, עבור לפרויקט</button>
      </div>
    </section>
  </div>
</template>
