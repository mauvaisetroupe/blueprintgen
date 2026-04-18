<script setup lang="ts">
import { useDagStore } from '@/stores/dag'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Card from 'primevue/card'

const store = useDagStore()
const router = useRouter()
</script>

<template>
  <div class="dag-list">
    <div class="list-header">
      <h1>DAGs</h1>
      <Button label="New DAG" icon="pi pi-plus" @click="router.push('/dag/new')" />
    </div>

    <div v-if="store.dags.length === 0" class="empty">
      <p>No DAG yet. Create your first one.</p>
    </div>

    <div class="dag-grid">
      <Card
        v-for="dag in store.dags"
        :key="dag.id"
        class="dag-card"
        @click="router.push(`/dag/${dag.id}`)"
      >
        <template #title>{{ dag.name }}</template>
        <template #content>
          <p class="dag-desc">{{ dag.description || '—' }}</p>
          <p class="dag-meta">
            {{ dag.components.length }} component(s) · {{ dag.categories.length }} categories
          </p>
        </template>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.dag-list {
  padding: 2rem;
  max-width: 960px;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
}

.list-header h1 {
  margin: 0;
}

.dag-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.dag-card {
  cursor: pointer;
}

.dag-desc {
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
  margin-bottom: 0.5rem;
}

.dag-meta {
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
}

.empty {
  color: var(--p-text-muted-color);
  font-style: italic;
}
</style>
