<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useDagStore } from '@/stores/dag'
import { generateLandscapeDsl } from '@/utils/landscapeDslGenerator'
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
  manualDsl.value = generatedDsl.value
  editMode.value = 'manual'
  validate(manualDsl.value)
}

function resetToGenerated() {
  editMode.value = 'generated'
  validationError.value = null
  if (dag.value) dag.value.landscape.mermaidDsl = undefined
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

// --- Real-time validation ---
const validationError = ref<string | null>(null)
const isValidating = ref(false)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

async function validate(code: string) {
  if (!code.trim()) {
    validationError.value = null
    return
  }
  isValidating.value = true
  try {
    await mermaid.parse(code)
    validationError.value = null
  } catch (e) {
    validationError.value = e instanceof Error ? e.message : 'Invalid syntax'
  } finally {
    isValidating.value = false
  }
}

function onDslInput() {
  if (dag.value) dag.value.landscape.mermaidDsl = manualDsl.value
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => validate(manualDsl.value), 400)
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
        @change="editMode === 'manual' ? switchToManual() : resetToGenerated()"
      />

      <div class="elk-toggle">
        <ToggleSwitch
          v-model="useElk"
          :disabled="editMode === 'manual'"
          input-id="elk-switch"
        />
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
        <!-- Validation status -->
        <div class="validation-bar">
          <span v-if="isValidating" class="validating">
            <i class="pi pi-spin pi-spinner" /> Validating…
          </span>
          <span v-else-if="validationError === null" class="valid">
            <i class="pi pi-check-circle" /> Valid
          </span>
          <span v-else class="invalid">
            <i class="pi pi-times-circle" /> Invalid
          </span>
          <Button
            label="Reset to generated"
            icon="pi pi-refresh"
            size="small"
            severity="secondary"
            text
            @click="resetToGenerated"
          />
        </div>

        <textarea
          v-model="manualDsl"
          spellcheck="false"
          :class="{ 'has-error': validationError !== null }"
          @input="onDslInput"
        />

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

.subgraph-label {
  font-weight: 600;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  cursor: pointer;
}

.content {
  flex: 1;
  overflow: hidden;
}

.content.split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.diagram-panel {
  overflow: auto;
  height: 100%;
}

.editor-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  height: 100%;
}

.validation-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.85rem;
}

.validating { color: var(--p-text-muted-color); }
.valid      { color: #16a34a; }
.invalid    { color: #dc2626; }

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
}

.editor-panel textarea:focus {
  border-color: var(--p-primary-color);
}

.editor-panel textarea.has-error {
  border-color: #dc2626;
}

</style>
