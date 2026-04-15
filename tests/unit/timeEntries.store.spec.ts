import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { TimeEntry } from '@/types'

const mockDbState = vi.hoisted(() => ({
  timeEntries: [] as Array<TimeEntry & { id: number }>,
  nextEntryId: 1,
}))

vi.mock('@/db', () => ({
  db: {
    timeEntries: {
      orderBy: (field: keyof TimeEntry) => ({
        toArray: async () =>
          [...mockDbState.timeEntries].sort((a, b) => `${a[field] ?? ''}`.localeCompare(`${b[field] ?? ''}`)),
      }),
      add: async (entry: Omit<TimeEntry, 'id'>) => {
        mockDbState.timeEntries.push({ ...entry, id: mockDbState.nextEntryId++ })
      },
      update: async (entryId: number, payload: Partial<TimeEntry>) => {
        const index = mockDbState.timeEntries.findIndex((entry) => entry.id === entryId)
        if (index >= 0) {
          const current = mockDbState.timeEntries[index]
          if (current) {
            mockDbState.timeEntries[index] = {
              id: current.id,
              projectId: payload.projectId ?? current.projectId,
              startAt: payload.startAt ?? current.startAt,
              endAt: payload.endAt ?? current.endAt,
              note: payload.note ?? current.note,
              dayKey: payload.dayKey ?? current.dayKey,
            }
          }
        }
      },
      delete: async (entryId: number) => {
        mockDbState.timeEntries = mockDbState.timeEntries.filter((entry) => entry.id !== entryId)
      },
      filter: (predicate: (entry: TimeEntry) => boolean) => ({
        toArray: async () => mockDbState.timeEntries.filter((entry) => predicate(entry)),
      }),
    },
    transaction: async (_mode: string, _timeEntriesTable: unknown, cb: () => Promise<void>) => {
      await cb()
    },
  },
}))

import { useTimeEntriesStore } from '@/stores/timeEntries'

describe('timeEntries store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockDbState.timeEntries = []
    mockDbState.nextEntryId = 1
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-13T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads entries sorted by startAt', async () => {
    mockDbState.timeEntries.push(
      {
        id: 2,
        projectId: 1,
        startAt: '2026-04-13T09:00:00.000Z',
        endAt: '2026-04-13T10:00:00.000Z',
        note: '',
        dayKey: '2026-04-13',
      },
      {
        id: 1,
        projectId: 1,
        startAt: '2026-04-13T08:00:00.000Z',
        endAt: '2026-04-13T08:30:00.000Z',
        note: '',
        dayKey: '2026-04-13',
      },
    )

    const store = useTimeEntriesStore()
    await store.loadEntries()

    expect(store.entries.map((entry) => entry.id)).toEqual([1, 2])
  })

  it('todayEntries returns only entries from current day', async () => {
    mockDbState.timeEntries.push(
      {
        id: 1,
        projectId: 1,
        startAt: '2026-04-13T08:00:00.000Z',
        endAt: '2026-04-13T09:00:00.000Z',
        note: '',
        dayKey: '2026-04-13',
      },
      {
        id: 2,
        projectId: 1,
        startAt: '2026-04-12T08:00:00.000Z',
        endAt: '2026-04-12T09:00:00.000Z',
        note: '',
        dayKey: '2026-04-12',
      },
    )

    const store = useTimeEntriesStore()
    await store.loadEntries()

    expect(store.todayEntries).toHaveLength(1)
    expect(store.todayEntries[0]!.dayKey).toBe('2026-04-13')
  })

  it('detects active project', async () => {
    mockDbState.timeEntries.push(
      {
        id: 1,
        projectId: 7,
        startAt: '2026-04-13T08:00:00.000Z',
        note: '',
        dayKey: '2026-04-13',
      },
      {
        id: 2,
        projectId: 8,
        startAt: '2026-04-13T06:00:00.000Z',
        endAt: '2026-04-13T07:00:00.000Z',
        note: '',
        dayKey: '2026-04-13',
      },
    )

    const store = useTimeEntriesStore()
    await store.loadEntries()

    expect(store.isProjectActive(7)).toBe(true)
    expect(store.isProjectActive(8)).toBe(false)
  })

  it('clocks in only once for active project', async () => {
    const store = useTimeEntriesStore()

    await store.clockIn(1)
    await store.clockIn(1)

    expect(store.entries).toHaveLength(1)
    expect(store.entries[0]).toMatchObject({ projectId: 1, dayKey: '2026-04-13' })
    expect(store.entries[0]!.endAt).toBeUndefined()
  })

  it('clocks out active entry for project', async () => {
    mockDbState.timeEntries.push({
      id: 1,
      projectId: 1,
      startAt: '2026-04-13T08:00:00.000Z',
      note: '',
      dayKey: '2026-04-13',
    })

    const store = useTimeEntriesStore()
    await store.loadEntries()
    await store.clockOut(1)

    expect(store.entries[0]!.endAt).toBe('2026-04-13T10:00:00.000Z')
  })

  it('switches to target project by closing others and opening target entry', async () => {
    mockDbState.timeEntries.push(
      {
        id: 1,
        projectId: 1,
        startAt: '2026-04-13T09:00:00.000Z',
        note: '',
        dayKey: '2026-04-13',
      },
      {
        id: 2,
        projectId: 2,
        startAt: '2026-04-13T08:00:00.000Z',
        endAt: '2026-04-13T08:30:00.000Z',
        note: '',
        dayKey: '2026-04-13',
      },
    )

    const store = useTimeEntriesStore()
    await store.loadEntries()
    await store.switchToProject(3)

    const closedEntry = store.entries.find((entry) => entry.id === 1)
    const newEntry = store.entries.find((entry) => entry.projectId === 3 && !entry.endAt)

    expect(closedEntry?.endAt).toBe('2026-04-13T10:00:00.000Z')
    expect(newEntry).toBeTruthy()
    expect(newEntry?.dayKey).toBe('2026-04-13')
  })

  it('does not create duplicate entry when switching to already active project', async () => {
    mockDbState.timeEntries.push({
      id: 1,
      projectId: 5,
      startAt: '2026-04-13T09:00:00.000Z',
      note: '',
      dayKey: '2026-04-13',
    })

    const store = useTimeEntriesStore()
    await store.loadEntries()
    await store.switchToProject(5)

    expect(store.entries).toHaveLength(1)
    expect(store.entries[0]!.projectId).toBe(5)
    expect(store.entries[0]!.endAt).toBeUndefined()
  })

  it('updates note with trim', async () => {
    mockDbState.timeEntries.push({
      id: 1,
      projectId: 1,
      startAt: '2026-04-13T08:00:00.000Z',
      endAt: '2026-04-13T09:00:00.000Z',
      note: 'old',
      dayKey: '2026-04-13',
    })

    const store = useTimeEntriesStore()
    await store.loadEntries()
    await store.updateEntryNote(1, '  updated note  ')

    expect(store.entries[0]!.note).toBe('updated note')
  })

  it('validates and updates entry times and dayKey', async () => {
    mockDbState.timeEntries.push({
      id: 1,
      projectId: 1,
      startAt: '2026-04-13T08:00:00.000Z',
      endAt: '2026-04-13T09:00:00.000Z',
      note: '',
      dayKey: '2026-04-13',
    })

    const store = useTimeEntriesStore()
    await store.loadEntries()

    await expect(store.updateEntryTimes(1, 'invalid-date')).rejects.toThrow('זמן כניסה לא תקין')
    await expect(store.updateEntryTimes(1, '2026-04-13T08:00:00.000Z', 'invalid-date')).rejects.toThrow(
      'זמן יציאה לא תקין',
    )
    await expect(store.updateEntryTimes(1, '2026-04-13T09:00:00.000Z', '2026-04-13T08:00:00.000Z')).rejects.toThrow(
      'זמן יציאה חייב להיות אחרי זמן כניסה',
    )

    await store.updateEntryTimes(1, '2026-04-12T10:00:00.000Z', '2026-04-12T11:00:00.000Z')

    expect(store.entries[0]).toMatchObject({
      startAt: '2026-04-12T10:00:00.000Z',
      endAt: '2026-04-12T11:00:00.000Z',
      dayKey: '2026-04-12',
    })
  })

  it('detects overlapping edited range with other rows', async () => {
    mockDbState.timeEntries.push(
      {
        id: 1,
        projectId: 1,
        startAt: '2026-04-13T08:00:00.000Z',
        endAt: '2026-04-13T09:00:00.000Z',
        note: '',
        dayKey: '2026-04-13',
      },
      {
        id: 2,
        projectId: 1,
        startAt: '2026-04-13T09:30:00.000Z',
        endAt: '2026-04-13T10:30:00.000Z',
        note: '',
        dayKey: '2026-04-13',
      },
    )

    const store = useTimeEntriesStore()
    await store.loadEntries()

    const overlaps = store.findOverlappingEntries(1, '2026-04-13T09:00:00.000Z', '2026-04-13T10:00:00.000Z')
    const noOverlaps = store.findOverlappingEntries(1, '2026-04-13T07:00:00.000Z', '2026-04-13T08:00:00.000Z')

    expect(overlaps.map((entry) => entry.id)).toEqual([2])
    expect(noOverlaps).toHaveLength(0)
  })

  it('deletes entry', async () => {
    mockDbState.timeEntries.push({
      id: 1,
      projectId: 1,
      startAt: '2026-04-13T08:00:00.000Z',
      endAt: '2026-04-13T09:00:00.000Z',
      note: '',
      dayKey: '2026-04-13',
    })

    const store = useTimeEntriesStore()
    await store.loadEntries()
    await store.deleteEntry(1)

    expect(store.entries).toHaveLength(0)
  })
})
