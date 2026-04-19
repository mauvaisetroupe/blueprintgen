<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useDagStore } from '@/stores/dag'
import { generateLandscapeDsl, toNodeId } from '@/utils/landscapeDslGenerator'
import { collectAllFlowRelations } from '@/utils/sequenceDslGenerator'
import { validateDslAgainstModel, type DslValidationResult } from '@/utils/dslValidator'
import { inlineSvgStyles, injectHtmlLabelsFalse } from '@/utils/svgInliner'
import MermaidDiagram from '@/components/MermaidDiagram.vue'
import mermaid from 'mermaid'
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import SelectButton from 'primevue/selectbutton'
import ToggleSwitch from 'primevue/toggleswitch'
import Splitter from 'primevue/splitter'
import SplitterPanel from 'primevue/splitterpanel'
import RelationSpreadsheet from '@/components/dag/RelationSpreadsheet.vue'
import DslEditor from '@/components/DslEditor.vue'

const route = useRoute()
const store = useDagStore()

const dag = computed(() => store.getDag(route.params.id as string))

// Layout options
const useElk = ref(false)

// Read-only header: frontmatter + flowchart directive (depends on ELK toggle)
const landscapeHeader = computed(() => {
  const lines = ['---', 'config:', '    theme: neutral']
  if (useElk.value) lines.push('    layout: elk')
  lines.push('---', '', 'flowchart TB')
  return lines.join('\n')
})

// Generated DSL (guided mode — full DSL including header)
const generatedDsl = computed(() => {
  if (!dag.value) return ''
  return generateLandscapeDsl(dag.value, { useElk: useElk.value })
})

// Strips the header (frontmatter + flowchart directive) from a full DSL, returning the body only
function extractBody(fullDsl: string): string {
  const match = fullDsl.match(/(?:flowchart|graph)\s+\w+\r?\n?([\s\S]*)$/)
  return match ? match[1] : fullDsl
}

// Editor mode — persisted in store
const editMode = ref<'guided' | 'manual' | 'autosync'>(dag.value?.landscape.mode ?? 'guided')
const modeOptions = [
  { label: 'Guided',    value: 'guided' },
  { label: 'Edit DSL',  value: 'manual' },
  { label: 'Auto-sync', value: 'autosync' },
]

// Only the editable body — header is shown read-only above the editor
// Initialized from store on mount so navigation away/back preserves the content
function loadStoredBody(): string {
  const stored = dag.value?.landscape.mermaidDsl
  if (!stored) return ''
  // Strip header whether stored as full DSL (starts with --- or flowchart/graph)
  if (stored.startsWith('---') || /^(?:flowchart|graph)\s/m.test(stored)) {
    return extractBody(stored)
  }
  return stored
}
const manualDsl = ref(loadStoredBody())

// Full DSL passed to MermaidDiagram and validation in manual mode
const fullManualDsl = computed(() => landscapeHeader.value + '\n' + manualDsl.value)

// Auto-sync DSL: components + relations derived from all sequence flows
const autoSyncDsl = computed(() => {
  if (!dag.value) return ''
  const flowRelations = collectAllFlowRelations(dag.value)
  return generateLandscapeDsl(dag.value, { useElk: useElk.value }, flowRelations)
})

const activeDsl = computed(() => {
  if (editMode.value === 'manual')   return fullManualDsl.value
  if (editMode.value === 'autosync') return autoSyncDsl.value
  return generatedDsl.value
})

function switchToManual() {
  const stored = dag.value?.landscape.mermaidDsl
  manualDsl.value = stored
    ? loadStoredBody()
    : extractBody(generatedDsl.value)
  editMode.value = 'manual'
  if (dag.value) store.setLandscapeMode(dag.value.id, 'manual')
  runValidation(fullManualDsl.value)
}

function resetToGuided() {
  editMode.value = 'guided'
  syntaxError.value = null
  functionalResult.value = null
  if (dag.value) {
    store.setLandscapeMode(dag.value.id, 'guided')
    store.saveLandscapeDsl(dag.value.id, undefined)
  }
}

function switchToAutoSync() {
  editMode.value = 'autosync'
  syntaxError.value = null
  functionalResult.value = null
  if (dag.value) store.setLandscapeMode(dag.value.id, 'autosync')
}

watch(editMode, (mode) => {
  if (mode === 'manual') manualDsl.value = loadStoredBody()
})

// Subgraph toggles
function toggleSubgraph(categoryId: string, value: boolean) {
  if (!dag.value) return
  store.updateCategory(dag.value.id, categoryId, { showSubgraph: value })
}

// --- Validation ---
const syntaxError     = ref<string | null>(null)
const isValidating    = ref(false)
const functionalResult = ref<DslValidationResult | null>(null)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

async function runValidation(code: string) {
  if (!code.trim()) {
    syntaxError.value = null
    functionalResult.value = null
    return
  }
  isValidating.value = true
  syntaxError.value = null
  functionalResult.value = null

  try {
    await mermaid.parse(code)
  } catch (e) {
    const raw = e instanceof Error ? e.message : 'Invalid syntax'
    syntaxError.value = raw.replace(/^Syntax error in text\s*\nmermaid version [\d.]+\s*\n?/i, '').trim() || 'Invalid syntax'
    isValidating.value = false
    return
  }

  if (dag.value) functionalResult.value = validateDslAgainstModel(code, dag.value)
  isValidating.value = false
}

function onDslInput() {
  store.saveLandscapeDsl(dag.value!.id, manualDsl.value)
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => runValidation(fullManualDsl.value), 400)
}

function syncModel() {
  if (!dag.value || !functionalResult.value) return
  store.syncFromDsl(dag.value.id, functionalResult.value.parsed)
  runValidation(fullManualDsl.value)
}

const hasWarnings = computed(() => (functionalResult.value?.issues.length ?? 0) > 0)

// Node IDs for DSL autocompletion
const completionNames = computed(() =>
  (dag.value?.components ?? [])
    .filter((c) => c.name.trim() !== '')
    .map((c) => toNodeId(c.name)),
)

// IDs of categories that have at least one named component (drives v-if + v-show)
const categoryIdsWithComponents = computed(() =>
  new Set(
    (dag.value?.components ?? [])
      .filter((c) => c.name.trim() !== '')
      .map((c) => c.categoryId),
  ),
)

const validationStatus = computed(() => {
  if (isValidating.value)          return 'validating'
  if (syntaxError.value)           return 'syntax-error'
  if (functionalResult.value === null) return 'idle'
  if (hasWarnings.value)           return 'warnings'
  return 'valid'
})

// ─── Export ──────────────────────────────────────────────────────────────────

const exportMenu = ref<InstanceType<typeof Menu>>()
const exportMenuItems = ref([
  {
    label: 'SVG',
    items: [
      {
        label: 'SVG — raw (browser rendering)',
        icon: 'pi pi-image',
        command: () => exportSvg(false),
      },
      {
        label: 'SVG — pptx-ready (text labels + inlined styles)',
        icon: 'pi pi-file-export',
        command: () => exportSvg(true),
      },
    ],
  },
  {
    label: 'Coming soon',
    items: [
      { label: 'draw.io (.drawio)', icon: 'pi pi-share-alt', disabled: true },
    ],
  },
])

async function exportSvg(pptxMode: boolean) {
  if (!dag.value) return
  const dsl = pptxMode ? injectHtmlLabelsFalse(activeDsl.value) : activeDsl.value
  const id  = `export-${Date.now()}`
  const { svg } = await mermaid.render(id, dsl)
  const processed = pptxMode ? inlineSvgStyles(svg) : svg
  const blob = new Blob([processed], { type: 'image/svg+xml' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${dag.value.name.replace(/[^\w\s-]/g, '').trim()}${pptxMode ? '-pptx' : ''}.svg`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div v-if="dag" class="landscape">

    <!-- Toolbar -->
    <div class="toolbar">
      <SelectButton
        v-model="editMode"
        :options="modeOptions"
        option-label="label"
        option-value="value"
        @change="editMode === 'manual' ? switchToManual() : editMode === 'autosync' ? switchToAutoSync() : resetToGuided()"
      />

      <div class="elk-toggle">
        <ToggleSwitch v-model="useElk" input-id="elk-switch" />
        <label for="elk-switch">ELK layout</label>
      </div>

      <div v-if="categoryIdsWithComponents.size > 0" class="subgraph-options">
        <span class="subgraph-label">Subgraphs:</span>
        <label
          v-for="cat in dag.categories.slice().sort((a, b) => a.order - b.order)"
          v-show="categoryIdsWithComponents.has(cat.id)"
          :key="cat.id"
          class="toggle-label"
        >
          <input
            type="checkbox"
            :checked="cat.showSubgraph"
            @change="toggleSubgraph(cat.id, ($event.target as HTMLInputElement).checked)"
          />
          {{ cat.name }}
        </label>
      </div>

      <!-- Export -->
      <div class="toolbar-spacer" />
      <Button
        label="Export"
        icon="pi pi-download"
        size="small"
        severity="secondary"
        @click="exportMenu?.toggle($event)"
      />
      <Menu ref="exportMenu" :model="exportMenuItems" popup />

      <!-- Manual mode actions in toolbar -->
      <template v-if="editMode === 'manual'" class="manual-actions">
        <div class="validation-status">
          <span v-if="validationStatus === 'validating'" class="status validating">
            <i class="pi pi-spin pi-spinner" /> Validating…
          </span>
          <span v-else-if="validationStatus === 'syntax-error'" class="status error">
            <i class="pi pi-times-circle" /> Syntax error
          </span>
          <span v-else-if="validationStatus === 'warnings'" class="status warning">
            <i class="pi pi-exclamation-triangle" /> {{ functionalResult!.issues.length }} warning(s)
          </span>
          <span v-else-if="validationStatus === 'valid'" class="status valid">
            <i class="pi pi-check-circle" /> Valid
          </span>
        </div>

        <Button
          v-if="hasWarnings"
          label="Sync model"
          icon="pi pi-sync"
          size="small"
          severity="warn"
          @click="syncModel"
        />
        <Button
          label="Reset to guided"
          icon="pi pi-refresh"
          size="small"
          severity="secondary"
          text
          @click="resetToGuided"
        />
      </template>
    </div>

    <!-- Auto-sync mode: diagram only (read-only) -->
    <div v-if="editMode === 'autosync'" class="diagram-panel autosync-panel">
      <MermaidDiagram :code="activeDsl" />
    </div>

    <!-- Guided mode: relations panel | diagram -->
    <Splitter v-else-if="editMode === 'guided'" class="splitter" state-key="landscape-guided-splitter" state-storage="local">
      <SplitterPanel :size="35" :min-size="20" class="guided-panel">
        <RelationSpreadsheet :dag="dag" />
      </SplitterPanel>
      <SplitterPanel :size="65" :min-size="30" class="diagram-panel">
        <MermaidDiagram :code="activeDsl" />
      </SplitterPanel>
    </Splitter>

    <!-- Manual mode: DSL editor | diagram -->
    <Splitter v-else class="splitter" state-key="landscape-splitter" state-storage="local">
      <SplitterPanel :size="35" :min-size="20" class="editor-panel">

        <DslEditor
          :model-value="manualDsl"
          :read-only-header="landscapeHeader"
          :completion-names="completionNames"
          :validation-status="validationStatus"
          @update:model-value="(v) => { manualDsl = v; onDslInput() }"
        />

        <!-- Syntax error -->
        <div v-if="syntaxError" class="issue-list error-list">
          <div class="issue-item">
            <i class="pi pi-times-circle" />
            <span>{{ syntaxError }}</span>
          </div>
        </div>

        <!-- Functional warnings -->
        <div v-if="hasWarnings" class="issue-list warning-list">
          <div v-for="(issue, i) in functionalResult!.issues" :key="i" class="issue-item">
            <i class="pi pi-exclamation-triangle" />
            <span>{{ issue.message }}</span>
          </div>
        </div>

      </SplitterPanel>

      <SplitterPanel :size="65" :min-size="30" class="diagram-panel">
        <MermaidDiagram :code="activeDsl" />
      </SplitterPanel>
    </Splitter>

  </div>
</template>

<style scoped>
.landscape {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 0;
}

/* Toolbar */
.toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--p-content-border-color);
  flex-shrink: 0;
}

.elk-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.subgraph-options {
  display: flex;
  align-items: center;
  gap: 0.75rem;
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

/* Validation status in toolbar */
.validation-status { margin-left: auto; }

.toolbar-spacer { flex: 1; }

.status { display: flex; align-items: center; gap: 0.35rem; font-size: 0.875rem; }
.status.validating { color: var(--p-text-muted-color); }
.status.valid      { color: #16a34a; }
.status.error      { color: #dc2626; }
.status.warning    { color: #d97706; }

/* Generated mode */
.diagram-only {
  flex: 1;
  overflow: auto;
  padding: 1rem;
}

/* Splitter */
.splitter {
  flex: 1;
  min-height: 0;
  border: none !important;
}

/* Guided panel */
.guided-panel {
  overflow: hidden;
  padding: 0 !important;
  border-right: 1px solid var(--p-content-border-color);
}

/* Editor panel */
.editor-panel {
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow: hidden;
  padding: 0 !important;
}


/* Diagram panel */
.diagram-panel {
  overflow: auto;
  padding: 1rem !important;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.autosync-panel {
  flex: 1;
  min-height: 0;
  padding: 1rem;
  overflow: auto;
}

/* Issue lists */
.issue-list {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.78rem;
  font-family: monospace;
  flex-shrink: 0;
  max-height: 140px;
  overflow-y: auto;
  padding: 0.5rem 0.75rem;
}

.error-list   { background: #fef2f2; border-top: 1px solid #fca5a5; color: #dc2626; }
.warning-list { background: #fffbeb; border-top: 1px solid #fcd34d; color: #92400e; }

.issue-item {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
}
</style>
