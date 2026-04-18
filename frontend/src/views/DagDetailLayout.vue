<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useDagStore } from '@/stores/dag'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'

const route = useRoute()
const store = useDagStore()

const dag = computed(() => store.getDag(route.params.id as string))

const tabs = [
  { label: 'Overview',             route: '',           value: '0' },
  { label: 'Landscape',            route: 'landscape',  value: '1' },
  { label: 'Technical Landscape',  route: 'technical',  value: '2' },
  { label: 'Application Flows',    route: 'flows',      value: '3' },
]
</script>

<template>
  <div v-if="dag" class="detail-layout">
    <div class="detail-header">
      <h2>{{ dag.name }}</h2>
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
}

.detail-header {
  padding: 1.25rem 1.5rem 0;
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
  overflow: auto;
  padding: 1.5rem;
}

.not-found {
  padding: 2rem;
  color: var(--p-text-muted-color);
}
</style>
