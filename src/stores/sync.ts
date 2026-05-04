import { defineStore } from 'pinia'
import { watch } from 'vue'
import { db } from '@/db'
import type { DriveData, TimeConflict, SyncConflict, Project, TimeEntry } from '@/types'
import type { GoogleUserInfo } from '@/services/googleAuth'
import { useProjectsStore } from './projects'
import { useTimeEntriesStore } from './timeEntries'

type ProjectsStore = ReturnType<typeof useProjectsStore>
type TimeEntriesStore = ReturnType<typeof useTimeEntriesStore>
import { requestToken, revokeToken, fetchUserInfo, getAccessToken } from '@/services/googleAuth'
import { findDriveFile, readDriveFile, createDriveFile, updateDriveFile } from '@/services/googleDrive'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string
const LAST_SYNC_KEY = 'clock-drive-last-sync'
const FILE_ID_KEY = 'clock-drive-file-id'
const USER_KEY = 'clock-drive-user'
const SYNC_BROADCAST_CHANNEL = 'clock-sync-channel'

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'conflict'

interface SyncState {
  isSignedIn: boolean
  user: GoogleUserInfo | null
  status: SyncStatus
  errorMessage: string | null
  conflict: SyncConflict | null
  driveFileId: string | null
  lastSyncAt: string | null
  _lastLocalChangeAt: number | undefined
  _pendingConflictAction: PendingConflictAction | undefined
  _projectsStore: ProjectsStore | null
  _timeEntriesStore: TimeEntriesStore | null
  _broadcastChannel: BroadcastChannel | null
}

interface SignInOptions {
  mode: 'transfer' | 'copy' | 'ignore'
}

interface SignOutOptions {
  mode: 'copy' | 'ignore'
}

type PendingConflictAction =
  | { type: 'sign-in-sync'; deleteLocalAfterSync: boolean; local: DriveData; remote: DriveData }

// ─────────────────────────────────────────────────────────────────────────────
// Pure helper functions
// ─────────────────────────────────────────────────────────────────────────────

function intervalsOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA
}

function detectTimeConflicts(local: DriveData, remote: DriveData): TimeConflict[] {
  const remoteStartAts = new Set(remote.timeEntries.map((e) => e.startAt))
  const localStartAts = new Set(local.timeEntries.map((e) => e.startAt))

  const localOnly = local.timeEntries.filter((e) => !remoteStartAts.has(e.startAt))
  const remoteOnly = remote.timeEntries.filter((e) => !localStartAts.has(e.startAt))

  const conflicts: TimeConflict[] = []
  const now = Date.now()

  for (const localEntry of localOnly) {
    const ls = new Date(localEntry.startAt).getTime()
    const le = localEntry.endAt ? new Date(localEntry.endAt).getTime() : now

    for (const remoteEntry of remoteOnly) {
      const rs = new Date(remoteEntry.startAt).getTime()
      const re = remoteEntry.endAt ? new Date(remoteEntry.endAt).getTime() : now

      if (intervalsOverlap(ls, le, rs, re)) {
        conflicts.push({ localEntry, remoteEntry })
      }
    }
  }

  return conflicts
}

function normalizeText(value: string | undefined): string {
  return (value ?? '').trim()
}

function buildProjectIdToNameMap(projects: Project[]): Map<number, string> {
  const map = new Map<number, string>()
  for (const p of projects) {
    if (p.id !== undefined) {
      map.set(p.id, p.name)
    }
  }
  return map
}

function projectFingerprint(project: Project): string {
  return JSON.stringify({
    name: normalizeText(project.name),
    notes: normalizeText(project.notes),
    isPaused: project.isPaused,
    createdAt: project.createdAt,
  })
}

function entryLogicalKey(entry: TimeEntry, projectName: string): string {
  return JSON.stringify({
    projectName: normalizeText(projectName),
    startAt: entry.startAt,
    dayKey: entry.dayKey,
  })
}

function entryFingerprint(entry: TimeEntry, projectName: string): string {
  return JSON.stringify({
    projectName: normalizeText(projectName),
    startAt: entry.startAt,
    endAt: entry.endAt ?? null,
    note: normalizeText(entry.note),
    dayKey: entry.dayKey,
  })
}

function isOnlyEndAtDifference(
  localEntry: TimeEntry,
  remoteEntry: TimeEntry,
  localProjectName: string,
  remoteProjectName: string,
): boolean {
  const sameBase =
    normalizeText(localProjectName) === normalizeText(remoteProjectName) &&
    localEntry.startAt === remoteEntry.startAt &&
    localEntry.dayKey === remoteEntry.dayKey &&
    normalizeText(localEntry.note) === normalizeText(remoteEntry.note)

  if (!sameBase) {
    return false
  }

  const localHasEnd = !!localEntry.endAt
  const remoteHasEnd = !!remoteEntry.endAt

  return localHasEnd !== remoteHasEnd
}

function isDivergent(local: DriveData, remote: DriveData): boolean {
  const localProjectById = buildProjectIdToNameMap(local.projects)
  const remoteProjectById = buildProjectIdToNameMap(remote.projects)

  const localByLogical = new Map<string, TimeEntry>()
  for (const entry of local.timeEntries) {
    const projectName = localProjectById.get(entry.projectId) ?? `project:${entry.projectId}`
    localByLogical.set(entryLogicalKey(entry, projectName), entry)
  }

  const remoteByLogical = new Map<string, TimeEntry>()
  for (const entry of remote.timeEntries) {
    const projectName = remoteProjectById.get(entry.projectId) ?? `project:${entry.projectId}`
    remoteByLogical.set(entryLogicalKey(entry, projectName), entry)
  }

  let hasLocalOnly = false
  let hasRemoteOnly = false

  const allLogicalKeys = new Set([...localByLogical.keys(), ...remoteByLogical.keys()])

  for (const logicalKey of allLogicalKeys) {
    const localEntry = localByLogical.get(logicalKey)
    const remoteEntry = remoteByLogical.get(logicalKey)

    if (!localEntry && remoteEntry) {
      hasRemoteOnly = true
      continue
    }

    if (localEntry && !remoteEntry) {
      hasLocalOnly = true
      continue
    }

    if (!localEntry || !remoteEntry) {
      continue
    }

    const localProjectName = localProjectById.get(localEntry.projectId) ?? `project:${localEntry.projectId}`
    const remoteProjectName = remoteProjectById.get(remoteEntry.projectId) ?? `project:${remoteEntry.projectId}`

    if (entryFingerprint(localEntry, localProjectName) === entryFingerprint(remoteEntry, remoteProjectName)) {
      continue
    }

    if (isOnlyEndAtDifference(localEntry, remoteEntry, localProjectName, remoteProjectName)) {
      // Treat clock-out completion as a non-divergent update.
      continue
    }

    // Same logical row changed differently on both sides -> divergent by definition.
    hasLocalOnly = true
    hasRemoteOnly = true
  }

  return hasLocalOnly && hasRemoteOnly
}

function datasetsAreEqual(local: DriveData, remote: DriveData): boolean {
  if (local.projects.length !== remote.projects.length) return false
  if (local.timeEntries.length !== remote.timeEntries.length) return false

  const localProjects = local.projects.map(projectFingerprint).sort()
  const remoteProjects = remote.projects.map(projectFingerprint).sort()

  for (let i = 0; i < localProjects.length; i += 1) {
    if (localProjects[i] !== remoteProjects[i]) {
      return false
    }
  }

  const localProjectById = buildProjectIdToNameMap(local.projects)
  const remoteProjectById = buildProjectIdToNameMap(remote.projects)

  const localEntries = local.timeEntries
    .map((entry) => {
      const projectName = localProjectById.get(entry.projectId) ?? `project:${entry.projectId}`
      return entryFingerprint(entry, projectName)
    })
    .sort()

  const remoteEntries = remote.timeEntries
    .map((entry) => {
      const projectName = remoteProjectById.get(entry.projectId) ?? `project:${entry.projectId}`
      return entryFingerprint(entry, projectName)
    })
    .sort()

  for (let i = 0; i < localEntries.length; i += 1) {
    if (localEntries[i] !== remoteEntries[i]) {
      return false
    }
  }

  return true
}

function isAuthErrorMessage(message: string): boolean {
  return /\b401\b|invalid[_ ]grant|invalid[_ ]token|unauthorized|consent required|login required|invalid authentication|authentication credentials/i.test(message)
}

/**
 * Merges two datasets. Projects are merged by name; time entries by startAt.
 * Produces a self-consistent dataset with new sequential IDs.
 */
function mergeDatasets(local: DriveData, remote: DriveData): DriveData {
  // Merge projects by name
  const projectsByName = new Map<string, Project>()
  for (const p of [...remote.projects, ...local.projects]) {
    if (!projectsByName.has(p.name)) {
      projectsByName.set(p.name, p)
    }
  }

  let nextProjectId = 1
  const mergedProjects: Project[] = []
  const nameToNewId = new Map<string, number>()

  for (const [name, p] of projectsByName) {
    const newId = nextProjectId++
    nameToNewId.set(name, newId)
    mergedProjects.push({ ...p, id: newId })
  }

  // Build old-ID → new-ID maps for both sides
  const buildIdMap = (projects: Project[]): Map<number, number> => {
    const m = new Map<number, number>()
    for (const p of projects) {
      const newId = nameToNewId.get(p.name)
      if (p.id !== undefined && newId !== undefined) m.set(p.id, newId)
    }
    return m
  }

  const localIdMap = buildIdMap(local.projects)
  const remoteIdMap = buildIdMap(remote.projects)

  const localProjectById = buildProjectIdToNameMap(local.projects)
  const remoteProjectById = buildProjectIdToNameMap(remote.projects)

  type CandidateEntry = { source: 'local' | 'remote'; entry: TimeEntry }

  const choosePreferredEntry = (a: CandidateEntry, b: CandidateEntry): CandidateEntry => {
    const aHasEnd = !!a.entry.endAt
    const bHasEnd = !!b.entry.endAt

    if (aHasEnd !== bHasEnd) {
      return aHasEnd ? a : b
    }

    if (a.entry.endAt && b.entry.endAt && a.entry.endAt !== b.entry.endAt) {
      return a.entry.endAt > b.entry.endAt ? a : b
    }

    const aNote = normalizeText(a.entry.note)
    const bNote = normalizeText(b.entry.note)
    if (!aNote && bNote) return b
    if (aNote && !bNote) return a

    // Stable tie-breaker: prefer local to keep immediate user edits.
    return b.source === 'local' ? b : a
  }

  // Merge time entries by logical row; prefer completed row when only endAt differs.
  const mergedByLogicalKey = new Map<string, CandidateEntry>()

  for (const candidate of [
    ...remote.timeEntries.map((entry) => ({ source: 'remote' as const, entry })),
    ...local.timeEntries.map((entry) => ({ source: 'local' as const, entry })),
  ]) {
    const projectName =
      candidate.source === 'local'
        ? localProjectById.get(candidate.entry.projectId) ?? `project:${candidate.entry.projectId}`
        : remoteProjectById.get(candidate.entry.projectId) ?? `project:${candidate.entry.projectId}`

    const logicalKey = entryLogicalKey(candidate.entry, projectName)
    const existing = mergedByLogicalKey.get(logicalKey)

    if (!existing) {
      mergedByLogicalKey.set(logicalKey, candidate)
      continue
    }

    mergedByLogicalKey.set(logicalKey, choosePreferredEntry(existing, candidate))
  }

  const mergedEntries: TimeEntry[] = []
  for (const { source, entry } of mergedByLogicalKey.values()) {
    const idMap = source === 'local' ? localIdMap : remoteIdMap
    const newProjectId = idMap.get(entry.projectId) ?? entry.projectId
    const { id: _id, ...entryData } = entry
    mergedEntries.push({ ...entryData, projectId: newProjectId })
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    projects: mergedProjects,
    timeEntries: mergedEntries,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useSyncStore = defineStore('sync', {
  state: (): SyncState => ({
    isSignedIn: !!localStorage.getItem(USER_KEY),
    user: null,
    status: 'idle',
    errorMessage: null,
    conflict: null,
    _lastLocalChangeAt: undefined,
    _pendingConflictAction: undefined,
    _projectsStore: null,
    _timeEntriesStore: null,
    _broadcastChannel: null,

    driveFileId: localStorage.getItem(FILE_ID_KEY),
    lastSyncAt: localStorage.getItem(LAST_SYNC_KEY),
  }),

  actions: {
    /** Restore persisted auth state and auto-sync if already signed in. */
    async init() {
      this._setupAutoSync()

      const savedUser = localStorage.getItem(USER_KEY)
      if (savedUser) {
        try {
          this.user = JSON.parse(savedUser) as GoogleUserInfo
          this.isSignedIn = true
          
          // Try to refresh token silently in the background
          // Don't wait for it or show errors
          if (CLIENT_ID) {
            try {
              void requestToken(CLIENT_ID, true).catch(() => {
                // Silent refresh failed, but that's OK - user will be prompted on next sync action
              })
            } catch {
              // Ignore
            }
          }
          
          // Auto-sync on app start
          await this.sync()
        } catch {
          localStorage.removeItem(USER_KEY)
        }
      }
    },

    async signIn(options: SignInOptions = { mode: 'ignore' }) {
      if (!CLIENT_ID) {
        this.status = 'error'
        this.errorMessage = 'VITE_GOOGLE_CLIENT_ID לא מוגדר בקובץ .env'
        return
      }
      try {
        this.status = 'syncing'
        this.errorMessage = null
        let token: string
        try {
          token = await requestToken(CLIENT_ID, false)
        } catch (err) {
          if (err instanceof Error && err.message === 'MISSING_DRIVE_FILE_SCOPE') {
            token = await requestToken(CLIENT_ID, false, true)
          } else {
            throw err
          }
        }
        const userInfo = await fetchUserInfo(token)
        this.user = userInfo
        this.isSignedIn = true
        localStorage.setItem(USER_KEY, JSON.stringify(userInfo))

        const driveResult = await this._readDriveData(token)
        const driveData = driveResult?.data ?? {
          version: 1,
          exportedAt: new Date().toISOString(),
          projects: [],
          timeEntries: [],
        }

        if (options.mode !== 'ignore') {
          const deleteLocalAfterSync = options.mode === 'transfer'
          const localData = await this._readLocalData()
          const hasLocal = localData.projects.length > 0 || localData.timeEntries.length > 0
          const hasDrive = driveData.projects.length > 0 || driveData.timeEntries.length > 0

          if (hasLocal && hasDrive && !datasetsAreEqual(localData, driveData) && isDivergent(localData, driveData)) {
            const timeConflicts = detectTimeConflicts(localData, driveData)
            this.conflict = { local: localData, remote: driveData, timeConflicts }
            this._pendingConflictAction = {
              type: 'sign-in-sync',
              deleteLocalAfterSync,
              local: localData,
              remote: driveData,
            }
            this.status = 'conflict'
            return
          }

          const chosen = hasDrive ? mergeDatasets(localData, driveData) : localData
          await this._writeDriveData(token, chosen)
          this._applyDataToStores(chosen)

          if (deleteLocalAfterSync) {
            await this._clearLocalData()
          }

          this._markSynced()
          return
        }

        this._applyDataToStores(driveData)
        this._markSynced()
      } catch (err) {
        this.status = 'error'
        this.errorMessage = err instanceof Error ? err.message : 'שגיאה בהתחברות'
        this.isSignedIn = false
        this.user = null
      }
    },

    async signOut(options: SignOutOptions = { mode: 'ignore' }) {
      if (options.mode === 'ignore') {
        this._signOutLocal({ revoke: true })
        return
      }

      try {
        this.status = 'syncing'
        const token = await this._getToken(false)
        const driveResult = await this._readDriveData(token)
        const driveData = driveResult?.data ?? {
          version: 1,
          exportedAt: new Date().toISOString(),
          projects: [],
          timeEntries: [],
        }

        await this._importData(driveData)
        this._signOutLocal({ revoke: true })
        const projectsStore = this._projectsStore
        const timeEntriesStore = this._timeEntriesStore
        if (projectsStore) await projectsStore.loadProjects()
        if (timeEntriesStore) await timeEntriesStore.loadEntries()
      } catch (err) {
        this.status = 'error'
        this.errorMessage = err instanceof Error ? err.message : 'שגיאה בהתנתקות'
      }
    },

    _signOutLocal(options: { revoke?: boolean } = {}) {
      const { revoke = false } = options

      if (revoke) {
        revokeToken()
      }

      this.isSignedIn = false
      this.user = null
      this.status = 'idle'
      this.errorMessage = null
      this.conflict = null
      localStorage.removeItem(USER_KEY)
      localStorage.removeItem(FILE_ID_KEY)
    },

    markLocalChange() {
      this._lastLocalChangeAt = Date.now()
    },

    async hasLocalData(): Promise<boolean> {
      const localProjectsCount = await db.projects.count()
      const localEntriesCount = await db.timeEntries.count()
      return localProjectsCount > 0 || localEntriesCount > 0
    },

    async _readLocalData(): Promise<DriveData> {
      const localProjects = await db.projects.orderBy('createdAt').toArray()
      const localEntries = await db.timeEntries.orderBy('startAt').toArray()

      return {
        version: 1,
        exportedAt: new Date().toISOString(),
        projects: localProjects,
        timeEntries: localEntries,
      }
    },

    async _readDriveData(token: string): Promise<{ fileId: string; data: DriveData } | null> {
      let fileId = this.driveFileId
      if (!fileId) {
        fileId = await findDriveFile(token)
        if (fileId) {
          this.driveFileId = fileId
          localStorage.setItem(FILE_ID_KEY, fileId)
        }
      }

      if (!fileId) {
        return null
      }

      const data = await readDriveFile<DriveData>(token, fileId)
      return { fileId, data }
    },

    async _writeDriveData(token: string, data: DriveData): Promise<string> {
      let fileId = this.driveFileId
      if (!fileId) {
        const found = await findDriveFile(token)
        if (found) {
          fileId = found
        }
      }

      if (!fileId) {
        const created = await createDriveFile(token, data)
        this.driveFileId = created
        localStorage.setItem(FILE_ID_KEY, created)
        return created
      }

      await updateDriveFile(token, fileId, data)
      this.driveFileId = fileId
      localStorage.setItem(FILE_ID_KEY, fileId)
      return fileId
    },

    _applyDataToStores(data: DriveData) {
      const projectsStore = this._projectsStore
      const timeEntriesStore = this._timeEntriesStore

      if (projectsStore) {
        projectsStore.projects = data.projects.map((project: Project) => ({ ...project }))
      }

      if (timeEntriesStore) {
        const sorted = [...data.timeEntries].sort((a, b) => a.startAt.localeCompare(b.startAt))
        timeEntriesStore.entries = sorted.map((entry: TimeEntry) => ({ ...entry }))
      }
    },

    async _clearLocalData() {
      await db.transaction('rw', db.projects, db.timeEntries, async () => {
        await db.timeEntries.clear()
        await db.projects.clear()
      })
    },

    async pushCloudFromStores(projects: Project[], timeEntries: TimeEntry[]) {
      if (!this.isSignedIn) {
        return
      }

      this.status = 'syncing'
      this.errorMessage = null

      try {
        const token = await this._getToken(false)
        const data: DriveData = {
          version: 1,
          exportedAt: new Date().toISOString(),
          projects: projects.map((project) => ({ ...project })),
          timeEntries: timeEntries.map((entry) => ({ ...entry })),
        }

        await this._writeDriveData(token, data)
        this._markSynced()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'שגיאת סנכרון'
        this.status = 'error'
        this.errorMessage = message
      }
    },

    /** Get a valid token; background flows stay silent by default. */
    async _getToken(interactive = false): Promise<string> {
      const existing = getAccessToken()
      if (existing) return existing
      
      if (!CLIENT_ID) throw new Error('VITE_GOOGLE_CLIENT_ID לא מוגדר')
      
      // If already signed in, try silent refresh first
      if (this.isSignedIn) {
        try {
          return await requestToken(CLIENT_ID, true)
        } catch {
          // Silent refresh failed, fall through to explicit request
        }
      }
      
      if (!interactive) {
        throw new Error('AUTH_REQUIRED')
      }

      // Explicit request (interactive/manual only)
      try {
        return await requestToken(CLIENT_ID, false)
      } catch (err) {
        if (err instanceof Error && err.message === 'MISSING_DRIVE_FILE_SCOPE') {
          return requestToken(CLIENT_ID, false, true)
        }
        throw err
      }
    },

    async sync() {
      if (!this.isSignedIn) return

      this.status = 'syncing'
      this.errorMessage = null
      this.conflict = null

      try {
        const token = await this._getToken(false)

        // Snapshot current working data (in-memory while signed in, DB otherwise)
        const projectsStore = this._projectsStore
        const timeEntriesStore = this._timeEntriesStore

        const localProjects = projectsStore?.projects
          ? projectsStore.projects.map((project: Project) => ({ ...project }))
          : await db.projects.orderBy('createdAt').toArray()

        const localEntries = timeEntriesStore?.entries
          ? timeEntriesStore.entries.map((entry: TimeEntry) => ({ ...entry }))
          : await db.timeEntries.orderBy('startAt').toArray()
        const localData: DriveData = {
          version: 1,
          exportedAt: new Date().toISOString(),
          projects: localProjects,
          timeEntries: localEntries,
        }

        // Locate Drive file
        let fileId = this.driveFileId
        if (!fileId) {
          fileId = await findDriveFile(token)
          if (fileId) {
            this.driveFileId = fileId
            localStorage.setItem(FILE_ID_KEY, fileId)
          }
        }

        // No Drive file yet → upload local data and finish
        if (!fileId) {
          const newId = await createDriveFile(token, localData)
          this.driveFileId = newId
          localStorage.setItem(FILE_ID_KEY, newId)
          this._markSynced()
          return
        }

        // Read Drive data
        const driveData = await readDriveFile<DriveData>(token, fileId)

        const hasLocal = localProjects.length > 0 || localEntries.length > 0
        const hasDrive = driveData.projects.length > 0 || driveData.timeEntries.length > 0

        if (!hasDrive) {
          // Drive is empty → push local
          await updateDriveFile(token, fileId, localData)
          this._markSynced()
          return
        }

        if (!hasLocal) {
          // Local is empty → pull from Drive
          this._applyDataToStores(driveData)
          this._markSynced()
          return
        }

        if (datasetsAreEqual(localData, driveData)) {
          // Already in sync
          this._markSynced()
          return
        }

        // Both have data and they differ
          // Did the user make a local edit since the last successful sync?
          const lastSyncMs = this.lastSyncAt ? new Date(this.lastSyncAt).getTime() : 0
          const lastLocalChangeAt = this._lastLocalChangeAt as number | undefined
          const hasLocalChanges = !!lastLocalChangeAt && lastLocalChangeAt > lastSyncMs

          if (!hasLocalChanges) {
            // No local edits since last sync → Drive has newer data → pull it in automatically
            this._applyDataToStores(driveData)
            this._markSynced()
            return
          }

          // User made local edits. Check if Drive also has independent changes (TRUE conflict).
          if (isDivergent(localData, driveData)) {
            const timeConflicts = detectTimeConflicts(localData, driveData)
            this.conflict = { local: localData, remote: driveData, timeConflicts }
            this.status = 'conflict'
            return
          }

          // Local has changes and no true divergence → merge safely and push result.
          // This also resolves endAt-open/closed mismatches by preferring completed rows.
          const merged = mergeDatasets(localData, driveData)
          this._applyDataToStores(merged)
          await updateDriveFile(token, fileId, merged)
          this._markSynced()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'שגיאת סנכרון'

        if (message === 'AUTH_REQUIRED') {
          // Token expired in this browser — transient, not a revocation.
          // Stay signed in and try again on the next poll cycle.
          this.status = 'idle'
          return
        }

        if (isAuthErrorMessage(message)) {
          // Google rejected the token (expired session / revoked).
          // Sign out and show a friendly message so the user knows to re-login.
          this._signOutLocal({ revoke: false })
          this.status = 'error'
          this.errorMessage = 'פג תוקף ההתחברות לגוגל – יש להתחבר מחדש'
          return
        }

        this.status = 'error'
        this.errorMessage = message
      }
    },

    /** Resolve a conflict: 'local' | 'remote' | 'merge' */
    async resolveConflict(resolution: 'local' | 'remote' | 'merge') {
      if (!this.conflict) return

      const { local, remote } = this.conflict
      const pending = this._pendingConflictAction
      this.conflict = null
      this._pendingConflictAction = undefined

      try {
        let chosen: DriveData

        if (resolution === 'local') {
          chosen = local
        } else if (resolution === 'remote') {
          chosen = remote
        } else {
          chosen = mergeDatasets(local, remote)
        }

        if (pending?.type === 'sign-in-sync') {
          this.status = 'syncing'
          const token = await this._getToken(false)
          await this._writeDriveData(token, chosen)

          if (pending.deleteLocalAfterSync) {
            await this._clearLocalData()
          }

          this._applyDataToStores(chosen)
          this._markSynced()
          return
        }

        this.status = 'syncing'
        const token = await this._getToken()
        const fileId = this.driveFileId!

        this._applyDataToStores(chosen)
        await updateDriveFile(token, fileId, chosen)
        this._markSynced()
      } catch (err) {
        this.status = 'error'
        this.errorMessage = err instanceof Error ? err.message : 'שגיאה בפתרון קונפליקט'
      }
    },

    /** Replace all local DB data with the given dataset. */
    async _importData(data: DriveData) {
      const projectIdMap = new Map<number, number>()

      await db.transaction('rw', db.projects, db.timeEntries, async () => {
        await db.timeEntries.clear()
        await db.projects.clear()
      })

      for (const project of data.projects) {
        const { id: driveId, ...rest } = project
        const newId = (await db.projects.add(rest)) as number
        if (driveId !== undefined) projectIdMap.set(driveId, newId)
      }

      for (const entry of data.timeEntries) {
        const { id: _id, ...rest } = entry
        const mappedProjectId = projectIdMap.get(entry.projectId) ?? entry.projectId
        await db.timeEntries.add({ ...rest, projectId: mappedProjectId })
      }
    },

    _markSynced() {
      const now = new Date().toISOString()
      this.lastSyncAt = now
      localStorage.setItem(LAST_SYNC_KEY, now)
      this.status = 'success'
      
      // Reload stores with fresh data from DB only in local mode.
      // In Google mode, store state is already the source used for push/pull.
      const timeEntriesStore = this._timeEntriesStore
      const projectsStore = this._projectsStore
      if (!this.isSignedIn) {
        if (timeEntriesStore) void timeEntriesStore.loadEntries()
        if (projectsStore) void projectsStore.loadProjects()
      }
      
      // Notify other tabs that we've synced
      try {
        const bc = this._broadcastChannel
        if (bc) {
          bc.postMessage({ type: 'sync-completed', timestamp: Date.now() })
        }
      } catch {
        // Broadcast failed, continue anyway
      }
    },

    /**
     * Setup store references and background polling.
     * Called once from init().
     */
    _setupAutoSync() {
      this._timeEntriesStore = useTimeEntriesStore()
      this._projectsStore = useProjectsStore()

      let pollInterval: ReturnType<typeof setInterval> | null = null
      let broadcastChannel: BroadcastChannel | null = null

      // Background pull from Drive for updates coming from other browsers/devices.
      const startPolling = () => {
        if (pollInterval) clearInterval(pollInterval)

        pollInterval = setInterval(() => {
          if (!this.isSignedIn || this.status === 'syncing') {
            return
          }

          void this.sync()
        }, 30000)
      }

      const stopPolling = () => {
        if (!pollInterval) {
          return
        }

        clearInterval(pollInterval)
        pollInterval = null
      }

      watch(
        () => this.isSignedIn,
        (isSignedIn) => {
          if (isSignedIn) {
            startPolling()
            return
          }

          stopPolling()
        },
      )

      if (this.isSignedIn) {
        startPolling()
      }

      // ─── BroadcastChannel for cross-tab sync ──────────────────────────────
      try {
        broadcastChannel = new BroadcastChannel(SYNC_BROADCAST_CHANNEL)
        
        broadcastChannel.onmessage = (event: MessageEvent) => {
          const message = event.data as { type: string; timestamp?: number }

          if (message.type === 'sync-completed') {
            // Fast path for same-browser tabs. Different browsers still rely on polling.
            if (this.isSignedIn && this.status !== 'syncing') {
              void this.sync()
            }
          }
        }
      } catch {
        // BroadcastChannel not supported.
      }

      // Store reference to broadcastChannel in the store so sync() can notify other tabs
      this._broadcastChannel = broadcastChannel
    },
  },
})
