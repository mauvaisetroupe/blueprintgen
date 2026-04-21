<script setup lang="ts">
import { computed, onMounted, provide, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useDagStore } from '@/stores/dag'
import { exportToPptx } from '@/utils/pptxExporter'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import ToggleSwitch from 'primevue/toggleswitch'
import { storeToRefs } from 'pinia'

const route = useRoute()
const store = useDagStore()
const { dslEditPreference } = storeToRefs(store)

const dag = computed(() => store.getDag(route.params.id as string))

// ── Edit mode (guided | manual) — partagé entre les onglets via provide/inject ──
const isComponents = computed(() => route.path.endsWith('/components'))

const dslEdit = ref()

onMounted(() => {
  setDslEdit()
})

watch(isComponents, () => {
  setDslEdit()
})

function setDslEdit() {
  if (isComponents.value) {
    dslEdit.value = false
  } else {
    dslEdit.value = dslEditPreference.value
  }
}

watch(dslEdit, (newValue) => {
  if (!isComponents.value) {
    store.setDslEditPreference(newValue)
  }
})

provide('dslEdit', dslEdit)

const tabs = [
  { label: 'Components',           route: 'components', value: '0' },
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

function saveLocally() {
  if (!dag.value) return
  const json = JSON.stringify(dag.value, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${dag.value.name.replace(/[^\w\s-]/g, '').trim()}.json`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div v-if="dag" class="detail-layout">
    <div class="detail-header">
      <h2>{{ dag.name }}</h2>
      <div class="header-actions">

        <div class="elk-toggle">
          <ToggleSwitch
            v-model="dslEdit"
            :disabled="isComponents"
            size="small"
            input-id="dsl-switch"
          />
          <label for="dsl-switch">DSL Edit</label>
        </div>

        <Button
          icon="pi pi-save"
          size="small"
          severity="secondary"
          text
          title="Save locally"
          label="Save locally"
          @click="saveLocally"
        />
        <Button
          label="Export PPTX"
          icon="pi pi-file-export"
          size="small"
          severity="secondary"
          :loading="exporting"
          @click="handleExport"
        />
      </div>
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
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
.tab-content:has(> .flows),
.tab-content:has(> .components) {
  padding: 0;
  overflow: hidden;
}

.not-found {
  padding: 2rem;
  color: var(--p-text-muted-color);
}
.elk-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}
</style>
