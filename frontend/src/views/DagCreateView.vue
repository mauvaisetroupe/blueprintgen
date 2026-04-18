<script setup lang="ts">
import { ref } from 'vue'
import { useDagStore } from '@/stores/dag'
import { useRouter } from 'vue-router'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Button from 'primevue/button'

const store = useDagStore()
const router = useRouter()

const name = ref('')
const description = ref('')

function submit() {
  if (!name.value.trim()) return
  const dag = store.createDag(name.value.trim(), description.value.trim())
  router.push(`/dag/${dag.id}`)
}
</script>

<template>
  <div class="create-view">
    <h1>New DAG</h1>
    <form @submit.prevent="submit" class="form">
      <div class="field">
        <label for="name">Name *</label>
        <InputText id="name" v-model="name" placeholder="My architecture" autofocus />
      </div>
      <div class="field">
        <label for="description">Description</label>
        <Textarea id="description" v-model="description" placeholder="Brief description of the solution" rows="3" />
      </div>
      <div class="form-actions">
        <Button label="Cancel" severity="secondary" @click="router.back()" />
        <Button label="Create" icon="pi pi-check" type="submit" :disabled="!name.trim()" />
      </div>
    </form>
  </div>
</template>

<style scoped>
.create-view {
  padding: 2rem;
  max-width: 480px;
}

.create-view h1 {
  margin-bottom: 1.5rem;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.field label {
  font-size: 0.875rem;
  font-weight: 600;
}

.field :deep(input),
.field :deep(textarea) {
  width: 100%;
}

.form-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}
</style>
