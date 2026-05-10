import { parse as parseYaml } from 'yaml'
import { parseDsl } from '@/utils/dslParser'
import { parseFlowSteps } from '@/utils/sequenceDslGenerator'
import { keyToName, toNodeId } from '@/utils/landscapeDslGenerator'
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

function importNewFormat(data: Record<string, unknown>): { dag: Dag; errors: string[] } {
  const errors: string[] = []
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
    const name = String(meta.name ?? '').trim() || keyToName(nodeId)
    const comp: Component = {
      id:          uid(),
      nodeId,
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
    const name = String(meta.name ?? '').trim() || keyToName(nodeId)
    const comp: Component = {
      id:          uid(),
      nodeId,
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
    name:        String(meta.name ?? '').trim() || keyToName(nodeId),
    description: String(meta.description ?? '').trim() || undefined,
  }))

  // ── Multi-zone node ID resolution ─────────────────────────────────────────
  // Resolves nodeIds like "api_gateway__dmz" or "web_frontend__internal_dmz"
  // to their component + specific instance. For single-zone components the plain
  // key is used; for multi-zone, the suffix __<toNodeId(zone.name)> selects the
  // right instance.
  const allResolvedZones = Array.from(zoneByName.values())

  function resolveToCompAndInstance(
    nodeId: string,
  ): { comp: Component; instanceId: string } | undefined {
    // Direct lookup (single-zone or unzoned component)
    const directComp = compByNodeId.get(nodeId) ?? techCompByNodeId.get(nodeId)
    if (directComp) {
      const insts = instancesByCompId.get(directComp.id) ?? []
      if (insts.length > 0) return { comp: directComp, instanceId: insts[0]!.id }
      return undefined
    }
    // Multi-zone: nodeId ends with __<toNodeId(zone.name)>
    for (const zone of allResolvedZones) {
      const suffix = `__${toNodeId(zone.name)}`
      if (!nodeId.endsWith(suffix)) continue
      const compKey = nodeId.slice(0, -suffix.length)
      const comp = compByNodeId.get(compKey) ?? techCompByNodeId.get(compKey)
      if (!comp) continue
      const inst = (instancesByCompId.get(comp.id) ?? []).find((i) => i.networkZoneId === zone.id)
      if (inst) return { comp, instanceId: inst.id }
    }
    return undefined
  }

  // ── Landscape arrows → relations ──────────────────────────────────────────
  const relations: Relation[] = []
  if (data.landscape) {
    const parsed = parseDsl(`flowchart TB\n${String(data.landscape)}`)
    for (const rel of parsed.relations) {
      const from = findComp(rel.fromId)
      const to   = findComp(rel.toId)
      if (!from) { errors.push(`landscape: unknown component "${rel.fromId}"`); continue }
      if (!to)   { errors.push(`landscape: unknown component "${rel.toId}"`);   continue }
      const label = rel.label?.trim() || undefined
      relations.push({ id: uid(), fromComponentId: from.id, toComponentId: to.id, label, source: 'manual' })
    }
  }

  // ── Technical landscape arrows → technical relations ──────────────────────
  const technicalRelations: TechnicalRelation[] = []
  if (data['technical-landscape']) {
    const parsed = parseDsl(`flowchart TB\n${String(data['technical-landscape'])}`)
    for (const rel of parsed.relations) {
      const from = resolveToCompAndInstance(rel.fromId)
      const to   = resolveToCompAndInstance(rel.toId)
      if (!from) { errors.push(`technical-landscape: unknown node "${rel.fromId}"`); continue }
      if (!to)   { errors.push(`technical-landscape: unknown node "${rel.toId}"`);   continue }
      const { protocol, label } = splitProtocolLabel(rel.label ?? '')
      technicalRelations.push({
        id:              uid(),
        fromComponentId: from.comp.id,
        toComponentId:   to.comp.id,
        fromInstanceId:  from.instanceId,
        toInstanceId:    to.instanceId,
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

  const dag: Dag = {
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
  return { dag, errors }
}

// ─────────────────────────────────────────────────────────────────────────────
// DEAD CODE REMOVED — old format (categories from DSL subgraphs) no longer supported
// ─────────────────────────────────────────────────────────────────────────────

function importOldFormat(_data: Record<string, unknown>): never {
  throw new Error('Unsupported YAML format: add a top-level "categories:" list. See help for the current format.')
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point — detects format automatically
// ─────────────────────────────────────────────────────────────────────────────

export function importDagFromYaml(content: string): { dag: Dag; errors: string[] } {
  const data = parseYaml(content) as Record<string, unknown>
  if (!data.name) throw new Error('Missing "name" field in YAML')

  // New format: has a top-level "categories" list
  if (Array.isArray(data.categories)) return importNewFormat(data)

  // Old format: categories derived from landscape subgraphs
  return importOldFormat(data)
}
