import { defineStore } from 'pinia'
import { db } from '@/db'
import type { Project } from '@/types'

interface ProjectsState {
  projects: Project[]
}

export const useProjectsStore = defineStore('projects', {
  state: (): ProjectsState => ({
    projects: [],
  }),

  actions: {
    async loadProjects() {
      this.projects = await db.projects.orderBy('createdAt').toArray()
    },

    async addProject(name: string, notes: string) {
      const cleanName = name.trim()
      if (!cleanName) {
        throw new Error('שם פרויקט הוא שדה חובה')
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
      const cleanName = payload.name.trim()
      if (!cleanName) {
        throw new Error('שם פרויקט הוא שדה חובה')
      }

      await db.projects.update(projectId, {
        name: cleanName,
        notes: payload.notes.trim(),
      })

      await this.loadProjects()
    },

    async setProjectPaused(projectId: number, isPaused: boolean) {
      await db.projects.update(projectId, { isPaused })
      await this.loadProjects()
    },

    async deleteProject(projectId: number) {
      await db.transaction('rw', db.projects, db.timeEntries, async () => {
        await db.projects.delete(projectId)
        await db.timeEntries.where('projectId').equals(projectId).delete()
      })

      await this.loadProjects()
    },
  },
})
