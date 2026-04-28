<script setup lang="ts">
import { computed, inject, ref, watch, type Ref } from 'vue'
import { useRoute } from 'vue-router'
import { useDagStore } from '@/stores/dag'
import { DEFAULT_ZONE_NAMES, DEFAULT_ZONE_COLORS, allNetworkZones, allCategories } from '@/types/dag'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'

const route = useRoute()
const store = useDagStore()

const dag = computed(() => store.getDag(route.params.id as string))
const tl  = computed(() => dag.value?.technicalLandscape)

// --- Active tab ---
const activeTab = ref<string>('components')

// --- Toggle ELK ---
const useElk = ref(dag.value?.technicalLandscape.useElk ?? false)
watch(useElk, (val) => { if (dag.value) store.setTechnicalLandscapeUseElk(dag.value.id, val) })

// --- Composants groupés par catégorie (tab Components) — business + technical ---
const categoriesWithComponents = computed(() => {
  if (!dag.value) return []
  const allComps = [...dag.value.components, ...dag.value.technicalComponents]
  return allCategories(dag.value)
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((cat) => ({
      category: cat,
      components: allComps.filter((c) => c.categoryId === cat.id && c.name.trim() !== ''),
    }))
    .filter((g) => g.components.length > 0)
})

// --- Zones ---
const zones = computed(() => tl.value ? allNetworkZones(tl.value) : [])

// --- Instances par composant ---
const instancesByComponent = computed(() => {
  const m = new Map<string, string[]>()
  tl.value?.instances.forEach((i) => {
    if (!m.has(i.componentId)) m.set(i.componentId, [])
    m.get(i.componentId)!.push(i.networkZoneId)
  })
  return m
})

function getInstanceId(componentId: string, zoneId: string): string | undefined {
  return tl.value?.instances.find((i) => i.componentId === componentId && i.networkZoneId === zoneId)?.id
}

function toggleZone(componentId: string, zoneId: string) {
  if (!dag.value) return
  const instanceId = getInstanceId(componentId, zoneId)
  if (instanceId) {
    store.removeZoneAssignment(dag.value.id, instanceId)
  } else {
    store.assignZone(dag.value.id, componentId, zoneId)
  }
}

function updateComponent(componentId: string, patch: { technology?: string; framework?: string; constraints?: string }) {
  if (!dag.value) return
  const isTechnical = dag.value.technicalComponents.some((c) => c.id === componentId)
  if (isTechnical)
    store.updateTechnicalComponent(dag.value.id, componentId, patch)
  else
    store.updateComponent(dag.value.id, componentId, patch)
}

// --- Gestion des zones réseau ---
const addingZone = ref(false)
const newZoneName = ref('')

function submitAddZone() {
  if (!newZoneName.value.trim() || !dag.value) return
  store.addNetworkZone(dag.value.id, newZoneName.value.trim())
  newZoneName.value = ''
  addingZone.value = false
}

function isDefaultZone(name: string): boolean {
  return DEFAULT_ZONE_NAMES.has(name.toLowerCase())
}

function zoneStyle(name: string): Record<string, string> {
  const colors = DEFAULT_ZONE_COLORS.get(name.toLowerCase())
  if (!colors) return {}
  return { background: colors.fill, borderColor: colors.stroke, color: '#064e3b' }
}

function zoneCheckboxStyle(name: string, checked: boolean): Record<string, string> {
  const colors = DEFAULT_ZONE_COLORS.get(name.toLowerCase())
  if (!colors || !checked) return {}
  return { background: colors.fill, borderColor: colors.stroke, color: '#064e3b', fontWeight: '600' }
}

</script>

<template>
  <div v-if="dag && tl" class="tech-sections">
    
    <!-- Section zones réseau -->
    <div class="section-block">
      <div class="section-header">
        <h4>Network Zones</h4>
        <Button icon="pi pi-plus" size="small" text severity="secondary" title="Add zone" @click="addingZone = true" />
      </div>
      <div class="zones-list">
        <span v-for="zone in zones" :key="zone.id" class="zone-tag" :style="zoneStyle(zone.name)">
          {{ zone.name }}
          <button v-if="!isDefaultZone(zone.name)" class="zone-delete" title="Delete zone" @click="store.deleteNetworkZone(dag!.id, zone.id)">×</button>
        </span>
      </div>
      <div v-if="addingZone" class="add-zone-form">
        <InputText v-model="newZoneName" placeholder="Zone name" size="small" autofocus @keyup.enter="submitAddZone" @keyup.escape="addingZone = false" />
        <Button icon="pi pi-check" size="small" @click="submitAddZone" />
        <Button icon="pi pi-times" size="small" severity="secondary" @click="addingZone = false" />
      </div>
    </div>

    <!-- Spreadsheet par catégorie -->
    <div v-for="group in categoriesWithComponents" :key="group.category.id" class="section-block">
      <div class="section-header">
        <span class="category-title">{{ group.category.name }}</span>
      </div>
      <table class="sheet">
        <thead>
          <tr>
            <th class="col-name">Component</th>
            <th class="col-tech">Technology</th>
            <th class="col-fw">Framework</th>
            <th class="col-constraints">Constraints</th>
            <th class="col-zones">Network Zone(s)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="comp in group.components" :key="comp.id">
            <td class="col-name cell-name">{{ comp.name }}</td>
            <td>
              <input class="cell-input" :value="comp.technology ?? ''" placeholder="e.g. Java"
                @change="updateComponent(comp.id, { technology: ($event.target as HTMLInputElement).value.trim() || undefined })" />
            </td>
            <td>
              <input class="cell-input" :value="comp.framework ?? ''" placeholder="e.g. Spring Boot"
                @change="updateComponent(comp.id, { framework: ($event.target as HTMLInputElement).value.trim() || undefined })" />
            </td>
            <td>
              <input class="cell-input" :value="comp.constraints ?? ''" placeholder="e.g. stateless"
                @change="updateComponent(comp.id, { constraints: ($event.target as HTMLInputElement).value.trim() || undefined })" />
            </td>
            <td class="col-zones">
              <div class="zone-checkboxes">
                <label v-for="zone in zones" :key="zone.id" class="zone-checkbox-label"
                  :class="{ active: instancesByComponent.get(comp.id)?.includes(zone.id) }"
                  :style="zoneCheckboxStyle(zone.name, instancesByComponent.get(comp.id)?.includes(zone.id) ?? false)">
                  <input type="checkbox" :checked="instancesByComponent.get(comp.id)?.includes(zone.id)" @change="toggleZone(comp.id, zone.id)" />
                  {{ zone.name }}
                </label>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="categoriesWithComponents.length === 0" class="empty-state">No components yet.</p>
  </div>
</template>

<style scoped>

.tech-sections {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem 1.5rem;
}

.section-block {
  border: 1px solid var(--p-content-border-color);
  border-radius: 8px;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: var(--p-surface-200, #e4e4e7);
  border-bottom: 1px solid var(--p-content-border-color);
}

.section-header h4 {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
}

.category-title { font-weight: 600; font-size: 0.9rem; }

/* ── Zones ── */
.zones-list { display: flex; flex-wrap: wrap; gap: 0.4rem; padding: 0.6rem 0.75rem; }

.zone-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.2rem 0.6rem;
  background: var(--p-surface-100, #f4f4f5);
  border: 1px solid var(--p-content-border-color);
  border-radius: 20px;
  font-size: 0.8rem;
}

.zone-delete { background: none; border: none; cursor: pointer; color: var(--p-text-muted-color); font-size: 0.9rem; line-height: 1; padding: 0; }
.zone-delete:hover { color: #dc2626; }

.add-zone-form { display: flex; align-items: center; gap: 0.4rem; padding: 0.5rem 0.75rem; }

/* ── Spreadsheet ── */
.sheet { width: 100%; border-collapse: collapse; }
.sheet thead th {
  text-align: left; font-size: 0.75rem; font-weight: 600; color: var(--p-text-muted-color);
  padding: 0.3rem 0.6rem; background: var(--p-surface-50, #fafafa);
  border-bottom: 1px solid var(--p-content-border-color);
  text-transform: uppercase; letter-spacing: 0.05em;
}
.sheet tbody tr:hover { background: var(--p-surface-50, #fafafa); }
.sheet td { padding: 2px 4px; border-bottom: 1px solid var(--p-content-border-color); vertical-align: middle; }
.sheet tbody tr:last-child td { border-bottom: none; }
.col-name { width: 14%; } .col-tech { width: 14%; } .col-fw { width: 18%; } .col-constraints { width: 18%; } .col-zones { width: 36%; }
.cell-name { font-weight: 500; padding: 0.35rem 0.6rem; font-size: 0.875rem; }

.cell-input {
  width: 100%; border: none; background: transparent;
  padding: 0.35rem 0.4rem; font-size: 0.875rem; font-family: inherit;
  color: inherit; outline: none; border-radius: 4px;
}
.cell-input:focus { background: var(--p-primary-50, #eff6ff); box-shadow: inset 0 0 0 2px var(--p-primary-300, #93c5fd); }
.cell-input::placeholder { color: var(--p-text-muted-color); opacity: 0.5; }

/* ── Zone checkboxes ── */
.zone-checkboxes { display: flex; flex-wrap: wrap; gap: 0.3rem; padding: 0.25rem 0.4rem; }
.zone-checkbox-label {
  display: inline-flex; align-items: center; gap: 0.25rem;
  font-size: 0.78rem; padding: 0.15rem 0.5rem; border-radius: 20px;
  border: 1px solid var(--p-content-border-color); cursor: pointer;
  background: var(--p-surface-0, #fff); transition: background 0.15s, border-color 0.15s;
}
.zone-checkbox-label input[type="checkbox"] { display: none; }
.zone-checkbox-label.active { background: var(--p-primary-100, #dbeafe); border-color: var(--p-primary-400, #60a5fa); color: var(--p-primary-700, #1d4ed8); font-weight: 600; }



.empty-state { color: var(--p-text-muted-color); font-style: italic; font-size: 0.875rem; padding: 1rem 0; }
</style>
