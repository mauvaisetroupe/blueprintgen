import { parse as parseYaml } from 'yaml'
import { parseDsl } from '@/utils/dslParser'
import { parseFlowSteps } from '@/utils/sequenceDslGenerator'
import { toNodeId } from '@/utils/landscapeDslGenerator'
import {
  DEFAULT_CATEGORIES,
  DEFAULT_NETWORK_ZONES,
  defaultZoneId,
} from '@/types/dag'
import type {
  Dag,
  Component,
  Category,
  Relation,
  NetworkZone,
  ComponentInstance,
  TechnicalRelation,
  TechnicalService,
  ApplicationFlow,
  FlowStep,
  TechnicalLandscape,
} from '@/types/dag'

function uid(): string {
  return crypto.randomUUID()
}

function now(): string {
  return new Date().toISOString()
}

// ── Category helpers ──────────────────────────────────────────────────────────

function resolveCategory(
  name: string,
  customCategories: Category[],
): Category {
  const lower = name.toLowerCase()
  const def = DEFAULT_CATEGORIES.find((c) => c.name.toLowerCase() === lower)
  if (def) {
    return {
      id:           `cat__${def.name.toLowerCase().replace(/\s+/g, '_')}`,
      name:         def.name,
      order:        def.order,
      showSubgraph: def.showSubgraph,
    }
  }
  const existing = customCategories.find((c) => c.name.toLowerCase() === lower)
  if (existing) return existing
  const cat: Category = {
    id:           uid(),
    name,
    order:        DEFAULT_CATEGORIES.length + customCategories.length + 1,
    showSubgraph: true,
  }
  customCategories.push(cat)
  return cat
}

// ── Zone helpers ──────────────────────────────────────────────────────────────

function resolveZone(
  name: string,
  customNetworkZones: NetworkZone[],
): NetworkZone {
  const lower = name.toLowerCase()
  const def = DEFAULT_NETWORK_ZONES.find((z) => z.name.toLowerCase() === lower)
  if (def) return { id: defaultZoneId(def.name), name: def.name, order: def.order }

  const existing = customNetworkZones.find((z) => z.name.toLowerCase() === lower)
  if (existing) return existing

  const zone: NetworkZone = {
    id:    uid(),
    name,
    order: DEFAULT_NETWORK_ZONES.length + customNetworkZones.length + 1,
  }
  customNetworkZones.push(zone)
  return zone
}

// ── Protocol / label split ────────────────────────────────────────────────────
// L'export joint protocol et label avec " — ". On re-sépare à l'import.

function splitProtocolLabel(raw: string): { protocol?: string; label?: string } {
  const sep = raw.indexOf(' — ')
  if (sep !== -1) {
    return {
      protocol: raw.slice(0, sep).trim() || undefined,
      label:    raw.slice(sep + 3).trim() || undefined,
    }
  }
  return { protocol: raw.trim() || undefined }
}

// ── Main import ───────────────────────────────────────────────────────────────

export function importDagFromYaml(content: string): Dag {
  const data = parseYaml(content) as Record<string, unknown>

  if (!data.name) throw new Error('Missing "name" field in YAML')
  if (!data.landscape) throw new Error('Missing "landscape" field in YAML')

  const compMetaRaw   = (data.components            ?? {}) as Record<string, Record<string, string>>
  const techCompMeta  = (data['technical-components'] ?? {}) as Record<string, Record<string, string>>
  const techSvcMeta   = (data['technical-services']   ?? {}) as Record<string, Record<string, string>>

  // ── 1. Parse application landscape ─────────────────────────────────────────

  const landscapeParsed = parseDsl(data.landscape as string)
  const customCategories: Category[] = []

  // Subgraph name → Category
  const categoryMap = new Map<string, Category>()
  for (const name of landscapeParsed.subgraphs) {
    categoryMap.set(name, resolveCategory(name, customCategories))
  }

  // Build application components
  const components: Component[] = landscapeParsed.nodes.map((node) => {
    const meta = compMetaRaw[node.id] ?? {}
    const category = node.subgraph ? categoryMap.get(node.subgraph) : undefined
    return {
      id:          uid(),
      name:        node.label,
      description: meta.description?.trim() ?? '',
      categoryId:  category?.id ?? '',
      technology:  meta.technology?.trim() || undefined,
      framework:   meta.framework?.trim()  || undefined,
      constraints: meta.constraints?.trim() || undefined,
    }
  })

  const findAppComp = (nodeId: string) =>
    components.find((c) => toNodeId(c.name) === nodeId)

  // Build landscape relations
  const relations: Relation[] = []
  for (const rel of landscapeParsed.relations) {
    const from = findAppComp(rel.fromId)
    const to   = findAppComp(rel.toId)
    if (!from || !to) continue
    const { protocol, label } = splitProtocolLabel(rel.label ?? '')
    relations.push({
      id:              uid(),
      fromComponentId: from.id,
      toComponentId:   to.id,
      protocol,
      label,
      source:          'manual',
    })
  }

  // ── 2. Parse technical landscape ───────────────────────────────────────────

  const TECH_SVC_SUBGRAPH = 'Technical Services'
  let technicalLandscape: TechnicalLandscape = {
    customNetworkZones: [],
    instances:          [],
    technicalRelations: [],
    technicalServices:  [],
  }

  const technicalComponents: Component[] = []

  if (data['technical-landscape']) {
    const techParsed = parseDsl(data['technical-landscape'] as string)
    const customNetworkZones: NetworkZone[] = []

    // Collect zones (subgraphs excluding Technical Services)
    const zoneMap = new Map<string, NetworkZone>()
    for (const name of techParsed.subgraphs) {
      if (name === TECH_SVC_SUBGRAPH) continue
      zoneMap.set(name, resolveZone(name, customNetworkZones))
    }

    // Build technical components from nodes that are neither app components
    // nor in the Technical Services subgraph
    for (const node of techParsed.nodes) {
      if (node.subgraph === TECH_SVC_SUBGRAPH) continue
      if (findAppComp(node.id)) continue
      // Check not already added
      if (technicalComponents.find((c) => toNodeId(c.name) === node.id)) continue

      const meta = techCompMeta[node.id] ?? {}
      technicalComponents.push({
        id:          uid(),
        name:        node.label,
        description: meta.description?.trim() ?? '',
        categoryId:  '',
        technology:  meta.technology?.trim()  || undefined,
        framework:   meta.framework?.trim()   || undefined,
        constraints: meta.constraints?.trim() || undefined,
      })
    }

    const allComps = [...components, ...technicalComponents]
    const findAnyComp = (nodeId: string) =>
      allComps.find((c) => toNodeId(c.name) === nodeId)

    // Build instances: node in a zone subgraph → ComponentInstance
    const instances: ComponentInstance[] = []
    const instanceByNodeId = new Map<string, ComponentInstance>()

    for (const node of techParsed.nodes) {
      if (!node.subgraph || node.subgraph === TECH_SVC_SUBGRAPH) continue
      const zone = zoneMap.get(node.subgraph)
      const comp = findAnyComp(node.id)
      if (!zone || !comp) continue
      const inst: ComponentInstance = {
        id:            uid(),
        componentId:   comp.id,
        networkZoneId: zone.id,
      }
      instances.push(inst)
      instanceByNodeId.set(node.id, inst)
    }

    // Technical services
    const technicalServices: TechnicalService[] = []
    for (const node of techParsed.nodes.filter((n) => n.subgraph === TECH_SVC_SUBGRAPH)) {
      const meta = techSvcMeta[node.id] ?? {}
      technicalServices.push({
        id:          uid(),
        name:        node.label,
        description: meta.description?.trim() || undefined,
      })
    }

    // Technical relations
    const technicalRelations: TechnicalRelation[] = []
    for (const rel of techParsed.relations) {
      const fromInst = instanceByNodeId.get(rel.fromId)
      const toInst   = instanceByNodeId.get(rel.toId)
      if (!fromInst || !toInst) continue
      const fromComp = findAnyComp(rel.fromId)
      const toComp   = findAnyComp(rel.toId)
      if (!fromComp || !toComp) continue
      const { protocol, label } = splitProtocolLabel(rel.label ?? '')
      technicalRelations.push({
        id:              uid(),
        fromComponentId: fromComp.id,
        toComponentId:   toComp.id,
        fromInstanceId:  fromInst.id,
        toInstanceId:    toInst.id,
        protocol,
        label,
      })
    }

    technicalLandscape = {
      customNetworkZones,
      instances,
      technicalRelations,
      technicalServices,
    }
  }

  // ── 3. Parse application flows ──────────────────────────────────────────────

  const flowsRaw = (data.flows ?? []) as Array<Record<string, string>>
  const minimalDag = { components } as Dag

  const applicationFlows: ApplicationFlow[] = flowsRaw
    .filter((f): f is Record<string, string> & { name: string } => !!f.name?.trim())
    .map((f) => {
      const diagram = (f.diagram ?? '').trim()
      // Strip "sequenceDiagram" header line to get the body
      const body = diagram.startsWith('sequenceDiagram')
        ? diagram.replace(/^sequenceDiagram\s*\n?/, '')
        : diagram

      const steps: FlowStep[] = body.trim()
        ? parseFlowSteps(body, minimalDag)
        : []

      return {
        id:          uid(),
        name:        f.name.trim(),
        description: f.description?.trim() ?? '',
        steps,
        mermaidDsl:  body.trim() || undefined,
      }
    })

  // ── 4. Assemble Dag ─────────────────────────────────────────────────────────

  // Only store non-default custom categories
  const defaultIds = new Set(
    DEFAULT_CATEGORIES.map((c) => `cat__${c.name.toLowerCase().replace(/\s+/g, '_')}`),
  )
  const storedCustomCategories = customCategories.filter((c) => !defaultIds.has(c.id))

  return {
    id:          uid(),
    name:        String(data.name).trim(),
    description: String(data.description ?? '').trim(),
    createdAt:   now(),
    updatedAt:   now(),
    customCategories: storedCustomCategories,
    components,
    technicalComponents,
    relations,
    landscape:   {},
    technicalLandscape,
    applicationFlows,
  }
}
