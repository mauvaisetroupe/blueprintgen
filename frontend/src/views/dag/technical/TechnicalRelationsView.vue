<script setup lang="ts">
import { computed, inject, ref, watch, type Ref } from 'vue'
import { useRoute } from 'vue-router'
import { useDagStore } from '@/stores/dag'
import { allNetworkZones } from '@/types/dag'
import {
  generateTechnicalLandscapeDsl,
  generateTechnicalLandscapeCommentHeader,
  generateTechnicalRelationsBody,
  parseTechnicalRelationsBody,
  validateTechnicalRelationsBody,
  getCompletionNames,
} from '@/utils/technicalLandscapeDslGenerator'
import DslEditor from '@/components/DslEditor.vue'
import Button from 'primevue/button'
import mermaid from 'mermaid'

const route = useRoute()
const store = useDagStore()

const dag = computed(() => store.getDag(route.params.id as string))
const tl  = computed(() => dag.value?.technicalLandscape)


// --- Toggle ELK ---
const useElk = ref(dag.value?.technicalLandscape.useElk ?? false)
watch(useElk, (val) => { if (dag.value) store.setTechnicalLandscapeUseElk(dag.value.id, val) })

// ── DSL edit mode (injecté depuis DagDetailLayout) ────────────────────────────
const dslEdit = inject<Ref<boolean>>('dslEdit')!

// Corps éditable des relations : uniquement les relations multi-instance
const localRelationsBody = ref(
  dag.value ? generateTechnicalRelationsBody(dag.value) : '',
)

watch(dslEdit, (mode) => {
  if (mode && dag.value) {
    localRelationsBody.value = generateTechnicalRelationsBody(dag.value)
    runValidation()
  }
})

// Header read-only : commentaires (node IDs)
const dslRelationsReadOnlyHeader = computed(() => {
  if (!dag.value) return ''
  const parts: string[] = []
  const comments = generateTechnicalLandscapeCommentHeader(dag.value)
  if (comments.trim()) parts.push(comments)
  return parts.join('\n')
})


// Node IDs pour l'autocomplétion dans l'éditeur DSL
const completionNames = computed(() => {
  return getCompletionNames(dag?.value)
})

// Y a-t-il au moins une relation avec un côté multi-instance ?

// Validation DSL (mode éditeur)
const syntaxError = ref<string | null>(null)
const semanticErrors = ref<string[]>([])
const isValidating = ref(false)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// DSL actif pour le rendu Mermaid
const activeDsl = computed(() => {
  if (!dag.value) return ''
  return generateTechnicalLandscapeDsl(dag.value)
})

async function runValidation() {
  if (!dslEdit?.value || !dag.value) return
  const fullCode = activeDsl.value
  if (!fullCode.trim()) { syntaxError.value = null; semanticErrors.value = []; return }
  isValidating.value = true
  syntaxError.value  = null
  try {
    await mermaid.parse(fullCode)
  } catch (e) {
    const raw = e instanceof Error ? e.message : 'Invalid syntax'
    syntaxError.value = raw.replace(/^Syntax error in text\s*\nmermaid version [\d.]+\s*\n?/i, '').trim() || 'Invalid syntax'
  }
  semanticErrors.value = syntaxError.value ? [] : validateTechnicalRelationsBody(localRelationsBody.value, dag.value)
  isValidating.value = false
}

// Function call when codemirror content change
function onRelationsChange(value: string) {
  localRelationsBody.value = value
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    if (!dag.value) return
    const edited = parseTechnicalRelationsBody(value, dag.value)
    store.replaceTechnicalRelations(dag.value.id, edited)
    runValidation()
  }, 400)
}

// --- Zones ---
const zones = computed(() => tl.value ? allNetworkZones(tl.value) : [])

// --- Instances par composant ---
const instancesByComponent = computed(() => {
  const m = new Map<string, string[]>()
  tl.value?.instances.forEach((i) => {
    if (!m.has(i.componentId)) m.set(i.componentId, [])
    m.get(i.componentId)!.push(i.networkZoneId)
  })
  return m
})

function compName(componentId: string): string {
  return [...(dag.value?.components ?? []), ...(dag.value?.technicalComponents ?? [])]
    .find((c) => c.id === componentId)?.name ?? componentId
}

function instZoneName(instanceId: string): string {
  const inst = tl.value?.instances.find((i) => i.id === instanceId)
  if (!inst) return ''
  return zones.value.find((z) => z.id === inst.networkZoneId)?.name ?? ''
}

const editableRelations = computed(() => {
  if (!tl.value || !dag.value) return []
  return tl.value.technicalRelations
})

// Liste de toutes les instances avec leur label "Composant [Zone]" pour les selects
const allInstances = computed(() => {
  if (!tl.value || !dag.value) return []
  const allComps = [...dag.value.components, ...(dag.value.technicalComponents ?? [])]
  return tl.value.instances.map((inst) => {
    const comp = allComps.find((c) => c.id === inst.componentId)
    const zone = zones.value.find((z) => z.id === inst.networkZoneId)
    return { id: inst.id, label: `${comp?.name ?? '?'} [${zone?.name ?? '?'}]` }
  })
})

interface AddRelState { fromInstanceId: string; toInstanceId: string; protocol: string }
const addingRel = ref<AddRelState | null>(null)

function startAddRel() {
  const insts = allInstances.value
  addingRel.value = { fromInstanceId: insts[0]?.id ?? '', toInstanceId: insts[1]?.id ?? insts[0]?.id ?? '', protocol: '' }
}

function submitAddRel() {
  if (!dag.value || !addingRel.value) return
  const { fromInstanceId, toInstanceId, protocol } = addingRel.value
  const fromInst = tl.value?.instances.find((i) => i.id === fromInstanceId)
  const toInst   = tl.value?.instances.find((i) => i.id === toInstanceId)
  if (!fromInst || !toInst) return
  store.addTechnicalRelation(dag.value.id, fromInst.componentId, toInst.componentId, fromInstanceId, toInstanceId, protocol.trim() || undefined)
  addingRel.value = null
}
</script>

<template>
  <div v-if="dag && tl" class="tech-dsl-panel">
      <!-- Mode DSL -->
      <template v-if="dslEdit">
        <DslEditor
          :model-value="localRelationsBody"
          :read-only-header="dslRelationsReadOnlyHeader"
          :completion-names="completionNames"
          :validation-status="syntaxError ? 'syntax-error' : semanticErrors.length > 0 ? 'warnings' : isValidating ? 'validating' : 'idle'"
          @update:model-value="onRelationsChange"
        />

        <div v-if="syntaxError" class="dsl-error-bar">
          <i class="pi pi-times-circle" /> {{ syntaxError }}
        </div>
        <div v-if="semanticErrors.length > 0 && !syntaxError" class="dsl-warning-bar">
          <div v-for="(err, i) in semanticErrors" :key="i">
            <i class="pi pi-exclamation-triangle" /> {{ err }}
          </div>
        </div>
      </template>

      <!-- Mode guidé -->
      <template v-else>
        <p v-if="editableRelations.length === 0" class="empty-state">
          No editable relations yet. Assign components to zones, then add relations below.
        </p>

        <table v-if="editableRelations.length > 0" class="rel-table">
          <thead>
            <tr>
              <th>From</th>
              <th class="col-zone">Zone</th>
              <th class="col-arrow"></th>
              <th>To</th>
              <th class="col-zone">Zone</th>
              <th class="col-proto">Protocol</th>
              <th class="col-action"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="tr in editableRelations" :key="tr.id">
              <td class="cell-zone-pill"><span class="zone-pill">{{ instZoneName(tr.fromInstanceId) }}</span></td>
              <td class="cell-name">{{ compName(tr.fromComponentId) }}</td>
              <td class="col-arrow">→</td>
              <td class="cell-zone-pill" ><span class="zone-pill">{{ instZoneName(tr.toInstanceId) }}</span></td>
              <td class="cell-name">{{ compName(tr.toComponentId) }}</td>
              <td>
                <input class="cell-input protocol-input" :value="tr.protocol ?? ''" placeholder="Protocol"
                  @change="store.updateTechnicalRelation(dag!.id, tr.id, { protocol: ($event.target as HTMLInputElement).value.trim() || undefined })" />
              </td>
              <td>
                <Button icon="pi pi-times" size="small" text severity="danger" @click="store.deleteTechnicalRelation(dag!.id, tr.id)" />
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Formulaire d'ajout -->
        <div v-if="addingRel" class="add-rel-form">
          <select v-model="addingRel.fromInstanceId" class="inst-select">
            <option v-for="inst in allInstances" :key="inst.id" :value="inst.id">{{ inst.label }}</option>
          </select>
          <span class="rel-arrow-sm">→</span>
          <select v-model="addingRel.toInstanceId" class="inst-select">
            <option v-for="inst in allInstances" :key="inst.id" :value="inst.id">{{ inst.label }}</option>
          </select>
          <input v-model="addingRel.protocol" class="cell-input protocol-input" placeholder="Protocol"
            @keyup.enter="submitAddRel" @keyup.escape="addingRel = null" />
          <Button icon="pi pi-check" size="small" @click="submitAddRel" />
          <Button icon="pi pi-times" size="small" severity="secondary" @click="addingRel = null" />
        </div>
        <Button v-else label="Add relation" icon="pi pi-plus" size="small" text class="add-rel-btn" @click="startAddRel" />
      </template>
  </div>
</template>

<style scoped>

.tech-dsl-panel { overflow: hidden; height: 100%; display: flex; flex-direction: column; }

.dsl-error-bar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  font-family: monospace;
  padding: 0.4rem 0.75rem;
  background: #fef2f2;
  border-top: 1px solid #fca5a5;
  color: #dc2626;
  flex-shrink: 0;
  white-space: pre-wrap;
}

.dsl-warning-bar {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.78rem;
  font-family: monospace;
  padding: 0.4rem 0.75rem;
  background: #fffbeb;
  border-top: 1px solid #fcd34d;
  color: #92400e;
  flex-shrink: 0;
}

/* ── Spreadsheet ── */
.sheet { width: 100%; border-collapse: collapse; }
.sheet thead th {
  text-align: left; font-size: 0.75rem; font-weight: 600; color: var(--p-text-muted-color);
  padding: 0.3rem 0.6rem; background: var(--p-surface-50, #fafafa);
  border-bottom: 1px solid var(--p-content-border-color);
  text-transform: uppercase; letter-spacing: 0.05em;
}
.sheet tbody tr:hover { background: var(--p-surface-50, #fafafa); }
.sheet td { padding: 2px 4px; border-bottom: 1px solid var(--p-content-border-color); vertical-align: middle; }
.sheet tbody tr:last-child td { border-bottom: none; }
.col-name { width: 14%; } .col-tech { width: 14%; } .col-fw { width: 18%; } .col-constraints { width: 18%; } .col-zones { width: 36%; }
.cell-name { font-weight: 500; padding: 0.35rem 0.6rem; font-size: 0.875rem; }

.cell-input {
  width: 100%; border: none; background: transparent;
  padding: 0.35rem 0.4rem; font-size: 0.875rem; font-family: inherit;
  color: inherit; outline: none; border-radius: 4px;
}
.cell-input:focus { background: var(--p-primary-50, #eff6ff); box-shadow: inset 0 0 0 2px var(--p-primary-300, #93c5fd); }
.cell-input::placeholder { color: var(--p-text-muted-color); opacity: 0.5; }


/* ── Relations guided mode ── */
.rel-table { width: 100%; border-collapse: collapse; }
.rel-table thead th {
  text-align: left; font-size: 0.75rem; font-weight: 600; color: var(--p-text-muted-color);
  padding: 0.3rem 0.5rem; background: var(--p-surface-50, #fafafa);
  border-bottom: 1px solid var(--p-content-border-color);
  text-transform: uppercase; letter-spacing: 0.05em;
}
.rel-table tbody tr:hover { background: var(--p-surface-50, #fafafa); }
.rel-table td { padding: 3px 4px; border-bottom: 1px solid var(--p-content-border-color); vertical-align: middle; }
.rel-table tbody tr:last-child td { border-bottom: none; }
.col-zone  { width: 90px; }
.col-arrow { width: 24px; text-align: center; color: var(--p-text-muted-color); font-size: 0.85rem; }
.col-proto { width: 120px; }
.col-action { width: 32px; }

.zone-pill {
  display: inline-block;
  font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 20px;
  border: 1px solid #86efac; background: #f0fdf4; color: #064e3b;
  white-space: nowrap;
}

.cell-zone-pill {
  width: 1%;
  white-space: nowrap;
}

.protocol-input {
  width: 100%; border: 1px solid var(--p-content-border-color) !important;
  border-radius: 4px; background: var(--p-surface-0, #fff) !important;
  padding: 0.25rem 0.4rem !important; font-size: 0.8rem !important;
}
.protocol-input:focus { border-color: var(--p-primary-400, #60a5fa) !important; box-shadow: none !important; }

.add-rel-form {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.5rem 0; flex-wrap: wrap;
}
.inst-select {
  font-size: 0.8rem; font-family: inherit;
  padding: 0.25rem 0.5rem; border: 1px solid var(--p-content-border-color);
  border-radius: 4px; background: var(--p-surface-0, #fff); flex: 1; min-width: 150px;
}
.rel-arrow-sm { color: var(--p-text-muted-color); flex-shrink: 0; }
.add-rel-btn { align-self: flex-start; }

.empty-state { color: var(--p-text-muted-color); font-style: italic; font-size: 0.875rem; padding: 1rem 0; }
</style>
