<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useDagStore } from '@/stores/dag'
import { generateFlowSkeleton, buildSequenceDsl, buildActivityDsl, toParticipantId, parseFlowSteps, findMissingLandscapeRelations, findUnknownParticipants } from '@/utils/sequenceDslGenerator'
import MermaidDiagram from '@/components/MermaidDiagram.vue'
import DslEditor from '@/components/DslEditor.vue'
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import SelectButton from 'primevue/selectbutton'
import ToggleSwitch from 'primevue/toggleswitch'
import Splitter from 'primevue/splitter'
import SplitterPanel from 'primevue/splitterpanel'
import mermaid from 'mermaid'
import { inlineSvgStyles, injectHtmlLabelsFalse } from '@/utils/svgInliner'
import { exportFlowToDrawio } from '@/utils/drawioExporter'

const route = useRoute()
const store = useDagStore()

const dag = computed(() => store.getDag(route.params.id as string))

// Selected flow
const selectedFlowId = ref<string | null>(null)
const selectedFlow = computed(() =>
  dag.value?.applicationFlows.find((f) => f.id === selectedFlowId.value) ?? null,
)

// DSL local copy to drive the editor
const editorDsl = ref('')

// --- Validation (syntax only for sequence diagrams) ---
const syntaxError = ref<string | null>(null)
const isValidating = ref(false)

// Mode de visualisation du diagramme (affecte tous les flows)
// Valeurs initiales lues depuis le store (persistance entre recharges)
type DiagramMode = 'sequence' | 'activity'
const diagramModeOptions = [
  { label: 'Sequence', value: 'sequence' },
  { label: 'Activity', value: 'activity' },
]

function allCategoryIds() { return new Set(dag.value?.categories.map((c) => c.id) ?? []) }

const fv = dag.value?.flowsView ?? {}
const diagramMode       = ref<DiagramMode>(fv.diagramMode    ?? 'sequence')
const useElkActivity    = ref<boolean>    (fv.useElk          ?? true)
const showReturnArrows  = ref<boolean>    (fv.showReturns     ?? false)
const activitySubgraphs = ref<Set<string>>(
  fv.subgraphCategoryIds ? new Set(fv.subgraphCategoryIds) : allCategoryIds(),
)

function toggleActivitySubgraph(categoryId: string, checked: boolean) {
  const next = new Set(activitySubgraphs.value)
  checked ? next.add(categoryId) : next.delete(categoryId)
  activitySubgraphs.value = next
}

// Persiste les options dans le store à chaque changement
watch(
  [diagramMode, useElkActivity, showReturnArrows, activitySubgraphs],
  () => {
    if (!dag.value) return
    store.updateFlowsView(dag.value.id, {
      diagramMode:         diagramMode.value,
      useElk:              useElkActivity.value,
      showReturns:         showReturnArrows.value,
      subgraphCategoryIds: [...activitySubgraphs.value],
    })
  },
)

// Catégories qui ont au moins un participant dans le flow courant
const activeCategoryIds = computed(() => {
  if (!dag.value || !editorDsl.value.trim()) return new Set<string>()
  const ANY_ARROW = /^([a-zA-Z_]\w*)\s*(?:->>|-->>|-x|->|-->)\S*\s*([a-zA-Z_]\w*)/
  const ids = new Set<string>()
  for (const raw of editorDsl.value.split('\n')) {
    const m = raw.trim().match(ANY_ARROW)
    if (!m) continue
    for (const pid of [m[1], m[2]]) {
      const comp = dag.value!.components.find((c) => toParticipantId(c.name) === pid)
      if (comp) ids.add(comp.categoryId)
    }
  }
  return ids
})

// DSL envoyé à Mermaid selon le mode de visualisation
const renderedDsl = computed(() => {
  if (!dag.value || !editorDsl.value.trim()) return ''
  if (diagramMode.value === 'activity')
    return buildActivityDsl(editorDsl.value, dag.value, useElkActivity.value, activitySubgraphs.value, showReturnArrows.value)
  return buildSequenceDsl(editorDsl.value, dag.value)
})

// Sélectionne le premier flow au chargement si aucun n'est sélectionné
if (!selectedFlowId.value && dag.value?.applicationFlows.length) {
  selectedFlowId.value = dag.value.applicationFlows[0]?.id ?? null
}

watch(selectedFlow, (flow) => {
  editorDsl.value = flow?.mermaidDsl ?? ''
  syntaxError.value = null
  if (!flow || !dag.value) return
  // Migration : anciens flows sans steps — on parse le DSL une fois au chargement
  if (flow.mermaidDsl?.trim() && flow.steps.length === 0) {
    store.saveFlowSteps(dag.value.id, flow.id, parseFlowSteps(flow.mermaidDsl, dag.value))
  }
  runValidation(buildSequenceDsl(flow.mermaidDsl ?? '', dag.value))
}, { immediate: true })

// Autocomplete: participant IDs derived from component names
const completionNames = computed(() =>
  (dag.value?.components ?? [])
    .filter((c) => c.name.trim() !== '')
    .map((c) => toParticipantId(c.name)),
)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

async function runValidation(code: string) {
  if (!code.trim()) { syntaxError.value = null; return }
  isValidating.value = true
  syntaxError.value = null
  try {
    await mermaid.parse(code)
  } catch (e) {
    const raw = e instanceof Error ? e.message : 'Invalid syntax'
    syntaxError.value = raw.replace(/^Syntax error in text\s*\nmermaid version [\d.]+\s*\n?/i, '').trim() || 'Invalid syntax'
  }
  isValidating.value = false
}

function onDslChange(value: string) {
  editorDsl.value = value
  if (!selectedFlow.value || !dag.value) return
  store.updateFlow(dag.value.id, selectedFlow.value.id, { mermaidDsl: value })
  // Mise à jour immédiate des steps structurés (source de vérité)
  store.saveFlowSteps(dag.value.id, selectedFlow.value.id, parseFlowSteps(value, dag.value))
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => runValidation(buildSequenceDsl(value, dag.value!)), 400)
}

const validationStatus = computed(() => {
  if (isValidating.value) return 'validating'
  if (syntaxError.value)  return 'syntax-error'
  return 'valid'
})

// Relations used in this flow but absent from the landscape
// When autosync is on, flow relations are already included in the diagram — no warning needed
const missingRelations = computed(() => {
  if (!dag.value || !selectedFlow.value) return []
  if (dag.value.landscape.autoSync) return []
  return findMissingLandscapeRelations(selectedFlow.value, dag.value)
})

const unknownParticipants = computed(() => {
  if (!dag.value || !editorDsl.value.trim()) return []
  return findUnknownParticipants(editorDsl.value, dag.value)
})

const landscapeAutoSync = computed(() => dag.value?.landscape.autoSync === true)

function addToLandscape() {
  if (!dag.value) return
  for (const rel of missingRelations.value) {
    store.addRelation(dag.value.id, rel.fromCompId, rel.toCompId)
  }
}

// --- Flow CRUD ---
function addFlow() {
  if (!dag.value) return
  const flow = store.addFlow(dag.value.id, 'New flow', '', generateFlowSkeleton())
  selectedFlowId.value = flow.id
}

function deleteFlow(flowId: string) {
  if (!dag.value) return
  store.deleteFlow(dag.value.id, flowId)
  if (selectedFlowId.value === flowId) {
    const remaining = dag.value.applicationFlows.filter((f) => f.id !== flowId)
    selectedFlowId.value = remaining[0]?.id ?? null
  }
}

function updateName(e: Event) {
  const value = (e.target as HTMLElement).innerText.trim()
  if (selectedFlow.value && dag.value) store.updateFlow(dag.value.id, selectedFlow.value.id, { name: value })
}

function updateDescription(e: Event) {
  const value = (e.target as HTMLElement).innerText.trim()
  if (selectedFlow.value && dag.value) store.updateFlow(dag.value.id, selectedFlow.value.id, { description: value })
}

// ─── Export ──────────────────────────────────────────────────────────────────

const exportMenu = ref<InstanceType<typeof Menu>>()
const exportMenuItems = computed(() => {
  const items: object[] = [
    {
      label: 'SVG',
      items: [
        { label: 'SVG — raw', icon: 'pi pi-image', command: () => exportSvg(false) },
        { label: 'SVG — pptx-ready (inlined styles)', icon: 'pi pi-file-export', command: () => exportSvg(true) },
      ],
    },
    {
      label: 'Mermaid',
      items: [
        { label: 'Export DSL (.mmd)', icon: 'pi pi-code', command: () => exportMermaid() },
        { label: 'Copy to clipboard', icon: 'pi pi-copy', command: () => copyMermaid() },
        {
          label: 'draw.io tip: Extras › Edit Diagram › paste',
          icon: 'pi pi-info-circle',
          disabled: true,
        },
      ],
    },
  ]

  if (diagramMode.value === 'activity') {
    items.push({
      label: 'draw.io',
      items: [
        {
          label: 'draw.io (.drawio)',
          icon: 'pi pi-share-alt',
          command: () => {
            if (!dag.value || !selectedFlow.value) return
            exportFlowToDrawio(
              dag.value,
              selectedFlow.value,
              activitySubgraphs.value,
              showReturnArrows.value,
            )
          },
        },
      ],
    })
  }

  return items
})

function flowBaseName(): string {
  if (!dag.value || !selectedFlow.value) return 'export'
  const dagName  = dag.value.name.replace(/[^\w\s-]/g, '').trim()
  const flowName = selectedFlow.value.name.replace(/[^\w\s-]/g, '').trim()
  const mode     = diagramMode.value === 'activity' ? '-activity' : '-sequence'
  return `${dagName}-${flowName}${mode}`
}

async function exportSvg(pptxMode: boolean) {
  if (!dag.value || !selectedFlow.value || !renderedDsl.value.trim()) return
  const dsl = pptxMode ? injectHtmlLabelsFalse(renderedDsl.value) : renderedDsl.value
  const id  = `export-flow-${Date.now()}`
  const { svg } = await mermaid.render(id, dsl)
  const processed = pptxMode ? inlineSvgStyles(svg) : svg
  const blob = new Blob([processed], { type: 'image/svg+xml' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${flowBaseName()}${pptxMode ? '-pptx' : ''}.svg`
  a.click()
  URL.revokeObjectURL(url)
}

function exportMermaid() {
  if (!renderedDsl.value.trim()) return
  const blob = new Blob([renderedDsl.value], { type: 'text/plain' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${flowBaseName()}.mmd`
  a.click()
  URL.revokeObjectURL(url)
}

async function copyMermaid() {
  if (!renderedDsl.value.trim()) return
  await navigator.clipboard.writeText(renderedDsl.value)
}
</script>

<template>
  <div v-if="dag" class="flows">

    <!-- Left: flow list -->
    <div class="flow-list">
      <div class="flow-list-header">
        <span class="flow-list-title">Flows</span>
        <Button icon="pi pi-plus" size="small" text @click="addFlow" />
      </div>

      <div
        v-for="flow in dag.applicationFlows"
        :key="flow.id"
        class="flow-item"
        :class="{ active: flow.id === selectedFlowId }"
        @click="selectedFlowId = flow.id"
      >
        <span class="flow-name">{{ flow.name }}</span>
        <Button
          icon="pi pi-times"
          size="small"
          text
          severity="danger"
          class="flow-delete"
          @click.stop="deleteFlow(flow.id)"
        />
      </div>

      <p v-if="dag.applicationFlows.length === 0" class="empty">No flows yet.</p>
    </div>

    <!-- Right: selected flow editor -->
    <div v-if="selectedFlow" class="flow-editor">

      <div class="flow-meta">
        <div
          class="flow-title"
          contenteditable="true"
          spellcheck="false"
          @blur="updateName"
        >{{ selectedFlow.name }}</div>
        <div
          class="flow-description"
          contenteditable="true"
          spellcheck="false"
          data-placeholder="Add a description…"
          @blur="updateDescription"
        >{{ selectedFlow.description }}</div>
      </div>

      <Splitter class="flow-splitter" state-key="flows-splitter" state-storage="local">
        <SplitterPanel :size="40" :min-size="20" class="dsl-panel">

          <DslEditor
            :model-value="editorDsl"
            :completion-names="completionNames"
            :validation-status="validationStatus"
            @update:model-value="onDslChange"
          />

          <div v-if="syntaxError" class="issue-list error-list">
            <div class="issue-item">
              <i class="pi pi-times-circle" />
              <span>{{ syntaxError }}</span>
            </div>
          </div>

          <!-- Unknown participants -->
          <div v-if="unknownParticipants.length > 0" class="issue-list error-list">
            <div class="issue-item">
              <i class="pi pi-question-circle" />
              <span>Unknown participants (not in model): <strong>{{ unknownParticipants.join(', ') }}</strong></span>
            </div>
          </div>

          <!-- Auto-sync mode: all relations are live in landscape -->
          <div v-if="landscapeAutoSync && dag.applicationFlows.length > 0 && !syntaxError && unknownParticipants.length === 0" class="issue-list synced-list">
            <div class="issue-item">
              <i class="pi pi-check-circle" />
              <span>Relations synced with landscape (auto-sync mode)</span>
            </div>
          </div>

          <!-- Manual/guided mode: show missing relations (only when all participants are known) -->
          <div v-else-if="!landscapeAutoSync && missingRelations.length > 0 && unknownParticipants.length === 0" class="issue-list warning-list">
            <div class="warning-header">
              <span><i class="pi pi-exclamation-triangle" /> {{ missingRelations.length }} relation(s) not in landscape</span>
              <Button
                label="Add to landscape"
                icon="pi pi-plus"
                size="small"
                severity="warn"
                text
                @click="addToLandscape"
              />
            </div>
            <div v-for="rel in missingRelations" :key="`${rel.fromCompId}-${rel.toCompId}`" class="issue-item">
              <span>{{ rel.fromName }} → {{ rel.toName }}</span>
            </div>
          </div>

        </SplitterPanel>

        <SplitterPanel :size="60" :min-size="30" class="diagram-panel">
          <div class="diagram-toolbar">
            <SelectButton
              v-model="diagramMode"
              :options="diagramModeOptions"
              option-label="label"
              option-value="value"
              size="small"
            />
            <Button
              icon="pi pi-download"
              size="small"
              severity="secondary"
              text
              :disabled="!renderedDsl"
              title="Export SVG"
              @click="exportMenu?.toggle($event)"
            />
            <Menu ref="exportMenu" :model="exportMenuItems" popup />
            <template v-if="diagramMode === 'activity'">
              <div class="elk-toggle">
                <ToggleSwitch v-model="useElkActivity" input-id="elk-activity-switch" />
                <label for="elk-activity-switch">ELK</label>
              </div>
              <div class="elk-toggle">
                <ToggleSwitch v-model="showReturnArrows" input-id="returns-switch" />
                <label for="returns-switch">Returns</label>
              </div>
              <div class="subgraph-options">
                <span class="subgraph-label">Subgraphs:</span>
                <label
                  v-for="cat in dag.categories.slice().sort((a, b) => a.order - b.order)"
                  v-show="activeCategoryIds.has(cat.id)"
                  :key="cat.id"
                  class="toggle-label"
                >
                  <input
                    type="checkbox"
                    :checked="activitySubgraphs.has(cat.id)"
                    @change="toggleActivitySubgraph(cat.id, ($event.target as HTMLInputElement).checked)"
                  />
                  {{ cat.name }}
                </label>
              </div>
            </template>
          </div>
          <MermaidDiagram :code="renderedDsl" />
        </SplitterPanel>
      </Splitter>
    </div>

    <!-- Empty state (no flow selected) -->
    <div v-else class="no-selection">
      <p>Select a flow or <a href="#" @click.prevent="addFlow">create a new one</a>.</p>
    </div>

  </div>
</template>

<style scoped>
.flows {
  display: flex;
  height: 100%;
  overflow: hidden;
}

/* Flow list */
.flow-list {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--p-content-border-color);
  overflow-y: auto;
}

.flow-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem 0.5rem;
  border-bottom: 1px solid var(--p-content-border-color);
  flex-shrink: 0;
}

.flow-list-title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
}

.flow-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.5rem 0.5rem 1rem;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: background 0.15s;
}

.flow-item:hover { background: var(--p-surface-100, #f4f4f5); }

.flow-item.active {
  background: var(--p-primary-50, #eff6ff);
  border-left-color: var(--p-primary-500, #3b82f6);
}

.flow-name {
  font-size: 0.875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.flow-delete { opacity: 0; transition: opacity 0.15s; flex-shrink: 0; }
.flow-item:hover .flow-delete { opacity: 1; }

.empty {
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
  font-style: italic;
  padding: 0.75rem 1rem;
}

/* Editor area */
.flow-editor {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.flow-meta {
  padding: 0.6rem 1.25rem;
  border-bottom: 1px solid var(--p-content-border-color);
  flex-shrink: 0;
}

.flow-title {
  font-size: 1rem;
  font-weight: 600;
  outline: none;
  border-radius: 4px;
  padding: 2px 4px;
  margin-left: -4px;
}

.flow-title:focus { background: var(--p-surface-100); }

.flow-description {
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
  margin-top: 0.15rem;
  outline: none;
  border-radius: 4px;
  padding: 2px 4px;
  margin-left: -4px;
  min-height: 1.4em;
}

.flow-description:empty::before {
  content: attr(data-placeholder);
  opacity: 0.5;
}

.flow-description:focus { background: var(--p-surface-100); color: var(--p-text-color); }

/* Splitter */
.flow-splitter {
  flex: 1;
  min-height: 0;
  border: none !important;
}

.dsl-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0 !important;
}

.diagram-panel {
  overflow: auto;
  padding: 0 !important;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.diagram-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 0.5rem;
  border-bottom: 1px solid var(--p-content-border-color);
  flex-shrink: 0;
}

.elk-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.875rem;
}

.subgraph-options {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  font-size: 0.875rem;
}

.subgraph-label { font-weight: 600; }

.toggle-label {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  cursor: pointer;
}

.diagram-panel :deep(.mermaid-wrapper) {
  flex: 1;
  padding: 1rem;
  overflow: auto;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.issue-list {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.78rem;
  font-family: monospace;
  flex-shrink: 0;
  max-height: 120px;
  overflow-y: auto;
  padding: 0.5rem 0.75rem;
}

.error-list   { background: #fef2f2; border-top: 1px solid #fca5a5; color: #dc2626; }
.warning-list { background: #fffbeb; border-top: 1px solid #fcd34d; color: #92400e; }
.synced-list  { background: #f0fdf4; border-top: 1px solid #86efac; color: #166534; }

.warning-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  margin-bottom: 0.2rem;
}

.issue-item { display: flex; gap: 0.5rem; align-items: flex-start; }

/* Empty state */
.no-selection {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--p-text-muted-color);
  font-size: 0.9rem;
}

.no-selection a { color: var(--p-primary-500); }
</style>
