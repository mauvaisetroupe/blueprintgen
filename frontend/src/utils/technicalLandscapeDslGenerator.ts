import type { Dag, NodeShape } from '@/types/dag'
import { DEFAULT_SHAPE_BY_NAME, DEFAULT_ZONE_COLORS, allNetworkZones } from '@/types/dag'
import { toNodeId } from './landscapeDslGenerator'

/**
 * Génère le DSL Mermaid du landscape technique.
 *
 * Structure :
 * - Composants regroupés par zone réseau (subgraph externe)
 *   - puis par catégorie (subgraph interne, si showSubgraph)
 * - Composants sans zone dans un groupe "Unassigned"
 * - Relations applicatives (dag.relations) avec protocole si disponible
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

  // Pour chaque zone, les composants qui y ont une instance
  for (const zone of zones) {
    const componentsInZone = dag.components.filter(
      (c) => c.name.trim() !== '' && tl.instances.some((i) => i.componentId === c.id && i.networkZoneId === zone.id),
    )
    if (componentsInZone.length === 0) continue

    const zoneNodeId = toNodeId(zone.name)
    lines.push(`  subgraph ${zoneNodeId} ["${zone.name}"]`)

    // Regrouper par catégorie à l'intérieur de la zone
    const sortedCategories = [...dag.categories].sort((a, b) => a.order - b.order)
    for (const category of sortedCategories) {
      const compsInCat = componentsInZone.filter((c) => c.categoryId === category.id)
      if (compsInCat.length === 0) continue
      const shape = DEFAULT_SHAPE_BY_NAME.get(category.name.toLowerCase())

      const showSubgraph = tl.categorySubgraphs?.[category.id] ?? category.showSubgraph
      if (showSubgraph) {
        lines.push(`    subgraph ${zoneNodeId}_${toNodeId(category.name)} ["${category.name}"]`)
        for (const comp of compsInCat) {
          const nodeId = instanceNodeId(comp.id, zone.id)
          lines.push(`      ${nodeId}${nodeLabel(comp, shape)}`)
        }
        lines.push('    end')
      } else {
        for (const comp of compsInCat) {
          const nodeId = instanceNodeId(comp.id, zone.id)
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
      const category = dag.categories.find((c) => c.id === comp.categoryId)
      const shape = category ? DEFAULT_SHAPE_BY_NAME.get(category.name.toLowerCase()) : undefined
      lines.push(`    ${toNodeId(comp.name)}${nodeLabel(comp, shape)}`)
    }
    lines.push('  end')
  }

  // Relations applicatives (dag.relations) — avec protocole si disponible
  const validIds = new Set(dag.components.filter((c) => c.name.trim() !== '').map((c) => c.id))

  // Clés des relations manuelles pour dédupliquer l'autoSync
  const manualKeys = new Set(dag.relations.map((r) => `${r.fromComponentId}->${r.toComponentId}`))

  const relationsToRender = [...dag.relations]

  // AutoSync partagé avec le landscape applicatif
  if (dag.landscape.autoSync) {
    for (const flow of dag.applicationFlows) {
      for (const step of flow.steps.filter((s) => !s.isReturn)) {
        const key = `${step.fromComponentId}->${step.toComponentId}`
        if (manualKeys.has(key)) continue
        if (!validIds.has(step.fromComponentId) || !validIds.has(step.toComponentId)) continue
        manualKeys.add(key)
        relationsToRender.push({
          id: '',
          fromComponentId: step.fromComponentId,
          toComponentId:   step.toComponentId,
          protocol:        step.protocol,
          label:           step.label,
          source:          'manual',
        })
      }
    }
  }

  for (const rel of relationsToRender) {
    if (!validIds.has(rel.fromComponentId) || !validIds.has(rel.toComponentId)) continue

    const fromComp = dag.components.find((c) => c.id === rel.fromComponentId)!
    const toComp   = dag.components.find((c) => c.id === rel.toComponentId)!

    const fromInsts = instancesByComponent.get(rel.fromComponentId) ?? []
    const toInsts   = instancesByComponent.get(rel.toComponentId)   ?? []

    const fromId = fromInsts.length === 1 && fromInsts[0]
      ? instanceNodeId(fromComp.id, fromInsts[0].networkZoneId)
      : toNodeId(fromComp.name)
    const toId = toInsts.length === 1 && toInsts[0]
      ? instanceNodeId(toComp.id, toInsts[0].networkZoneId)
      : toNodeId(toComp.name)

    // Dans le landscape technique, on n'affiche que le protocole — pas le label fonctionnel
    const edgeLabel = rel.protocol
    lines.push(edgeLabel ? `  ${fromId} -->|${sanitizeLabel(edgeLabel)}| ${toId}` : `  ${fromId} --> ${toId}`)
  }

  // Styles des zones réseau : fond coloré + bordure pointillée
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

// Supprime les caractères invalides dans les labels de flèches Mermaid (pipe syntax)
function sanitizeLabel(label: string): string {
  return label.replace(/[()[\]{}"]/g, '').trim()
}

// Identifiant Mermaid unique pour une instance (composant + zone)
function instanceNodeId(componentId: string, zoneId: string): string {
  return `inst_${componentId.replace(/-/g, '')}_${zoneId.replace(/-/g, '')}`
}

// Label Mermaid du nœud avec infos techniques
function nodeLabel(comp: { name: string; technology?: string; framework?: string }, shape?: import('@/types/dag').NodeShape): string {
  const lines = [comp.name]
  if (comp.technology) lines.push(comp.technology)
  if (comp.framework)  lines.push(comp.framework)
  const label = lines.join('\\n')
  switch (shape) {
    case 'cylinder': return `[("${label}")]`
    case 'rounded':  return `(["${label}"])`
    default:         return `["${label}"]`
  }
}
