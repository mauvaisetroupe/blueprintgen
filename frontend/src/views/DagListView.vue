<script setup lang="ts">
import { ref } from 'vue'
import { useDagStore } from '@/stores/dag'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Card from 'primevue/card'
import ConfirmDialog from 'primevue/confirmdialog'
import { useConfirm } from 'primevue/useconfirm'

const store = useDagStore()
const router = useRouter()
const confirm = useConfirm()

function deleteDag(dagId: string, dagName: string, event: MouseEvent) {
  event.stopPropagation()
  confirm.require({
    message: `Delete "${dagName}"? This cannot be undone.`,
    header: 'Delete DAG',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptSeverity: 'danger',
    accept: () => store.deleteDag(dagId),
  })
}
</script>

<template>
  <div class="dag-list">
    <ConfirmDialog />

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
        <template #title>
          <div class="card-title-row">
            <span>{{ dag.name }}</span>
            <Button
              icon="pi pi-trash"
              size="small"
              text
              severity="danger"
              class="delete-btn"
              @click="deleteDag(dag.id, dag.name, $event)"
            />
          </div>
        </template>
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

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.delete-btn {
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
}

.dag-card:hover .delete-btn {
  opacity: 1;
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
