<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useDagStore } from '@/stores/dag'
import { generateFlowSkeleton, toParticipantId } from '@/utils/sequenceDslGenerator'
import MermaidDiagram from '@/components/MermaidDiagram.vue'
import DslEditor from '@/components/DslEditor.vue'
import Button from 'primevue/button'
import Splitter from 'primevue/splitter'
import SplitterPanel from 'primevue/splitterpanel'
import mermaid from 'mermaid'

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

watch(selectedFlow, (flow) => {
  editorDsl.value = flow?.mermaidDsl ?? ''
  syntaxError.value = null
  if (flow?.mermaidDsl) runValidation(flow.mermaidDsl)
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
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => runValidation(value), 400)
}

const validationStatus = computed(() => {
  if (isValidating.value) return 'validating'
  if (syntaxError.value)  return 'syntax-error'
  return 'valid'
})

// --- Flow CRUD ---
function addFlow() {
  if (!dag.value) return
  const skeleton = generateFlowSkeleton(dag.value)
  const flow = store.addFlow(dag.value.id, 'New flow', '', skeleton)
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

        </SplitterPanel>

        <SplitterPanel :size="60" :min-size="30" class="diagram-panel">
          <MermaidDiagram :code="editorDsl" />
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
  max-height: 120px;
  overflow-y: auto;
  padding: 0.5rem 0.75rem;
}

.error-list { background: #fef2f2; border-top: 1px solid #fca5a5; color: #dc2626; }

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
