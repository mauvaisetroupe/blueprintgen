<script setup lang="ts">
import { computed, inject, ref, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDagStore } from '@/stores/dag'
import { DEFAULT_ZONE_NAMES, DEFAULT_ZONE_COLORS, allNetworkZones, allCategories } from '@/types/dag'
import {
  generateTechnicalLandscapeDsl,
  generateTechnicalLandscapeCommentHeader,
  generateTechnicalRelationsBody,
} from '@/utils/technicalLandscapeDslGenerator'
import { inlineSvgStyles, injectHtmlLabelsFalse } from '@/utils/svgInliner'
import MermaidDiagram from '@/components/MermaidDiagram.vue'
import ImportRelationsDialog from '@/components/dag/ImportRelationsDialog.vue'
import Button from 'primevue/button'
import Menu from 'primevue/menu'
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
const router = useRouter()


// --- Active tab ---
const activeTab = ref<string>('components')

// --- Toggle ELK ---
const useElk = ref(dag.value?.technicalLandscape.useElk ?? false)
watch(useElk, (val) => { if (dag.value) store.setTechnicalLandscapeUseElk(dag.value.id, val) })

// ── DSL edit mode (injecté depuis DagDetailLayout) ────────────────────────────
const dslEdit = inject<Ref<boolean>>('dslEdit')!

// Corps éditable des relations : uniquement les relations multi-instance
const localRelationsBody = computed(() => {
  console.log("localRelationsBody")
  return  dag.value ? generateTechnicalRelationsBody(dag.value) : ''
})

// Header read-only : commentaires (node IDs)
const dslRelationsReadOnlyHeader = computed(() => {
  if (!dag.value) return ''
  const parts: string[] = []
  const comments = generateTechnicalLandscapeCommentHeader(dag.value)
  if (comments.trim()) parts.push(comments)
  return parts.join('\n')
})


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

// DSL actif pour le rendu Mermaid
const activeDsl = computed(() => {
  if (!dag.value) return ''
  return generateTechnicalLandscapeDsl(dag.value)
})

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


/**
 * Déduit l’onglet actif à partir de l’URL
 */
const activeSubRoute = computed<'components' | 'relations'>(() => {
  if (route.name === 'dag-technical-relations') return 'relations'
  return 'components'
})

const showImportDialog = ref(false)

const hasImportedRelations = computed(() =>
  dag.value?.technicalLandscape.technicalRelations.some((r) => r.imported) ?? false,
)

function cleanImportedRelations() {
  if (dag.value) store.cleanImportedTechnicalRelations(dag.value.id)
}

function onTabChange(value: string | number) {
  router.push({
    name:
      value === 'relations'
        ? 'dag-technical-relations'
        : 'dag-technical-zones',
    params: { id: route.params.id },
  })
}

</script>

<template>
  <div v-if="dag && tl" class="technical">

    <Splitter class="tech-splitter" state-key="technical-splitter" state-storage="local">
      <!-- Panneau gauche : tabs PrimeVue -->
      <SplitterPanel :size="55" :min-size="30" class="tech-left-panel">
          <!-- SOUS-MENU TECHNICAL -->
          <Tabs
            :value="activeSubRoute"
            class="tech-tabs"
            @update:value="onTabChange"
          >
            <TabList>
              <Tab value="components">Network zones</Tab>
              <Tab value="relations">Relations</Tab>
              <div v-if="activeSubRoute === 'relations'" class="tab-actions">
                <Button
                  v-if="hasImportedRelations"
                  label="Clean imported"
                  icon="pi pi-trash"
                  size="small"
                  severity="danger"
                  text
                  @click="cleanImportedRelations"
                />
                <Button
                  label="Import from landscape"
                  icon="pi pi-copy"
                  size="small"
                  severity="secondary"
                  outlined
                  @click="showImportDialog = true"
                />
              </div>
            </TabList>
          </Tabs>
          <!-- CONTENU -->
          <div class="tech-tab-panels">
            <RouterView />
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

    <ImportRelationsDialog
      v-if="dag"
      :dag-id="dag.id"
      :visible="showImportDialog"
      @update:visible="showImportDialog = $event"
    />
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

.toolbar-spacer { flex: 1; }

/* ── Splitter ── */
.tech-splitter { flex: 1; min-height: 0; border: none !important; }
.tech-left-panel { overflow: hidden; padding: 0 !important; border-right: 1px solid var(--p-content-border-color); display: flex; flex-direction: column; }
.tech-tabs { display: flex; flex-direction: column; }
.tech-tabs :deep(.p-tablist) { display: flex; align-items: center; }
.tab-actions { display: flex; align-items: center; gap: 0.4rem; margin-left: auto; padding-right: 0.5rem; }
.tech-tabs :deep(.p-tabpanels) { flex: 1; min-height: 0; }
.tech-tab-panels { flex: 1; min-height: 0; overflow: hidden; }
.tech-tab-panels :deep(.p-tabpanel) { height: 100%; }
.tech-right-panel { overflow: auto; padding: 0 !important; display: flex; flex-direction: column; }

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
</style>
