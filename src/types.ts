export interface Project {
  id?: number
  name: string
  notes: string
  isPaused: boolean
  createdAt: string
}

export interface TimeEntry {
  id?: number
  projectId: number
  startAt: string
  endAt?: string
  note: string
  dayKey: string
}

export interface ProjectSummary {
  projectId: number
  projectName: string
  totalMs: number
}
