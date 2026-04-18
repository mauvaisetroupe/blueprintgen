<script setup lang="ts">
import { ref } from 'vue'
import { useDagStore } from '@/stores/dag'
import type { Category, Component } from '@/types/dag'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Panel from 'primevue/panel'

const props = defineProps<{
  dagId: string
  category: Category
  components: Component[]
}>()

const store = useDagStore()

// --- Category editing ---
const editingName = ref(false)
const editedName = ref('')

function startEditCategory() {
  editedName.value = props.category.name
  editingName.value = true
}

function saveCategory() {
  if (!editedName.value.trim()) return
  store.updateCategory(props.dagId, props.category.id, { name: editedName.value.trim() })
  editingName.value = false
}

// --- Add component ---
const addingComponent = ref(false)
const newComponentName = ref('')
const newComponentDescription = ref('')

function submitAddComponent() {
  if (!newComponentName.value.trim()) return
  store.addComponent(props.dagId, newComponentName.value.trim(), newComponentDescription.value.trim(), props.category.id)
  newComponentName.value = ''
  newComponentDescription.value = ''
  addingComponent.value = false
}

// --- Edit component ---
const editingComponentId = ref<string | null>(null)
const editedComponentName = ref('')
const editedComponentDescription = ref('')

function startEditComponent(component: Component) {
  editingComponentId.value = component.id
  editedComponentName.value = component.name
  editedComponentDescription.value = component.description
}

function saveComponent() {
  if (!editedComponentName.value.trim() || !editingComponentId.value) return
  store.updateComponent(props.dagId, editingComponentId.value, {
    name: editedComponentName.value.trim(),
    description: editedComponentDescription.value.trim(),
  })
  editingComponentId.value = null
}
</script>

<template>
  <Panel class="category-panel">
    <template #header>
      <div class="panel-header">
        <template v-if="editingName">
          <InputText v-model="editedName" @keyup.enter="saveCategory" @keyup.escape="editingName = false" autofocus size="small" />
          <Button icon="pi pi-check" size="small" @click="saveCategory" />
          <Button icon="pi pi-times" size="small" severity="secondary" @click="editingName = false" />
        </template>
        <template v-else>
          <span class="category-name">{{ category.name }}</span>
          <Button icon="pi pi-pencil" size="small" severity="secondary" text @click="startEditCategory" />
          <Button icon="pi pi-trash" size="small" severity="danger" text @click="store.deleteCategory(dagId, category.id)" />
        </template>
      </div>
    </template>

    <!-- Component list -->
    <div class="component-list">
      <div v-for="component in components" :key="component.id" class="component-row">
        <template v-if="editingComponentId === component.id">
          <InputText v-model="editedComponentName" placeholder="Name" autofocus size="small" />
          <InputText v-model="editedComponentDescription" placeholder="Description" size="small" />
          <Button icon="pi pi-check" size="small" @click="saveComponent" />
          <Button icon="pi pi-times" size="small" severity="secondary" @click="editingComponentId = null" />
        </template>
        <template v-else>
          <span class="component-name">{{ component.name }}</span>
          <span class="component-desc">{{ component.description }}</span>
          <div class="row-actions">
            <Button icon="pi pi-pencil" size="small" severity="secondary" text @click="startEditComponent(component)" />
            <Button icon="pi pi-trash" size="small" severity="danger" text @click="store.deleteComponent(dagId, component.id)" />
          </div>
        </template>
      </div>

      <p v-if="components.length === 0" class="empty">No components yet.</p>
    </div>

    <!-- Add component form -->
    <div v-if="addingComponent" class="add-form">
      <InputText v-model="newComponentName" placeholder="Name" autofocus size="small" />
      <InputText v-model="newComponentDescription" placeholder="Description" size="small" />
      <Button icon="pi pi-check" size="small" @click="submitAddComponent" />
      <Button icon="pi pi-times" size="small" severity="secondary" @click="addingComponent = false" />
    </div>
    <Button
      v-else
      label="Add component"
      icon="pi pi-plus"
      size="small"
      text
      class="add-btn"
      @click="addingComponent = true"
    />
  </Panel>
</template>

<style scoped>
.panel-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
}

.category-name {
  font-weight: 600;
  flex: 1;
}

.component-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 0.75rem;
}

.component-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0;
  border-bottom: 1px solid var(--p-content-border-color);
}

.component-row:last-child {
  border-bottom: none;
}

.component-name {
  font-weight: 500;
  min-width: 120px;
}

.component-desc {
  flex: 1;
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
}

.row-actions {
  display: flex;
  gap: 0.25rem;
  margin-left: auto;
}

.add-form {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.add-btn {
  margin-top: 0.25rem;
}

.empty {
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}
</style>
