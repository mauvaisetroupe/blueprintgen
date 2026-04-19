<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDagStore } from '@/stores/dag'
import { useRouter } from 'vue-router'
import { parseImportDsl } from '@/utils/importParser'
import { parseDsl } from '@/utils/dslParser'
import type { Dag } from '@/types/dag'
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
    accept: () => store.deleteDag(dagId),
  })
}

// --- Save (JSON download) ---
function saveDag(dag: Dag, event: MouseEvent) {
  event.stopPropagation()
  const json = JSON.stringify(dag, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${dag.name.replace(/[^\w\s-]/g, '').trim()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// --- Open (JSON import) ---
const openError   = ref<string | null>(null)
const jsonFileInput = ref<HTMLInputElement>()

function triggerOpen() {
  openError.value = null
  jsonFileInput.value?.click()
}

async function handleOpenFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const data = JSON.parse(text) as Dag
    if (!data.name || !Array.isArray(data.components)) {
      throw new Error('Fichier JSON invalide — ce n\'est pas un DAG blueprintgen.')
    }
    const dag = store.openDag(data)
    router.push(`/dag/${dag.id}`)
  } catch (err) {
    openError.value = err instanceof Error ? err.message : 'Erreur de lecture du fichier.'
  }
  ;(e.target as HTMLInputElement).value = ''
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
        <Button label="Open" icon="pi pi-folder-open" severity="secondary" @click="triggerOpen" />
        <Button label="Import" icon="pi pi-upload" severity="secondary" @click="openImport" />
        <Button label="New DAG" icon="pi pi-plus" @click="router.push('/dag/new')" />
      </div>
      <!-- Input file caché pour Open -->
      <input ref="jsonFileInput" type="file" accept=".json" style="display:none" @change="handleOpenFile" />
      <small v-if="openError" class="open-error">{{ openError }}</small>
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
            <div class="card-actions">
              <Button
                icon="pi pi-save"
                size="small"
                text
                severity="secondary"
                class="card-btn"
                title="Save locally"
                @click="saveDag(dag, $event)"
              />
              <Button
                icon="pi pi-trash"
                size="small"
                text
                severity="danger"
                class="card-btn"
                @click="deleteDag(dag.id, dag.name, $event)"
              />
            </div>
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

.card-actions { display: flex; gap: 0.1rem; flex-shrink: 0; }
.card-btn { opacity: 0; transition: opacity 0.15s; }
.dag-card:hover .card-btn { opacity: 1; }

.open-error {
  color: #dc2626;
  font-size: 0.8rem;
  margin-top: 0.25rem;
}

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
