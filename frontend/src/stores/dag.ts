import { defineStore } from 'pinia'
import { ref } from 'vue'
import { type Dag, type Category, type Component, type Relation, type FlowStep, type DagImportDraft, type NetworkZone, type ComponentInstance, type TechnicalRelation, type TechnicalService, DEFAULT_CATEGORIES, defaultCategoryId, allCategories, allNetworkZones } from '@/types/dag'
import type { ParsedDsl } from '@/utils/dslParser'
import { toNodeId } from '@/utils/landscapeDslGenerator'

function generateId(): string {
  return crypto.randomUUID()
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
        technicalComponents: [],
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
     */
    function openDag(data: Dag): Dag {
      const tl = data.technicalLandscape
      const dag: Dag = {
        ...data,
        id:        generateId(),
        createdAt: now(),
        updatedAt: now(),
        landscape: {
          useElk:            data.landscape?.useElk,
          categorySubgraphs: data.landscape?.categorySubgraphs,
        },
        relations:           data.relations        ?? [],
        applicationFlows:    data.applicationFlows ?? [],
        customCategories:    data.customCategories ?? [],
        disabledCategoryIds: data.disabledCategoryIds,
        components: (data.components ?? []).map((c: any) =>
          c.nodeId ? c : { ...c, nodeId: toNodeId(c.name) },
        ),
        technicalComponents: (data.technicalComponents ?? []).map((c: any) =>
          c.nodeId ? c : { ...c, nodeId: toNodeId(c.name) },
        ),
        technicalLandscape: {
          customNetworkZones: tl?.customNetworkZones ?? [],
          instances:          tl?.instances          ?? [],
          technicalRelations: tl?.technicalRelations ?? [],
          technicalServices:  tl?.technicalServices  ?? [],
          useElk:             tl?.useElk,
          categorySubgraphs:  tl?.categorySubgraphs,
        },
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
    // ── Helpers pour importDag ────────────────────────────────────────────────

    function applyZoneAssignments(dag: Dag, draftComps: Array<{ name: string; networkZone?: string }>) {
      for (const dc of draftComps) {
        if (!dc.networkZone) continue
        const zoneName = dc.networkZone.trim()
        if (!zoneName) continue

        // Trouver le composant correspondant (business ou technique)
        const comp = [...dag.components, ...dag.technicalComponents].find(
          (c) => c.name.toLowerCase() === dc.name.toLowerCase(),
        )
        if (!comp) continue

        // Trouver ou créer la zone réseau
        const allZones = allNetworkZones(dag.technicalLandscape)
        let zone = allZones.find((z) => z.name.toLowerCase() === zoneName.toLowerCase())
        if (!zone) {
          const newZone: NetworkZone = {
            id:    generateId(),
            name:  zoneName,
            order: allZones.length + 1,
          }
          dag.technicalLandscape.customNetworkZones.push(newZone)
          zone = newZone
        }

        // Créer l'instance si elle n'existe pas
        const alreadyAssigned = dag.technicalLandscape.instances.some(
          (i) => i.componentId === comp.id && i.networkZoneId === zone!.id,
        )
        if (!alreadyAssigned) {
          dag.technicalLandscape.instances.push({
            id:            generateId(),
            componentId:   comp.id,
            networkZoneId: zone.id,
          })
        }
      }
    }

    // Patterns de relations sécurité auto-générées à l'import
    const SECURITY_PATTERNS: Array<{ from: string; to: string }> = [
      { from: 'users',              to: 'auth gateway'       },
      { from: 'auth gateway',       to: 'frontends'          },
      { from: 'auth gateway',       to: 'iam'                },
      { from: 'frontends',          to: 'backends'           },
      { from: 'backends',           to: 'iam'                },
      { from: 'backends',           to: 'permission manager' },
    ]

    function applySecurityRelations(dag: Dag) {
      const cats = allCategories(dag)
      const allComps = [...dag.components, ...dag.technicalComponents]

      function firstInCategory(categoryName: string): Component | undefined {
        const cat = cats.find((c) => c.name.toLowerCase() === categoryName.toLowerCase())
        if (!cat) return undefined
        return allComps.find((c) => c.categoryId === cat.id && c.name.trim() !== '')
      }

      for (const pattern of SECURITY_PATTERNS) {
        const fromComp = firstInCategory(pattern.from)
        const toComp   = firstInCategory(pattern.to)
        if (!fromComp || !toComp) continue
        const alreadyExists = dag.relations.some(
          (r) => r.fromComponentId === fromComp.id && r.toComponentId === toComp.id,
        )
        if (!alreadyExists) {
          dag.relations.push({
            id:              generateId(),
            fromComponentId: fromComp.id,
            toComponentId:   toComp.id,
            source:          'manual',
          })
        }
      }
    }

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
              nodeId:      toNodeId(comp.name),
              name:        comp.name,
              description: comp.description,
              categoryId:  category?.id ?? '',
            })
          }
        }

        // Merge technicalComponents — add missing ones
        for (const comp of draft.technicalComponents ?? []) {
          const alreadyExists = existing.technicalComponents.some(
            (c) => c.name.toLowerCase() === comp.name.toLowerCase(),
          )
          if (!alreadyExists) {
            const category = allCategories(existing).find(
              (c) => c.name.toLowerCase() === comp.category.toLowerCase(),
            )
            existing.technicalComponents.push({
              id:          generateId(),
              nodeId:      toNodeId(comp.name),
              name:        comp.name,
              description: comp.description,
              categoryId:  category?.id ?? '',
            })
          }
        }

        // Zone assignments from networkZone fields
        applyZoneAssignments(existing, [...(draft.components ?? []), ...(draft.technicalComponents ?? [])])

        // Auto-generate security relations
        applySecurityRelations(existing)

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
        nodeId:      toNodeId(c.name),
        name:        c.name,
        description: c.description,
        categoryId:  categoryIdByName.get(c.category.toLowerCase()) ?? '',
      }))

      const technicalComponents = (draft.technicalComponents ?? []).map((c) => ({
        id:          generateId(),
        nodeId:      toNodeId(c.name),
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
        technicalComponents,
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

      // Zone assignments from networkZone fields
      applyZoneAssignments(dag, [...(draft.components ?? []), ...(draft.technicalComponents ?? [])])

      // Auto-generate security relations
      applySecurityRelations(dag)

      dags.value.push(dag)
      return dag
    }

    function getDag(id: string): Dag | undefined {
      const dag = dags.value.find((d) => d.id === id)
      if (!dag) return undefined
      for (const c of dag.components) {
        if (!c.nodeId) c.nodeId = toNodeId(c.name)
      }
      for (const c of dag.technicalComponents) {
        if (!c.nodeId) c.nodeId = toNodeId(c.name)
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
        nodeId: toNodeId(name),
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
      // Cascade : supprimer les relations logiques impliquant ce composant
      dag.relations = dag.relations.filter(
        (r) => r.fromComponentId !== componentId && r.toComponentId !== componentId,
      )
      // Cascade : supprimer les TechnicalRelations impliquant ce composant
      dag.technicalLandscape.technicalRelations = dag.technicalLandscape.technicalRelations.filter(
        (tr) => tr.fromComponentId !== componentId && tr.toComponentId !== componentId,
      )
      dag.updatedAt = now()
    }

    // --- Technical Components ---

    function addTechnicalComponent(dagId: string, name: string, description: string, categoryId: string): Component {
      const dag = getDag(dagId)
      if (!dag) throw new Error(`DAG ${dagId} not found`)
      const component: Component = { id: generateId(), nodeId: toNodeId(name), name, description, categoryId }
      dag.technicalComponents.push(component)
      dag.updatedAt = now()
      return component
    }

    function updateTechnicalComponent(dagId: string, componentId: string, patch: Partial<Omit<Component, 'id'>>) {
      const dag = getDag(dagId)
      if (!dag) return
      const component = dag.technicalComponents.find((c) => c.id === componentId)
      if (!component) return
      Object.assign(component, patch)
      dag.updatedAt = now()
    }

    function deleteTechnicalComponent(dagId: string, componentId: string) {
      const dag = getDag(dagId)
      if (!dag) return
      dag.technicalComponents = dag.technicalComponents.filter((c) => c.id !== componentId)
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
      const rel = dag.relations.find((r) => r.id === relationId)
      if (rel) {
        // Cascade : supprimer les TechnicalRelations qui instanciaient cette relation logique
        dag.technicalLandscape.technicalRelations = dag.technicalLandscape.technicalRelations.filter(
          (tr) => !(tr.fromComponentId === rel.fromComponentId && tr.toComponentId === rel.toComponentId),
        )
      }
      dag.relations = dag.relations.filter((r) => r.id !== relationId)
      dag.updatedAt = now()
    }

    // --- Sync model from parsed DSL ---
    function syncFromDsl(dagId: string, parsed: ParsedDsl, listKey: 'components' | 'technicalComponents' = 'components') {
      const dag = getDag(dagId)
      if (!dag) return

      const list = dag[listKey]

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

        const component =
          list.find((c) => c.nodeId === node.id)
          ?? list.find((c) => c.name === node.label)

        if (!component) {
          list.push({
            id: generateId(),
            nodeId: node.id,
            name: node.label,
            description: '',
            categoryId: category?.id ?? '',
          })
        } else {
          if (component.name !== node.label) component.name = node.label
          if (category && component.categoryId !== category.id) component.categoryId = category.id
        }
      }

      // Relations seulement pour la liste business (pas de relations pour les composants techniques)
      if (listKey === 'components') {
        for (const parsedRel of parsed.relations) {
          const fromNode = parsed.nodes.find((n) => n.id === parsedRel.fromId)
          const toNode   = parsed.nodes.find((n) => n.id === parsedRel.toId)

          const fromComp =
            (fromNode ? list.find((c) => c.name === fromNode.label) : undefined)
            ?? list.find((c) => c.nodeId === parsedRel.fromId)
          const toComp =
            (toNode ? list.find((c) => c.name === toNode.label) : undefined)
            ?? list.find((c) => c.nodeId === parsedRel.toId)

          if (!fromComp || !toComp) continue

          const exists = dag.relations.some(
            (r) => r.fromComponentId === fromComp.id && r.toComponentId === toComp.id,
          )
          if (!exists) {
            dag.relations.push({
              id: generateId(),
              fromComponentId: fromComp.id,
              toComponentId: toComp.id,
              label: parsedRel.label,
              source: 'manual',
            })
          }
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

    function addTechnicalRelation(
      dagId: string,
      fromComponentId: string,
      toComponentId: string,
      fromInstanceId: string,
      toInstanceId: string,
      protocol?: string,
      label?: string,
    ): TechnicalRelation {
      const dag = getDag(dagId)
      if (!dag) throw new Error(`DAG ${dagId} not found`)
      const relation: TechnicalRelation = { id: generateId(), fromComponentId, toComponentId, fromInstanceId, toInstanceId, protocol, label }
      dag.technicalLandscape.technicalRelations.push(relation)
      dag.updatedAt = now()
      return relation
    }

    function updateTechnicalRelation(dagId: string, relationId: string, patch: Partial<Pick<TechnicalRelation, 'protocol' | 'label' | 'fromInstanceId' | 'toInstanceId'>>) {
      const dag = getDag(dagId)
      if (!dag) return
      const rel = dag.technicalLandscape.technicalRelations.find((r) => r.id === relationId)
      if (!rel) return
      Object.assign(rel, patch)
      dag.updatedAt = now()
    }

    function deleteTechnicalRelation(dagId: string, relationId: string) {
      const dag = getDag(dagId)
      if (!dag) return
      dag.technicalLandscape.technicalRelations = dag.technicalLandscape.technicalRelations.filter((r) => r.id !== relationId)
      dag.updatedAt = now()
    }

    function replaceTechnicalRelations(
      dagId: string,
      relations: Array<{ fromComponentId: string; toComponentId: string; fromInstanceId: string; toInstanceId: string; protocol?: string }>,
    ) {
      const dag = getDag(dagId)
      if (!dag) return
      // Préserve le flag imported pour les relations qui existent déjà (édition DSL ne doit pas perdre le tag)
      const existing = dag.technicalLandscape.technicalRelations
      dag.technicalLandscape.technicalRelations = relations.map((r) => {
        const prev = existing.find(
          (e) => e.fromInstanceId === r.fromInstanceId && e.toInstanceId === r.toInstanceId,
        )
        return { id: prev?.id ?? generateId(), ...r, imported: prev?.imported }
      })
      dag.updatedAt = now()
    }

    function importTechnicalRelationsFromLandscape(
      dagId: string,
      selections: Array<{ fromComponentId: string; toComponentId: string; fromInstanceId: string; toInstanceId: string; label?: string }>,
    ) {
      const dag = getDag(dagId)
      if (!dag) return
      for (const sel of selections) {
        const alreadyExists = dag.technicalLandscape.technicalRelations.some(
          (tr) => tr.fromInstanceId === sel.fromInstanceId && tr.toInstanceId === sel.toInstanceId,
        )
        if (!alreadyExists) {
          dag.technicalLandscape.technicalRelations.push({ id: generateId(), ...sel, imported: true })
        }
      }
      dag.updatedAt = now()
    }

    function cleanImportedTechnicalRelations(dagId: string) {
      const dag = getDag(dagId)
      if (!dag) return
      dag.technicalLandscape.technicalRelations = dag.technicalLandscape.technicalRelations.filter(
        (tr) => !tr.imported,
      )
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


    /** Remplace toutes les relations manuelles du landscape par celles parsées depuis l'éditeur DSL.
     *  Préserve le flag imported si la relation existe déjà (même paire de composants). */
    function replaceManualRelations(
      dagId: string,
      relations: Array<{ fromComponentId: string; toComponentId: string; label?: string }>,
    ) {
      const dag = getDag(dagId)
      if (!dag) return
      dag.relations = relations.map((r) => {
        const existing = dag.relations.find(
          (e) => e.fromComponentId === r.fromComponentId && e.toComponentId === r.toComponentId,
        )
        return {
          id:              existing?.id ?? generateId(),
          fromComponentId: r.fromComponentId,
          toComponentId:   r.toComponentId,
          label:           r.label,
          source:          'manual' as const,
          imported:        existing?.imported,
        }
      })
      dag.updatedAt = now()
    }

    function importLandscapeRelationsFromFlows(
      dagId: string,
      selections: Array<{ fromComponentId: string; toComponentId: string }>,
    ) {
      const dag = getDag(dagId)
      if (!dag) return
      for (const sel of selections) {
        const alreadyExists = dag.relations.some(
          (r) => r.fromComponentId === sel.fromComponentId && r.toComponentId === sel.toComponentId,
        )
        if (!alreadyExists) {
          dag.relations.push({
            id:              generateId(),
            fromComponentId: sel.fromComponentId,
            toComponentId:   sel.toComponentId,
            source:          'manual' as const,
            imported:        true,
          })
        }
      }
      dag.updatedAt = now()
    }

    function cleanImportedLandscapeRelations(dagId: string) {
      const dag = getDag(dagId)
      if (!dag) return
      dag.relations = dag.relations.filter((r) => !r.imported)
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
      addTechnicalComponent,
      updateTechnicalComponent,
      deleteTechnicalComponent,
      addRelation,
      updateRelation,
      deleteRelation,
      syncFromDsl,
      setLandscapeUseElk,
      setLandscapeCategorySubgraph,
      replaceManualRelations,
      importLandscapeRelationsFromFlows,
      cleanImportedLandscapeRelations,
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
      updateTechnicalRelation,
      deleteTechnicalRelation,
      replaceTechnicalRelations,
      importTechnicalRelationsFromLandscape,
      cleanImportedTechnicalRelations,
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
