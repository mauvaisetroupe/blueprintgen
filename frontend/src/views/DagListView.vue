<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDagStore } from '@/stores/dag'
import { useRouter } from 'vue-router'
import { parseImportDsl } from '@/utils/importParser'
import { parseDsl } from '@/utils/dslParser'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import ConfirmDialog from 'primevue/confirmdialog'
import { useConfirm } from 'primevue/useconfirm'

const store = useDagStore()
const router = useRouter()
const confirm = useConfirm()

// --- Delete ---
function deleteDag(dagId: string, dagName: string, event: MouseEvent) {
  event.stopPropagation()
  confirm.require({
    message: `Delete "${dagName}"? This cannot be undone.`,
    header: 'Delete DAG',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptSeverity: 'danger',
    accept: () => store.deleteDag(dagId),
  })
}

// --- Import ---
const importOpen = ref(false)
const importName = ref('')
const importDsl = ref('')

const importPreview = computed(() => {
  const raw = importDsl.value.trim()
  if (!raw) return null
  return parseImportDsl(raw)
})

function openImport() {
  importName.value = ''
  importDsl.value = ''
  importOpen.value = true
}

function executeImport() {
  if (!importName.value.trim() || !importPreview.value) return

  // Create the DAG
  const dag = store.createDag(importName.value.trim(), '')

  // Sync landscape components from the flowchart body
  const { landscapeBody, flows } = importPreview.value
  if (landscapeBody) {
    const parsed = parseDsl('flowchart TB\n' + landscapeBody)
    store.syncFromDsl(dag.id, parsed)
  }

  // Save the landscape DSL body so the landscape view can display it
  if (landscapeBody) {
    store.saveLandscapeDsl(dag.id, landscapeBody)
  }

  // Create application flows
  for (const flow of flows) {
    store.addFlow(dag.id, flow.name, '', flow.mermaidDsl)
  }

  importOpen.value = false
  router.push(`/dag/${dag.id}`)
}
</script>

<template>
  <div class="dag-list">
    <ConfirmDialog />

    <div class="list-header">
      <h1>DAGs</h1>
      <div class="header-actions">
        <Button label="Import" icon="pi pi-upload" severity="secondary" @click="openImport" />
        <Button label="New DAG" icon="pi pi-plus" @click="router.push('/dag/new')" />
      </div>
    </div>

    <div v-if="store.dags.length === 0" class="empty">
      <p>No DAG yet. Create your first one.</p>
    </div>

    <div class="dag-grid">
      <Card
        v-for="dag in store.dags"
        :key="dag.id"
        class="dag-card"
        @click="router.push(`/dag/${dag.id}`)"
      >
        <template #title>
          <div class="card-title-row">
            <span>{{ dag.name }}</span>
            <Button
              icon="pi pi-trash"
              size="small"
              text
              severity="danger"
              class="delete-btn"
              @click="deleteDag(dag.id, dag.name, $event)"
            />
          </div>
        </template>
        <template #content>
          <p class="dag-desc">{{ dag.description || '—' }}</p>
          <p class="dag-meta">
            {{ dag.components.length }} component(s) · {{ dag.categories.length }} categories
          </p>
        </template>
      </Card>
    </div>

    <!-- Import dialog -->
    <Dialog
      v-model:visible="importOpen"
      modal
      header="Import DAG from DSL"
      style="width: min(860px, 95vw)"
    >
      <div class="import-body">
        <div class="import-name">
          <label for="import-name">DAG name</label>
          <InputText
            id="import-name"
            v-model="importName"
            placeholder="My application"
            autofocus
            style="width: 100%"
          />
        </div>

        <label class="dsl-label">DSL <span class="hint">(flowchart landscape + <code>%%</code> flow sections)</span></label>
        <textarea
          v-model="importDsl"
          class="dsl-textarea"
          placeholder="flowchart TB&#10;subgraph Users&#10;  internet_user[&quot;Internet user&quot;]&#10;end&#10;&#10;%% Browse catalog&#10;internet_user -&gt;&gt; webfrontend: Browse catalog&#10;..."
          spellcheck="false"
        />

        <!-- Preview -->
        <div v-if="importPreview" class="preview">
          <div class="preview-item">
            <i class="pi pi-sitemap" />
            <span>
              <strong>{{ parseDsl('flowchart TB\n' + importPreview.landscapeBody).nodes.length }}</strong>
              component(s) in
              <strong>{{ parseDsl('flowchart TB\n' + importPreview.landscapeBody).subgraphs.length }}</strong>
              categor{{ parseDsl('flowchart TB\n' + importPreview.landscapeBody).subgraphs.length === 1 ? 'y' : 'ies' }}
            </span>
          </div>
          <div class="preview-item">
            <i class="pi pi-list" />
            <span>
              <strong>{{ importPreview.flows.length }}</strong> flow(s) :
              {{ importPreview.flows.map(f => f.name).join(' · ') || '—' }}
            </span>
          </div>
        </div>
      </div>

      <template #footer>
        <Button label="Cancel" severity="secondary" text @click="importOpen = false" />
        <Button
          label="Import"
          icon="pi pi-check"
          :disabled="!importName.trim() || !importPreview || (!importPreview.landscapeBody && importPreview.flows.length === 0)"
          @click="executeImport"
        />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.dag-list {
  padding: 2rem;
  max-width: 960px;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
}

.list-header h1 { margin: 0; }

.header-actions {
  display: flex;
  gap: 0.5rem;
}

.dag-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.dag-card { cursor: pointer; }

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.delete-btn { opacity: 0; transition: opacity 0.15s; flex-shrink: 0; }
.dag-card:hover .delete-btn { opacity: 1; }

.dag-desc { color: var(--p-text-muted-color); font-size: 0.875rem; margin-bottom: 0.5rem; }
.dag-meta { font-size: 0.8rem; color: var(--p-text-muted-color); }

.empty { color: var(--p-text-muted-color); font-style: italic; }

/* Import dialog */
.import-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.import-name {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.import-name label { font-size: 0.875rem; font-weight: 600; }

.dsl-label {
  font-size: 0.875rem;
  font-weight: 600;
}

.hint { font-weight: 400; color: var(--p-text-muted-color); font-size: 0.8rem; }
.hint code { font-family: monospace; }

.dsl-textarea {
  width: 100%;
  height: 300px;
  font-family: monospace;
  font-size: 0.8rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 6px;
  resize: vertical;
  outline: none;
  background: var(--p-surface-0);
  color: var(--p-text-color);
  box-sizing: border-box;
}

.dsl-textarea:focus { border-color: var(--p-primary-400); }

.preview {
  background: var(--p-surface-50, #fafafa);
  border: 1px solid var(--p-content-border-color);
  border-radius: 6px;
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.preview-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--p-text-color);
}

.preview-item .pi { color: var(--p-primary-500); }
</style>
