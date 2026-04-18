<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useDagStore } from '@/stores/dag'
import { generateLandscapeDsl } from '@/utils/landscapeDslGenerator'
import { validateDslAgainstModel, type DslValidationResult } from '@/utils/dslValidator'
import MermaidDiagram from '@/components/MermaidDiagram.vue'
import mermaid from 'mermaid'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import ToggleSwitch from 'primevue/toggleswitch'
import Splitter from 'primevue/splitter'
import SplitterPanel from 'primevue/splitterpanel'

const route = useRoute()
const store = useDagStore()

const dag = computed(() => store.getDag(route.params.id as string))

// Layout options
const useElk = ref(false)

// Generated DSL
const generatedDsl = computed(() => {
  if (!dag.value) return ''
  return generateLandscapeDsl(dag.value, { useElk: useElk.value })
})

// Editor mode
const editMode = ref<'generated' | 'manual'>('generated')
const modeOptions = [
  { label: 'Generated', value: 'generated' },
  { label: 'Edit DSL',  value: 'manual' },
]

const manualDsl = ref(dag.value?.landscape.mermaidDsl || '')

const activeDsl = computed(() =>
  editMode.value === 'manual' ? manualDsl.value : generatedDsl.value,
)

function switchToManual() {
  manualDsl.value = dag.value?.landscape.mermaidDsl || generatedDsl.value
  editMode.value = 'manual'
  runValidation(manualDsl.value)
}

function resetToGenerated() {
  editMode.value = 'generated'
  syntaxError.value = null
  functionalResult.value = null
  if (dag.value) store.saveLandscapeDsl(dag.value.id, undefined)
}

watch(editMode, (mode) => {
  if (mode === 'manual' && dag.value?.landscape.mermaidDsl) {
    manualDsl.value = dag.value.landscape.mermaidDsl
  }
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
  debounceTimer = setTimeout(() => runValidation(manualDsl.value), 400)
}

function syncModel() {
  if (!dag.value || !functionalResult.value) return
  store.syncFromDsl(dag.value.id, functionalResult.value.parsed)
  runValidation(manualDsl.value)
}

const hasWarnings = computed(() => (functionalResult.value?.issues.length ?? 0) > 0)

const validationStatus = computed(() => {
  if (isValidating.value)          return 'validating'
  if (syntaxError.value)           return 'syntax-error'
  if (functionalResult.value === null) return 'idle'
  if (hasWarnings.value)           return 'warnings'
  return 'valid'
})
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
        @change="editMode === 'manual' ? switchToManual() : resetToGenerated()"
      />

      <div class="elk-toggle">
        <ToggleSwitch v-model="useElk" :disabled="editMode === 'manual'" input-id="elk-switch" />
        <label for="elk-switch">ELK layout</label>
      </div>

      <div v-if="editMode === 'generated'" class="subgraph-options">
        <span class="subgraph-label">Subgraphs:</span>
        <label
          v-for="cat in dag.categories.slice().sort((a, b) => a.order - b.order)"
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

      <!-- Manual mode actions in toolbar -->
      <template v-if="editMode === 'manual'">
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
          label="Reset to generated"
          icon="pi pi-refresh"
          size="small"
          severity="secondary"
          text
          @click="resetToGenerated"
        />
      </template>
    </div>

    <!-- Generated mode: diagram only -->
    <div v-if="editMode === 'generated'" class="diagram-only">
      <MermaidDiagram :code="activeDsl" />
    </div>

    <!-- Manual mode: splitter editor | diagram -->
    <Splitter v-else class="splitter" state-key="landscape-splitter" state-storage="local">
      <SplitterPanel :size="35" :min-size="20" class="editor-panel">

        <textarea
          v-model="manualDsl"
          spellcheck="false"
          :class="{
            'has-syntax-error': validationStatus === 'syntax-error',
            'has-warnings':     validationStatus === 'warnings',
          }"
          @input="onDslInput"
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

/* Editor panel */
.editor-panel {
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow: hidden;
  padding: 0 !important;
}

.editor-panel textarea {
  flex: 1;
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.85rem;
  line-height: 1.6;
  padding: 1rem;
  border: none;
  border-right: 1px solid var(--p-content-border-color);
  resize: none;
  background: var(--p-surface-50, #fafafa);
  color: var(--p-text-color);
  outline: none;
  transition: background 0.2s;
  min-height: 0;
  overflow-y: scroll;
  scrollbar-gutter: stable;
}

.editor-panel textarea:focus {
  background: var(--p-surface-0);
}

.editor-panel textarea.has-syntax-error {
  border-left: 3px solid #dc2626;
}

.editor-panel textarea.has-warnings {
  border-left: 3px solid #d97706;
}

/* Diagram panel */
.diagram-panel {
  overflow: auto;
  padding: 1rem !important;
  display: flex;
  align-items: flex-start;
  justify-content: center;
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
