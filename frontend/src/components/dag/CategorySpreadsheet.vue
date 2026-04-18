<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { useDagStore } from '@/stores/dag'
import type { Category, Component } from '@/types/dag'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'

const props = defineProps<{
  dagId: string
  category: Category
  components: Component[]
}>()

const store = useDagStore()

// --- Category name editing ---
const editingName = ref(false)
const editedName = ref('')

function startEditName() {
  editedName.value = props.category.name
  editingName.value = true
}

function saveName() {
  if (editedName.value.trim()) {
    store.updateCategory(props.dagId, props.category.id, { name: editedName.value.trim() })
  }
  editingName.value = false
}

// --- Cell refs for focus management ---
const cellRefs = ref<HTMLInputElement[][]>([])

function setCellRef(el: HTMLInputElement | null, rowIndex: number, colIndex: number) {
  if (!cellRefs.value[rowIndex]) cellRefs.value[rowIndex] = []
  if (el) cellRefs.value[rowIndex][colIndex] = el
}

async function focusCell(rowIndex: number, colIndex: number) {
  await nextTick()
  cellRefs.value[rowIndex]?.[colIndex]?.focus()
}

// --- Inline updates ---
function updateName(component: Component, value: string) {
  store.updateComponent(props.dagId, component.id, { name: value })
}

function updateDescription(component: Component, value: string) {
  store.updateComponent(props.dagId, component.id, { description: value })
}

// --- Add row ---
async function addRow(focusRow?: number) {
  store.addComponent(props.dagId, '', '', props.category.id)
  const newIndex = focusRow ?? props.components.length
  await focusCell(newIndex, 0)
}

// --- Keyboard navigation ---
function onKeydown(e: KeyboardEvent, rowIndex: number, colIndex: number) {
  if (e.key === 'Tab') {
    e.preventDefault()
    const nextCol = colIndex + 1
    if (nextCol < 2) {
      focusCell(rowIndex, nextCol)
    } else if (rowIndex + 1 < props.components.length) {
      focusCell(rowIndex + 1, 0)
    } else {
      addRow(rowIndex + 1)
    }
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (rowIndex + 1 < props.components.length) {
      focusCell(rowIndex + 1, 0)
    } else {
      addRow(rowIndex + 1)
    }
  } else if (e.key === 'Backspace' && colIndex === 0) {
    const component = props.components[rowIndex]
    if (component && component.name === '' && component.description === '') {
      e.preventDefault()
      store.deleteComponent(props.dagId, component.id)
      focusCell(Math.max(0, rowIndex - 1), 0)
    }
  }
}

// --- Paste from Excel (TSV) ---
function onPaste(e: ClipboardEvent, rowIndex: number, colIndex: number) {
  const text = e.clipboardData?.getData('text/plain') ?? ''

  // Single value paste — let the browser handle it normally
  if (!text.includes('\t') && !text.includes('\n')) return

  e.preventDefault()

  const rows = text.trimEnd().split('\n').map((r) => r.split('\t'))
  let currentRow = rowIndex

  for (const [i, cols] of rows.entries()) {
    const name = (colIndex === 0 ? cols[0] : '') ?? ''
    const description = (colIndex === 0 ? cols[1] : cols[0]) ?? ''

    const existingComponent = props.components[currentRow]
    if (i === 0 && existingComponent) {
      // Fill into the current row
      store.updateComponent(props.dagId, existingComponent.id, {
        name: name.trim(),
        description: description?.trim() ?? '',
      })
    } else {
      // Create new rows for subsequent lines
      store.addComponent(props.dagId, name.trim(), description?.trim() ?? '', props.category.id)
    }
    currentRow++
  }

  focusCell(currentRow - 1, 0)
}
</script>

<template>
  <div class="category-block">
    <!-- Category header -->
    <div class="category-header">
      <template v-if="editingName">
        <InputText
          v-model="editedName"
          size="small"
          autofocus
          @keyup.enter="saveName"
          @keyup.escape="editingName = false"
          @blur="saveName"
        />
      </template>
      <template v-else>
        <span class="category-title" @dblclick="startEditName">{{ category.name }}</span>
        <Button icon="pi pi-pencil" size="small" text severity="secondary" @click="startEditName" />
        <Button icon="pi pi-trash" size="small" text severity="danger" @click="store.deleteCategory(dagId, category.id)" />
      </template>
    </div>

    <!-- Spreadsheet table -->
    <table class="sheet">
      <thead>
        <tr>
          <th class="col-name">Name</th>
          <th class="col-desc">Description</th>
          <th class="col-actions"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(component, rowIndex) in components" :key="component.id">
          <td>
            <input
              :ref="(el) => setCellRef(el as HTMLInputElement, rowIndex, 0)"
              class="cell-input"
              :value="component.name"
              placeholder="Name"
              @input="updateName(component, ($event.target as HTMLInputElement).value)"
              @keydown="onKeydown($event, rowIndex, 0)"
              @paste="onPaste($event, rowIndex, 0)"
            />
          </td>
          <td>
            <input
              :ref="(el) => setCellRef(el as HTMLInputElement, rowIndex, 1)"
              class="cell-input"
              :value="component.description"
              placeholder="Description"
              @input="updateDescription(component, ($event.target as HTMLInputElement).value)"
              @keydown="onKeydown($event, rowIndex, 1)"
              @paste="onPaste($event, rowIndex, 1)"
            />
          </td>
          <td class="col-actions">
            <Button
              icon="pi pi-times"
              size="small"
              text
              severity="danger"
              @click="store.deleteComponent(dagId, component.id)"
            />
          </td>
        </tr>
      </tbody>
    </table>

    <Button
      label="Add row"
      icon="pi pi-plus"
      size="small"
      text
      @click="addRow()"
    />
  </div>
</template>

<style scoped>
.category-block {
  border: 1px solid var(--p-content-border-color);
  border-radius: 8px;
  overflow: hidden;
}

.category-header {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  background: var(--p-content-background);
  border-bottom: 1px solid var(--p-content-border-color);
}

.category-title {
  font-weight: 600;
  flex: 1;
  cursor: default;
}

.sheet {
  width: 100%;
  border-collapse: collapse;
}

.sheet thead th {
  text-align: left;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  padding: 0.3rem 0.6rem;
  background: var(--p-surface-50, #fafafa);
  border-bottom: 1px solid var(--p-content-border-color);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.sheet tbody tr:hover {
  background: var(--p-surface-50, #fafafa);
}

.sheet td {
  padding: 2px 4px;
  border-bottom: 1px solid var(--p-content-border-color);
}

.sheet tbody tr:last-child td {
  border-bottom: none;
}

.cell-input {
  width: 100%;
  border: none;
  background: transparent;
  padding: 0.35rem 0.4rem;
  font-size: 0.9rem;
  font-family: inherit;
  color: inherit;
  outline: none;
  border-radius: 4px;
}

.cell-input:focus {
  background: var(--p-primary-50, #eff6ff);
  box-shadow: inset 0 0 0 2px var(--p-primary-300, #93c5fd);
}

.cell-input::placeholder {
  color: var(--p-text-muted-color);
  opacity: 0.5;
}

.col-name { width: 30%; }
.col-desc { width: 65%; }
.col-actions { width: 40px; }
</style>
