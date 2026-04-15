import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Project, TimeEntry } from '@/types'

const mockDbState = vi.hoisted(() => ({
  projects: [] as Array<Project & { id: number }>,
  timeEntries: [] as Array<TimeEntry & { id: number }>,
  nextProjectId: 1,
  nextEntryId: 1,
}))

vi.mock('@/db', () => ({
  db: {
    projects: {
      orderBy: (field: keyof Project) => ({
        toArray: async () =>
          [...mockDbState.projects].sort((a, b) => `${a[field] ?? ''}`.localeCompare(`${b[field] ?? ''}`)),
      }),
      add: async (project: Omit<Project, 'id'>) => {
        mockDbState.projects.push({ ...project, id: mockDbState.nextProjectId++ })
      },
      update: async (projectId: number, payload: Partial<Project>) => {
        const index = mockDbState.projects.findIndex((project) => project.id === projectId)
        if (index >= 0) {
          mockDbState.projects[index] = { ...mockDbState.projects[index], ...payload } as Project & { id: number }
        }
      },
      delete: async (projectId: number) => {
        mockDbState.projects = mockDbState.projects.filter((project) => project.id !== projectId)
      },
    },
    timeEntries: {
      where: (_field: keyof TimeEntry) => ({
        equals: (projectId: number) => ({
          delete: async () => {
            mockDbState.timeEntries = mockDbState.timeEntries.filter((entry) => entry.projectId !== projectId)
          },
        }),
      }),
    },
    transaction: async (_mode: string, _projectsTable: unknown, _timeEntriesTable: unknown, cb: () => Promise<void>) => {
      await cb()
    },
  },
}))

import { useProjectsStore } from '@/stores/projects'

describe('projects store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockDbState.projects = []
    mockDbState.timeEntries = []
    mockDbState.nextProjectId = 1
    mockDbState.nextEntryId = 1
  })

  it('loads projects sorted by createdAt', async () => {
    mockDbState.projects.push(
      {
        id: 2,
        name: 'B',
        notes: '',
        isPaused: false,
        createdAt: '2026-02-01T00:00:00.000Z',
      },
      {
        id: 1,
        name: 'A',
        notes: '',
        isPaused: false,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    )

    const store = useProjectsStore()
    await store.loadProjects()

    expect(store.projects.map((project) => project.id)).toEqual([1, 2])
  })

  it('adds project with trimmed values', async () => {
    const store = useProjectsStore()
    await store.addProject('  Alpha  ', '  Notes  ')

    expect(store.projects).toHaveLength(1)
    expect(store.projects[0]).toMatchObject({
      name: 'Alpha',
      notes: 'Notes',
      isPaused: false,
    })
    expect(store.projects[0]!.createdAt).toBeTypeOf('string')
  })

  it('rejects empty project name on add', async () => {
    const store = useProjectsStore()

    await expect(store.addProject('   ', 'x')).rejects.toThrow('שם פרויקט הוא שדה חובה')
  })

  it('updates project with trimmed name and notes', async () => {
    mockDbState.projects.push({
      id: 1,
      name: 'Old',
      notes: 'Old notes',
      isPaused: false,
      createdAt: '2026-01-01T00:00:00.000Z',
    })

    const store = useProjectsStore()
    await store.updateProject(1, { name: '  New Name ', notes: '  New Notes ' })

    expect(store.projects[0]).toMatchObject({ name: 'New Name', notes: 'New Notes' })
  })

  it('rejects empty project name on update', async () => {
    mockDbState.projects.push({
      id: 1,
      name: 'Old',
      notes: 'Old notes',
      isPaused: false,
      createdAt: '2026-01-01T00:00:00.000Z',
    })

    const store = useProjectsStore()

    await expect(store.updateProject(1, { name: ' ', notes: 'x' })).rejects.toThrow('שם פרויקט הוא שדה חובה')
  })

  it('sets paused flag for project', async () => {
    mockDbState.projects.push({
      id: 1,
      name: 'A',
      notes: '',
      isPaused: false,
      createdAt: '2026-01-01T00:00:00.000Z',
    })

    const store = useProjectsStore()
    await store.setProjectPaused(1, true)

    expect(store.projects[0]!.isPaused).toBe(true)
  })

  it('deletes project and related time entries', async () => {
    mockDbState.projects.push(
      {
        id: 1,
        name: 'A',
        notes: '',
        isPaused: false,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 2,
        name: 'B',
        notes: '',
        isPaused: false,
        createdAt: '2026-02-01T00:00:00.000Z',
      },
    )

    mockDbState.timeEntries.push(
      {
        id: 1,
        projectId: 1,
        startAt: '2026-03-01T08:00:00.000Z',
        endAt: '2026-03-01T09:00:00.000Z',
        note: '',
        dayKey: '2026-03-01',
      },
      {
        id: 2,
        projectId: 2,
        startAt: '2026-03-01T10:00:00.000Z',
        endAt: '2026-03-01T11:00:00.000Z',
        note: '',
        dayKey: '2026-03-01',
      },
    )

    const store = useProjectsStore()
    await store.deleteProject(1)

    expect(store.projects.map((project) => project.id)).toEqual([2])
    expect(mockDbState.timeEntries.map((entry) => entry.projectId)).toEqual([2])
  })
})
