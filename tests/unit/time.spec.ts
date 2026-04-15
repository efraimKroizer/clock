import { describe, expect, it } from 'vitest'
import {
  calculateTotalMs,
  durationMs,
  formatDateToDayKey,
  formatDateToMonthKey,
  formatMsToDecimalHours,
  formatMsToHoursAndMinutes,
  summarizeByProject,
} from '@/utils/time'
import type { Project, TimeEntry } from '@/types'

describe('time utils', () => {
  it('formats day key correctly', () => {
    expect(formatDateToDayKey(new Date('2026-03-12T12:34:00Z'))).toBe('2026-03-12')
  })

  it('formats month key correctly', () => {
    expect(formatDateToMonthKey(new Date('2026-11-02T12:34:00Z'))).toBe('2026-11')
  })

  it('calculates duration safely for closed and open entries', () => {
    const now = new Date('2026-03-12T10:00:00.000Z')

    expect(
      durationMs(
        {
          id: 1,
          projectId: 1,
          startAt: '2026-03-12T08:00:00.000Z',
          endAt: '2026-03-12T09:30:00.000Z',
          note: '',
          dayKey: '2026-03-12',
        },
        now,
      ),
    ).toBe(90 * 60 * 1000)

    expect(
      durationMs(
        {
          id: 2,
          projectId: 1,
          startAt: '2026-03-12T09:15:00.000Z',
          note: '',
          dayKey: '2026-03-12',
        },
        now,
      ),
    ).toBe(45 * 60 * 1000)

    expect(
      durationMs(
        {
          id: 3,
          projectId: 1,
          startAt: '2026-03-12T11:00:00.000Z',
          endAt: '2026-03-12T10:30:00.000Z',
          note: '',
          dayKey: '2026-03-12',
        },
        now,
      ),
    ).toBe(0)
  })

  it('calculates open and closed entries duration', () => {
    const now = new Date('2026-03-12T10:00:00.000Z')
    const entries: TimeEntry[] = [
      {
        id: 1,
        projectId: 1,
        startAt: '2026-03-12T08:00:00.000Z',
        endAt: '2026-03-12T09:00:00.000Z',
        note: '',
        dayKey: '2026-03-12',
      },
      {
        id: 2,
        projectId: 1,
        startAt: '2026-03-12T09:30:00.000Z',
        note: '',
        dayKey: '2026-03-12',
      },
    ]

    expect(calculateTotalMs(entries, now)).toBe(90 * 60 * 1000)
  })

  it('formats ms to hh:mm', () => {
    expect(formatMsToHoursAndMinutes(95 * 60 * 1000)).toBe('01:35')
    expect(formatMsToHoursAndMinutes(-5000)).toBe('00:00')
  })

  it('formats ms to decimal hours', () => {
    expect(formatMsToDecimalHours(90 * 60 * 1000)).toBe('1.50')
    expect(formatMsToDecimalHours(-1)).toBe('0.00')
  })

  it('summarizes by project', () => {
    const projects: Project[] = [
      { id: 1, name: 'A', notes: '', isPaused: false, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 2, name: 'B', notes: '', isPaused: false, createdAt: '2026-01-01T00:00:00.000Z' },
    ]

    const entries: TimeEntry[] = [
      {
        id: 1,
        projectId: 1,
        startAt: '2026-03-12T08:00:00.000Z',
        endAt: '2026-03-12T09:00:00.000Z',
        note: '',
        dayKey: '2026-03-12',
      },
      {
        id: 2,
        projectId: 2,
        startAt: '2026-03-12T10:00:00.000Z',
        endAt: '2026-03-12T12:00:00.000Z',
        note: '',
        dayKey: '2026-03-12',
      },
    ]

    const summary = summarizeByProject(entries, projects)
    expect(summary).toHaveLength(2)
    expect(summary.map((item) => item.projectName)).toEqual(['A', 'B'])
    expect(summary.map((item) => item.totalMs)).toEqual([1 * 60 * 60 * 1000, 2 * 60 * 60 * 1000])
  })

  it('excludes projects with zero duration from summary', () => {
    const projects: Project[] = [
      { id: 1, name: 'A', notes: '', isPaused: false, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 2, name: 'B', notes: '', isPaused: false, createdAt: '2026-01-01T00:00:00.000Z' },
    ]

    const entries: TimeEntry[] = [
      {
        id: 1,
        projectId: 1,
        startAt: '2026-03-12T08:00:00.000Z',
        endAt: '2026-03-12T09:00:00.000Z',
        note: '',
        dayKey: '2026-03-12',
      },
    ]

    const summary = summarizeByProject(entries, projects)
    expect(summary).toHaveLength(1)
    expect(summary[0]).toMatchObject({ projectId: 1, projectName: 'A' })
  })
})
