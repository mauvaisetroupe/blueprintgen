<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useDagStore } from '@/stores/dag'
import {
  generateLandscapeDsl,
  generateLandscapeHeader,
  generateComponentsBody,
  generateManualRelationsBody,
  generateAutoSyncRelationsBody,
  parseRelationsBody,
  toNodeId,
} from '@/utils/landscapeDslGenerator'
import { validateDslAgainstModel, type DslValidationResult } from '@/utils/dslValidator'
import { inlineSvgStyles, injectHtmlLabelsFalse } from '@/utils/svgInliner'
import { exportToDrawio } from '@/utils/drawioExporter'
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

// ── ELK toggle ────────────────────────────────────────────────────────────────
const useElk = ref(dag.value?.landscape.useElk ?? false)
watch(useElk, (val) => {
  if (dag.value) store.setLandscapeUseElk(dag.value.id, val)
})

// ── Auto-sync toggle ──────────────────────────────────────────────────────────
const autoSync = ref(dag.value?.landscape.autoSync ?? false)
watch(autoSync, (val) => {
  if (dag.value) store.setLandscapeAutoSync(dag.value.id, val)
})

// ── Mode : guided | manual ────────────────────────────────────────────────────
const editMode = ref<'guided' | 'manual'>(
  dag.value?.landscape.mode === 'manual' ? 'manual' : 'guided',
)
const modeOptions = [
  { label: 'Guided',   value: 'guided' },
  { label: 'Edit DSL', value: 'manual' },
]

// ── DSL editor state (manuel uniquement) ─────────────────────────────────────

// Contenu de la zone éditable : uniquement les flèches manuelles
const localRelationsBody = ref('')

// Header read-only = frontmatter + flowchart TB + components/subgraphs
const dslReadOnlyHeader = computed(() => {
  if (!dag.value) return ''
  return generateLandscapeHeader(dag.value) + '\n' + generateComponentsBody(dag.value)
})

// Footer read-only = relations auto-sync (si toggle activé)
const dslReadOnlyFooter = computed(() => {
  if (!dag.value || !autoSync.value) return ''
  const body = generateAutoSyncRelationsBody(dag.value)
  return body || ''
})

function switchToManual() {
  if (!dag.value) return
  localRelationsBody.value = generateManualRelationsBody(dag.value)
  editMode.value = 'manual'
  store.setLandscapeMode(dag.value.id, 'manual')
  runValidation()
}

function switchToGuided() {
  editMode.value = 'guided'
  syntaxError.value = null
  functionalResult.value = null
  if (dag.value) store.setLandscapeMode(dag.value.id, 'guided')
}

watch(editMode, (mode) => {
  if (mode === 'manual' && dag.value) {
    localRelationsBody.value = generateManualRelationsBody(dag.value)
  }
})

// ── DSL complet pour le rendu Mermaid ─────────────────────────────────────────
// En mode manuel : construit depuis les parties locales pour prévisualisation instantanée
// En mode guidé  : généré depuis le modèle (dag.relations + autoSync)
const activeDsl = computed(() => {
  if (!dag.value) return ''
  if (editMode.value === 'manual') {
    const parts = [dslReadOnlyHeader.value]
    if (localRelationsBody.value.trim()) parts.push(localRelationsBody.value)
    if (dslReadOnlyFooter.value.trim())  parts.push(dslReadOnlyFooter.value)
    return parts.join('\n')
  }
  return generateLandscapeDsl(dag.value)
})

// ── Validation (mode manuel) ──────────────────────────────────────────────────
const syntaxError      = ref<string | null>(null)
const isValidating     = ref(false)
const functionalResult = ref<DslValidationResult | null>(null)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

async function runValidation() {
  if (editMode.value !== 'manual' || !dag.value) return
  const code = activeDsl.value
  if (!code.trim()) { syntaxError.value = null; functionalResult.value = null; return }

  isValidating.value = true
  syntaxError.value  = null
  functionalResult.value = null

  try {
    await mermaid.parse(code)
  } catch (e) {
    const raw = e instanceof Error ? e.message : 'Invalid syntax'
    syntaxError.value = raw.replace(/^Syntax error in text\s*\nmermaid version [\d.]+\s*\n?/i, '').trim() || 'Invalid syntax'
    isValidating.value = false
    return
  }

  functionalResult.value = validateDslAgainstModel(code, dag.value)
  isValidating.value = false
}

function onRelationsChange(value: string) {
  localRelationsBody.value = value
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    if (!dag.value) return
    const parsed = parseRelationsBody(value, dag.value)
    store.replaceManualRelations(dag.value.id, parsed)
    runValidation()
  }, 400)
}

const hasWarnings = computed(() => (functionalResult.value?.issues.length ?? 0) > 0)

const validationStatus = computed(() => {
  if (isValidating.value)               return 'validating'
  if (syntaxError.value)                return 'syntax-error'
  if (functionalResult.value === null)  return 'idle'
  if (hasWarnings.value)                return 'warnings'
  return 'valid'
})

// Node IDs pour l'autocomplétion dans l'éditeur DSL
const completionNames = computed(() =>
  (dag.value?.components ?? [])
    .filter((c) => c.name.trim() !== '')
    .map((c) => toNodeId(c.name)),
)

// ── Subgraph toggles (guided + DSL) ──────────────────────────────────────────
function toggleSubgraph(categoryId: string, value: boolean) {
  if (!dag.value) return
  store.updateCategory(dag.value.id, categoryId, { showSubgraph: value })
}

const categoryIdsWithComponents = computed(() =>
  new Set(
    (dag.value?.components ?? [])
      .filter((c) => c.name.trim() !== '')
      .map((c) => c.categoryId),
  ),
)

// ── Export ────────────────────────────────────────────────────────────────────
const exportMenu = ref<InstanceType<typeof Menu>>()
const exportMenuItems = ref([
  {
    label: 'SVG',
    items: [
      { label: 'SVG — raw (browser rendering)',                  icon: 'pi pi-image',        command: () => exportSvg(false) },
      { label: 'SVG — pptx-ready (text labels + inlined styles)', icon: 'pi pi-file-export',  command: () => exportSvg(true)  },
    ],
  },
  {
    label: 'Mermaid',
    items: [
      { label: 'Export DSL (.mmd)', icon: 'pi pi-code',         command: () => exportMermaid() },
      { label: 'Copy to clipboard', icon: 'pi pi-copy',         command: () => copyMermaid()   },
      { label: 'draw.io tip: Extras › Edit Diagram › paste', icon: 'pi pi-info-circle', disabled: true },
    ],
  },
  {
    label: 'draw.io',
    items: [
      { label: 'draw.io (.drawio)', icon: 'pi pi-share-alt', command: () => dag.value && exportToDrawio(dag.value) },
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

function exportMermaid() {
  if (!dag.value || !activeDsl.value.trim()) return
  const blob = new Blob([activeDsl.value], { type: 'text/plain' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${dag.value.name.replace(/[^\w\s-]/g, '').trim()}-landscape.mmd`
  a.click()
  URL.revokeObjectURL(url)
}

async function copyMermaid() {
  if (!activeDsl.value.trim()) return
  await navigator.clipboard.writeText(activeDsl.value)
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
        @change="editMode === 'manual' ? switchToManual() : switchToGuided()"
      />

      <div class="elk-toggle">
        <ToggleSwitch v-model="useElk" input-id="elk-switch" />
        <label for="elk-switch">ELK</label>
      </div>

      <div class="elk-toggle">
        <ToggleSwitch v-model="autoSync" input-id="autosync-switch" />
        <label for="autosync-switch">Auto-sync flows</label>
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

      <!-- Validation status (mode manuel) -->
      <div v-if="editMode === 'manual'" class="validation-status">
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

      <div class="toolbar-spacer" />
      <Button
        label="Export"
        icon="pi pi-download"
        size="small"
        severity="secondary"
        @click="exportMenu?.toggle($event)"
      />
      <Menu ref="exportMenu" :model="exportMenuItems" popup />
    </div>

    <!-- Guided mode : RelationSpreadsheet | Diagram -->
    <Splitter v-if="editMode === 'guided'" class="splitter" state-key="landscape-guided-splitter" state-storage="local">
      <SplitterPanel :size="35" :min-size="20" class="guided-panel">
        <RelationSpreadsheet :dag="dag" />
      </SplitterPanel>
      <SplitterPanel :size="65" :min-size="30" class="diagram-panel">
        <MermaidDiagram :code="activeDsl" />
      </SplitterPanel>
    </Splitter>

    <!-- Manual / Edit DSL mode : éditeur relations | Diagram -->
    <Splitter v-else class="splitter" state-key="landscape-manual-splitter" state-storage="local">
      <SplitterPanel :size="35" :min-size="20" class="editor-panel">

        <DslEditor
          :model-value="localRelationsBody"
          :read-only-header="dslReadOnlyHeader"
          :read-only-footer="dslReadOnlyFooter || undefined"
          :completion-names="completionNames"
          :validation-status="validationStatus"
          @update:model-value="onRelationsChange"
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

.validation-status { display: flex; align-items: center; }
.toolbar-spacer { flex: 1; }

.status { display: flex; align-items: center; gap: 0.35rem; font-size: 0.875rem; }
.status.validating { color: var(--p-text-muted-color); }
.status.valid      { color: #16a34a; }
.status.error      { color: #dc2626; }
.status.warning    { color: #d97706; }

.splitter {
  flex: 1;
  min-height: 0;
  border: none !important;
}

.guided-panel {
  overflow: hidden;
  padding: 0 !important;
  border-right: 1px solid var(--p-content-border-color);
}

.editor-panel {
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow: hidden;
  padding: 0 !important;
}

.diagram-panel {
  overflow: auto;
  padding: 1rem !important;
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
  max-height: 140px;
  overflow-y: auto;
  padding: 0.5rem 0.75rem;
}

.error-list   { background: #fef2f2; border-top: 1px solid #fca5a5; color: #dc2626; }
.warning-list { background: #fffbeb; border-top: 1px solid #fcd34d; color: #92400e; }

.issue-item { display: flex; gap: 0.5rem; align-items: flex-start; }
</style>
