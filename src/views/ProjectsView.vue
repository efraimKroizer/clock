<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useProjectsStore } from '@/stores/projects'

const projectsStore = useProjectsStore()
const { projects } = storeToRefs(projectsStore)

const newProject = reactive({
  name: '',
  notes: '',
})

const editState = reactive<Record<number, { name: string; notes: string }>>({})
const message = ref('')

onMounted(async () => {
  await projectsStore.loadProjects()
  seedEditState()
})

function seedEditState() {
  for (const project of projects.value) {
    if (!project.id) {
      continue
    }

    editState[project.id] = {
      name: project.name,
      notes: project.notes,
    }
  }
}

async function addProject() {
  message.value = ''
  try {
    await projectsStore.addProject(newProject.name, newProject.notes)
    newProject.name = ''
    newProject.notes = ''
    seedEditState()
    message.value = 'הפרויקט נוסף בהצלחה'
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'שגיאה בהוספת הפרויקט'
  }
}

async function saveProject(projectId: number) {
  const data = editState[projectId]
  if (!data) {
    return
  }

  message.value = ''
  try {
    await projectsStore.updateProject(projectId, data)
    seedEditState()
    message.value = 'השינויים נשמרו'
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'שמירה נכשלה'
  }
}

async function togglePaused(projectId: number, isPaused: boolean) {
  message.value = ''
  await projectsStore.setProjectPaused(projectId, !isPaused)
  seedEditState()
  message.value = !isPaused ? 'הפרויקט הושהה' : 'הפרויקט חזר לפעילות'
}

async function removeProject(projectId: number) {
  message.value = ''
  await projectsStore.deleteProject(projectId)
  delete editState[projectId]
  message.value = 'הפרויקט וכל השורות שלו נמחקו'
}

function onEditName(projectId: number | undefined, value: string) {
  if (!projectId || !editState[projectId]) {
    return
  }

  editState[projectId].name = value
}

function onEditNotes(projectId: number | undefined, value: string) {
  if (!projectId || !editState[projectId]) {
    return
  }

  editState[projectId].notes = value
}

function isProjectDirty(projectId: number): boolean {
  const current = projects.value.find((project) => project.id === projectId)
  const draft = editState[projectId]
  if (!current || !draft) {
    return false
  }

  return current.name !== draft.name || current.notes !== draft.notes
}
</script>

<template>
  <section class="screen grid">
    <div class="row">
      <h2>ניהול פרויקטים</h2>
      <span class="spacer" />
      <p class="status muted">הוסף פרויקטים והערות כלליות</p>
    </div>

    <section class="grid">
      <h3>פרויקט חדש</h3>
      <div class="row">
        <input
          v-model="newProject.name"
          data-testid="add-project-name"
          placeholder="שם פרויקט"
          aria-label="שם פרויקט"
        />
        <input
          v-model="newProject.notes"
          data-testid="add-project-notes"
          placeholder="הערות לפרויקט"
          aria-label="הערות לפרויקט"
        />
        <button class="primary" data-testid="add-project-submit" title="הוסף פרויקט" @click="addProject">
          הוסף פרויקט
        </button>
      </div>
      <p v-if="message" class="status">{{ message }}</p>
    </section>

    <section class="grid">
      <h3>רשימת פרויקטים</h3>
      <div class="projects-grid">
        <article v-for="project in projects" :key="project.id" class="project-card">
          <template v-if="project.id && editState[project.id]">
            <p class="muted">סטטוס: {{ project.isPaused ? 'מושהה' : 'פעיל' }}</p>
            <input
              :value="editState[project.id]?.name ?? ''"
              aria-label="שם פרויקט לעריכה"
              @input="onEditName(project.id, ($event.target as HTMLInputElement).value)"
            />
            <textarea
              :value="editState[project.id]?.notes ?? ''"
              rows="3"
              aria-label="הערות פרויקט לעריכה"
              @input="onEditNotes(project.id, ($event.target as HTMLTextAreaElement).value)"
            />
            <div class="row project-actions">
              <button
                v-if="isProjectDirty(project.id)"
                class="icon-btn primary"
                :aria-label="`שמור פרויקט ${project.name}`"
                title="שמור"
                @click="saveProject(project.id)"
              >
                ✓
              </button>
              <span class="spacer" />
              <div class="row project-actions-left">
                <button
                  class="icon-btn secondary"
                  :aria-label="project.isPaused ? `בטל השהיה עבור ${project.name}` : `השהה את ${project.name}`"
                  :title="project.isPaused ? 'בטל השהיה' : 'השהה'"
                  @click="togglePaused(project.id, project.isPaused)"
                >
                  <i :class="project.isPaused ? 'fa-solid fa-play' : 'fa-solid fa-pause'" aria-hidden="true"></i>
                </button>
                <button
                  class="icon-btn warn"
                  :aria-label="`מחק פרויקט ${project.name}`"
                  title="מחק פרויקט"
                  @click="removeProject(project.id)"
                >
                  <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          </template>
        </article>
      </div>
    </section>
  </section>
</template>
