import type { Project, ProjectSummary, TimeEntry } from '@/types'

const HOUR_MS = 60 * 60 * 1000

export function formatDateToDayKey(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatDateToMonthKey(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  return `${year}-${month}`
}

export function durationMs(entry: TimeEntry, now: Date = new Date()): number {
  const startMs = new Date(entry.startAt).getTime()
  const endMs = entry.endAt ? new Date(entry.endAt).getTime() : now.getTime()
  return Math.max(0, endMs - startMs)
}

export function formatMsToHoursAndMinutes(ms: number): string {
  const safe = Math.max(0, ms)
  const hours = Math.floor(safe / HOUR_MS)
  const minutes = Math.floor((safe % HOUR_MS) / 60000)
  return `${`${hours}`.padStart(2, '0')}:${`${minutes}`.padStart(2, '0')}`
}

export function formatMsToDecimalHours(ms: number): string {
  return (Math.max(0, ms) / HOUR_MS).toFixed(2)
}

export function calculateTotalMs(entries: TimeEntry[], now: Date = new Date()): number {
  return entries.reduce((sum, entry) => sum + durationMs(entry, now), 0)
}

export function summarizeByProject(
  entries: TimeEntry[],
  projects: Project[],
  now: Date = new Date(),
): ProjectSummary[] {
  const map = new Map<number, number>()

  for (const entry of entries) {
    const current = map.get(entry.projectId) ?? 0
    map.set(entry.projectId, current + durationMs(entry, now))
  }

  return projects
    .map((project) => ({
      projectId: project.id ?? -1,
      projectName: project.name,
      totalMs: map.get(project.id ?? -1) ?? 0,
    }))
    .filter((item) => item.totalMs > 0)
}
