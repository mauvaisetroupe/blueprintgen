<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDagStore } from '@/stores/dag'
import { useRouter } from 'vue-router'
import { importDagFromYaml } from '@/utils/dagYamlImporter'
import type { Dag } from '@/types/dag'
import { allCategories } from '@/types/dag'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Menu from 'primevue/menu'
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

// --- Open (JSON / YAML) ---
const openError      = ref<string | null>(null)
const jsonFileInput  = ref<HTMLInputElement>()
const yamlFileInput  = ref<HTMLInputElement>()
const openMenu       = ref<InstanceType<typeof Menu>>()

const openMenuItems = [
  {
    label: 'Open JSON (.json)',
    icon: 'pi pi-file',
    command: () => { openError.value = null; jsonFileInput.value?.click() },
  },
  {
    label: 'Open YAML (.yaml)',
    icon: 'pi pi-file-edit',
    command: () => { openError.value = null; yamlFileInput.value?.click() },
  },
]

async function handleOpenFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    let dagData: Dag
    if (file.name.endsWith('.yaml') || file.name.endsWith('.yml')) {
      dagData = importDagFromYaml(text)
    } else {
      const data = JSON.parse(text) as Dag
      if (!data.name || !Array.isArray(data.components)) {
        throw new Error('Fichier JSON invalide — ce n\'est pas un DAG blueprintgen.')
      }
      dagData = data
    }
    const dag = store.openDag(dagData)
    router.push(`/dag/${dag.id}`)
  } catch (err) {
    openError.value = err instanceof Error ? err.message : 'Erreur de lecture du fichier.'
  }
  ;(e.target as HTMLInputElement).value = ''
}

</script>

<template>
  <div class="dag-list">
    <ConfirmDialog />

    <div class="list-header">
      <h1>DAGs</h1>
      <div class="header-actions">
        <Button label="Open" icon="pi pi-folder-open" severity="secondary" @click="openMenu?.toggle($event)" />
        <Menu ref="openMenu" :model="openMenuItems" popup />
<Button label="New DAG" icon="pi pi-plus" @click="router.push('/dag/new')" />
      </div>
      <input ref="jsonFileInput" type="file" accept=".json" style="display:none" @change="handleOpenFile" />
      <input ref="yamlFileInput" type="file" accept=".yaml,.yml" style="display:none" @change="handleOpenFile" />
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
        @click="router.push(`/dag/${dag.id}/components`)"
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
            {{ dag.components.length }} component(s) · {{ allCategories(dag).length }} categories
          </p>
        </template>
      </Card>
    </div>

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

</style>
