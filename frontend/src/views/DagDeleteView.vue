<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDagStore } from '@/stores/dag'

const route = useRoute()
const router = useRouter()
const store = useDagStore()
const errorMessage = ref<string | null>(null)

onMounted(() => {
  const id = route.params.id as string
  const dag = store.getDag(id)

  if (!dag) {
    errorMessage.value = `DAG ${id} not found.`
    return
  }

  store.deleteDag(id)
  router.replace('/')
})
</script>

<template>
  <div class="delete-view">
    <template v-if="errorMessage">
      <p class="error">{{ errorMessage }}</p>
      <a href="/">Back to dashboard</a>
    </template>
    <template v-else>
      <p>Deleting DAG…</p>
    </template>
  </div>
</template>

<style scoped>
.delete-view {
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
