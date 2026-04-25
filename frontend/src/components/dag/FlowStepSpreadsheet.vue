<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
import { useDagStore } from '@/stores/dag'
import type { ApplicationFlow, Dag, FlowStep } from '@/types/dag'
import { allCategories } from '@/types/dag'
import Button from 'primevue/button'

const props = defineProps<{ dag: Dag; flow: ApplicationFlow }>()
const store = useDagStore()

const steps = computed(() => [...props.flow.steps].sort((a, b) => a.order - b.order))

const groupedComponents = computed(() => {
  const sorted = allCategories(props.dag).sort((a, b) => a.order - b.order)
  return sorted
    .map((cat) => ({
      category: cat,
      components: props.dag.components.filter((c) => c.categoryId === cat.id && c.name.trim() !== ''),
    }))
    .filter((g) => g.components.length > 0)
})

// ── Cell focus management ─────────────────────────────────────────────────────
const cellRefs = ref<(HTMLElement | null)[][]>([])

function setCellRef(el: HTMLElement | null, row: number, col: number) {
  if (!cellRefs.value[row]) cellRefs.value[row] = []
  cellRefs.value[row][col] = el
}

async function focusCell(row: number, col: number) {
  await nextTick()
  cellRefs.value[row]?.[col]?.focus()
}

// ── Step CRUD ────────────────────────────────────────────────────────────────
function saveSteps(newSteps: FlowStep[]) {
  store.saveFlowSteps(props.dag.id, props.flow.id, newSteps)
}

function updateStep(stepId: string, patch: Partial<FlowStep>) {
  saveSteps(steps.value.map((s) => (s.id === stepId ? { ...s, ...patch } : s)))
}

async function addRow() {
  const oldLength = steps.value.length
  const maxOrder = steps.value.reduce((m, s) => Math.max(m, s.order), 0)
  const newStep: FlowStep = {
    id: crypto.randomUUID(),
    fromComponentId: '',
    toComponentId: '',
    label: '',
    order: maxOrder + 1,
    isReturn: false,
  }
  saveSteps([...steps.value, newStep])
  await focusCell(oldLength, 0)
}

function deleteStep(stepId: string) {
  saveSteps(steps.value.filter((s) => s.id !== stepId))
}

// ── Keyboard navigation (cols: 0=from, 1=to, 2=label) ────────────────────────
function onKeydown(e: KeyboardEvent, rowIndex: number, colIndex: number) {
  if (e.key === 'Tab') {
    e.preventDefault()
    const nextCol = colIndex + 1
    if (nextCol < 3) {
      focusCell(rowIndex, nextCol)
    } else if (rowIndex + 1 < steps.value.length) {
      focusCell(rowIndex + 1, 0)
    } else {
      addRow()
    }
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (rowIndex + 1 < steps.value.length) {
      focusCell(rowIndex + 1, 0)
    } else {
      addRow()
    }
  }
}
</script>

<template>
  <div class="step-block">
    <table class="sheet">
      <thead>
        <tr>
          <th class="col-from">From</th>
          <th class="col-arrow"></th>
          <th class="col-to">To</th>
          <th class="col-label">Label / Protocol</th>
          <th class="col-return" title="Return arrow (dashed)">Return</th>
          <th class="col-actions"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(step, rowIndex) in steps" :key="step.id" :class="{ 'row-return': step.isReturn }">

          <!-- From -->
          <td>
            <select
              :ref="(el) => setCellRef(el as HTMLElement, rowIndex, 0)"
              :value="step.fromComponentId"
              class="cell-select"
              @change="updateStep(step.id, { fromComponentId: ($event.target as HTMLSelectElement).value })"
              @keydown="onKeydown($event, rowIndex, 0)"
            >
              <option value="">— select —</option>
              <optgroup v-for="group in groupedComponents" :key="group.category.id" :label="group.category.name">
                <option v-for="comp in group.components" :key="comp.id" :value="comp.id">
                  {{ comp.name }}
                </option>
              </optgroup>
            </select>
          </td>

          <!-- Arrow indicator -->
          <td class="col-arrow">
            <span class="arrow">{{ step.isReturn ? '⇠' : '→' }}</span>
          </td>

          <!-- To -->
          <td>
            <select
              :ref="(el) => setCellRef(el as HTMLElement, rowIndex, 1)"
              :value="step.toComponentId"
              class="cell-select"
              @change="updateStep(step.id, { toComponentId: ($event.target as HTMLSelectElement).value })"
              @keydown="onKeydown($event, rowIndex, 1)"
            >
              <option value="">— select —</option>
              <optgroup v-for="group in groupedComponents" :key="group.category.id" :label="group.category.name">
                <option v-for="comp in group.components" :key="comp.id" :value="comp.id">
                  {{ comp.name }}
                </option>
              </optgroup>
            </select>
          </td>

          <!-- Label -->
          <td>
            <input
              :ref="(el) => setCellRef(el as HTMLElement, rowIndex, 2)"
              class="cell-input"
              :value="step.label ?? ''"
              placeholder="e.g. REST, HTTPS…"
              @input="updateStep(step.id, { label: ($event.target as HTMLInputElement).value })"
              @keydown="onKeydown($event, rowIndex, 2)"
            />
          </td>

          <!-- Return checkbox -->
          <td class="col-return">
            <input
              type="checkbox"
              :checked="step.isReturn ?? false"
              class="cell-check"
              @change="updateStep(step.id, { isReturn: ($event.target as HTMLInputElement).checked })"
            />
          </td>

          <!-- Delete -->
          <td class="col-actions">
            <Button
              icon="pi pi-times"
              size="small"
              text
              severity="danger"
              @click="deleteStep(step.id)"
            />
          </td>
        </tr>
      </tbody>
    </table>

    <p v-if="steps.length === 0" class="empty">No steps yet.</p>

    <Button label="Add step" icon="pi pi-plus" size="small" text @click="addRow" />
  </div>
</template>

<style scoped>
.step-block {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  scrollbar-gutter: stable;
  padding: 0.75rem 1rem;
}

.sheet {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 0.5rem;
}

.sheet thead th {
  text-align: left;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  padding: 0.3rem 0.4rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--p-content-border-color);
}

.sheet tbody tr:hover { background: var(--p-surface-50, #fafafa); }
.sheet tbody tr.row-return { opacity: 0.7; }

.sheet td {
  padding: 2px 4px;
  border-bottom: 1px solid var(--p-content-border-color);
  vertical-align: middle;
}

.sheet tbody tr:last-child td { border-bottom: none; }

.col-arrow  { width: 24px; text-align: center; }
.col-label  { width: 140px; }
.col-return { width: 56px; text-align: center; }
.col-actions { width: 36px; }

.arrow { color: var(--p-text-muted-color); font-size: 1rem; }

.cell-select,
.cell-input {
  width: 100%;
  border: none;
  background: transparent;
  padding: 0.35rem 0.4rem;
  font-size: 0.875rem;
  font-family: inherit;
  color: inherit;
  outline: none;
  border-radius: 4px;
}

.cell-select:focus,
.cell-input:focus {
  background: var(--p-primary-50, #eff6ff);
  box-shadow: inset 0 0 0 2px var(--p-primary-300, #93c5fd);
}

.cell-input::placeholder { color: var(--p-text-muted-color); opacity: 0.5; }

.cell-check {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.empty {
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
  font-style: italic;
  padding: 0.5rem 0;
}
</style>
