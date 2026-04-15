<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useProjectsStore } from '@/stores/projects'
import { useTimeEntriesStore } from '@/stores/timeEntries'
import type { TimeEntry } from '@/types'
import {
  calculateTotalMs,
  durationMs,
  formatDateToMonthKey,
  formatMsToDecimalHours,
  formatMsToHoursAndMinutes,
  summarizeByProject,
} from '@/utils/time'

const projectsStore = useProjectsStore()
const timeEntriesStore = useTimeEntriesStore()
const { projects } = storeToRefs(projectsStore)
const { entries } = storeToRefs(timeEntriesStore)

const selectedMonth = ref(formatDateToMonthKey(new Date()))
const expandedDayProjectRows = ref<Set<string>>(new Set())

type DailyProjectSummary = {
  dayKey: string
  projectId: number
  projectName: string
  totalMs: number
  entries: TimeEntry[]
}

onMounted(async () => {
  await Promise.all([projectsStore.loadProjects(), timeEntriesStore.loadEntries()])
})

const monthEntries = computed(() => entries.value.filter((entry) => entry.dayKey.startsWith(selectedMonth.value)))

const monthDailyProjectSummary = computed<DailyProjectSummary[]>(() => {
  const map = new Map<string, DailyProjectSummary>()

  for (const entry of monthEntries.value) {
    const projectName = projectsById.value.get(entry.projectId) ?? 'פרויקט לא ידוע'
    const key = `${entry.dayKey}__${entry.projectId}`
    const existing = map.get(key)
    if (existing) {
      existing.entries.push(entry)
      existing.totalMs += durationMs(entry)
      continue
    }

    map.set(key, {
      dayKey: entry.dayKey,
      projectId: entry.projectId,
      projectName,
      totalMs: durationMs(entry),
      entries: [entry],
    })
  }

  return Array.from(map.values())
    .map((item) => ({
      ...item,
      entries: item.entries.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
    }))
    .sort((a, b) => {
      if (a.dayKey !== b.dayKey) {
        return b.dayKey.localeCompare(a.dayKey)
      }
      return a.projectName.localeCompare(b.projectName, 'he')
    })
})

const monthSummary = computed(() => summarizeByProject(monthEntries.value, projects.value))

const totalMonthMs = computed(() => calculateTotalMs(monthEntries.value))

const projectsById = computed(() => {
  const map = new Map<number, string>()
  for (const project of projects.value) {
    if (project.id) {
      map.set(project.id, project.name)
    }
  }
  return map
})

function getDayProjectKey(dayKey: string, projectId: number): string {
  return `${dayKey}__${projectId}`
}

function toggleDayProjectRows(dayKey: string, projectId: number) {
  const next = new Set(expandedDayProjectRows.value)
  const key = getDayProjectKey(dayKey, projectId)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  expandedDayProjectRows.value = next
}

function isDayProjectExpanded(dayKey: string, projectId: number): boolean {
  return expandedDayProjectRows.value.has(getDayProjectKey(dayKey, projectId))
}

function formatDayLabel(dayKey: string): string {
  return new Date(`${dayKey}T00:00:00`).toLocaleDateString('he-IL', {
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function formatTime(dateIso: string): string {
  return new Date(dateIso).toLocaleString('he-IL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function printReport() {
  window.print()
}
</script>

<template>
  <section class="screen grid">
    <div class="row">
      <h2>היסטוריה חודשית</h2>
      <span class="spacer" />
      <button class="secondary no-print" @click="printReport">הדפס דוח</button>
    </div>

    <div class="row no-print">
      <label for="month">בחר חודש:</label>
      <input id="month" v-model="selectedMonth" type="month" />
    </div>

    <div class="kpis">
      <article class="kpi">
        <p class="label">סה"כ שעות בחודש</p>
        <p class="value">{{ formatMsToHoursAndMinutes(totalMonthMs) }}</p>
      </article>
      <article class="kpi">
        <p class="label">סה"כ עשרוני</p>
        <p class="value">{{ formatMsToDecimalHours(totalMonthMs) }}</p>
      </article>
      <article class="kpi">
        <p class="label">שורות עבודה</p>
        <p class="value">{{ monthEntries.length }}</p>
      </article>
    </div>

    <section class="grid">
      <h3>פירוט שעות לפי פרויקט</h3>
      <table>
        <thead>
          <tr>
            <th>פרויקט</th>
            <th>משך</th>
            <th>שעות עשרוניות</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="monthSummary.length === 0">
            <td colspan="3">אין נתונים לחודש שנבחר</td>
          </tr>
          <tr v-for="item in monthSummary" :key="item.projectId">
            <td>{{ item.projectName }}</td>
            <td>{{ formatMsToHoursAndMinutes(item.totalMs) }}</td>
            <td>{{ formatMsToDecimalHours(item.totalMs) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="grid">
      <h3>פירוט יומי לפי פרויקט</h3>
      <table>
        <thead>
          <tr>
            <th class="no-print">פירוט</th>
            <th>יום</th>
            <th>פרויקט</th>
            <th>סה"כ יומי</th>
            <th>שורות</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="monthDailyProjectSummary.length === 0">
            <td colspan="5">אין רשומות להצגה</td>
          </tr>
          <template v-for="item in monthDailyProjectSummary" :key="`${item.dayKey}-${item.projectId}`">
            <tr>
              <td class="no-print">
                <button
                  class="secondary icon-btn"
                  type="button"
                  :aria-expanded="isDayProjectExpanded(item.dayKey, item.projectId)"
                  @click="toggleDayProjectRows(item.dayKey, item.projectId)"
                >
                  {{ isDayProjectExpanded(item.dayKey, item.projectId) ? '−' : '+' }}
                </button>
              </td>
              <td>{{ formatDayLabel(item.dayKey) }}</td>
              <td>{{ item.projectName }}</td>
              <td>{{ formatMsToHoursAndMinutes(item.totalMs) }}</td>
              <td>{{ item.entries.length }}</td>
            </tr>
            <tr v-if="isDayProjectExpanded(item.dayKey, item.projectId)" class="details-row">
              <td colspan="5">
                <table class="inner-table">
                  <thead>
                    <tr>
                      <th>התחלה</th>
                      <th>סיום</th>
                      <th>משך</th>
                      <th>הערה</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="entry in item.entries" :key="entry.id">
                      <td>{{ formatTime(entry.startAt) }}</td>
                      <td>{{ entry.endAt ? formatTime(entry.endAt) : 'פעיל' }}</td>
                      <td>{{ formatMsToHoursAndMinutes(calculateTotalMs([entry])) }}</td>
                      <td>{{ entry.note || '-' }}</td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </section>
  </section>
</template>
