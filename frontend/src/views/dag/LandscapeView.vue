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
  { label: 'Edit DSL', value: 'manual' },
]

const manualDsl = ref(dag.value?.landscape.mermaidDsl ?? '')

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
  if (dag.value) store.saveLandscapeDsl(dag.value.id, '')
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

// --- Syntax validation ---
const syntaxError = ref<string | null>(null)
const isValidating = ref(false)

// --- Functional validation ---
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

  // Step 1: syntax
  try {
    await mermaid.parse(code)
  } catch (e) {
    const raw = e instanceof Error ? e.message : 'Invalid syntax'
    syntaxError.value = raw.replace(/^Syntax error in text\s*\nmermaid version [\d.]+\s*\n?/i, '').trim() || 'Invalid syntax'
    isValidating.value = false
    return
  }

  // Step 2: functional (only if syntax is valid)
  if (dag.value) {
    functionalResult.value = validateDslAgainstModel(code, dag.value)
  }

  isValidating.value = false
}

function onDslInput() {
  store.saveLandscapeDsl(dag.value!.id, manualDsl.value)
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => runValidation(manualDsl.value), 400)
}

// --- Sync model from DSL ---
function syncModel() {
  if (!dag.value || !functionalResult.value) return
  store.syncFromDsl(dag.value.id, functionalResult.value.parsed)
  // Re-run validation — issues should be gone
  runValidation(manualDsl.value)
}

// Computed helpers
const hasWarnings = computed(() =>
  (functionalResult.value?.issues.length ?? 0) > 0,
)

const validationStatus = computed(() => {
  if (isValidating.value) return 'validating'
  if (syntaxError.value) return 'syntax-error'
  if (functionalResult.value === null) return 'idle'
  if (hasWarnings.value) return 'warnings'
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
    </div>

    <!-- Main content -->
    <div class="content" :class="{ split: editMode === 'manual' }">
      <!-- Diagram -->
      <div class="diagram-panel">
        <MermaidDiagram :code="activeDsl" />
      </div>

      <!-- DSL editor (manual mode only) -->
      <div v-if="editMode === 'manual'" class="editor-panel">

        <!-- Validation bar -->
        <div class="validation-bar">
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
          <span v-else class="status idle" />

          <div class="bar-actions">
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
          </div>
        </div>

        <!-- Textarea -->
        <textarea
          v-model="manualDsl"
          spellcheck="false"
          :class="{
            'has-syntax-error': validationStatus === 'syntax-error',
            'has-warnings': validationStatus === 'warnings',
          }"
          @input="onDslInput"
        />

        <!-- Syntax error detail -->
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
      </div>
    </div>
  </div>
</template>

<style scoped>
.landscape {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  height: 100%;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
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

.content { flex: 1; overflow: hidden; }

.content.split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.diagram-panel { overflow: auto; height: 100%; }

.editor-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  height: 100%;
  min-height: 0;
}

/* Validation bar */
.validation-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.85rem;
  flex-shrink: 0;
}

.bar-actions { display: flex; gap: 0.5rem; align-items: center; }

.status { display: flex; align-items: center; gap: 0.35rem; }
.status.validating { color: var(--p-text-muted-color); }
.status.valid      { color: #16a34a; }
.status.error      { color: #dc2626; }
.status.warning    { color: #d97706; }

/* Textarea */
.editor-panel textarea {
  flex: 1;
  font-family: monospace;
  font-size: 0.875rem;
  padding: 0.75rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 6px;
  resize: none;
  background: var(--p-surface-0);
  color: var(--p-text-color);
  outline: none;
  transition: border-color 0.2s;
  min-height: 0;
}

.editor-panel textarea:focus        { border-color: var(--p-primary-color); }
.editor-panel textarea.has-syntax-error { border-color: #dc2626; }
.editor-panel textarea.has-warnings     { border-color: #d97706; }

/* Issue lists */
.issue-list {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.8rem;
  font-family: monospace;
  flex-shrink: 0;
  max-height: 150px;
  overflow-y: auto;
  border-radius: 4px;
  padding: 0.5rem 0.75rem;
}

.error-list   { background: #fef2f2; border: 1px solid #fca5a5; color: #dc2626; }
.warning-list { background: #fffbeb; border: 1px solid #fcd34d; color: #92400e; }

.issue-item {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
}
</style>
