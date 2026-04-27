<script setup lang="ts">
import { computed, inject, ref, watch, type Ref } from 'vue'
import { useRoute } from 'vue-router'
import { useDagStore } from '@/stores/dag'
import { DEFAULT_ZONE_NAMES, DEFAULT_ZONE_COLORS, allNetworkZones, allCategories } from '@/types/dag'
import {
  generateTechnicalLandscapeDsl,
  generateTechnicalLandscapeStructure,
  generateTechnicalLandscapeCommentHeader,
  generateTechnicalRelationsBody,
  generateFixedRelationsBody,
  parseTechnicalRelationsBody,
  getFixedRelationData,
  validateTechnicalRelationsBody,
} from '@/utils/technicalLandscapeDslGenerator'
import { inlineSvgStyles, injectHtmlLabelsFalse } from '@/utils/svgInliner'
import MermaidDiagram from '@/components/MermaidDiagram.vue'
import DslEditor from '@/components/DslEditor.vue'
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import InputText from 'primevue/inputtext'
import Splitter from 'primevue/splitter'
import SplitterPanel from 'primevue/splitterpanel'
import ToggleSwitch from 'primevue/toggleswitch'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import mermaid from 'mermaid'

const route = useRoute()
const store = useDagStore()

const dag = computed(() => store.getDag(route.params.id as string))
const tl  = computed(() => dag.value?.technicalLandscape)

// --- Active tab ---
const activeTab = ref<string>('components')

// --- Toggle ELK ---
const useElk = ref(dag.value?.technicalLandscape.useElk ?? false)
watch(useElk, (val) => { if (dag.value) store.setTechnicalLandscapeUseElk(dag.value.id, val) })

// ── DSL edit mode (injecté depuis DagDetailLayout) ────────────────────────────
const dslEdit = inject<Ref<boolean>>('dslEdit')!

// Corps éditable des relations : uniquement les relations multi-instance
const localRelationsBody = computed(() => {
  return  dag.value ? generateTechnicalRelationsBody(dag.value) : ''
})

// Header read-only : commentaires (node IDs) + relations mono-instance (automatiques, pas de choix de zone)
const dslRelationsReadOnlyHeader = computed(() => {
  if (!dag.value) return ''
  const parts: string[] = []
  const comments = generateTechnicalLandscapeCommentHeader(dag.value)
  if (comments.trim()) parts.push(comments)
  const fixed = generateFixedRelationsBody(dag.value)
  if (fixed.trim()) parts.push(fixed)
  return parts.join('\n')
})

// Structure complète pour le rendu Mermaid (zones + composants + styles)
const dslStructure = computed(() => dag.value ? generateTechnicalLandscapeStructure(dag.value) : '')

// Node IDs pour l'autocomplétion dans l'éditeur DSL
const completionNames = computed(() => {
  if (!dag.value) return []
  const instances = dag.value.technicalLandscape.instances
  const zones = allNetworkZones(dag.value.technicalLandscape)
  const countByComp = new Map<string, number>()
  for (const inst of instances) countByComp.set(inst.componentId, (countByComp.get(inst.componentId) ?? 0) + 1)
  const names: string[] = []
  const allComps = [...dag.value.components, ...dag.value.technicalComponents]
  for (const comp of allComps.filter((c) => c.name.trim() !== '')) {
    const count = countByComp.get(comp.id) ?? 0
    if (count === 0) continue
    if (count === 1) {
      names.push(comp.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase())
    } else {
      for (const inst of instances.filter((i) => i.componentId === comp.id)) {
        const zone = zones.find((z) => z.id === inst.networkZoneId)
        if (zone) names.push(`${comp.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}__${zone.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`)
      }
    }
  }
  return names
})

// Y a-t-il au moins une relation avec un côté multi-instance ?

// Validation DSL (mode éditeur)
const syntaxError = ref<string | null>(null)
const semanticErrors = ref<string[]>([])
const isValidating = ref(false)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// DSL actif pour le rendu Mermaid
const activeDsl = computed(() => {
  if (!dag.value) return ''
  if (activeTab.value === 'relations') {
    const parts = [dslStructure.value]
    const fixed = generateFixedRelationsBody(dag.value)
    if (fixed.trim()) parts.push(fixed)
    if (localRelationsBody.value.trim()) parts.push(localRelationsBody.value)
    return parts.join('\n')
  }
  return generateTechnicalLandscapeDsl(dag.value)
})

async function runValidation() {
  if (!dslEdit?.value || !dag.value) return
  const fullCode = activeDsl.value
  if (!fullCode.trim()) { syntaxError.value = null; semanticErrors.value = []; return }
  isValidating.value = true
  syntaxError.value  = null
  try {
    await mermaid.parse(fullCode)
  } catch (e) {
    const raw = e instanceof Error ? e.message : 'Invalid syntax'
    syntaxError.value = raw.replace(/^Syntax error in text\s*\nmermaid version [\d.]+\s*\n?/i, '').trim() || 'Invalid syntax'
  }
  semanticErrors.value = syntaxError.value ? [] : validateTechnicalRelationsBody(localRelationsBody.value, dag.value)
  isValidating.value = false
}

function onRelationsChange(value: string) {
  localRelationsBody.value = value
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    if (!dag.value) return
    // Relations fixes (mono→mono) + relations éditées (multi-instance)
    const fixed  = getFixedRelationData(dag.value)
    const edited = parseTechnicalRelationsBody(value, dag.value)
    store.replaceTechnicalRelations(dag.value.id, [...fixed, ...edited])
    runValidation()
  }, 400)
}


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

// ─── Relations tab ────────────────────────────────────────────────────────────

function compName(componentId: string): string {
  return [...(dag.value?.components ?? []), ...(dag.value?.technicalComponents ?? [])]
    .find((c) => c.id === componentId)?.name ?? componentId
}

function instZoneName(instanceId: string): string {
  const inst = tl.value?.instances.find((i) => i.id === instanceId)
  if (!inst) return ''
  return zones.value.find((z) => z.id === inst.networkZoneId)?.name ?? ''
}

// Relations éditables : impliquant un composant technique OU au moins un côté multi-instance
const editableRelations = computed(() => {
  if (!tl.value || !dag.value) return []
  const techIds = new Set((dag.value.technicalComponents ?? []).map((c) => c.id))
  return tl.value.technicalRelations.filter((tr) => {
    const fromIsMulti = (instancesByComponent.value.get(tr.fromComponentId)?.length ?? 0) > 1
    const toIsMulti   = (instancesByComponent.value.get(tr.toComponentId)?.length   ?? 0) > 1
    return techIds.has(tr.fromComponentId) || techIds.has(tr.toComponentId) || fromIsMulti || toIsMulti
  })
})

// Liste de toutes les instances avec leur label "Composant [Zone]" pour les selects
const allInstances = computed(() => {
  if (!tl.value || !dag.value) return []
  const allComps = [...dag.value.components, ...(dag.value.technicalComponents ?? [])]
  return tl.value.instances.map((inst) => {
    const comp = allComps.find((c) => c.id === inst.componentId)
    const zone = zones.value.find((z) => z.id === inst.networkZoneId)
    return { id: inst.id, label: `${comp?.name ?? '?'} [${zone?.name ?? '?'}]` }
  })
})

interface AddRelState { fromInstanceId: string; toInstanceId: string; protocol: string }
const addingRel = ref<AddRelState | null>(null)

function startAddRel() {
  const insts = allInstances.value
  addingRel.value = { fromInstanceId: insts[0]?.id ?? '', toInstanceId: insts[1]?.id ?? insts[0]?.id ?? '', protocol: '' }
}

function submitAddRel() {
  if (!dag.value || !addingRel.value) return
  const { fromInstanceId, toInstanceId, protocol } = addingRel.value
  const fromInst = tl.value?.instances.find((i) => i.id === fromInstanceId)
  const toInst   = tl.value?.instances.find((i) => i.id === toInstanceId)
  if (!fromInst || !toInst) return
  store.addTechnicalRelation(dag.value.id, fromInst.componentId, toInst.componentId, fromInstanceId, toInstanceId, protocol.trim() || undefined)
  addingRel.value = null
}

// Toutes les relations logiques (manual + autoSync), sans distinction de source
const logicalRelations = computed(() => {
  if (!dag.value) return []
  const allComponents = [...dag.value.components, ...(dag.value.technicalComponents ?? [])]
  const valid = new Set(allComponents.filter((c) => c.name.trim() !== '').map((c) => c.id))
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

// Auto-matérialise la première TechnicalRelation quand les deux côtés d'une relation logique
// ont au moins une instance assignée.
watch(
  [() => tl.value?.instances, () => dag.value?.relations?.length],
  () => {
    if (!dag.value) return
    for (const lr of logicalRelations.value) {
      const fromInsts = tl.value?.instances.filter((i) => i.componentId === lr.fromComponentId) ?? []
      const toInsts   = tl.value?.instances.filter((i) => i.componentId === lr.toComponentId)   ?? []
      if (fromInsts.length === 0 || toInsts.length === 0) continue
      const existing = tl.value?.technicalRelations.filter(
        (tr) => tr.fromComponentId === lr.fromComponentId && tr.toComponentId === lr.toComponentId,
      ) ?? []
      if (existing.length > 0) continue
      store.addTechnicalRelation(dag.value.id, lr.fromComponentId, lr.toComponentId, fromInsts[0]!.id, toInsts[0]!.id)
    }
  },
  { immediate: true },
)

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
  if (!dag.value || !activeDsl.value.trim()) return
  const source = pptxMode ? injectHtmlLabelsFalse(activeDsl.value) : activeDsl.value
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
  if (!dag.value || !activeDsl.value.trim()) return
  const blob = new Blob([activeDsl.value], { type: 'text/plain' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${dag.value.name.replace(/[^\w\s-]/g, '').trim()}-technical.mmd`
  a.click()
  URL.revokeObjectURL(url)
}

async function copyMermaid() {
  if (!activeDsl.value.trim()) return
  await navigator.clipboard.writeText(activeDsl.value)
}
</script>

<template>
  <div v-if="dag && tl" class="technical">

    <Splitter class="tech-splitter" state-key="technical-splitter" state-storage="local">

      <!-- Panneau gauche : tabs PrimeVue -->
      <SplitterPanel :size="55" :min-size="30" class="tech-left-panel">
        <Tabs v-model:value="activeTab" class="tech-tabs">
          <TabList>
            <Tab value="components">Network zones</Tab>
            <Tab value="relations">
              Relations
              <span v-if="logicalRelations.length" class="tab-badge">{{ logicalRelations.length }}</span>
            </Tab>
          </TabList>

          <TabPanels class="tech-tab-panels">

            <!-- ── TAB : Components ── -->
            <TabPanel value="components" class="tech-sections">

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
            </TabPanel>

            <!-- ── TAB : Relations ── -->
            <TabPanel value="relations" :class="dslEdit ? 'tech-dsl-panel' : 'tech-sections'">

              <!-- Mode DSL -->
              <template v-if="dslEdit">
                <DslEditor
                  :model-value="localRelationsBody"
                  :read-only-header="dslRelationsReadOnlyHeader"
                  :completion-names="completionNames"
                  :validation-status="syntaxError ? 'syntax-error' : semanticErrors.length > 0 ? 'warnings' : isValidating ? 'validating' : 'idle'"
                  @update:model-value="onRelationsChange"
                />
                <div v-if="syntaxError" class="dsl-error-bar">
                  <i class="pi pi-times-circle" /> {{ syntaxError }}
                </div>
                <div v-if="semanticErrors.length > 0 && !syntaxError" class="dsl-warning-bar">
                  <div v-for="(err, i) in semanticErrors" :key="i">
                    <i class="pi pi-exclamation-triangle" /> {{ err }}
                  </div>
                </div>
              </template>

              <!-- Mode guidé -->
              <template v-else>
                <p v-if="editableRelations.length === 0" class="empty-state">
                  No editable relations yet. Assign components to zones, then add relations below.
                </p>

                <table v-if="editableRelations.length > 0" class="rel-table">
                  <thead>
                    <tr>
                      <th>From</th>
                      <th class="col-zone">Zone</th>
                      <th class="col-arrow"></th>
                      <th>To</th>
                      <th class="col-zone">Zone</th>
                      <th class="col-proto">Protocol</th>
                      <th class="col-action"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="tr in editableRelations" :key="tr.id">
                      <td class="cell-name">{{ compName(tr.fromComponentId) }}</td>
                      <td><span class="zone-pill">{{ instZoneName(tr.fromInstanceId) }}</span></td>
                      <td class="col-arrow">→</td>
                      <td class="cell-name">{{ compName(tr.toComponentId) }}</td>
                      <td><span class="zone-pill">{{ instZoneName(tr.toInstanceId) }}</span></td>
                      <td>
                        <input class="cell-input protocol-input" :value="tr.protocol ?? ''" placeholder="Protocol"
                          @change="store.updateTechnicalRelation(dag!.id, tr.id, { protocol: ($event.target as HTMLInputElement).value.trim() || undefined })" />
                      </td>
                      <td>
                        <Button icon="pi pi-times" size="small" text severity="danger" @click="store.deleteTechnicalRelation(dag!.id, tr.id)" />
                      </td>
                    </tr>
                  </tbody>
                </table>

                <!-- Formulaire d'ajout -->
                <div v-if="addingRel" class="add-rel-form">
                  <select v-model="addingRel.fromInstanceId" class="inst-select">
                    <option v-for="inst in allInstances" :key="inst.id" :value="inst.id">{{ inst.label }}</option>
                  </select>
                  <span class="rel-arrow-sm">→</span>
                  <select v-model="addingRel.toInstanceId" class="inst-select">
                    <option v-for="inst in allInstances" :key="inst.id" :value="inst.id">{{ inst.label }}</option>
                  </select>
                  <input v-model="addingRel.protocol" class="cell-input protocol-input" placeholder="Protocol"
                    @keyup.enter="submitAddRel" @keyup.escape="addingRel = null" />
                  <Button icon="pi pi-check" size="small" @click="submitAddRel" />
                  <Button icon="pi pi-times" size="small" severity="secondary" @click="addingRel = null" />
                </div>
                <Button v-else label="Add relation" icon="pi pi-plus" size="small" text class="add-rel-btn" @click="startAddRel" />
              </template>

            </TabPanel>

          </TabPanels>
        </Tabs>
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

    <!-- Toolbar : export -->
      <div class="toolbar-spacer" />
      <Button label="Export" icon="pi pi-download" size="small" severity="secondary" @click="exportMenu?.toggle($event)" />
      <Menu ref="exportMenu" :model="exportMenuItems" popup />



        </div>
        <div class="diagram-wrap">
          <MermaidDiagram v-if="activeDsl" :code="activeDsl" />
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
  margin-left: 0.3rem;
}

.toolbar-spacer { flex: 1; }

/* ── Splitter ── */
.tech-splitter { flex: 1; min-height: 0; border: none !important; }

.tech-left-panel { overflow: hidden; padding: 0 !important; border-right: 1px solid var(--p-content-border-color); display: flex; flex-direction: column; }

.tech-tabs { display: flex; flex-direction: column; height: 100%; }
.tech-tabs :deep(.p-tabpanels) { flex: 1; min-height: 0; }
.tech-tab-panels { flex: 1; min-height: 0; overflow: hidden; }
.tech-tab-panels :deep(.p-tabpanel) { height: 100%; }

.tech-dsl-panel { overflow: hidden; height: 100%; display: flex; flex-direction: column; }
.tech-right-panel { overflow: auto; padding: 0 !important; display: flex; flex-direction: column; }

.dsl-error-bar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  font-family: monospace;
  padding: 0.4rem 0.75rem;
  background: #fef2f2;
  border-top: 1px solid #fca5a5;
  color: #dc2626;
  flex-shrink: 0;
  white-space: pre-wrap;
}

.dsl-warning-bar {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.78rem;
  font-family: monospace;
  padding: 0.4rem 0.75rem;
  background: #fffbeb;
  border-top: 1px solid #fcd34d;
  color: #92400e;
  flex-shrink: 0;
}


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


/* ── Relations guided mode ── */
.rel-table { width: 100%; border-collapse: collapse; }
.rel-table thead th {
  text-align: left; font-size: 0.75rem; font-weight: 600; color: var(--p-text-muted-color);
  padding: 0.3rem 0.5rem; background: var(--p-surface-50, #fafafa);
  border-bottom: 1px solid var(--p-content-border-color);
  text-transform: uppercase; letter-spacing: 0.05em;
}
.rel-table tbody tr:hover { background: var(--p-surface-50, #fafafa); }
.rel-table td { padding: 3px 4px; border-bottom: 1px solid var(--p-content-border-color); vertical-align: middle; }
.rel-table tbody tr:last-child td { border-bottom: none; }
.col-zone  { width: 90px; }
.col-arrow { width: 24px; text-align: center; color: var(--p-text-muted-color); font-size: 0.85rem; }
.col-proto { width: 120px; }
.col-action { width: 32px; }

.zone-pill {
  display: inline-block;
  font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 20px;
  border: 1px solid #86efac; background: #f0fdf4; color: #064e3b;
  white-space: nowrap;
}

.protocol-input {
  width: 100%; border: 1px solid var(--p-content-border-color) !important;
  border-radius: 4px; background: var(--p-surface-0, #fff) !important;
  padding: 0.25rem 0.4rem !important; font-size: 0.8rem !important;
}
.protocol-input:focus { border-color: var(--p-primary-400, #60a5fa) !important; box-shadow: none !important; }

.add-rel-form {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.5rem 0; flex-wrap: wrap;
}
.inst-select {
  font-size: 0.8rem; font-family: inherit;
  padding: 0.25rem 0.5rem; border: 1px solid var(--p-content-border-color);
  border-radius: 4px; background: var(--p-surface-0, #fff); flex: 1; min-width: 150px;
}
.rel-arrow-sm { color: var(--p-text-muted-color); flex-shrink: 0; }
.add-rel-btn { align-self: flex-start; }

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
