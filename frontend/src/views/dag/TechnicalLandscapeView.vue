<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useDagStore } from '@/stores/dag'
import { DEFAULT_ZONE_NAMES, DEFAULT_ZONE_COLORS, allNetworkZones, allCategories } from '@/types/dag'
import type { ComponentInstance, TechnicalRelation } from '@/types/dag'
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

// --- Active tab ---
type Tab = 'components' | 'relations' | 'services' | 'security'
const activeTab = ref<Tab>('components')

// --- Toggle ELK ---
const useElk = ref(dag.value?.technicalLandscape.useElk ?? false)
watch(useElk, (val) => { if (dag.value) store.setTechnicalLandscapeUseElk(dag.value.id, val) })

// --- DSL ---
const dsl = computed(() => dag.value ? generateTechnicalLandscapeDsl(dag.value) : '')

// --- Composants groupés par catégorie (tab Components) ---
const categoriesWithComponents = computed(() => {
  if (!dag.value) return []
  return allCategories(dag.value)
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((cat) => ({
      category: cat,
      components: dag.value!.components.filter((c) => c.categoryId === cat.id && c.name.trim() !== ''),
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

// ─── Relations tab ────────────────────────────────────────────────────────────

// Toutes les relations logiques (manual + autoSync), sans distinction de source
const logicalRelations = computed(() => {
  if (!dag.value) return []
  const valid = new Set(dag.value.components.filter((c) => c.name.trim() !== '').map((c) => c.id))
  const seen  = new Set<string>()
  const result: Array<{ fromComponentId: string; toComponentId: string; protocol?: string }> = []

  for (const rel of dag.value.relations) {
    if (!valid.has(rel.fromComponentId) || !valid.has(rel.toComponentId)) continue
    const key = `${rel.fromComponentId}->${rel.toComponentId}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ fromComponentId: rel.fromComponentId, toComponentId: rel.toComponentId, protocol: rel.protocol })
  }

  if (dag.value.landscape.autoSync) {
    for (const flow of dag.value.applicationFlows) {
      for (const step of flow.steps.filter((s) => !s.isReturn)) {
        if (!valid.has(step.fromComponentId) || !valid.has(step.toComponentId)) continue
        const key = `${step.fromComponentId}->${step.toComponentId}`
        if (seen.has(key)) continue
        seen.add(key)
        result.push({ fromComponentId: step.fromComponentId, toComponentId: step.toComponentId, protocol: step.protocol })
      }
    }
  }
  return result
})

// TechnicalRelations pour une relation logique donnée
function technicalRelationsFor(fromCompId: string, toCompId: string): TechnicalRelation[] {
  return tl.value?.technicalRelations.filter(
    (tr) => tr.fromComponentId === fromCompId && tr.toComponentId === toCompId,
  ) ?? []
}

// Instances d'un composant
function instancesFor(componentId: string): ComponentInstance[] {
  return tl.value?.instances.filter((i) => i.componentId === componentId) ?? []
}

// Nom d'une zone à partir de son ID
function zoneName(zoneId: string): string {
  return zones.value.find((z) => z.id === zoneId)?.name ?? zoneId
}

// Nom d'un composant à partir de son ID
function compName(componentId: string): string {
  return dag.value?.components.find((c) => c.id === componentId)?.name ?? componentId
}

// Une relation est-elle multi-zone (au moins un côté a 2+ instances) ?
function isMultiZone(fromCompId: string, toCompId: string): boolean {
  return instancesFor(fromCompId).length > 1 || instancesFor(toCompId).length > 1
}

// ── Ajout d'une TechnicalRelation ──

interface AddingState {
  fromComponentId: string
  toComponentId: string
  fromInstanceId: string
  toInstanceId: string
  protocol: string
}

const addingRelation = ref<AddingState | null>(null)

function startAddRelation(fromCompId: string, toCompId: string) {
  const fromInsts = instancesFor(fromCompId)
  const toInsts   = instancesFor(toCompId)
  addingRelation.value = {
    fromComponentId: fromCompId,
    toComponentId:   toCompId,
    fromInstanceId:  fromInsts[0]?.id ?? '',
    toInstanceId:    toInsts[0]?.id  ?? '',
    protocol:        '',
  }
}

function submitAddRelation() {
  if (!dag.value || !addingRelation.value) return
  const { fromComponentId, toComponentId, fromInstanceId, toInstanceId, protocol } = addingRelation.value
  if (!fromInstanceId || !toInstanceId) return
  store.addTechnicalRelation(
    dag.value.id,
    fromComponentId,
    toComponentId,
    fromInstanceId,
    toInstanceId,
    protocol.trim() || undefined,
  )
  addingRelation.value = null
}

function cancelAddRelation() {
  addingRelation.value = null
}

// Auto-matérialise la première TechnicalRelation quand les deux côtés d'une relation logique
// ont au moins une instance assignée. Ne se déclenche que sur les changements structurels
// (ajout d'instance ou de relation), pas sur les suppressions de TechnicalRelations.
watch(
  [() => tl.value?.instances, () => dag.value?.relations?.length],
  () => {
    if (!dag.value) return
    for (const lr of logicalRelations.value) {
      const fromInsts = instancesFor(lr.fromComponentId)
      const toInsts   = instancesFor(lr.toComponentId)
      if (fromInsts.length === 0 || toInsts.length === 0) continue
      if (technicalRelationsFor(lr.fromComponentId, lr.toComponentId).length > 0) continue
      store.addTechnicalRelation(dag.value.id, lr.fromComponentId, lr.toComponentId, fromInsts[0]!.id, toInsts[0]!.id)
    }
  },
  { immediate: true },
)

function deletePhysicalRelation(relId: string) {
  if (!dag.value) return
  store.deleteTechnicalRelation(dag.value.id, relId)
}

function updateProtocol(relId: string, value: string) {
  if (!dag.value) return
  store.updateTechnicalRelation(dag.value.id, relId, { protocol: value.trim() || undefined })
}

// --- Export ---
const exportMenu = ref()
const exportMenuItems = computed(() => [
  {
    label: 'SVG',
    items: [
      { label: 'SVG standard',                                    icon: 'pi pi-image',       command: () => exportSvg(false) },
      { label: 'SVG — pptx-ready (text labels + inlined styles)', icon: 'pi pi-file-export', command: () => exportSvg(true)  },
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

    <!-- Toolbar : tabs + export -->
    <div class="toolbar">
      <div class="tabs">
        <button :class="['tab', { active: activeTab === 'components' }]" @click="activeTab = 'components'">Components</button>
        <button :class="['tab', { active: activeTab === 'relations' }]" @click="activeTab = 'relations'">
          Relations
          <span v-if="logicalRelations.length" class="tab-badge">{{ logicalRelations.length }}</span>
        </button>
        <button :class="['tab', { active: activeTab === 'services' }]" @click="activeTab = 'services'">Services</button>
        <button :class="['tab', { active: activeTab === 'security' }]" @click="activeTab = 'security'">Security</button>
      </div>
      <div class="toolbar-spacer" />
      <Button label="Export" icon="pi pi-download" size="small" severity="secondary" @click="exportMenu?.toggle($event)" />
      <Menu ref="exportMenu" :model="exportMenuItems" popup />
    </div>

    <Splitter class="tech-splitter" state-key="technical-splitter" state-storage="local">

      <!-- Panneau gauche : contenu du tab actif -->
      <SplitterPanel :size="55" :min-size="30" class="tech-left-panel">

        <!-- ── TAB : Components ── -->
        <div v-if="activeTab === 'components'" class="tech-sections">

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

        <!-- ── TAB : Relations ── -->
        <div v-else-if="activeTab === 'relations'" class="tech-sections">
          <p v-if="logicalRelations.length === 0" class="empty-state">
            No logical relations yet. Add relations in the Application Landscape<span v-if="!dag.landscape.autoSync"> or enable AutoSync</span>.
          </p>

          <div v-for="lr in logicalRelations" :key="`${lr.fromComponentId}->${lr.toComponentId}`" class="rel-block">
            <!-- En-tête : noms logiques + badge + bouton ajout (multi-zone uniquement) -->
            <div class="rel-header">
              <span class="rel-comp">{{ compName(lr.fromComponentId) }}</span>
              <span class="rel-arrow">→</span>
              <span class="rel-comp">{{ compName(lr.toComponentId) }}</span>
              <span v-if="instancesFor(lr.fromComponentId).length === 0 || instancesFor(lr.toComponentId).length === 0"
                class="rel-badge warn" title="One or both components have no zone assigned">⚠ no zone</span>
              <div class="rel-header-spacer" />
              <Button v-if="isMultiZone(lr.fromComponentId, lr.toComponentId)" icon="pi pi-plus" size="small" text severity="secondary" title="Add instance pair"
                @click="startAddRelation(lr.fromComponentId, lr.toComponentId)" />
            </div>

            <!-- Une ligne par TechnicalRelation existante -->
            <div v-for="tr in technicalRelationsFor(lr.fromComponentId, lr.toComponentId)" :key="tr.id" class="rel-row">
              <!-- côté source : pill si 1 seule instance, select si plusieurs -->
              <template v-if="instancesFor(lr.fromComponentId).length <= 1">
                <span class="zone-pill">{{ zoneName(instancesFor(lr.fromComponentId).find(i => i.id === tr.fromInstanceId)?.networkZoneId ?? '') }}</span>
              </template>
              <template v-else>
                <select :value="tr.fromInstanceId" class="zone-select"
                  @change="store.updateTechnicalRelation(dag!.id, tr.id, { fromInstanceId: ($event.target as HTMLSelectElement).value })">
                  <option v-for="inst in instancesFor(lr.fromComponentId)" :key="inst.id" :value="inst.id">{{ zoneName(inst.networkZoneId) }}</option>
                </select>
              </template>
              <span class="rel-comp-sm">{{ compName(lr.fromComponentId) }}</span>
              <span class="rel-arrow-sm">→</span>
              <!-- côté destination : pill si 1 seule instance, select si plusieurs -->
              <template v-if="instancesFor(lr.toComponentId).length <= 1">
                <span class="zone-pill">{{ zoneName(instancesFor(lr.toComponentId).find(i => i.id === tr.toInstanceId)?.networkZoneId ?? '') }}</span>
              </template>
              <template v-else>
                <select :value="tr.toInstanceId" class="zone-select"
                  @change="store.updateTechnicalRelation(dag!.id, tr.id, { toInstanceId: ($event.target as HTMLSelectElement).value })">
                  <option v-for="inst in instancesFor(lr.toComponentId)" :key="inst.id" :value="inst.id">{{ zoneName(inst.networkZoneId) }}</option>
                </select>
              </template>
              <span class="rel-comp-sm">{{ compName(lr.toComponentId) }}</span>
              <input class="cell-input protocol-input"
                :value="tr.protocol ?? ''"
                :placeholder="lr.protocol ?? 'Protocol'"
                @change="updateProtocol(tr.id, ($event.target as HTMLInputElement).value)" />
              <Button icon="pi pi-times" size="small" text severity="danger" @click="deletePhysicalRelation(tr.id)" />
            </div>


            <!-- Formulaire d'ajout inline (multi-zone) -->
            <div v-if="addingRelation?.fromComponentId === lr.fromComponentId && addingRelation?.toComponentId === lr.toComponentId" class="rel-add-form">
              <select v-model="addingRelation.fromInstanceId" class="zone-select">
                <option v-for="inst in instancesFor(lr.fromComponentId)" :key="inst.id" :value="inst.id">
                  {{ zoneName(inst.networkZoneId) }}
                </option>
              </select>
              <span class="rel-comp-sm">{{ compName(lr.fromComponentId) }}</span>
              <span class="rel-arrow-sm">→</span>
              <select v-model="addingRelation.toInstanceId" class="zone-select">
                <option v-for="inst in instancesFor(lr.toComponentId)" :key="inst.id" :value="inst.id">
                  {{ zoneName(inst.networkZoneId) }}
                </option>
              </select>
              <span class="rel-comp-sm">{{ compName(lr.toComponentId) }}</span>
              <input v-model="addingRelation.protocol" class="cell-input protocol-input" placeholder="Protocol" @keyup.enter="submitAddRelation" @keyup.escape="cancelAddRelation" />
              <span class="rel-actions">
                <Button icon="pi pi-check" size="small" @click="submitAddRelation" />
                <Button icon="pi pi-times" size="small" severity="secondary" @click="cancelAddRelation" />
              </span>
            </div>
          </div>
        </div>

        <!-- ── TAB : Services ── -->
        <div v-else-if="activeTab === 'services'" class="tech-sections">
          <p class="empty-state coming-soon">Technical Services — coming soon.</p>
        </div>

        <!-- ── TAB : Security ── -->
        <div v-else-if="activeTab === 'security'" class="tech-sections">
          <p class="empty-state coming-soon">Security (AuthN/AuthZ, API Gateway, WAF) — coming soon.</p>
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
            <label v-for="group in categoriesWithComponents" :key="group.category.id" class="toggle-label">
              <input type="checkbox"
                :checked="tl.categorySubgraphs?.[group.category.id] ?? group.category.showSubgraph"
                @change="store.setTechnicalCategorySubgraph(dag!.id, group.category.id, ($event.target as HTMLInputElement).checked)" />
              {{ group.category.name }}
            </label>
          </div>
        </div>
        <div class="diagram-wrap">
          <MermaidDiagram v-if="dsl" :code="dsl" />
          <p v-else class="empty-state">Add components and assign zones to see the diagram.</p>
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

/* ── Toolbar ── */
.toolbar {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0 1rem 0 0;
  border-bottom: 1px solid var(--p-content-border-color);
  flex-shrink: 0;
}

.tabs {
  display: flex;
  align-items: stretch;
  gap: 0;
}

.tab {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0 1.1rem;
  height: 42px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-size: 0.875rem;
  font-family: inherit;
  color: var(--p-text-muted-color);
  white-space: nowrap;
  transition: color 0.15s, border-color 0.15s;
}

.tab:hover { color: var(--p-text-color); }

.tab.active {
  color: var(--p-primary-color);
  border-bottom-color: var(--p-primary-color);
  font-weight: 600;
}

.tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  background: var(--p-surface-200, #e4e4e7);
  border-radius: 9px;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
}

.tab.active .tab-badge {
  background: var(--p-primary-100, #dbeafe);
  color: var(--p-primary-700, #1d4ed8);
}

.toolbar-spacer { flex: 1; }

/* ── Splitter ── */
.tech-splitter { flex: 1; min-height: 0; border: none !important; }

.tech-left-panel { overflow-y: auto; padding: 0 !important; border-right: 1px solid var(--p-content-border-color); }
.tech-right-panel { overflow: auto; padding: 0 !important; display: flex; flex-direction: column; }

/* ── Sections communes ── */
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

/* ── Relations tab ── */
.rel-block {
  border: 1px solid var(--p-content-border-color);
  border-radius: 8px;
  overflow: hidden;
}

.rel-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  background: var(--p-surface-50, #fafafa);
  border-bottom: 1px solid var(--p-content-border-color);
  min-height: 38px;
}

.rel-block:last-child .rel-header:last-child { border-bottom: none; }

.rel-comp { font-weight: 500; font-size: 0.875rem; }
.rel-arrow { color: var(--p-text-muted-color); font-size: 0.9rem; }
.rel-arrow-sm { color: var(--p-text-muted-color); font-size: 0.8rem; flex-shrink: 0; }
.rel-header-spacer { flex: 1; }

.rel-badge {
  font-size: 0.72rem;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  font-weight: 600;
}
.rel-badge.warn { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }

.protocol-input {
  width: 100%;
  border: 1px solid var(--p-content-border-color) !important;
  border-radius: 4px;
  background: var(--p-surface-0, #fff) !important;
  padding: 0.25rem 0.4rem !important;
  font-size: 0.8rem !important;
}
.protocol-input:focus { border-color: var(--p-primary-400, #60a5fa) !important; box-shadow: none !important; }

/* Grille partagée : comp-from | zone-from | → | comp-to | zone-to | protocol | action
   Toutes les lignes (rel-row ET rel-add-form) utilisent exactement ces colonnes pour un
   alignement parfait entre les cas simple, multi-zone et formulaire d'ajout. */
.rel-row,
.rel-add-form {
  display: grid;
  grid-template-columns: 110px 1fr 18px 110px 1fr 110px 30px;
  align-items: center;
  column-gap: 0.4rem;
  padding: 0.3rem 0.75rem;
  border-bottom: 1px solid var(--p-content-border-color);
}
.rel-row:last-of-type { border-bottom: none; }

.rel-add-form {
  background: var(--p-surface-50, #fafafa);
  border-top: 1px dashed var(--p-content-border-color);
  border-bottom: none;
}

.rel-comp-sm {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.zone-pill {
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  border-radius: 20px;
  border: 1px solid #86efac;
  background: #f0fdf4;
  color: #064e3b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.rel-actions {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  grid-column: 7;  /* occupe la colonne action même si 2 boutons */
}

.zone-select {
  width: 100%;
  font-size: 0.75rem;
  font-family: inherit;
  padding: 0.15rem 1.2rem 0.15rem 0.5rem;
  border: 1px solid #86efac;
  border-radius: 20px;
  background: #f0fdf4 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23059669'/%3E%3C/svg%3E") no-repeat right 0.45rem center;
  color: #064e3b;
  cursor: pointer;
  appearance: none;
  text-align: left;
}

/* ── Diagram panel ── */
.diagram-toolbar {
  display: flex; align-items: center; gap: 1rem;
  padding: 0.5rem 1rem; border-bottom: 1px solid var(--p-content-border-color);
  flex-shrink: 0; flex-wrap: wrap;
}
.toolbar-toggle { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; }
.subgraph-options { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; font-size: 0.875rem; }
.subgraph-label { font-weight: 600; }
.toggle-label { display: flex; align-items: center; gap: 0.3rem; cursor: pointer; }

.diagram-wrap { flex: 1; overflow: auto; padding: 1rem; display: flex; align-items: flex-start; justify-content: center; }

.empty-state { color: var(--p-text-muted-color); font-style: italic; font-size: 0.875rem; padding: 1rem 0; }
.coming-soon { text-align: center; padding: 3rem 1rem; }
</style>
