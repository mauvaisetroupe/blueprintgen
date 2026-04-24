<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDagStore } from '@/stores/dag'
import type { DagImportDraft } from '@/types/dag'

const IMPORT_STORAGE_KEY = 'blueprintgen:import'

const router = useRouter()
const store = useDagStore()
const errorMessage = ref<string | null>(null)

onMounted(() => {
  const raw = localStorage.getItem(IMPORT_STORAGE_KEY)
  if (!raw) {
    errorMessage.value = 'No import data found.'
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

  if (!draft.id || !draft.name || !Array.isArray(draft.categories)) {
    errorMessage.value = 'Import data is missing required fields (id, name, categories).'
    localStorage.removeItem(IMPORT_STORAGE_KEY)
    return
  }

  localStorage.removeItem(IMPORT_STORAGE_KEY)
  const dag = store.importDag(draft)
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
