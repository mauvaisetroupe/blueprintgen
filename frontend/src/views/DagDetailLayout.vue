<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useDagStore } from '@/stores/dag'
import { exportToPptx } from '@/utils/pptxExporter'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import Button from 'primevue/button'

const route = useRoute()
const store = useDagStore()

const dag = computed(() => store.getDag(route.params.id as string))

const tabs = [
  { label: 'Components',           route: '',           value: '0' },
  { label: 'Landscape',            route: 'landscape',  value: '1' },
  { label: 'Application Flows',    route: 'flows',      value: '2' },
  { label: 'Technical Landscape',  route: 'technical',  value: '3' },
]

const exporting = ref(false)

async function handleExport() {
  if (!dag.value || exporting.value) return
  exporting.value = true
  try {
    await exportToPptx(dag.value)
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div v-if="dag" class="detail-layout">
    <div class="detail-header">
      <h2>{{ dag.name }}</h2>
      <Button
        label="Export PPTX"
        icon="pi pi-file-export"
        size="small"
        severity="secondary"
        :loading="exporting"
        @click="handleExport"
      />
    </div>

    <Tabs value="0" class="detail-tabs">
      <TabList>
        <Tab
          v-for="tab in tabs"
          :key="tab.value"
          :value="tab.value"
          as="div"
        >
          <router-link :to="`/dag/${dag.id}/${tab.route}`" class="tab-link">
            {{ tab.label }}
          </router-link>
        </Tab>
      </TabList>
    </Tabs>

    <div class="tab-content">
      <router-view />
    </div>
  </div>

  <div v-else class="not-found">DAG not found.</div>
</template>

<style scoped>
.detail-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.detail-header {
  padding: 1.25rem 1.5rem 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.detail-header h2 {
  margin: 0;
}

.detail-tabs {
  padding: 0 1.5rem;
}

.tab-link {
  text-decoration: none;
  color: inherit;
  display: block;
}

.tab-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 1.5rem;
}

/* Views that manage their own layout get no padding */
.tab-content:has(> .landscape),
.tab-content:has(> .flows) {
  padding: 0;
  overflow: hidden;
}

.not-found {
  padding: 2rem;
  color: var(--p-text-muted-color);
}
</style>
