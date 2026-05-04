<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useSyncStore } from '@/stores/sync'
import { useTimeEntriesStore } from '@/stores/timeEntries'
import { useProjectsStore } from '@/stores/projects'
import type { DriveData } from '@/types'

const syncStore = useSyncStore()
const timeEntriesStore = useTimeEntriesStore()
const projectsStore = useProjectsStore()
const showSignInChoice = ref(false)
const showSignOutChoice = ref(false)

const { isSignedIn, user, status, errorMessage, conflict, lastSyncAt } = storeToRefs(syncStore)

const statusIcon = computed(() => {
  switch (status.value) {
    case 'syncing':  return 'fa-solid fa-rotate fa-spin'
    case 'success':  return 'fa-solid fa-cloud-arrow-up'
    case 'error':    return 'fa-solid fa-triangle-exclamation'
    case 'conflict': return 'fa-solid fa-code-merge'
    default:         return 'fa-solid fa-cloud'
  }
})

const statusTitle = computed(() => {
  switch (status.value) {
    case 'syncing':  return 'מסנכרן…'
    case 'success':  return lastSyncAt.value ? `סונכרן: ${fmtDate(lastSyncAt.value)}` : 'סונכרן'
    case 'error':    return errorMessage.value ?? 'שגיאת סנכרון'
    case 'conflict': return 'נמצאה התנגשות נתונים – לחץ לפתרון'
    default:         return 'לחץ לסנכרון עם Drive'
  }
})

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}

function getProjectName(dataset: DriveData, projectId: number): string {
  return dataset.projects.find((p) => p.id === projectId)?.name ?? `פרויקט ${projectId}`
}

async function afterResolve() {
  await timeEntriesStore.loadEntries()
  await projectsStore.loadProjects()
}

async function resolve(choice: 'local' | 'remote' | 'merge') {
  await syncStore.resolveConflict(choice)
  await afterResolve()
}

async function completeSignIn(mode: 'transfer' | 'copy' | 'ignore') {
  showSignInChoice.value = false
  await syncStore.signIn({ mode })
  await afterResolve()
}

async function handleSignIn() {
  const hasLocalData = await syncStore.hasLocalData()

  if (hasLocalData) {
    showSignInChoice.value = true
    return
  }

  await completeSignIn('ignore')
}

async function completeSignOut(mode: 'copy' | 'ignore') {
  showSignOutChoice.value = false
  await syncStore.signOut({ mode })
  await afterResolve()
}

async function handleSignOut() {
  showSignOutChoice.value = true
}
</script>

<template>
  <!-- ── Not signed in ────────────────────────────────────────────── -->
  <div v-if="!isSignedIn" class="sync-area">
    <button
      class="sync-signin-btn"
      type="button"
      :disabled="status === 'syncing'"
      title="התחבר עם Google כדי לגבות נתונים ב-Drive"
      @click="handleSignIn"
    >
      <svg class="google-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      התחבר עם Google Drive
    </button>
  </div>

  <!-- ── Signed in ─────────────────────────────────────────────────── -->
  <div v-else class="sync-area sync-area--active">
    <img
      v-if="user?.picture"
      :src="user.picture"
      :alt="user.name"
      class="sync-avatar"
      :title="user.email"
      referrerpolicy="no-referrer"
    />

    <button
      class="theme-icon-btn sync-status-btn"
      type="button"
      :title="statusTitle"
      :class="{
        'sync-status--error':    status === 'error',
        'sync-status--conflict': status === 'conflict',
        'sync-status--success':  status === 'success',
      }"
      @click="status === 'conflict' ? undefined : syncStore.sync()"
    >
      <i :class="statusIcon" aria-hidden="true"></i>
    </button>

    <button
      class="theme-icon-btn"
      type="button"
      title="התנתק מ-Google"
      @click="handleSignOut"
    >
      <i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i>
    </button>
  </div>

  <!-- ── Sign-in choice modal ─────────────────────────────────────── -->
  <Teleport to="body">
    <div v-if="showSignInChoice" class="modal-backdrop" @click.self="showSignInChoice = false">
      <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="signin-choice-title">
        <p class="hero-eyebrow">התחברות ל-Google Drive</p>
        <h3 id="signin-choice-title">נמצאו נתונים מקומיים</h3>
        <p class="conflict-intro">בחר מה לעשות עם הנתונים המקומיים בעת ההתחברות:</p>

        <div class="conflict-actions">
          <button
            class="primary conflict-btn"
            type="button"
            title="שמור ב-Drive ומחק את הנתונים המקומיים"
            @click="completeSignIn('transfer')"
          >
            <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
            <span class="choice-title">העבר</span>
          </button>
          <button
            class="primary conflict-btn"
            type="button"
            title="הנתונים המקומיים יועתקו ל-Drive אך יישמרו גם מקומית ללא שינוי"
            @click="completeSignIn('copy')"
          >
            <i class="fa-solid fa-copy" aria-hidden="true"></i>
            <span class="choice-title">העתק</span>
          </button>
          <button
            class="secondary conflict-btn"
            type="button"
            title="משוך רק מ-Drive ואל תשנה את הנתונים המקומיים"
            @click="completeSignIn('ignore')"
          >
            <i class="fa-solid fa-circle-xmark" aria-hidden="true"></i>
            <span class="choice-title">התעלם</span>
          </button>
        </div>
      </section>
    </div>
  </Teleport>

  <!-- ── Sign-out choice modal ────────────────────────────────────── -->
  <Teleport to="body">
    <div v-if="showSignOutChoice" class="modal-backdrop" @click.self="showSignOutChoice = false">
      <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="signout-choice-title">
        <p class="hero-eyebrow">התנתקות מ-Google Drive</p>
        <h3 id="signout-choice-title">בחר פעולה לפני ההתנתקות</h3>
        <p class="conflict-intro">האם ליצור עותק מקומי מנתוני ה-Drive או להתנתק בלבד?</p>

        <div class="conflict-actions">
          <button
            class="primary conflict-btn"
            type="button"
            title="צור עותק מקומי של הנתונים מה-Drive, נתונים קודמים אם ישנם יימחקו"
            @click="completeSignOut('copy')"
          >
            <i class="fa-solid fa-copy" aria-hidden="true"></i>
            <span class="choice-title">העתק</span>
          </button>
          <button
            class="secondary conflict-btn"
            type="button"
            title="התנתק בלבד בלי לשנות את הנתונים המקומיים"
            @click="completeSignOut('ignore')"
          >
            <i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i>
            <span class="choice-title">התעלם</span>
          </button>
        </div>
      </section>
    </div>
  </Teleport>

  <!-- ── Conflict modal ────────────────────────────────────────────── -->
  <Teleport to="body">
    <div v-if="conflict" class="modal-backdrop" @click.self="undefined">
      <section
        class="modal-panel conflict-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-title"
      >
        <p class="hero-eyebrow">סנכרון עם Google Drive</p>
        <h3 id="conflict-title">
          <i class="fa-solid fa-code-merge" aria-hidden="true"></i>
          התנגשות נתונים
        </h3>

        <p class="conflict-intro">
          נמצאו נתונים שונים גם בדפדפן וגם ב-Drive. בחר כיצד להמשיך:
        </p>

        <!-- Summary table -->
        <div class="conflict-summary">
          <div class="conflict-col">
            <div class="conflict-col-header">
              <i class="fa-solid fa-laptop" aria-hidden="true"></i>
              נתונים מקומיים (דפדפן)
            </div>
            <ul>
              <li>{{ conflict.local.projects.length }} פרויקטים</li>
              <li>{{ conflict.local.timeEntries.length }} רשומות שעות</li>
            </ul>
          </div>
          <div class="conflict-col">
            <div class="conflict-col-header">
              <i class="fa-brands fa-google-drive" aria-hidden="true"></i>
              נתונים ב-Drive
            </div>
            <ul>
              <li>{{ conflict.remote.projects.length }} פרויקטים</li>
              <li>{{ conflict.remote.timeEntries.length }} רשומות שעות</li>
            </ul>
          </div>
        </div>

        <!-- Time conflicts alert -->
        <div v-if="conflict.timeConflicts.length > 0" class="time-conflicts-alert">
          <p class="time-conflicts-title">
            <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
            נמצאו {{ conflict.timeConflicts.length }} התנגשו{{ conflict.timeConflicts.length > 1 ? 'יות' : 'ת' }} בשעות
          </p>
          <div class="time-conflicts-list">
            <div
              v-for="(tc, i) in conflict.timeConflicts"
              :key="i"
              class="time-conflict-row"
            >
              <div class="time-conflict-side">
                <span class="tc-label">מקומי:</span>
                <span class="tc-project">{{ getProjectName(conflict.local, tc.localEntry.projectId) }}</span>
                <span class="tc-range">
                  {{ fmtTime(tc.localEntry.startAt) }} – {{ tc.localEntry.endAt ? fmtTime(tc.localEntry.endAt) : 'פתוח' }}
                </span>
              </div>
              <i class="fa-solid fa-arrows-left-right tc-arrow" aria-hidden="true"></i>
              <div class="time-conflict-side">
                <span class="tc-label">Drive:</span>
                <span class="tc-project">{{ getProjectName(conflict.remote, tc.remoteEntry.projectId) }}</span>
                <span class="tc-range">
                  {{ fmtTime(tc.remoteEntry.startAt) }} – {{ tc.remoteEntry.endAt ? fmtTime(tc.remoteEntry.endAt) : 'פתוח' }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Action buttons -->
        <div class="conflict-actions">
          <button
            class="primary conflict-btn"
            type="button"
            title="מחק את הנתונים המקומיים ותחליף בנתונים מ-Drive"
            @click="resolve('remote')"
          >
            <i class="fa-brands fa-google-drive" aria-hidden="true"></i>
            השתמש ב-Drive
          </button>

          <button
            class="primary conflict-btn"
            type="button"
            title="מחק את נתוני Drive ותחליף בנתונים המקומיים"
            @click="resolve('local')"
          >
            <i class="fa-solid fa-laptop" aria-hidden="true"></i>
            השתמש במקומי
          </button>

          <button
            class="secondary conflict-btn"
            type="button"
            title="שמור את כל הרשומות משני הצדדים וערוך ידנית"
            @click="resolve('merge')"
          >
            <i class="fa-solid fa-code-merge" aria-hidden="true"></i>
            שמור הכל (ערוך ידנית)
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
/* ── Sync area ──────────────────────────────────────────────────────────── */
.sync-area {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.sync-signin-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.8rem;
  border-radius: 6px;
  border: 1px solid var(--border, #555);
  background: transparent;
  color: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}
.sync-signin-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent, #6c8ebf) 15%, transparent);
}
.sync-signin-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.google-icon {
  width: 1.1rem;
  height: 1.1rem;
  flex-shrink: 0;
}

.sync-avatar {
  width: 1.7rem;
  height: 1.7rem;
  border-radius: 50%;
  border: 2px solid var(--panel-strong, #888);
  object-fit: cover;
}

/* Status icon colours */
.sync-status--error    { color: var(--danger, #e05252); }
.sync-status--conflict { color: #f0a500; }
.sync-status--success  { color: #4caf50; }

.choice-title {
  display: block;
  font-weight: 700;
}

/* ── Conflict modal ─────────────────────────────────────────────────────── */
.conflict-panel {
  max-width: 660px;
  width: 95vw;
}

.conflict-intro {
  margin: 0 0 1rem;
  font-size: 0.9rem;
}

.conflict-summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1rem;
}

.conflict-col {
  background: color-mix(in srgb, var(--panel-strong, #888) 12%, transparent);
  border-radius: 6px;
  padding: 0.75rem 1rem;
}

.conflict-col-header {
  font-weight: 600;
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
}

.conflict-col ul {
  margin: 0;
  padding: 0 1rem 0 0;
  font-size: 0.85rem;
}
.conflict-col li {
  margin-bottom: 0.2rem;
}

/* Time conflicts */
.time-conflicts-alert {
  border: 1px solid var(--danger, #e05252);
  border-radius: 6px;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  background: color-mix(in srgb, var(--danger, #e05252) 8%, transparent);
}

.time-conflicts-title {
  font-weight: 600;
  color: var(--danger, #e05252);
  margin: 0 0 0.6rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
}

.time-conflicts-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 180px;
  overflow-y: auto;
}

.time-conflict-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.8rem;
  background: color-mix(in srgb, var(--row-bg, #eee) 50%, transparent);
  border-radius: 4px;
  padding: 0.35rem 0.6rem;
  flex-wrap: wrap;
}

.time-conflict-side {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex: 1;
}

.tc-label   { font-weight: 600; flex-shrink: 0; }
.tc-project { color: var(--accent, #6c8ebf); }
.tc-range   { opacity: 0.8; }
.tc-arrow   { opacity: 0.5; flex-shrink: 0; }

/* Action buttons */
.conflict-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  flex-wrap: wrap;
  margin-top: 0.5rem;
}

.conflict-btn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

@media (max-width: 500px) {
  .conflict-summary {
    grid-template-columns: 1fr;
  }
  .conflict-actions {
    flex-direction: column;
  }
  .conflict-btn {
    width: 100%;
    justify-content: center;
  }
}
</style>
