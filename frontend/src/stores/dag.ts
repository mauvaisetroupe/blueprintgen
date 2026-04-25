import { defineStore } from 'pinia'
import { ref } from 'vue'
import { type Dag, type Category, type Component, type Relation, type FlowStep, type DagImportDraft, type NetworkZone, type ComponentInstance, type TechnicalRelation, type TechnicalService, DEFAULT_CATEGORIES, DEFAULT_NETWORK_ZONES } from '@/types/dag'
import type { ParsedDsl } from '@/utils/dslParser'
import { toNodeId } from '@/utils/landscapeDslGenerator'

function generateId(): string {
  return crypto.randomUUID()
}

// Migration défensive : convertit l'ancien format TechnicalLandscape vers le nouveau
function migrateTechnicalLandscape(tl: any) {
  // Zones de base — migration additive : on ajoute les nouvelles zones par défaut si absentes
  const existingZones: NetworkZone[] = tl?.networkZones ?? []
  for (const def of DEFAULT_NETWORK_ZONES) {
    const alreadyExists = existingZones.some((z) => z.name.toLowerCase() === def.name.toLowerCase())
    if (!alreadyExists) existingZones.push({ id: generateId(), name: def.name, order: def.order })
  }
  return {
    networkZones:       existingZones,
    instances:          tl?.instances          ?? [],
    technicalRelations: tl?.technicalRelations ?? [],
    technicalServices:  tl?.technicalServices  ?? [],
    useElk:             tl?.useElk,
  }
}

function now(): string {
  return new Date().toISOString()
}

export const useDagStore = defineStore(
  'dag',
  () => {
    const dags = ref<Dag[]>([])
    const dslEditPreference = ref(true)
    function setDslEditPreference(value: boolean) {
      dslEditPreference.value = value
    }

    // --- DAG CRUD ---

    function createDag(name: string, description: string): Dag {
      const dag: Dag = {
        id: generateId(),
        name,
        description,
        createdAt: now(),
        updatedAt: now(),
        categories: DEFAULT_CATEGORIES.map((c) => ({ ...c, id: generateId() })),
        components: [],
        relations: [],
        landscape: {},
        technicalLandscape: {
          networkZones:       DEFAULT_NETWORK_ZONES.map((z) => ({ ...z, id: generateId() })),
          instances:          [],
          technicalRelations: [],
          technicalServices:  [],
        },
        applicationFlows: [],
      }
      dags.value.push(dag)
      return dag
    }

    function updateDag(id: string, patch: Partial<Pick<Dag, 'name' | 'description'>>) {
      const dag = getDag(id)
      if (!dag) return
      Object.assign(dag, patch, { updatedAt: now() })
    }

    function deleteDag(id: string) {
      dags.value = dags.value.filter((d) => d.id !== id)
    }

    /**
     * Ouvre un DAG depuis un objet JSON sauvegardé (format natif du store).
     * Un nouvel ID est généré pour éviter les conflits si on ouvre le même fichier deux fois.
     * Les champs corrompus ou manquants sont sanitizés.
     */
    function openDag(data: Dag): Dag {
      const dag: Dag = {
        ...data,
        id:        generateId(),
        createdAt: now(),
        updatedAt: now(),
        landscape: {
          useElk:    data.landscape?.useElk,
          autoSync:  data.landscape?.autoSync,
        },
        // Champs ajoutés dans les versions récentes — migration défensive
        relations:          data.relations        ?? [],
        applicationFlows:   data.applicationFlows ?? [],
        categories:         data.categories         ?? [],
        components:         data.components         ?? [],
        technicalLandscape: migrateTechnicalLandscape(data.technicalLandscape),
      }
      dags.value.push(dag)
      return dag
    }

    /**
     * Imports a DAG from an external draft (upsert by ID).
     * - If a DAG with the same ID already exists: updates name/description and
     *   merges categories and components additively (existing data is preserved).
     * - If not: creates a new DAG from the draft.
     */
    function importDag(draft: DagImportDraft): Dag {
      const defaultByName = new Map(DEFAULT_CATEGORIES.map((c) => [c.name.toLowerCase(), c]))
      const existing = dags.value.find((d) => d.id === draft.id)

      if (existing) {
        existing.name = draft.name
        existing.description = draft.description

        // Merge categories — add missing ones, keep existing ones intact
        for (const catName of draft.categories) {
          const alreadyExists = existing.categories.some(
            (c) => c.name.toLowerCase() === catName.toLowerCase(),
          )
          if (!alreadyExists) {
            const defaults = defaultByName.get(catName.toLowerCase())
            existing.categories.push({
              id: generateId(),
              name: defaults?.name ?? catName,
              order: defaults?.order ?? existing.categories.length + 1,
              showSubgraph: defaults?.showSubgraph ?? true,
            })
          }
        }

        // Merge components — add missing ones, keep existing ones intact
        for (const comp of draft.components ?? []) {
          const alreadyExists = existing.components.some(
            (c) => c.name.toLowerCase() === comp.name.toLowerCase(),
          )
          if (!alreadyExists) {
            const category = existing.categories.find(
              (c) => c.name.toLowerCase() === comp.category.toLowerCase(),
            )
            existing.components.push({
              id: generateId(),
              name: comp.name,
              description: comp.description,
              categoryId: category?.id ?? '',
            })
          }
        }

        existing.updatedAt = now()
        return existing
      }

      // Create new DAG from draft
      const categoryByName = new Map<string, Category>()
      const categories = draft.categories.map((name, index) => {
        const defaults = defaultByName.get(name.toLowerCase())
        const cat: Category = {
          id: generateId(),
          name: defaults?.name ?? name,
          order: defaults?.order ?? DEFAULT_CATEGORIES.length + index + 1,
          showSubgraph: defaults?.showSubgraph ?? true,
        }
        categoryByName.set(name.toLowerCase(), cat)
        return cat
      })

      const components = (draft.components ?? []).map((c) => ({
        id: generateId(),
        name: c.name,
        description: c.description,
        categoryId: categoryByName.get(c.category.toLowerCase())?.id ?? '',
      }))

      const dag: Dag = {
        id: draft.id,
        name: draft.name,
        description: draft.description,
        createdAt: now(),
        updatedAt: now(),
        categories,
        components,
        relations: [],
        landscape: {},
        technicalLandscape: {
          networkZones:       DEFAULT_NETWORK_ZONES.map((z) => ({ ...z, id: generateId() })),
          instances:          [],
          technicalRelations: [],
          technicalServices:  [],
        },
        applicationFlows: [],
      }
      dags.value.push(dag)
      return dag
    }

    function getDag(id: string): Dag | undefined {
      const dag = dags.value.find((d) => d.id === id)
      if (!dag) return undefined
      // Migrations défensives pour les DAGs créés avant les nouveaux champs
      if (!dag.relations) dag.relations = []
      if (!dag.technicalLandscape?.networkZones) {
        dag.technicalLandscape = migrateTechnicalLandscape(dag.technicalLandscape)
      }
      return dag
    }

    // --- Categories ---

    function addCategory(dagId: string, name: string): Category {
      const dag = getDag(dagId)
      if (!dag) throw new Error(`DAG ${dagId} not found`)
      const category: Category = {
        id: generateId(),
        name,
        order: dag.categories.length + 1,
        showSubgraph: true,
      }
      dag.categories.push(category)
      dag.updatedAt = now()
      return category
    }

    function updateCategory(dagId: string, categoryId: string, patch: Partial<Omit<Category, 'id'>>) {
      const dag = getDag(dagId)
      if (!dag) return
      const category = dag.categories.find((c) => c.id === categoryId)
      if (!category) return
      Object.assign(category, patch)
      dag.updatedAt = now()
    }

    function deleteCategory(dagId: string, categoryId: string) {
      const dag = getDag(dagId)
      if (!dag) return
      dag.categories = dag.categories.filter((c) => c.id !== categoryId)
      dag.components
        .filter((c) => c.categoryId === categoryId)
        .forEach((c) => (c.categoryId = ''))
      dag.updatedAt = now()
    }

    // --- Components ---

    function addComponent(dagId: string, name: string, description: string, categoryId: string): Component {
      const dag = getDag(dagId)
      if (!dag) throw new Error(`DAG ${dagId} not found`)
      const component: Component = {
        id: generateId(),
        name,
        description,
        categoryId,
      }
      dag.components.push(component)
      dag.updatedAt = now()
      return component
    }

    function updateComponent(dagId: string, componentId: string, patch: Partial<Omit<Component, 'id'>>) {
      const dag = getDag(dagId)
      if (!dag) return
      const component = dag.components.find((c) => c.id === componentId)
      if (!component) return
      Object.assign(component, patch)
      dag.updatedAt = now()
    }

    function deleteComponent(dagId: string, componentId: string) {
      const dag = getDag(dagId)
      if (!dag) return
      dag.components = dag.components.filter((c) => c.id !== componentId)
      // Remove relations involving this component
      dag.relations = dag.relations.filter(
        (r) => r.fromComponentId !== componentId && r.toComponentId !== componentId,
      )
      dag.updatedAt = now()
    }

    // --- Relations ---

    function addRelation(dagId: string, fromComponentId: string, toComponentId: string, label?: string): Relation {
      const dag = getDag(dagId)
      if (!dag) throw new Error(`DAG ${dagId} not found`)
      const relation: Relation = {
        id: generateId(),
        fromComponentId,
        toComponentId,
        label,
        source: 'manual',
      }
      dag.relations.push(relation)
      dag.updatedAt = now()
      return relation
    }

    function updateRelation(dagId: string, relationId: string, patch: Partial<Omit<Relation, 'id'>>) {
      const dag = getDag(dagId)
      if (!dag) return
      const relation = dag.relations.find((r) => r.id === relationId)
      if (!relation) return
      Object.assign(relation, patch)
      dag.updatedAt = now()
    }

    function deleteRelation(dagId: string, relationId: string) {
      const dag = getDag(dagId)
      if (!dag) return
      dag.relations = dag.relations.filter((r) => r.id !== relationId)
      dag.updatedAt = now()
    }

    // --- Sync model from parsed DSL ---
    function syncFromDsl(dagId: string, parsed: ParsedDsl) {
      const dag = getDag(dagId)
      if (!dag) return

      for (const node of parsed.nodes) {
        let category = node.subgraph ? dag.categories.find((c) => c.name === node.subgraph) : null
        if (node.subgraph && !category) {
          category = {
            id: generateId(),
            name: node.subgraph,
            order: dag.categories.length + 1,
            showSubgraph: true,
          }
          dag.categories.push(category)
        }

        // Match by label first; fallback to node ID (handles renames in the DSL)
        const component =
          dag.components.find((c) => c.name === node.label)
          ?? dag.components.find((c) => toNodeId(c.name) === node.id)

        if (!component) {
          dag.components.push({
            id: generateId(),
            name: node.label,
            description: '',
            categoryId: category?.id ?? '',
          })
        } else {
          // Update name if it changed (rename case)
          if (component.name !== node.label) component.name = node.label
          if (category && component.categoryId !== category.id) component.categoryId = category.id
        }
      }

      // Sync relations from parsed arrows
      console.log('[syncFromDsl] parsed.relations:', parsed.relations)
      console.log('[syncFromDsl] parsed.nodes:', parsed.nodes.map(n => `${n.id}="${n.label}"`))
      for (const parsedRel of parsed.relations) {
        const fromNode = parsed.nodes.find((n) => n.id === parsedRel.fromId)
        const toNode   = parsed.nodes.find((n) => n.id === parsedRel.toId)
        console.log(`[syncFromDsl] rel ${parsedRel.fromId}->${parsedRel.toId}: fromNode=${fromNode?.label}, toNode=${toNode?.label}`)

        // Primary: resolve via node declaration label; fallback: match by derived node ID
        const fromComp =
          (fromNode ? dag.components.find((c) => c.name === fromNode.label) : undefined)
          ?? dag.components.find((c) => toNodeId(c.name) === parsedRel.fromId)
        const toComp =
          (toNode ? dag.components.find((c) => c.name === toNode.label) : undefined)
          ?? dag.components.find((c) => toNodeId(c.name) === parsedRel.toId)

        console.log(`[syncFromDsl] fromComp=${fromComp?.name}, toComp=${toComp?.name}`)
        if (!fromComp || !toComp) { console.log('[syncFromDsl] SKIP: component not found'); continue }

        // Add only if relation doesn't already exist
        const exists = dag.relations.some(
          (r) => r.fromComponentId === fromComp.id && r.toComponentId === toComp.id,
        )
        console.log(`[syncFromDsl] exists=${exists}`)
        if (!exists) {
          dag.relations.push({
            id: generateId(),
            fromComponentId: fromComp.id,
            toComponentId: toComp.id,
            label: parsedRel.label,
            source: 'manual',
          })
          console.log('[syncFromDsl] PUSHED relation', fromComp.name, '->', toComp.name)
        }
      }

      dag.updatedAt = now()
    }

    // --- Application Flows ---

    function addFlow(dagId: string, name: string, description: string, mermaidDsl?: string) {
      const dag = getDag(dagId)
      if (!dag) throw new Error(`DAG ${dagId} not found`)
      const flow = {
        id: generateId(),
        name,
        description,
        steps: [],
        mermaidDsl,
      }
      dag.applicationFlows.push(flow)
      dag.updatedAt = now()
      return flow
    }

    function updateFlow(dagId: string, flowId: string, patch: Partial<Pick<import('@/types/dag').ApplicationFlow, 'name' | 'description' | 'mermaidDsl' | 'viewOptions'>>) {
      const dag = getDag(dagId)
      if (!dag) return
      const flow = dag.applicationFlows.find((f) => f.id === flowId)
      if (!flow) return
      Object.assign(flow, patch)
      dag.updatedAt = now()
    }

    function saveFlowSteps(dagId: string, flowId: string, steps: FlowStep[]) {
      const dag = getDag(dagId)
      if (!dag) return
      const flow = dag.applicationFlows.find((f) => f.id === flowId)
      if (!flow) return
      flow.steps = steps
      dag.updatedAt = now()
    }

    function deleteFlow(dagId: string, flowId: string) {
      const dag = getDag(dagId)
      if (!dag) return
      dag.applicationFlows = dag.applicationFlows.filter((f) => f.id !== flowId)
      dag.updatedAt = now()
    }

    // --- Network Zones ---

    function addNetworkZone(dagId: string, name: string): NetworkZone {
      const dag = getDag(dagId)
      if (!dag) throw new Error(`DAG ${dagId} not found`)
      const zone: NetworkZone = {
        id:    generateId(),
        name,
        order: dag.technicalLandscape.networkZones.length + 1,
      }
      dag.technicalLandscape.networkZones.push(zone)
      dag.updatedAt = now()
      return zone
    }

    function deleteNetworkZone(dagId: string, zoneId: string) {
      const dag = getDag(dagId)
      if (!dag) return
      dag.technicalLandscape.networkZones = dag.technicalLandscape.networkZones.filter((z) => z.id !== zoneId)
      // Supprimer les instances liées à cette zone
      const removedInstanceIds = dag.technicalLandscape.instances
        .filter((i) => i.networkZoneId === zoneId)
        .map((i) => i.id)
      dag.technicalLandscape.instances = dag.technicalLandscape.instances.filter((i) => i.networkZoneId !== zoneId)
      // Supprimer les relations techniques liées à ces instances
      dag.technicalLandscape.technicalRelations = dag.technicalLandscape.technicalRelations.filter(
        (r) => !removedInstanceIds.includes(r.fromInstanceId) && !removedInstanceIds.includes(r.toInstanceId),
      )
      dag.updatedAt = now()
    }

    // --- Component Instances ---

    /**
     * Assigne un composant à une zone réseau.
     * Si une instance existe déjà pour ce couple (componentId, zoneId), retourne l'existante.
     */
    function assignZone(dagId: string, componentId: string, networkZoneId: string): ComponentInstance {
      const dag = getDag(dagId)
      if (!dag) throw new Error(`DAG ${dagId} not found`)
      const existing = dag.technicalLandscape.instances.find(
        (i) => i.componentId === componentId && i.networkZoneId === networkZoneId,
      )
      if (existing) return existing
      const instance: ComponentInstance = { id: generateId(), componentId, networkZoneId }
      dag.technicalLandscape.instances.push(instance)
      dag.updatedAt = now()
      return instance
    }

    function removeZoneAssignment(dagId: string, instanceId: string) {
      const dag = getDag(dagId)
      if (!dag) return
      dag.technicalLandscape.instances = dag.technicalLandscape.instances.filter((i) => i.id !== instanceId)
      dag.technicalLandscape.technicalRelations = dag.technicalLandscape.technicalRelations.filter(
        (r) => r.fromInstanceId !== instanceId && r.toInstanceId !== instanceId,
      )
      dag.updatedAt = now()
    }

    // --- Technical Relations ---

    function addTechnicalRelation(dagId: string, fromInstanceId: string, toInstanceId: string, protocol?: string, label?: string): TechnicalRelation {
      const dag = getDag(dagId)
      if (!dag) throw new Error(`DAG ${dagId} not found`)
      const relation: TechnicalRelation = { id: generateId(), fromInstanceId, toInstanceId, protocol, label }
      dag.technicalLandscape.technicalRelations.push(relation)
      dag.updatedAt = now()
      return relation
    }

    function deleteTechnicalRelation(dagId: string, relationId: string) {
      const dag = getDag(dagId)
      if (!dag) return
      dag.technicalLandscape.technicalRelations = dag.technicalLandscape.technicalRelations.filter((r) => r.id !== relationId)
      dag.updatedAt = now()
    }

    // --- Technical Services ---

    function addTechnicalService(dagId: string, name: string, description?: string): TechnicalService {
      const dag = getDag(dagId)
      if (!dag) throw new Error(`DAG ${dagId} not found`)
      const service: TechnicalService = { id: generateId(), name, description }
      dag.technicalLandscape.technicalServices.push(service)
      dag.updatedAt = now()
      return service
    }

    function deleteTechnicalService(dagId: string, serviceId: string) {
      const dag = getDag(dagId)
      if (!dag) return
      dag.technicalLandscape.technicalServices = dag.technicalLandscape.technicalServices.filter((s) => s.id !== serviceId)
      dag.updatedAt = now()
    }

    function setLandscapeUseElk(dagId: string, useElk: boolean) {
      const dag = getDag(dagId)
      if (!dag) return
      dag.landscape.useElk = useElk
      dag.updatedAt = now()
    }

    function setLandscapeAutoSync(dagId: string, autoSync: boolean) {
      const dag = getDag(dagId)
      if (!dag) return
      dag.landscape.autoSync = autoSync
      dag.updatedAt = now()
    }

    function setTechnicalCategorySubgraph(dagId: string, categoryId: string, show: boolean) {
      const dag = getDag(dagId)
      if (!dag) return
      if (!dag.technicalLandscape.categorySubgraphs) dag.technicalLandscape.categorySubgraphs = {}
      dag.technicalLandscape.categorySubgraphs[categoryId] = show
      dag.updatedAt = now()
    }

    function setTechnicalLandscapeUseElk(dagId: string, useElk: boolean) {
      const dag = getDag(dagId)
      if (!dag) return
      dag.technicalLandscape.useElk = useElk
      dag.updatedAt = now()
    }


    /** Remplace toutes les relations manuelles du landscape par celles parsées depuis l'éditeur DSL. */
    function replaceManualRelations(
      dagId: string,
      relations: Array<{ fromComponentId: string; toComponentId: string; label?: string }>,
    ) {
      const dag = getDag(dagId)
      if (!dag) return
      dag.relations = relations.map((r) => ({
        id:              generateId(),
        fromComponentId: r.fromComponentId,
        toComponentId:   r.toComponentId,
        label:           r.label,
        source:          'manual' as const,
      }))
      dag.updatedAt = now()
    }

    return {
      dags,
      createDag,
      updateDag,
      deleteDag,
      openDag,
      importDag,
      getDag,
      addCategory,
      updateCategory,
      deleteCategory,
      addComponent,
      updateComponent,
      deleteComponent,
      addRelation,
      updateRelation,
      deleteRelation,
      syncFromDsl,
      setLandscapeUseElk,
      setLandscapeAutoSync,
      replaceManualRelations,
      saveFlowSteps,
      addFlow,
      updateFlow,
      deleteFlow,
      dslEditPreference,
      setDslEditPreference,
      addNetworkZone,
      deleteNetworkZone,
      assignZone,
      removeZoneAssignment,
      addTechnicalRelation,
      deleteTechnicalRelation,
      addTechnicalService,
      deleteTechnicalService,
      setTechnicalLandscapeUseElk,
      setTechnicalCategorySubgraph,
    }
  },
  {
    persist: true,
  },
)
