<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useDagStore } from '@/stores/dag'
import { DEFAULT_ZONE_NAMES, DEFAULT_ZONE_COLORS, allNetworkZones } from '@/types/dag'
import { generateTechnicalLandscapeDsl } from '@/utils/technicalLandscapeDslGenerator'
import { inlineSvgStyles, injectHtmlLabelsFalse } from '@/utils/svgInliner'
import MermaidDiagram from '@/components/MermaidDiagram.vue'
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import InputText from 'primevue/inputtext'
import Splitter from 'primevue/splitter'
import SplitterPanel from 'primevue/splitterpanel'
import ToggleSwitch from 'primevue/toggleswitch'
import mermaid from 'mermaid'

const route = useRoute()
const store = useDagStore()

const dag = computed(() => store.getDag(route.params.id as string))
const tl  = computed(() => dag.value?.technicalLandscape)

// --- Toggle ELK (au-dessus du diagramme) ---
const useElk = ref(dag.value?.technicalLandscape.useElk ?? false)
watch(useElk, (val) => { if (dag.value) store.setTechnicalLandscapeUseElk(dag.value.id, val) })

// --- DSL ---
const dsl = computed(() => dag.value ? generateTechnicalLandscapeDsl(dag.value) : '')

// --- Composants groupés par catégorie ---
const categoriesWithComponents = computed(() => {
  if (!dag.value) return []
  return dag.value.categories
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((cat) => ({
      category: cat,
      components: dag.value!.components.filter((c) => c.categoryId === cat.id && c.name.trim() !== ''),
    }))
    .filter((g) => g.components.length > 0)
})

// --- Toutes les zones (defaults + custom) ---
const zones = computed(() => tl.value ? allNetworkZones(tl.value) : [])

// --- Instances par composant ---
const instancesByComponent = computed(() => {
  const m = new Map<string, string[]>() // componentId → zoneId[]
  tl.value?.instances.forEach((i) => {
    if (!m.has(i.componentId)) m.set(i.componentId, [])
    m.get(i.componentId)!.push(i.networkZoneId)
  })
  return m
})

// Retourne l'instanceId pour un couple (componentId, zoneId)
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

// --- Export ---
const exportMenu = ref()

const exportMenuItems = computed(() => [
  {
    label: 'SVG',
    items: [
      { label: 'SVG standard',                                      icon: 'pi pi-image',       command: () => exportSvg(false) },
      { label: 'SVG — pptx-ready (text labels + inlined styles)',   icon: 'pi pi-file-export', command: () => exportSvg(true)  },
    ],
  },
  {
    label: 'Mermaid',
    items: [
      { label: 'Export DSL (.mmd)', icon: 'pi pi-code', command: () => exportMermaid() },
      { label: 'Copy to clipboard', icon: 'pi pi-copy', command: () => copyMermaid()   },
    ],
  },
])

async function exportSvg(pptxMode: boolean) {
  if (!dag.value || !dsl.value.trim()) return
  const source = pptxMode ? injectHtmlLabelsFalse(dsl.value) : dsl.value
  const id = `export-tech-${Date.now()}`
  const { svg } = await mermaid.render(id, source)
  const processed = pptxMode ? inlineSvgStyles(svg) : svg
  const blob = new Blob([processed], { type: 'image/svg+xml' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${dag.value.name.replace(/[^\w\s-]/g, '').trim()}-technical${pptxMode ? '-pptx' : ''}.svg`
  a.click()
  URL.revokeObjectURL(url)
}

function exportMermaid() {
  if (!dag.value || !dsl.value.trim()) return
  const blob = new Blob([dsl.value], { type: 'text/plain' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${dag.value.name.replace(/[^\w\s-]/g, '').trim()}-technical.mmd`
  a.click()
  URL.revokeObjectURL(url)
}

async function copyMermaid() {
  if (!dsl.value.trim()) return
  await navigator.clipboard.writeText(dsl.value)
}
</script>

<template>
  <div v-if="dag && tl" class="technical">

    <div class="toolbar">
      <div class="toolbar-spacer" />
      <Button label="Export" icon="pi pi-download" size="small" severity="secondary" @click="exportMenu?.toggle($event)" />
      <Menu ref="exportMenu" :model="exportMenuItems" popup />
    </div>

    <Splitter class="tech-splitter" state-key="technical-splitter" state-storage="local">

      <!-- Panneau gauche : spreadsheet technique -->
      <SplitterPanel :size="55" :min-size="30" class="tech-left-panel">
        <div class="tech-sections">

          <!-- Section zones réseau -->
          <div class="zones-section">
            <div class="section-header">
              <h4>Network Zones</h4>
              <Button icon="pi pi-plus" size="small" text severity="secondary" title="Add zone" @click="addingZone = true" />
            </div>
            <div class="zones-list">
              <span
                v-for="zone in zones"
                :key="zone.id"
                class="zone-tag"
                :style="zoneStyle(zone.name)"
              >
                {{ zone.name }}
                <button
                  v-if="!isDefaultZone(zone.name)"
                  class="zone-delete"
                  title="Delete zone"
                  @click="store.deleteNetworkZone(dag!.id, zone.id)"
                >×</button>
              </span>
            </div>
            <div v-if="addingZone" class="add-zone-form">
              <InputText
                v-model="newZoneName"
                placeholder="Zone name"
                size="small"
                autofocus
                @keyup.enter="submitAddZone"
                @keyup.escape="addingZone = false"
              />
              <Button icon="pi pi-check" size="small" @click="submitAddZone" />
              <Button icon="pi pi-times" size="small" severity="secondary" @click="addingZone = false" />
            </div>
          </div>

          <!-- Spreadsheet par catégorie -->
          <div
            v-for="group in categoriesWithComponents"
            :key="group.category.id"
            class="category-block"
          >
            <div class="category-header">
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
                    <input
                      class="cell-input"
                      :value="comp.technology ?? ''"
                      placeholder="e.g. Java"
                      @change="updateComponent(comp.id, { technology: ($event.target as HTMLInputElement).value.trim() || undefined })"
                    />
                  </td>
                  <td>
                    <input
                      class="cell-input"
                      :value="comp.framework ?? ''"
                      placeholder="e.g. Spring Boot"
                      @change="updateComponent(comp.id, { framework: ($event.target as HTMLInputElement).value.trim() || undefined })"
                    />
                  </td>
                  <td>
                    <input
                      class="cell-input"
                      :value="comp.constraints ?? ''"
                      placeholder="e.g. stateless"
                      @change="updateComponent(comp.id, { constraints: ($event.target as HTMLInputElement).value.trim() || undefined })"
                    />
                  </td>
                  <td class="col-zones">
                    <div class="zone-checkboxes">
                      <label
                        v-for="zone in zones"
                        :key="zone.id"
                        class="zone-checkbox-label"
                        :class="{ active: instancesByComponent.get(comp.id)?.includes(zone.id) }"
                        :style="zoneCheckboxStyle(zone.name, instancesByComponent.get(comp.id)?.includes(zone.id) ?? false)"
                      >
                        <input
                          type="checkbox"
                          :checked="instancesByComponent.get(comp.id)?.includes(zone.id)"
                          @change="toggleZone(comp.id, zone.id)"
                        />
                        {{ zone.name }}
                      </label>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

        </div>
      </SplitterPanel>

      <!-- Panneau droit : diagramme -->
      <SplitterPanel :size="45" :min-size="25" class="tech-right-panel">
        <div class="diagram-toolbar">
          <div class="toolbar-toggle">
            <ToggleSwitch v-model="useElk" input-id="tech-elk" size="small" />
            <label for="tech-elk">ELK</label>
          </div>
          <div v-if="categoriesWithComponents.length > 0" class="subgraph-options">
            <span class="subgraph-label">Subgraphs:</span>
            <label
              v-for="group in categoriesWithComponents"
              :key="group.category.id"
              class="toggle-label"
            >
              <input
                type="checkbox"
                :checked="tl.categorySubgraphs?.[group.category.id] ?? group.category.showSubgraph"
                @change="store.setTechnicalCategorySubgraph(dag!.id, group.category.id, ($event.target as HTMLInputElement).checked)"
              />
              {{ group.category.name }}
            </label>
          </div>
        </div>
        <div class="diagram-wrap">
          <MermaidDiagram v-if="dsl" :code="dsl" />
          <p v-else class="empty-diagram">Add components and assign zones to see the diagram.</p>
        </div>
      </SplitterPanel>

    </Splitter>
  </div>
</template>

<style scoped>
.technical {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--p-content-border-color);
  flex-shrink: 0;
}

.toolbar-spacer { flex: 1; }

.tech-splitter {
  flex: 1;
  min-height: 0;
  border: none !important;
}

.tech-left-panel {
  overflow-y: auto;
  padding: 0 !important;
  border-right: 1px solid var(--p-content-border-color);
}

.tech-right-panel {
  overflow: auto;
  padding: 0 !important;
  display: flex;
  flex-direction: column;
}

.diagram-toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--p-content-border-color);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.toolbar-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.subgraph-options {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  font-size: 0.875rem;
}

.subgraph-label { font-weight: 600; }

.toggle-label {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  cursor: pointer;
}

.tech-sections {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem 1.5rem;
}

/* --- Zones réseau --- */
.zones-section {
  border: 1px solid var(--p-content-border-color);
  border-radius: 8px;
  padding: 0.75rem 1rem;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.section-header h4 {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
}

.zones-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

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

.zone-delete {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--p-text-muted-color);
  font-size: 0.9rem;
  line-height: 1;
  padding: 0;
}

.zone-delete:hover { color: #dc2626; }

.add-zone-form {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.5rem;
}

/* --- Spreadsheet --- */
.category-block {
  border: 1px solid var(--p-content-border-color);
  border-radius: 8px;
  overflow: hidden;
}

.category-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: var(--p-surface-200, #e4e4e7);
  border-bottom: 1px solid var(--p-content-border-color);
}

.category-title {
  font-weight: 600;
  font-size: 0.9rem;
}


.sheet {
  width: 100%;
  border-collapse: collapse;
}

.sheet thead th {
  text-align: left;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  padding: 0.3rem 0.6rem;
  background: var(--p-surface-50, #fafafa);
  border-bottom: 1px solid var(--p-content-border-color);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.sheet tbody tr:hover { background: var(--p-surface-50, #fafafa); }

.sheet td {
  padding: 2px 4px;
  border-bottom: 1px solid var(--p-content-border-color);
  vertical-align: middle;
}

.sheet tbody tr:last-child td { border-bottom: none; }

.col-name        { width: 14%; }
.col-tech        { width: 14%; }
.col-fw          { width: 18%; }
.col-constraints { width: 18%; }
.col-zones       { width: 36%; }

.cell-name {
  font-weight: 500;
  padding: 0.35rem 0.6rem;
  font-size: 0.875rem;
  color: var(--p-text-color);
}

.cell-input {
  width: 100%;
  border: none;
  background: transparent;
  padding: 0.35rem 0.4rem;
  font-size: 0.875rem;
  font-family: inherit;
  color: inherit;
  outline: none;
  border-radius: 4px;
}

.cell-input:focus {
  background: var(--p-primary-50, #eff6ff);
  box-shadow: inset 0 0 0 2px var(--p-primary-300, #93c5fd);
}

.cell-input::placeholder {
  color: var(--p-text-muted-color);
  opacity: 0.5;
}

/* --- Zone checkboxes --- */
.zone-checkboxes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  padding: 0.25rem 0.4rem;
}

.zone-checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.78rem;
  padding: 0.15rem 0.5rem;
  border-radius: 20px;
  border: 1px solid var(--p-content-border-color);
  cursor: pointer;
  background: var(--p-surface-0, #fff);
  transition: background 0.15s, border-color 0.15s;
}

.zone-checkbox-label input[type="checkbox"] { display: none; }

.zone-checkbox-label.active {
  background: var(--p-primary-100, #dbeafe);
  border-color: var(--p-primary-400, #60a5fa);
  color: var(--p-primary-700, #1d4ed8);
  font-weight: 600;
}

.diagram-wrap {
  flex: 1;
  overflow: auto;
  padding: 1rem;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.empty-diagram {
  color: var(--p-text-muted-color);
  font-style: italic;
  font-size: 0.875rem;
}
</style>
