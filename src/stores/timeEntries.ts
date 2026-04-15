import { defineStore } from 'pinia'
import { db } from '@/db'
import type { TimeEntry } from '@/types'
import { formatDateToDayKey } from '@/utils/time'

interface TimeEntriesState {
  entries: TimeEntry[]
}

function intervalsOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA
}

export const useTimeEntriesStore = defineStore('timeEntries', {
  state: (): TimeEntriesState => ({
    entries: [],
  }),

  getters: {
    todayEntries(state): TimeEntry[] {
      const todayKey = formatDateToDayKey(new Date())
      return state.entries.filter((entry) => entry.dayKey === todayKey)
    },

    entriesForDay: (state) => (dayKey: string): TimeEntry[] => {
      return state.entries.filter((entry) => entry.dayKey === dayKey)
    },
  },

  actions: {
    async loadEntries() {
      this.entries = await db.timeEntries.orderBy('startAt').toArray()
    },

    isProjectActive(projectId: number): boolean {
      return this.entries.some((entry) => entry.projectId === projectId && !entry.endAt)
    },

    async clockIn(projectId: number) {
      const activeForProject = this.entries.find((entry) => entry.projectId === projectId && !entry.endAt)
      if (activeForProject) {
        return
      }

      const now = new Date()
      await db.timeEntries.add({
        projectId,
        startAt: now.toISOString(),
        note: '',
        dayKey: formatDateToDayKey(now),
      })

      await this.loadEntries()
    },

    async clockOut(projectId: number) {
      const openEntry = this.entries.find((entry) => entry.projectId === projectId && !entry.endAt)
      if (!openEntry?.id) {
        return
      }

      await db.timeEntries.update(openEntry.id, {
        endAt: new Date().toISOString(),
      })

      await this.loadEntries()
    },

    async switchToProject(projectId: number) {
      const now = new Date()
      const nowIso = now.toISOString()

      await db.transaction('rw', db.timeEntries, async () => {
        const activeEntries = await db.timeEntries.filter((entry) => !entry.endAt).toArray()

        for (const entry of activeEntries) {
          if (entry.projectId !== projectId && entry.id) {
            await db.timeEntries.update(entry.id, { endAt: nowIso })
          }
        }

        const targetStillActive = activeEntries.some((entry) => entry.projectId === projectId)
        if (!targetStillActive) {
          await db.timeEntries.add({
            projectId,
            startAt: nowIso,
            note: '',
            dayKey: formatDateToDayKey(now),
          })
        }
      })

      await this.loadEntries()
    },

    async updateEntryNote(entryId: number, note: string) {
      await db.timeEntries.update(entryId, { note: note.trim() })
      await this.loadEntries()
    },

    findOverlappingEntries(entryId: number, startAt: string, endAt?: string): TimeEntry[] {
      const nextStartMs = new Date(startAt).getTime()
      const nextEndMs = endAt ? new Date(endAt).getTime() : Number.POSITIVE_INFINITY

      if (Number.isNaN(nextStartMs) || Number.isNaN(nextEndMs)) {
        return []
      }

      return this.entries.filter((entry) => {
        if (!entry.id || entry.id === entryId) {
          return false
        }

        const existingStartMs = new Date(entry.startAt).getTime()
        const existingEndMs = entry.endAt ? new Date(entry.endAt).getTime() : Number.POSITIVE_INFINITY

        if (Number.isNaN(existingStartMs) || Number.isNaN(existingEndMs)) {
          return false
        }

        return intervalsOverlap(nextStartMs, nextEndMs, existingStartMs, existingEndMs)
      })
    },

    async updateEntryTimes(entryId: number, startAt: string, endAt?: string) {
      const startDate = new Date(startAt)
      const endDate = endAt ? new Date(endAt) : undefined

      if (Number.isNaN(startDate.getTime())) {
        throw new Error('זמן כניסה לא תקין')
      }

      if (endDate && Number.isNaN(endDate.getTime())) {
        throw new Error('זמן יציאה לא תקין')
      }

      if (endDate && startDate.getTime() > endDate.getTime()) {
        throw new Error('זמן יציאה חייב להיות אחרי זמן כניסה')
      }

      await db.timeEntries.update(entryId, {
        startAt: startDate.toISOString(),
        endAt: endDate?.toISOString(),
        dayKey: formatDateToDayKey(startDate),
      })

      await this.loadEntries()
    },

    async deleteEntry(entryId: number) {
      await db.timeEntries.delete(entryId)
      await this.loadEntries()
    },
  },
})
