<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useDagStore } from '@/stores/dag'
import { generateComponentsBody } from '@/utils/landscapeDslGenerator'
import { validateDslAgainstModel, type DslValidationResult } from '@/utils/dslValidator'
import CategorySpreadsheet from '@/components/dag/CategorySpreadsheet.vue'
import DslEditor from '@/components/DslEditor.vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import SelectButton from 'primevue/selectbutton'
import mermaid from 'mermaid'

const route = useRoute()
const store = useDagStore()

const dag = computed(() => store.getDag(route.params.id as string))

const componentsByCategory = computed(() => {
  if (!dag.value) return {}
  return Object.fromEntries(
    dag.value.categories.map((cat) => [
      cat.id,
      dag.value!.components.filter((c) => c.categoryId === cat.id),
    ]),
  )
})

// --- Edit DAG ---
const editingDag = ref(false)
const editedName = ref('')
const editedDescription = ref('')

function startEditDag() {
  if (!dag.value) return
  editedName.value = dag.value.name
  editedDescription.value = dag.value.description
  editingDag.value = true
}

function saveDag() {
  if (!dag.value || !editedName.value.trim()) return
  store.updateDag(dag.value.id, { name: editedName.value.trim(), description: editedDescription.value.trim() })
  editingDag.value = false
}

// --- Add category ---
const addingCategory = ref(false)
const newCategoryName = ref('')

function submitAddCategory() {
  if (!newCategoryName.value.trim() || !dag.value) return
  store.addCategory(dag.value.id, newCategoryName.value.trim())
  newCategoryName.value = ''
  addingCategory.value = false
}

// --- DSL mode ---
const viewMode = ref<'guided' | 'dsl'>('guided')
const modeOptions = [
  { label: 'Guided', value: 'guided' },
  { label: 'DSL',    value: 'dsl' },
]

// Read-only header shown above the DSL editor
const dslHeader = 'flowchart TB'

// Body generated from the model (nodes + subgraphs, no relations)
const generatedBody = computed(() => {
  if (!dag.value) return ''
  return generateComponentsBody(dag.value)
})

function loadDslBody(): string {
  return generatedBody.value
}

const dslBody = ref('')

function onSwitchToDsl() {
  dslBody.value = loadDslBody()
  syntaxError.value = null
  functionalResult.value = null
  runValidation(dslHeader + '\n' + dslBody.value)
}

// Validation
const syntaxError = ref<string | null>(null)
const isValidating = ref(false)
const functionalResult = ref<DslValidationResult | null>(null)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

async function runValidation(code: string) {
  if (!code.trim()) { syntaxError.value = null; functionalResult.value = null; return }
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
  if (dag.value) functionalResult.value = validateDslAgainstModel(dslHeader + '\n' + dslBody.value, dag.value)
  isValidating.value = false
}

function onDslChange(value: string) {
  dslBody.value = value
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => runValidation(dslHeader + '\n' + value), 400)
}

function syncModel() {
  if (!dag.value || !functionalResult.value) return
  store.syncFromDsl(dag.value.id, functionalResult.value.parsed)
  runValidation(dslHeader + '\n' + dslBody.value)
}

const hasWarnings = computed(() => (functionalResult.value?.issues.length ?? 0) > 0)

const validationStatus = computed(() => {
  if (isValidating.value)               return 'validating'
  if (syntaxError.value)                return 'syntax-error'
  if (functionalResult.value === null)  return 'idle'
  if (hasWarnings.value)                return 'warnings'
  return 'valid'
})
</script>

<template>
  <div v-if="dag">
    <!-- DAG description header -->
    <div class="dag-info">
      <template v-if="editingDag">
        <div class="edit-form">
          <InputText v-model="editedName" placeholder="Name" autofocus />
          <Textarea v-model="editedDescription" placeholder="Description" rows="2" />
          <div class="edit-actions">
            <Button label="Save" icon="pi pi-check" @click="saveDag" />
            <Button label="Cancel" severity="secondary" @click="editingDag = false" />
          </div>
        </div>
      </template>
      <template v-else>
        <p v-if="dag.description" class="dag-desc">{{ dag.description }}</p>
        <Button label="Edit" icon="pi pi-pencil" size="small" severity="secondary" text @click="startEditDag" />
      </template>
    </div>

    <!-- Categories section -->
    <div class="categories-section">
      <div class="section-header">
        <h3>Categories & Components</h3>
        <div class="section-header-actions">
          <SelectButton
            v-model="viewMode"
            :options="modeOptions"
            option-label="label"
            option-value="value"
            size="small"
            @change="viewMode === 'dsl' ? onSwitchToDsl() : null"
          />
          <Button
            v-if="viewMode === 'guided' && !addingCategory"
            label="Add category"
            icon="pi pi-plus"
            size="small"
            @click="addingCategory = true"
          />
        </div>
      </div>

      <!-- Guided mode -->
      <template v-if="viewMode === 'guided'">
        <div v-if="addingCategory" class="add-category-form">
          <InputText
            v-model="newCategoryName"
            placeholder="Category name"
            autofocus
            @keyup.enter="submitAddCategory"
            @keyup.escape="addingCategory = false"
          />
          <Button icon="pi pi-check" @click="submitAddCategory" />
          <Button icon="pi pi-times" severity="secondary" @click="addingCategory = false" />
        </div>

        <CategorySpreadsheet
          v-for="category in dag.categories.slice().sort((a, b) => a.order - b.order)"
          :key="category.id"
          :dag-id="dag.id"
          :category="category"
          :components="componentsByCategory[category.id] ?? []"
        />

        <p v-if="dag.categories.length === 0" class="empty">No categories yet.</p>
      </template>

      <!-- DSL mode -->
      <template v-else>
        <div class="dsl-toolbar">
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

          <Button
            v-if="hasWarnings && !syntaxError"
            label="Sync model"
            icon="pi pi-sync"
            size="small"
            severity="warn"
            @click="syncModel"
          />
        </div>

        <div class="dsl-editor-wrap">
          <DslEditor
            :model-value="dslBody"
            :read-only-header="dslHeader"
            :validation-status="validationStatus"
            @update:model-value="onDslChange"
          />
        </div>

        <div v-if="syntaxError" class="issue-list error-list">
          <div class="issue-item"><i class="pi pi-times-circle" /><span>{{ syntaxError }}</span></div>
        </div>

        <div v-if="hasWarnings" class="issue-list warning-list">
          <div v-for="(issue, i) in functionalResult!.issues" :key="i" class="issue-item">
            <i class="pi pi-exclamation-triangle" /><span>{{ issue.message }}</span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.dag-info {
  margin-bottom: 1.5rem;
  display: flex;
  align-items: flex-start;
  gap: 1rem;
}

.dag-desc {
  color: var(--p-text-muted-color);
  flex: 1;
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
  max-width: 480px;
}

.edit-form :deep(input),
.edit-form :deep(textarea) { width: 100%; }

.edit-actions { display: flex; gap: 0.5rem; }

.categories-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-header h3 { margin: 0; }

.section-header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.add-category-form {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.empty {
  color: var(--p-text-muted-color);
  font-style: italic;
}

/* DSL mode */
.dsl-toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.status { display: flex; align-items: center; gap: 0.35rem; font-size: 0.875rem; }
.status.validating { color: var(--p-text-muted-color); }
.status.valid      { color: #16a34a; }
.status.error      { color: #dc2626; }
.status.warning    { color: #d97706; }

.dsl-editor-wrap {
  border: 1px solid var(--p-content-border-color);
  border-radius: 6px;
  overflow: hidden;
  min-height: 300px;
}

.issue-list {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.78rem;
  font-family: monospace;
  max-height: 160px;
  overflow-y: auto;
  padding: 0.5rem 0.75rem;
}

.error-list   { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 4px; color: #dc2626; }
.warning-list { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 4px; color: #92400e; }

.issue-item { display: flex; gap: 0.5rem; align-items: flex-start; }
</style>
