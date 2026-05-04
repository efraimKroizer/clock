import { defineStore } from 'pinia'
import { db } from '@/db'
import type { Project } from '@/types'
import { useSyncStore } from './sync'
import { useTimeEntriesStore } from './timeEntries'

interface ProjectsState {
  projects: Project[]
}

function nextProjectId(projects: Project[]): number {
  const maxId = projects.reduce((max, project) => Math.max(max, project.id ?? 0), 0)
  return maxId + 1
}

export const useProjectsStore = defineStore('projects', {
  state: (): ProjectsState => ({
    projects: [],
  }),

  actions: {
    async loadProjects() {
      const syncStore = useSyncStore()
      if (syncStore.isSignedIn) return // Drive data is already in memory
      this.projects = await db.projects.orderBy('createdAt').toArray()
    },

    async addProject(name: string, notes: string) {
      const syncStore = useSyncStore()
      const timeEntriesStore = useTimeEntriesStore()
      const cleanName = name.trim()
      if (!cleanName) {
        throw new Error('שם פרויקט הוא שדה חובה')
      }

      syncStore.markLocalChange()

      if (syncStore.isSignedIn) {
        this.projects.push({
          id: nextProjectId(this.projects),
          name: cleanName,
          notes: notes.trim(),
          isPaused: false,
          createdAt: new Date().toISOString(),
        })
        await syncStore.pushCloudFromStores(this.projects, timeEntriesStore.entries)
        return
      }

      await db.projects.add({
        name: cleanName,
        notes: notes.trim(),
        isPaused: false,
        createdAt: new Date().toISOString(),
      })

      await this.loadProjects()
    },

    async updateProject(projectId: number, payload: Pick<Project, 'name' | 'notes'>) {
      const syncStore = useSyncStore()
      const timeEntriesStore = useTimeEntriesStore()
      const cleanName = payload.name.trim()
      if (!cleanName) {
        throw new Error('שם פרויקט הוא שדה חובה')
      }

      syncStore.markLocalChange()

      if (syncStore.isSignedIn) {
        const project = this.projects.find((item) => item.id === projectId)
        if (!project) return
        project.name = cleanName
        project.notes = payload.notes.trim()
        await syncStore.pushCloudFromStores(this.projects, timeEntriesStore.entries)
        return
      }

      await db.projects.update(projectId, {
        name: cleanName,
        notes: payload.notes.trim(),
      })

      await this.loadProjects()
    },

    async setProjectPaused(projectId: number, isPaused: boolean) {
      const syncStore = useSyncStore()
      const timeEntriesStore = useTimeEntriesStore()
      syncStore.markLocalChange()

      if (syncStore.isSignedIn) {
        const project = this.projects.find((item) => item.id === projectId)
        if (!project) return
        project.isPaused = isPaused
        await syncStore.pushCloudFromStores(this.projects, timeEntriesStore.entries)
        return
      }

      await db.projects.update(projectId, { isPaused })
      await this.loadProjects()
    },

    async deleteProject(projectId: number) {
      const syncStore = useSyncStore()
      const timeEntriesStore = useTimeEntriesStore()
      syncStore.markLocalChange()

      if (syncStore.isSignedIn) {
        this.projects = this.projects.filter((project) => project.id !== projectId)
        timeEntriesStore.entries = timeEntriesStore.entries.filter((entry) => entry.projectId !== projectId)
        await syncStore.pushCloudFromStores(this.projects, timeEntriesStore.entries)
        return
      }

      await db.transaction('rw', db.projects, db.timeEntries, async () => {
        await db.projects.delete(projectId)
        await db.timeEntries.where('projectId').equals(projectId).delete()
      })

      await this.loadProjects()
    },
  },
})
