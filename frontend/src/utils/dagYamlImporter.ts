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
  TechnicalLandscape,
} from '@/types/dag'

function uid(): string  { return crypto.randomUUID() }
function now(): string  { return new Date().toISOString() }

// ── Category helpers ──────────────────────────────────────────────────────────

function resolveCategory(name: string, customCategories: Category[]): Category {
  const lower = name.toLowerCase()
  const def   = DEFAULT_CATEGORIES.find((c) => c.name.toLowerCase() === lower)
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

function resolveZone(name: string, customNetworkZones: NetworkZone[]): NetworkZone {
  const lower = name.toLowerCase()
  const def   = DEFAULT_NETWORK_ZONES.find((z) => z.name.toLowerCase() === lower)
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

// ── Name derivation from YAML key (best-effort fallback) ─────────────────────

function nameFromKey(key: string): string {
  return key.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// ── Stored custom categories filter ──────────────────────────────────────────

function filterStoredCustomCategories(customCategories: Category[]): Category[] {
  const defaultIds = new Set(
    DEFAULT_CATEGORIES.map((c) => `cat__${c.name.toLowerCase().replace(/\s+/g, '_')}`),
  )
  return customCategories.filter((c) => !defaultIds.has(c.id))
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW FORMAT — top-level "categories" list is the source of truth
// ─────────────────────────────────────────────────────────────────────────────

function importNewFormat(data: Record<string, unknown>): Dag {
  const categoriesRaw   = (data.categories             ?? []) as string[]
  const zonesRaw        = (data['network-zones']        ?? []) as string[]
  const compMetaRaw     = (data.components              ?? {}) as Record<string, Record<string, unknown>>
  const techCompMetaRaw = (data['technical-components'] ?? {}) as Record<string, Record<string, unknown>>
  const techSvcMetaRaw  = (data['technical-services']   ?? {}) as Record<string, Record<string, unknown>>
  const flowsRaw        = (data.flows                   ?? []) as Array<Record<string, string>>

  // ── Categories ─────────────────────────────────────────────────────────────
  const customCategories: Category[] = []
  const categoryByName   = new Map<string, Category>()

  for (const name of categoriesRaw) {
    const cat = resolveCategory(name, customCategories)
    categoryByName.set(name.toLowerCase(), cat)
  }

  function resolveCompCategory(catName?: string): string {
    if (!catName?.trim()) return ''
    const key   = catName.trim().toLowerCase()
    const found = categoryByName.get(key)
    if (found) return found.id
    const cat = resolveCategory(catName.trim(), customCategories)
    categoryByName.set(key, cat)
    return cat.id
  }

  // ── Network zones ──────────────────────────────────────────────────────────
  const customNetworkZones: NetworkZone[] = []
  const zoneByName = new Map<string, NetworkZone>()

  for (const name of zonesRaw) {
    const zone = resolveZone(name, customNetworkZones)
    zoneByName.set(name.toLowerCase(), zone)
  }

  function resolveCompZone(zoneName: string): NetworkZone | undefined {
    const key   = zoneName.trim().toLowerCase()
    const found = zoneByName.get(key)
    if (found) return found
    const zone  = resolveZone(zoneName.trim(), customNetworkZones)
    zoneByName.set(key, zone)
    return zone
  }

  // ── Application components ─────────────────────────────────────────────────
  const components: Component[]   = []
  const compByNodeId = new Map<string, Component>()

  for (const [nodeId, meta] of Object.entries(compMetaRaw)) {
    const name = String(meta.name ?? '').trim() || nameFromKey(nodeId)
    const comp: Component = {
      id:          uid(),
      name,
      description: String(meta.description ?? '').trim(),
      categoryId:  resolveCompCategory(meta.category as string | undefined),
      technology:  String(meta.technology  ?? '').trim() || undefined,
      framework:   String(meta.framework   ?? '').trim() || undefined,
      constraints: String(meta.constraints ?? '').trim() || undefined,
    }
    components.push(comp)
    compByNodeId.set(nodeId, comp)
  }

  // ── Technical components ───────────────────────────────────────────────────
  const technicalComponents: Component[] = []
  const techCompByNodeId = new Map<string, Component>()

  for (const [nodeId, meta] of Object.entries(techCompMetaRaw)) {
    const name = String(meta.name ?? '').trim() || nameFromKey(nodeId)
    const comp: Component = {
      id:          uid(),
      name,
      description: String(meta.description ?? '').trim(),
      categoryId:  resolveCompCategory(meta.category as string | undefined),
      technology:  String(meta.technology  ?? '').trim() || undefined,
      framework:   String(meta.framework   ?? '').trim() || undefined,
      constraints: String(meta.constraints ?? '').trim() || undefined,
    }
    technicalComponents.push(comp)
    techCompByNodeId.set(nodeId, comp)
  }

  const findComp = (nodeId: string): Component | undefined =>
    compByNodeId.get(nodeId) ?? techCompByNodeId.get(nodeId)

  // ── Zone instances (from zones: field on each component) ──────────────────
  const instances: ComponentInstance[]     = []
  const instancesByCompId = new Map<string, ComponentInstance[]>()

  function addInstances(meta: Record<string, unknown>, compId: string) {
    if (!Array.isArray(meta.zones)) return
    for (const zoneName of meta.zones) {
      if (typeof zoneName !== 'string') continue
      const zone = resolveCompZone(zoneName)
      if (!zone) continue
      const inst: ComponentInstance = { id: uid(), componentId: compId, networkZoneId: zone.id }
      instances.push(inst)
      if (!instancesByCompId.has(compId)) instancesByCompId.set(compId, [])
      instancesByCompId.get(compId)!.push(inst)
    }
  }

  for (const [nodeId, meta] of Object.entries(compMetaRaw)) {
    const comp = compByNodeId.get(nodeId)
    if (comp) addInstances(meta, comp.id)
  }
  for (const [nodeId, meta] of Object.entries(techCompMetaRaw)) {
    const comp = techCompByNodeId.get(nodeId)
    if (comp) addInstances(meta, comp.id)
  }

  // ── Technical services ────────────────────────────────────────────────────
  const technicalServices: TechnicalService[] = Object.entries(techSvcMetaRaw).map(([nodeId, meta]) => ({
    id:          uid(),
    name:        String(meta.name ?? '').trim() || nameFromKey(nodeId),
    description: String(meta.description ?? '').trim() || undefined,
  }))

  // ── Landscape arrows → relations ──────────────────────────────────────────
  const relations: Relation[] = []
  if (data.landscape) {
    const parsed = parseDsl(`flowchart TB\n${String(data.landscape)}`)
    for (const rel of parsed.relations) {
      const from = findComp(rel.fromId)
      const to   = findComp(rel.toId)
      if (!from || !to) continue
      const { protocol, label } = splitProtocolLabel(rel.label ?? '')
      relations.push({ id: uid(), fromComponentId: from.id, toComponentId: to.id, protocol, label, source: 'manual' })
    }
  }

  // ── Technical landscape arrows → technical relations ──────────────────────
  const technicalRelations: TechnicalRelation[] = []
  if (data['technical-landscape']) {
    const parsed = parseDsl(`flowchart TB\n${String(data['technical-landscape'])}`)
    for (const rel of parsed.relations) {
      const fromComp = findComp(rel.fromId)
      const toComp   = findComp(rel.toId)
      if (!fromComp || !toComp) continue
      const fromInsts = instancesByCompId.get(fromComp.id) ?? []
      const toInsts   = instancesByCompId.get(toComp.id)   ?? []
      if (!fromInsts.length || !toInsts.length) continue
      const { protocol, label } = splitProtocolLabel(rel.label ?? '')
      technicalRelations.push({
        id:              uid(),
        fromComponentId: fromComp.id,
        toComponentId:   toComp.id,
        fromInstanceId:  fromInsts[0].id,
        toInstanceId:    toInsts[0].id,
        protocol,
        label,
      })
    }
  }

  // ── Flows ─────────────────────────────────────────────────────────────────
  const minimalDag = { components } as Dag
  const applicationFlows: ApplicationFlow[] = (flowsRaw as Array<Record<string, string>>)
    .filter((f): f is Record<string, string> & { name: string } => !!f.name?.trim())
    .map((f) => {
      const diagram = (f.diagram ?? '').trim()
      const body    = diagram.startsWith('sequenceDiagram')
        ? diagram.replace(/^sequenceDiagram\s*\n?/, '')
        : diagram
      return {
        id:          uid(),
        name:        f.name.trim(),
        description: f.description?.trim() ?? '',
        steps:       body.trim() ? parseFlowSteps(body, minimalDag) : [],
        mermaidDsl:  body.trim() || undefined,
      }
    })

  const technicalLandscape: TechnicalLandscape = {
    customNetworkZones,
    instances,
    technicalRelations,
    technicalServices,
  }

  return {
    id:               uid(),
    name:             String(data.name).trim(),
    description:      String(data.description ?? '').trim(),
    createdAt:        now(),
    updatedAt:        now(),
    customCategories: filterStoredCustomCategories(customCategories),
    components,
    technicalComponents,
    relations,
    landscape:        {},
    technicalLandscape,
    applicationFlows,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OLD FORMAT — categories derived from landscape subgraphs (backward compat)
// ─────────────────────────────────────────────────────────────────────────────

function importOldFormat(data: Record<string, unknown>): Dag {
  if (!data.landscape) throw new Error('Missing "landscape" field in YAML')

  const compMetaRaw   = (data.components              ?? {}) as Record<string, Record<string, string>>
  const techCompMeta  = (data['technical-components'] ?? {}) as Record<string, Record<string, string>>
  const techSvcMeta   = (data['technical-services']   ?? {}) as Record<string, Record<string, string>>

  // ── 1. Parse application landscape ─────────────────────────────────────────
  const landscapeParsed  = parseDsl(data.landscape as string)
  const customCategories: Category[] = []
  const categoryMap = new Map<string, Category>()
  for (const name of landscapeParsed.subgraphs) {
    categoryMap.set(name, resolveCategory(name, customCategories))
  }

  const components: Component[] = landscapeParsed.nodes.map((node) => {
    const meta     = compMetaRaw[node.id] ?? {}
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

  const relations: Relation[] = []
  for (const rel of landscapeParsed.relations) {
    const from = findAppComp(rel.fromId)
    const to   = findAppComp(rel.toId)
    if (!from || !to) continue
    const { protocol, label } = splitProtocolLabel(rel.label ?? '')
    relations.push({ id: uid(), fromComponentId: from.id, toComponentId: to.id, protocol, label, source: 'manual' })
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
    const techParsed         = parseDsl(data['technical-landscape'] as string)
    const customNetworkZones: NetworkZone[] = []
    const zoneMap = new Map<string, NetworkZone>()

    for (const name of techParsed.subgraphs) {
      if (name === TECH_SVC_SUBGRAPH) continue
      zoneMap.set(name, resolveZone(name, customNetworkZones))
    }

    for (const node of techParsed.nodes) {
      if (node.subgraph === TECH_SVC_SUBGRAPH) continue
      if (findAppComp(node.id)) continue
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

    const allComps     = [...components, ...technicalComponents]
    const findAnyComp  = (nodeId: string) => allComps.find((c) => toNodeId(c.name) === nodeId)
    const instances: ComponentInstance[]   = []
    const instanceByNodeId = new Map<string, ComponentInstance>()

    for (const node of techParsed.nodes) {
      if (!node.subgraph || node.subgraph === TECH_SVC_SUBGRAPH) continue
      const zone = zoneMap.get(node.subgraph)
      const comp = findAnyComp(node.id)
      if (!zone || !comp) continue
      const inst: ComponentInstance = { id: uid(), componentId: comp.id, networkZoneId: zone.id }
      instances.push(inst)
      instanceByNodeId.set(node.id, inst)
    }

    const technicalServices: TechnicalService[] = []
    for (const node of techParsed.nodes.filter((n) => n.subgraph === TECH_SVC_SUBGRAPH)) {
      const meta = techSvcMeta[node.id] ?? {}
      technicalServices.push({
        id:          uid(),
        name:        node.label,
        description: meta.description?.trim() || undefined,
      })
    }

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

    technicalLandscape = { customNetworkZones, instances, technicalRelations, technicalServices }
  }

  // ── 3. Flows ────────────────────────────────────────────────────────────────
  const flowsRaw   = (data.flows ?? []) as Array<Record<string, string>>
  const minimalDag = { components } as Dag

  const applicationFlows: ApplicationFlow[] = flowsRaw
    .filter((f): f is Record<string, string> & { name: string } => !!f.name?.trim())
    .map((f) => {
      const diagram = (f.diagram ?? '').trim()
      const body    = diagram.startsWith('sequenceDiagram')
        ? diagram.replace(/^sequenceDiagram\s*\n?/, '')
        : diagram
      return {
        id:          uid(),
        name:        f.name.trim(),
        description: f.description?.trim() ?? '',
        steps:       body.trim() ? parseFlowSteps(body, minimalDag) : [],
        mermaidDsl:  body.trim() || undefined,
      }
    })

  const defaultIds = new Set(
    DEFAULT_CATEGORIES.map((c) => `cat__${c.name.toLowerCase().replace(/\s+/g, '_')}`),
  )

  return {
    id:               uid(),
    name:             String(data.name).trim(),
    description:      String(data.description ?? '').trim(),
    createdAt:        now(),
    updatedAt:        now(),
    customCategories: customCategories.filter((c) => !defaultIds.has(c.id)),
    components,
    technicalComponents,
    relations,
    landscape:        {},
    technicalLandscape,
    applicationFlows,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point — detects format automatically
// ─────────────────────────────────────────────────────────────────────────────

export function importDagFromYaml(content: string): Dag {
  const data = parseYaml(content) as Record<string, unknown>
  if (!data.name) throw new Error('Missing "name" field in YAML')

  // New format: has a top-level "categories" list
  if (Array.isArray(data.categories)) return importNewFormat(data)

  // Old format: categories derived from landscape subgraphs
  return importOldFormat(data)
}
