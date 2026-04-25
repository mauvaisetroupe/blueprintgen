import type { Dag, NodeShape } from '@/types/dag'
import { DEFAULT_SHAPE_BY_NAME, DEFAULT_ZONE_COLORS, allNetworkZones, allCategories } from '@/types/dag'
import { toNodeId } from './landscapeDslGenerator'

/**
 * Génère le DSL Mermaid du landscape technique.
 *
 * IDs de nœuds :
 * - 1 seule zone  → toNodeId(comp.name)           ex: web_frontend
 * - Multi-zones   → toNodeId(comp.name)__toNodeId(zone.name)   ex: web_frontend__dmz
 */
export function generateTechnicalLandscapeDsl(dag: Dag): string {
  const tl = dag.technicalLandscape
  const lines: string[] = []

  // Header
  const headerLines = ['---', 'config:', '    theme: neutral']
  if (tl.useElk) headerLines.push('    layout: elk')
  headerLines.push('---', '', 'flowchart TB')
  lines.push(headerLines.join('\n'))

  // Index des instances par composant
  const instancesByComponent = new Map<string, typeof tl.instances>()
  for (const inst of tl.instances) {
    if (!instancesByComponent.has(inst.componentId)) instancesByComponent.set(inst.componentId, [])
    instancesByComponent.get(inst.componentId)!.push(inst)
  }

  // Composants sans aucune instance → groupe "Unassigned"
  const unassigned = dag.components.filter(
    (c) => c.name.trim() !== '' && !instancesByComponent.has(c.id),
  )

  // Zones triées : defaults (IDs stables) + zones custom du DAG
  const zones = allNetworkZones(tl).sort((a, b) => a.order - b.order)
  const renderedZoneIds: string[] = []

  for (const zone of zones) {
    const componentsInZone = dag.components.filter(
      (c) => c.name.trim() !== '' && tl.instances.some((i) => i.componentId === c.id && i.networkZoneId === zone.id),
    )
    if (componentsInZone.length === 0) continue

    const zoneNodeId = toNodeId(zone.name)
    lines.push(`  subgraph ${zoneNodeId} ["${zone.name}"]`)

    const sortedCategories = allCategories(dag).sort((a, b) => a.order - b.order)
    for (const category of sortedCategories) {
      const compsInCat = componentsInZone.filter((c) => c.categoryId === category.id)
      if (compsInCat.length === 0) continue
      const shape = DEFAULT_SHAPE_BY_NAME.get(category.name.toLowerCase())
      const showSubgraph = tl.categorySubgraphs?.[category.id] ?? category.showSubgraph

      if (showSubgraph) {
        lines.push(`    subgraph ${zoneNodeId}_${toNodeId(category.name)} ["${category.name}"]`)
        for (const comp of compsInCat) {
          const isMulti = (instancesByComponent.get(comp.id)?.length ?? 0) > 1
          const nodeId = nodeIdForInstance(comp.name, zone.name, isMulti)
          lines.push(`      ${nodeId}${nodeLabel(comp, shape)}`)
        }
        lines.push('    end')
      } else {
        for (const comp of compsInCat) {
          const isMulti = (instancesByComponent.get(comp.id)?.length ?? 0) > 1
          const nodeId = nodeIdForInstance(comp.name, zone.name, isMulti)
          lines.push(`    ${nodeId}${nodeLabel(comp, shape)}`)
        }
      }
    }
    lines.push('  end')
    renderedZoneIds.push(zoneNodeId)
  }

  // Composants non assignés
  if (unassigned.length > 0) {
    lines.push('  subgraph unassigned ["Unassigned"]')
    for (const comp of unassigned) {
      const category = allCategories(dag).find((c) => c.id === comp.categoryId)
      const shape = category ? DEFAULT_SHAPE_BY_NAME.get(category.name.toLowerCase()) : undefined
      lines.push(`    ${toNodeId(comp.name)}${nodeLabel(comp, shape)}`)
    }
    lines.push('  end')
  }

  // Relations
  const validIds = new Set(dag.components.filter((c) => c.name.trim() !== '').map((c) => c.id))
  const manualKeys = new Set(dag.relations.map((r) => `${r.fromComponentId}->${r.toComponentId}`))
  const relationsToRender = [...dag.relations]

  if (dag.landscape.autoSync) {
    for (const flow of dag.applicationFlows) {
      for (const step of flow.steps.filter((s) => !s.isReturn)) {
        const key = `${step.fromComponentId}->${step.toComponentId}`
        if (manualKeys.has(key)) continue
        if (!validIds.has(step.fromComponentId) || !validIds.has(step.toComponentId)) continue
        manualKeys.add(key)
        relationsToRender.push({
          id: '', fromComponentId: step.fromComponentId, toComponentId: step.toComponentId,
          protocol: step.protocol, label: step.label, source: 'manual',
        })
      }
    }
  }

  // Index des TechnicalRelations par clé logique
  const techRelsByKey = new Map<string, typeof tl.technicalRelations>()
  for (const tr of tl.technicalRelations) {
    const key = `${tr.fromComponentId}->${tr.toComponentId}`
    if (!techRelsByKey.has(key)) techRelsByKey.set(key, [])
    techRelsByKey.get(key)!.push(tr)
  }

  // Index des instances par ID
  const instanceById = new Map(tl.instances.map((i) => [i.id, i]))

  for (const rel of relationsToRender) {
    if (!validIds.has(rel.fromComponentId) || !validIds.has(rel.toComponentId)) continue

    const fromComp = dag.components.find((c) => c.id === rel.fromComponentId)!
    const toComp   = dag.components.find((c) => c.id === rel.toComponentId)!
    const key      = `${rel.fromComponentId}->${rel.toComponentId}`
    const techRels = techRelsByKey.get(key)

    if (techRels && techRels.length > 0) {
      // Rendu par instance physique
      for (const tr of techRels) {
        const fromInst = instanceById.get(tr.fromInstanceId)
        const toInst   = instanceById.get(tr.toInstanceId)
        const fromZone = fromInst ? zones.find((z) => z.id === fromInst.networkZoneId) : undefined
        const toZone   = toInst   ? zones.find((z) => z.id === toInst.networkZoneId)   : undefined
        const fromIsMulti = (instancesByComponent.get(rel.fromComponentId)?.length ?? 0) > 1
        const toIsMulti   = (instancesByComponent.get(rel.toComponentId)?.length   ?? 0) > 1
        const fromId = fromZone ? nodeIdForInstance(fromComp.name, fromZone.name, fromIsMulti) : toNodeId(fromComp.name)
        const toId   = toZone   ? nodeIdForInstance(toComp.name,   toZone.name,   toIsMulti)   : toNodeId(toComp.name)
        const edgeLabel = tr.protocol ?? rel.protocol
        lines.push(edgeLabel ? `  ${fromId} -->|${sanitizeLabel(edgeLabel)}| ${toId}` : `  ${fromId} --> ${toId}`)
      }
    } else {
      // Fallback : relation logique sans instance physique définie
      const fromInsts = instancesByComponent.get(rel.fromComponentId) ?? []
      const toInsts   = instancesByComponent.get(rel.toComponentId)   ?? []
      const fromId = resolveRelationNodeId(fromComp.name, fromInsts, zones)
      const toId   = resolveRelationNodeId(toComp.name, toInsts, zones)
      const edgeLabel = rel.protocol
      lines.push(edgeLabel ? `  ${fromId} -->|${sanitizeLabel(edgeLabel)}| ${toId}` : `  ${fromId} --> ${toId}`)
    }
  }

  // Styles des zones : fond coloré + bordure pointillée
  for (const zoneNodeId of renderedZoneIds) {
    const zone = zones.find((z) => toNodeId(z.name) === zoneNodeId)
    if (!zone) continue
    const colors = DEFAULT_ZONE_COLORS.get(zone.name.toLowerCase())
    if (colors) {
      lines.push(`  style ${zoneNodeId} fill:${colors.fill},stroke:${colors.stroke},stroke-dasharray:6 3,stroke-width:2px,color:#064e3b`)
    }
  }

  return lines.join('\n')
}

// ID de nœud lisible : nom seul si 1 instance, nom__zone si multi-zone
function nodeIdForInstance(compName: string, zoneName: string, isMulti: boolean): string {
  return isMulti ? `${toNodeId(compName)}__${toNodeId(zoneName)}` : toNodeId(compName)
}

// Résout l'ID de nœud pour une extrémité de relation
function resolveRelationNodeId(
  compName: string,
  instances: { networkZoneId: string }[],
  zones: { id: string; name: string }[],
): string {
  if (instances.length === 0) return toNodeId(compName)
  if (instances.length === 1) return toNodeId(compName)
  // Multi-zone : on ne peut pas deviner quelle instance — on utilise la première (l'architecte ajustera via TechnicalRelation)
  const zone = zones.find((z) => z.id === instances[0]?.networkZoneId)
  return zone ? `${toNodeId(compName)}__${toNodeId(zone.name)}` : toNodeId(compName)
}

function sanitizeLabel(label: string): string {
  return label.replace(/[()[\]{}"]/g, '').trim()
}

function nodeLabel(comp: { name: string; technology?: string; framework?: string }, shape?: NodeShape): string {
  const parts = [comp.name]
  if (comp.technology) parts.push(comp.technology)
  if (comp.framework)  parts.push(comp.framework)
  const label = parts.join('\\n')
  switch (shape) {
    case 'cylinder': return `[("${label}")]`
    case 'rounded':  return `(["${label}"])`
    default:         return `["${label}"]`
  }
}
