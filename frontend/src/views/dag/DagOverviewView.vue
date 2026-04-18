<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useDagStore } from '@/stores/dag'
import CategorySpreadsheet from '@/components/dag/CategorySpreadsheet.vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'

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
        <Button
          v-if="!addingCategory"
          label="Add category"
          icon="pi pi-plus"
          size="small"
          @click="addingCategory = true"
        />
      </div>

      <div v-if="addingCategory" class="add-category-form">
        <InputText
          v-model="newCategoryName"
          placeholder="Category name"
          @keyup.enter="submitAddCategory"
          @keyup.escape="addingCategory = false"
          autofocus
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
.edit-form :deep(textarea) {
  width: 100%;
}

.edit-actions {
  display: flex;
  gap: 0.5rem;
}

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

.section-header h3 {
  margin: 0;
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
</style>
