import Dexie, { type Table } from 'dexie'
import type { Project, TimeEntry } from './types'

class WorkClockDB extends Dexie {
  projects!: Table<Project, number>
  timeEntries!: Table<TimeEntry, number>

  constructor() {
    super('workClockDB')

    this.version(1).stores({
      projects: '++id, name, createdAt',
      timeEntries: '++id, projectId, dayKey, startAt, endAt',
    })

    this.version(2)
      .stores({
        projects: '++id, name, isPaused, createdAt',
        timeEntries: '++id, projectId, dayKey, startAt, endAt',
      })
      .upgrade(async (tx) => {
        await tx
          .table('projects')
          .toCollection()
          .modify((project: Project) => {
            if (typeof project.isPaused !== 'boolean') {
              project.isPaused = false
            }
          })
      })
  }
}

export const db = new WorkClockDB()
