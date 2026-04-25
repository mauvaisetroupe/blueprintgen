<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
import { useDagStore } from '@/stores/dag'
import type { Dag, Relation } from '@/types/dag'
import { allCategories } from '@/types/dag'
import Button from 'primevue/button'

const props = defineProps<{ dag: Dag }>()
const store = useDagStore()

// Components with a name, grouped by category for the selects
const componentOptions = computed(() =>
  props.dag.components.filter((c) => c.name.trim() !== ''),
)

function categoryName(componentId: string): string {
  const comp = props.dag.components.find((c) => c.id === componentId)
  if (!comp) return ''
  return allCategories(props.dag).find((c) => c.id === comp.categoryId)?.name ?? ''
}

// Group components by category for <optgroup>
const groupedComponents = computed(() => {
  const sorted = allCategories(props.dag).sort((a, b) => a.order - b.order)
  return sorted
    .map((cat) => ({
      category: cat,
      components: componentOptions.value.filter((c) => c.categoryId === cat.id),
    }))
    .filter((g) => g.components.length > 0)
})

// --- Cell focus management ---
const cellRefs = ref<(HTMLElement | null)[][]>([])

function setCellRef(el: HTMLElement | null, row: number, col: number) {
  if (!cellRefs.value[row]) cellRefs.value[row] = []
  cellRefs.value[row][col] = el
}

async function focusCell(row: number, col: number) {
  await nextTick()
  cellRefs.value[row]?.[col]?.focus()
}

// --- Add relation ---
async function addRow() {
  store.addRelation(props.dag.id, '', '', '')
  await focusCell(props.dag.relations.length - 1, 0)
}

// --- Inline updates ---
function updateFrom(relation: Relation, value: string) {
  store.updateRelation(props.dag.id, relation.id, { fromComponentId: value })
}

function updateTo(relation: Relation, value: string) {
  store.updateRelation(props.dag.id, relation.id, { toComponentId: value })
}

function updateLabel(relation: Relation, value: string) {
  store.updateRelation(props.dag.id, relation.id, { label: value })
}

// --- Keyboard navigation ---
function onKeydown(e: KeyboardEvent, rowIndex: number, colIndex: number) {
  if (e.key === 'Tab') {
    e.preventDefault()
    const nextCol = colIndex + 1
    if (nextCol < 3) {
      focusCell(rowIndex, nextCol)
    } else if (rowIndex + 1 < props.dag.relations.length) {
      focusCell(rowIndex + 1, 0)
    } else {
      addRow()
    }
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (rowIndex + 1 < props.dag.relations.length) {
      focusCell(rowIndex + 1, 0)
    } else {
      addRow()
    }
  }
}
</script>

<template>
  <div class="relation-block">
    <table class="sheet">
      <thead>
        <tr>
          <th class="col-from">From</th>
          <th class="col-arrow"></th>
          <th class="col-to">To</th>
          <th class="col-label">Label</th>
          <th class="col-actions"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(relation, rowIndex) in dag.relations" :key="relation.id">
          <!-- From -->
          <td>
            <select
              :ref="(el) => setCellRef(el as HTMLElement, rowIndex, 0)"
              :value="relation.fromComponentId"
              class="cell-select"
              @change="updateFrom(relation, ($event.target as HTMLSelectElement).value)"
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

          <!-- Arrow -->
          <td class="col-arrow">
            <span class="arrow">→</span>
          </td>

          <!-- To -->
          <td>
            <select
              :ref="(el) => setCellRef(el as HTMLElement, rowIndex, 1)"
              :value="relation.toComponentId"
              class="cell-select"
              @change="updateTo(relation, ($event.target as HTMLSelectElement).value)"
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
              :value="relation.label ?? ''"
              placeholder="HTTPS, REST…"
              @input="updateLabel(relation, ($event.target as HTMLInputElement).value)"
              @keydown="onKeydown($event, rowIndex, 2)"
            />
          </td>

          <!-- Delete -->
          <td class="col-actions">
            <Button
              icon="pi pi-times"
              size="small"
              text
              severity="danger"
              @click="store.deleteRelation(dag.id, relation.id)"
            />
          </td>
        </tr>
      </tbody>
    </table>

    <p v-if="dag.relations.length === 0" class="empty">No relations yet.</p>

    <Button label="Add relation" icon="pi pi-plus" size="small" text @click="addRow" />
  </div>
</template>

<style scoped>
.relation-block {
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

.sheet td {
  padding: 2px 4px;
  border-bottom: 1px solid var(--p-content-border-color);
  vertical-align: middle;
}

.sheet tbody tr:last-child td { border-bottom: none; }

.col-arrow { width: 24px; text-align: center; }
.col-label { width: 120px; }
.col-actions { width: 36px; }

.arrow {
  color: var(--p-text-muted-color);
  font-size: 1rem;
}

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

.empty {
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
  font-style: italic;
  padding: 0.5rem 0;
}
</style>
