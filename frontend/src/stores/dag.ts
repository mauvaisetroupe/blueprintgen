import { defineStore } from 'pinia'
import { ref } from 'vue'
import { type Dag, type Category, type Component, type Relation, type FlowStep, type DagImportDraft, type NetworkZone, type ComponentInstance, type TechnicalRelation, type TechnicalService, DEFAULT_CATEGORIES, DEFAULT_NETWORK_ZONES, DEFAULT_CATEGORY_NAMES, defaultZoneId, defaultCategoryId, allCategories } from '@/types/dag'
import type { ParsedDsl } from '@/utils/dslParser'
import { toNodeId } from '@/utils/landscapeDslGenerator'

function generateId(): string {
  return crypto.randomUUID()
}

// Migration défensive : convertit l'ancien format TechnicalLandscape vers le nouveau
function migrateTechnicalLandscape(tl: any) {
  // Récupère les zones custom (anciennes ou nouvelles) en excluant les zones par défaut
  const defaultNames = new Set(DEFAULT_NETWORK_ZONES.map((z) => z.name.toLowerCase()))
  const rawZones: NetworkZone[] = tl?.networkZones ?? tl?.customNetworkZones ?? []
  const customZones = rawZones.filter((z: NetworkZone) => !defaultNames.has(z.name.toLowerCase()))

  // Migre les ComponentInstances qui référencent d'anciens IDs de zones par défaut
  // (remplace les UUID par les IDs stables dérivés du nom)
  const instances: ComponentInstance[] = (tl?.instances ?? []).map((inst: ComponentInstance) => {
    const oldZone = rawZones.find((z: NetworkZone) => z.id === inst.networkZoneId)
    if (oldZone && defaultNames.has(oldZone.name.toLowerCase())) {
      return { ...inst, networkZoneId: defaultZoneId(oldZone.name) }
    }
    return inst
  })

  return {
    customNetworkZones: customZones,
    instances,
    technicalRelations: tl?.technicalRelations ?? [],
    technicalServices:  tl?.technicalServices  ?? [],
    useElk:             tl?.useElk,
    categorySubgraphs:  tl?.categorySubgraphs,
  }
}

// Migration défensive : convertit l'ancien format dag.categories vers customCategories + disabledCategoryIds
function migrateCategories(dag: any): {
  customCategories: Category[]
  disabledCategoryIds: string[]
  components: Component[]
} {
  const oldCategories: any[] = dag.categories ?? []

  // Table de correspondance : ancien UUID → ID stable (pour les catégories par défaut)
  const oldIdToStable = new Map<string, string>()
  for (const cat of oldCategories) {
    if (DEFAULT_CATEGORY_NAMES.has(cat.name.toLowerCase())) {
      oldIdToStable.set(cat.id, defaultCategoryId(cat.name))
    }
  }

  // Catégories custom (non-défaut)
  const customCategories: Category[] = oldCategories
    .filter((c: any) => !DEFAULT_CATEGORY_NAMES.has(c.name.toLowerCase()))
    .map((c: any, i: number) => ({
      id:           c.id,
      name:         c.name,
      order:        DEFAULT_CATEGORIES.length + i + 1,
      showSubgraph: c.showSubgraph,
    }))

  // Catégories par défaut absentes de l'ancien DAG (supprimées par l'architecte)
  const disabledCategoryIds: string[] = DEFAULT_CATEGORIES
    .filter((def) => !oldCategories.some((c: any) => c.name.toLowerCase() === def.name.toLowerCase()))
    .map((def) => defaultCategoryId(def.name))

  // Migration des composants : remplace les anciens UUID par les IDs stables
  const components: Component[] = (dag.components ?? []).map((comp: any) => {
    const stableId = oldIdToStable.get(comp.categoryId)
    return stableId ? { ...comp, categoryId: stableId } : comp
  })

  return { customCategories, disabledCategoryIds, components }
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
        customCategories: [],   // toutes les catégories par défaut sont actives (aucune désactivée)
        components: [],
        relations: [],
        landscape: {},
        technicalLandscape: {
          customNetworkZones: [],
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
      const rawData = data as any
      const catMigration = rawData.categories
        ? migrateCategories(rawData)
        : { customCategories: data.customCategories ?? [], disabledCategoryIds: data.disabledCategoryIds ?? [], components: data.components ?? [] }

      const dag: Dag = {
        ...data,
        id:        generateId(),
        createdAt: now(),
        updatedAt: now(),
        landscape: {
          useElk:           data.landscape?.useElk,
          autoSync:         data.landscape?.autoSync,
          categorySubgraphs: data.landscape?.categorySubgraphs,
        },
        // Champs ajoutés dans les versions récentes — migration défensive
        relations:          data.relations        ?? [],
        applicationFlows:   data.applicationFlows ?? [],
        customCategories:   catMigration.customCategories,
        disabledCategoryIds: catMigration.disabledCategoryIds.length > 0 ? catMigration.disabledCategoryIds : undefined,
        components:         catMigration.components,
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
        // S'assurer que la migration est faite
        getDag(existing.id)

        existing.name = draft.name
        existing.description = draft.description

        const currentCategories = allCategories(existing)

        // Merge categories — ajouter les manquantes, garder les existantes intactes
        for (const catName of draft.categories) {
          const alreadyExists = currentCategories.some((c) => c.name.toLowerCase() === catName.toLowerCase())
          if (!alreadyExists) {
            const def = defaultByName.get(catName.toLowerCase())
            if (def) {
              // Catégorie par défaut désactivée → réactiver
              existing.disabledCategoryIds = (existing.disabledCategoryIds ?? []).filter(
                (id) => id !== defaultCategoryId(def.name),
              )
            } else {
              existing.customCategories.push({
                id:           generateId(),
                name:         catName,
                order:        DEFAULT_CATEGORIES.length + existing.customCategories.length + 1,
                showSubgraph: true,
              })
            }
          }
        }

        // Merge components — add missing ones
        for (const comp of draft.components ?? []) {
          const alreadyExists = existing.components.some(
            (c) => c.name.toLowerCase() === comp.name.toLowerCase(),
          )
          if (!alreadyExists) {
            const category = allCategories(existing).find(
              (c) => c.name.toLowerCase() === comp.category.toLowerCase(),
            )
            existing.components.push({
              id:          generateId(),
              name:        comp.name,
              description: comp.description,
              categoryId:  category?.id ?? '',
            })
          }
        }

        existing.updatedAt = now()
        return existing
      }

      // Créer un nouveau DAG depuis le draft
      // Seules les catégories mentionnées dans draft.categories sont actives
      const categoryIdByName = new Map<string, string>()
      const draftNamesLower  = new Set(draft.categories.map((n) => n.toLowerCase()))

      // Catégories par défaut non présentes dans le draft → désactivées
      const disabledCategoryIds: string[] = DEFAULT_CATEGORIES
        .filter((def) => !draftNamesLower.has(def.name.toLowerCase()))
        .map((def) => defaultCategoryId(def.name))

      // Catégories par défaut présentes dans le draft → actives (IDs stables)
      for (const def of DEFAULT_CATEGORIES) {
        if (draftNamesLower.has(def.name.toLowerCase())) {
          categoryIdByName.set(def.name.toLowerCase(), defaultCategoryId(def.name))
        }
      }

      // Catégories custom (non-défaut dans le draft)
      const customCategories: Category[] = []
      for (const catName of draft.categories) {
        if (!defaultByName.has(catName.toLowerCase())) {
          const id = generateId()
          customCategories.push({
            id,
            name:         catName,
            order:        DEFAULT_CATEGORIES.length + customCategories.length + 1,
            showSubgraph: true,
          })
          categoryIdByName.set(catName.toLowerCase(), id)
        }
      }

      const components = (draft.components ?? []).map((c) => ({
        id:          generateId(),
        name:        c.name,
        description: c.description,
        categoryId:  categoryIdByName.get(c.category.toLowerCase()) ?? '',
      }))

      const dag: Dag = {
        id:          draft.id,
        name:        draft.name,
        description: draft.description,
        createdAt:   now(),
        updatedAt:   now(),
        customCategories,
        disabledCategoryIds: disabledCategoryIds.length > 0 ? disabledCategoryIds : undefined,
        components,
        relations:   [],
        landscape:   {},
        technicalLandscape: {
          customNetworkZones: [],
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
      if (!dag.technicalLandscape?.customNetworkZones) {
        dag.technicalLandscape = migrateTechnicalLandscape(dag.technicalLandscape)
      }
      const rawDag = dag as any
      if (!dag.customCategories && rawDag.categories) {
        const { customCategories, disabledCategoryIds, components } = migrateCategories(rawDag)
        dag.customCategories = customCategories
        if (disabledCategoryIds.length > 0) dag.disabledCategoryIds = disabledCategoryIds
        dag.components = components
        delete rawDag.categories
      }
      return dag
    }

    // --- Categories ---

    function addCategory(dagId: string, name: string): Category {
      const dag = getDag(dagId)
      if (!dag) throw new Error(`DAG ${dagId} not found`)

      // Si c'est une catégorie par défaut précédemment désactivée → réactiver
      const def = DEFAULT_CATEGORIES.find((c) => c.name.toLowerCase() === name.toLowerCase())
      if (def) {
        dag.disabledCategoryIds = (dag.disabledCategoryIds ?? []).filter(
          (id) => id !== defaultCategoryId(def.name),
        )
        dag.updatedAt = now()
        return { id: defaultCategoryId(def.name), name: def.name, order: def.order, showSubgraph: def.showSubgraph }
      }

      // Catégorie custom
      const category: Category = {
        id:           generateId(),
        name,
        order:        DEFAULT_CATEGORIES.length + dag.customCategories.length + 1,
        showSubgraph: true,
      }
      dag.customCategories.push(category)
      dag.updatedAt = now()
      return category
    }

    function updateCategory(dagId: string, categoryId: string, patch: Partial<Omit<Category, 'id'>>) {
      const dag = getDag(dagId)
      if (!dag) return
      // Seules les catégories custom sont modifiables (les défauts sont immuables)
      const category = dag.customCategories.find((c) => c.id === categoryId)
      if (!category) return
      Object.assign(category, patch)
      dag.updatedAt = now()
    }

    function deleteCategory(dagId: string, categoryId: string) {
      const dag = getDag(dagId)
      if (!dag) return
      // Catégorie par défaut → désactiver
      const isDefault = DEFAULT_CATEGORIES.some((def) => defaultCategoryId(def.name) === categoryId)
      if (isDefault) {
        if (!dag.disabledCategoryIds) dag.disabledCategoryIds = []
        if (!dag.disabledCategoryIds.includes(categoryId)) dag.disabledCategoryIds.push(categoryId)
      } else {
        dag.customCategories = dag.customCategories.filter((c) => c.id !== categoryId)
      }
      dag.components.filter((c) => c.categoryId === categoryId).forEach((c) => (c.categoryId = ''))
      dag.updatedAt = now()
    }

    function setLandscapeCategorySubgraph(dagId: string, categoryId: string, show: boolean) {
      const dag = getDag(dagId)
      if (!dag) return
      if (!dag.landscape.categorySubgraphs) dag.landscape.categorySubgraphs = {}
      dag.landscape.categorySubgraphs[categoryId] = show
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
        const currentCategories = allCategories(dag)
        let category = node.subgraph ? currentCategories.find((c) => c.name === node.subgraph) : null
        if (node.subgraph && !category) {
          category = {
            id:           generateId(),
            name:         node.subgraph,
            order:        DEFAULT_CATEGORIES.length + dag.customCategories.length + 1,
            showSubgraph: true,
          }
          dag.customCategories.push(category)
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
        order: dag.technicalLandscape.customNetworkZones.length + 1,
      }
      dag.technicalLandscape.customNetworkZones.push(zone)
      dag.updatedAt = now()
      return zone
    }

    function deleteNetworkZone(dagId: string, zoneId: string) {
      const dag = getDag(dagId)
      if (!dag) return
      dag.technicalLandscape.customNetworkZones = dag.technicalLandscape.customNetworkZones.filter((z) => z.id !== zoneId)
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
      setLandscapeCategorySubgraph,
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
