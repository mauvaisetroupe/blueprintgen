<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDagStore } from '@/stores/dag'
import { DEFAULT_CATEGORIES, type DagImportDraft, type Dag } from '@/types/dag'

const IMPORT_STORAGE_KEY = 'blueprintgen:import'

const router = useRouter()
const store = useDagStore()
const errorMessage = ref<string | null>(null)

function generateId(): string {
  return crypto.randomUUID()
}

function now(): string {
  return new Date().toISOString()
}

function buildDag(draft: DagImportDraft): Dag {
  // Map category names to Category objects.
  // Match against DEFAULT_CATEGORIES first, otherwise create new ones.
  const defaultByName = new Map(DEFAULT_CATEGORIES.map((c) => [c.name.toLowerCase(), c]))

  const categories = draft.categories.map((name, index) => {
    const defaults = defaultByName.get(name.toLowerCase())
    return {
      id: generateId(),
      name: defaults?.name ?? name,
      order: defaults?.order ?? DEFAULT_CATEGORIES.length + index + 1,
      showSubgraph: defaults?.showSubgraph ?? true,
    }
  })

  const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]))

  const components = (draft.components ?? []).map((c) => ({
    id: generateId(),
    name: c.name,
    description: c.description,
    categoryId: categoryByName.get(c.category.toLowerCase())?.id ?? '',
  }))

  return {
    id: generateId(),
    name: draft.name,
    description: draft.description,
    createdAt: now(),
    updatedAt: now(),
    categories,
    components,
    relations: [],
    landscape: {},
    technicalLandscape: { components: [] },
    applicationFlows: [],
  }
}

onMounted(() => {
  const raw = localStorage.getItem(IMPORT_STORAGE_KEY)
  if (!raw) {
    errorMessage.value = 'No import data found in localStorage.'
    return
  }

  let draft: DagImportDraft
  try {
    draft = JSON.parse(raw) as DagImportDraft
  } catch {
    errorMessage.value = 'Import data is not valid JSON.'
    localStorage.removeItem(IMPORT_STORAGE_KEY)
    return
  }

  if (!draft.name || !Array.isArray(draft.categories)) {
    errorMessage.value = 'Import data is missing required fields (name, categories).'
    localStorage.removeItem(IMPORT_STORAGE_KEY)
    return
  }

  localStorage.removeItem(IMPORT_STORAGE_KEY)
  const dag = store.openDag(buildDag(draft))
  router.replace(`/dag/${dag.id}/components`)
})
</script>

<template>
  <div class="import-view">
    <template v-if="errorMessage">
      <p class="error">{{ errorMessage }}</p>
      <a href="/">Back to dashboard</a>
    </template>
    <template v-else>
      <p>Importing DAG…</p>
    </template>
  </div>
</template>

<style scoped>
.import-view {
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.error {
  color: var(--p-red-500, #e53e3e);
  font-weight: 600;
}
</style>
