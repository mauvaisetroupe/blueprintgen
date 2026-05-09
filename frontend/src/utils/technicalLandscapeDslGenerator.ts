import type { Dag, Component, NodeShape, ComponentInstance } from '@/types/dag'
import { DEFAULT_SHAPE_BY_NAME, DEFAULT_ZONE_COLORS, allNetworkZones, allCategories } from '@/types/dag'
import { toNodeId } from './landscapeDslGenerator'

function allComps(dag: Dag): Component[] {
  return [...dag.components, ...(dag.technicalComponents ?? [])]
}

/**
 * Génère le DSL Mermaid du landscape technique depuis le data model (info dans le dag)
 */
export function generateTechnicalLandscapeDsl(dag: Dag): string {
  const tl = dag.technicalLandscape
  const lines: string[] = []

  // Header
  const headerLines = ['---', 'config:', '    theme: neutral']
  if (tl.useElk) headerLines.push('    layout: elk')
  headerLines.push('---', '', 'flowchart TB')
  lines.push(headerLines.join('\n'))

  const instancesByComponent = buildInstancesByComponent(tl)
  const zones = allNetworkZones(tl)
  const renderedZoneIds: string[] = []

  for (const zone of zones) {
    const componentsInZone = allComps(dag).filter(
      (c) => c.name.trim() !== '' && tl.instances.some((i) => i.componentId === c.id && i.networkZoneId === zone.id),
    )
    if (componentsInZone.length === 0) continue

    const zoneNodeId = toNodeId(zone.name)
    lines.push(`  subgraph ${zoneNodeId} ["Zone - ${zone.name}"]`)

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
          const nodeId = nodeIdForInstance(comp, zone, isMulti)
          lines.push(`      ${nodeId}${nodeLabel(comp, shape)}`)
        }
        lines.push('    end')
      } else {
        for (const comp of compsInCat) {
          const isMulti = (instancesByComponent.get(comp.id)?.length ?? 0) > 1
          const nodeId = nodeIdForInstance(comp, zone, isMulti)
          lines.push(`    ${nodeId}${nodeLabel(comp, shape)}`)
        }
      }      
    }
    lines.push('  end')
    renderedZoneIds.push(zoneNodeId)
  }

  // Add physical relationship
  lines.push(generateTechnicalRelationsBody(dag))

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


// /**
//  * Retourne les node IDs valides pour la section éditable (relations multi-instance).
//  * Seuls les composants impliqués dans au moins une relation multi-instance sont listés.
//  */
export function getEditableNodeIds(dag: Dag): Set<string> {
  const tl = dag.technicalLandscape
  const zones = allNetworkZones(tl)
  const instancesByComponent = buildInstancesByComponent(tl)

  const nodeIds = new Set<string>()
  for (const comp of allComps(dag)) {
    const insts = instancesByComponent.get(comp.id) ?? []
    if (insts.length === 0) continue
    const isMulti = insts.length > 1
    for (const inst of insts) {
      const zone = zones.find((z) => z.id === inst.networkZoneId)
      nodeIds.add(isMulti && zone
        ? `${comp.nodeId}__${toNodeId(zone.name)}`
        : comp.nodeId)
    }
  }
  return nodeIds
}

// /**
//  * Valide le corps éditable des technical relations.
//  * Retourne une liste de messages d'erreur sémantiques.
//  */
export function validateTechnicalRelationsBody(body: string, dag: Dag): string[] {
  const errors: string[] = []
  const editableNodeIds   = getEditableNodeIds(dag)
  // const editableLogical   = getEditableLogicalKeys(dag)
  // const zones             = allNetworkZones(dag.technicalLandscape)
  const arrowRe = /^\s*([\w]+)\s+-->\s*(?:\|([^|]*)\|\s*)?([\w]+)\s*(?:%%.*)?$/

  for (const line of body.split('\n')) {
    if (!line.trim() || line.trim().startsWith('%%')) continue
    const m = line.match(arrowRe)
    if (!m) continue
    const fromNodeId = m[1]!
    const toNodeId_  = m[3]!

    if (!editableNodeIds.has(fromNodeId)) {
      errors.push(`Unknown or non-editable node: "${fromNodeId}"`)
      continue
    }
    if (!editableNodeIds.has(toNodeId_)) {
      errors.push(`Unknown or non-editable node: "${toNodeId_}"`)
      continue
    }

    // const from = resolveNodeIdToInstance(fromNodeId, dag, zones)
    // const to   = resolveNodeIdToInstance(toNodeId_,  dag, zones)
    // if (from && to) {
    //   const key = `${from.compId}->${to.compId}`
    //   if (!editableLogical.has(key)) {
    //     const fromName = allComps(dag).find((c) => c.id === from.compId)?.name ?? fromNodeId
    //     const toName   = allComps(dag).find((c) => c.id === to.compId)?.name   ?? toNodeId_
    //     errors.push(`No relation defined between "${fromName}" and "${toName}"`)
    //   }
    // }
  }
  return errors
}

// /**
//  * Header commenté pour l'éditeur DSL : liste des node IDs impliqués dans des
//  * relations éditables (multi-instance), suivis des flèches fixes (mono→mono).
//  */
export function generateTechnicalLandscapeCommentHeader(dag: Dag): string {
  const tl   = dag.technicalLandscape
  const zones = allNetworkZones(tl)
  const instancesByComponent = buildInstancesByComponent(tl)
  const lines: string[] = ['flowchart TB']

  // Tous les instance
  const nodes: string[] = []
  for (const inst of tl.instances) {
    const insts = instancesByComponent.get(inst.componentId) ?? []
    if (insts.length === 0) continue
    const isMulti = insts.length > 1
    const zone = zones.find((z) => z.id === inst.networkZoneId)
    const comp = allComps(dag).find((c) => c.id === inst.componentId)
    if (comp && zone) {
      const nodeId = nodeIdForInstance(comp, zone, isMulti)
      nodes.push(`  %%   ${nodeId}`)
    }
  }

  if (nodes.length > 0) {
    lines.push('  %% Available nodes:')
    lines.push(...nodes)
  }
  // lines.push('  %% Arrows: --> link  -->|label| labeled link')

  return lines.join('\n')
}

// /**
//  * Flèches éditables :
//  * - relations business multi-instance (choix de zone), au moins le "from" ou le "to" est multi-instance
//  * - au moins un composant technique (stored in tl.technicalRelations)
//  */
export function generateTechnicalRelationsBody(dag: Dag): string {
  const tl = dag.technicalLandscape
  const instancesByComponent = buildInstancesByComponent(tl)
  const zones = allNetworkZones(tl)
  const lines: string[] = []
  const instanceById = new Map(tl.instances.map((i) => [i.id, i]))
  for (const tr of tl.technicalRelations) {
    const fromComp = allComps(dag).find((c) => c.id === tr.fromComponentId)
    const toComp   = allComps(dag).find((c) => c.id === tr.toComponentId)
    if (!fromComp || !toComp) continue
    const fromInst = instanceById.get(tr.fromInstanceId)
    const toInst   = instanceById.get(tr.toInstanceId)
    const fromZone = fromInst ? zones.find((z) => z.id === fromInst.networkZoneId) : undefined
    const toZone   = toInst   ? zones.find((z) => z.id === toInst.networkZoneId)   : undefined
    const fromIsMulti = (instancesByComponent.get(tr.fromComponentId)?.length ?? 0) > 1
    const toIsMulti   = (instancesByComponent.get(tr.toComponentId)?.length   ?? 0) > 1
    const fromId = fromZone ? nodeIdForInstance(fromComp, fromZone, fromIsMulti) : fromComp.nodeId
    const toId   = toZone   ? nodeIdForInstance(toComp,   toZone,   toIsMulti)   : toComp.nodeId
    const edgeLabel = tr.protocol
    lines.push(edgeLabel ? `  ${fromId} -->|${sanitizeLabel(edgeLabel)}| ${toId}` : `  ${fromId} --> ${toId}`)
  } 

  return lines.join('\n')
}

// function buildRelationLines(dag: Dag, multiOnly: boolean): string {
//   const tl = dag.technicalLandscape
//   const lines: string[] = []

//   const instancesByComponent = buildInstancesByComponent(tl)

//   const zones = allNetworkZones(tl).sort((a, b) => a.order - b.order)
//   const techRelsByKey = new Map<string, typeof tl.technicalRelations>()
//   for (const tr of tl.technicalRelations) {
//     const key = `${tr.fromComponentId}->${tr.toComponentId}`
//     if (!techRelsByKey.has(key)) techRelsByKey.set(key, [])
//     techRelsByKey.get(key)!.push(tr)
//   }
//   const instanceById = new Map(tl.instances.map((i) => [i.id, i]))

//   for (const rel of buildRelationsToRender(dag)) {
//     const isMulti = fromIsMulti || toIsMulti

//     if (multiOnly !== isMulti) continue

//     const fromComp = allComps(dag).find((c) => c.id === rel.fromComponentId)!
//     const toComp   = allComps(dag).find((c) => c.id === rel.toComponentId)!
//     const key      = `${rel.fromComponentId}->${rel.toComponentId}`
//     const techRels = techRelsByKey.get(key)

//     if (techRels && techRels.length > 0) {
//       for (const tr of techRels) {
//         const fromInst = instanceById.get(tr.fromInstanceId)
//         const toInst   = instanceById.get(tr.toInstanceId)
//         const fromZone = fromInst ? zones.find((z) => z.id === fromInst.networkZoneId) : undefined
//         const toZone   = toInst   ? zones.find((z) => z.id === toInst.networkZoneId)   : undefined
//         //LCO should check
//         const fromId = fromZone ? nodeIdForInstance(fromComp.name, fromZone.name) : toNodeId(fromComp.name)
//         const toId   = toZone   ? nodeIdForInstance(toComp.name,   toZone.name)   : toNodeId(toComp.name)
//         const edgeLabel = tr.protocol ?? rel.protocol
//         lines.push(edgeLabel ? `  ${fromId} -->|${sanitizeLabel(edgeLabel)}| ${toId}` : `  ${fromId} --> ${toId}`)
//       }
//     } else {
//       const fromInsts = instancesByComponent.get(rel.fromComponentId) ?? []
//       const toInsts   = instancesByComponent.get(rel.toComponentId)   ?? []
//       const fromId = resolveRelationNodeId(fromComp.name, fromInsts, zones)
//       const toId   = resolveRelationNodeId(toComp.name, toInsts, zones)
//       const edgeLabel = rel.protocol
//       lines.push(edgeLabel ? `  ${fromId} -->|${sanitizeLabel(edgeLabel)}| ${toId}` : `  ${fromId} --> ${toId}`)
//     }
//   }

// //   return lines.join('\n')
// // }

// /**
//  * Données structurées des relations fixes (mono→mono) pour alimenter le store.
//  * Permet de conserver ces relations lors d'un replaceTechnicalRelations depuis l'éditeur DSL.
//  */
// export function getFixedRelationData(
//   dag: Dag,
// ): Array<{ fromComponentId: string; toComponentId: string; fromInstanceId: string; toInstanceId: string; protocol?: string }> {
//   const tl = dag.technicalLandscape
//   const result: Array<{ fromComponentId: string; toComponentId: string; fromInstanceId: string; toInstanceId: string; protocol?: string }> = []

//   const instancesByComponent = buildInstancesByComponent(tl)

//   const techRelsByKey = new Map<string, typeof tl.technicalRelations>()
//   for (const tr of tl.technicalRelations) {
//     const key = `${tr.fromComponentId}->${tr.toComponentId}`
//     if (!techRelsByKey.has(key)) techRelsByKey.set(key, [])
//     techRelsByKey.get(key)!.push(tr)
//   }

//   for (const rel of buildRelationsToRender(dag)) {
//     const fromInsts = instancesByComponent.get(rel.fromComponentId) ?? []
//     const toInsts   = instancesByComponent.get(rel.toComponentId)   ?? []
//     if (fromInsts.length !== 1 || toInsts.length !== 1) continue

//     const existing = techRelsByKey.get(`${rel.fromComponentId}->${rel.toComponentId}`)
//     if (existing && existing.length > 0) {
//       // Réutilise le protocol déjà stocké
//       result.push({
//         fromComponentId: rel.fromComponentId,
//         toComponentId:   rel.toComponentId,
//         fromInstanceId:  fromInsts[0]!.id,
//         toInstanceId:    toInsts[0]!.id,
//         protocol:        existing[0]!.protocol,
//       })
//     } else {
//       result.push({
//         fromComponentId: rel.fromComponentId,
//         toComponentId:   rel.toComponentId,
//         fromInstanceId:  fromInsts[0]!.id,
//         toInstanceId:    toInsts[0]!.id,
//         protocol:        rel.protocol,
//       })
//     }
//   }

//   return result
// }

// /**
//  * Parse les flèches DSL et retourne des données de TechnicalRelation.
//  * Utilisé pour synchroniser le modèle depuis l'éditeur DSL.
//  */
export function parseTechnicalRelationsBody(
  body: string,
  dag: Dag,
): Array<{ fromComponentId: string; toComponentId: string; fromInstanceId: string; toInstanceId: string; protocol?: string }> {
  const tl = dag.technicalLandscape
  const zones = allNetworkZones(tl)
  const result: Array<{ fromComponentId: string; toComponentId: string; fromInstanceId: string; toInstanceId: string; protocol?: string }> = []

  // Matches: nodeId --> nodeId  or  nodeId -->|label| nodeId
  const arrowRe = /^\s*([\w]+)\s+-->\s*(?:\|([^|]*)\|\s*)?([\w]+)\s*(?:%%.*)?$/

  for (const line of body.split('\n')) {
    const m = line.match(arrowRe)
    if (!m) continue
    const fromNodeId = m[1]
    const label      = m[2]
    const toNodeId_  = m[3]
    if (!fromNodeId || !toNodeId_) continue

    const from = resolveNodeIdToInstance(fromNodeId, dag, zones)
    const to   = resolveNodeIdToInstance(toNodeId_, dag, zones)
    if (!from || !to) continue

    result.push({
      fromComponentId: from.compId,
      toComponentId:   to.compId,
      fromInstanceId:  from.instId,
      toInstanceId:    to.instId,
      protocol:        label?.trim() || undefined,
    })
  }

  return result
}

function resolveNodeIdToInstance(
  nodeId: string,
  dag: Dag,
  zones: { id: string; name: string }[],
): { compId: string; instId: string } | null {
  const tl = dag.technicalLandscape

  // Multi-instance: nodeId ends with __<zoneNodeId>
  for (const zone of zones) {
    const suffix = `__${toNodeId(zone.name)}`
    if (nodeId.endsWith(suffix)) {
      const compId = nodeId.slice(0, -suffix.length)
      const comp = allComps(dag).find((c) => c.name.trim() !== '' && c.nodeId === compId)
      if (comp) {
        const inst = tl.instances.find((i) => i.componentId === comp.id && i.networkZoneId === zone.id)
        if (inst) return { compId: comp.id, instId: inst.id }
      }
    }
  }

  // Single-instance
  const comp = allComps(dag).find((c) => c.name.trim() !== '' && c.nodeId === nodeId)
  if (comp) {
    const insts = tl.instances.filter((i) => i.componentId === comp.id)
    if (insts.length > 0) return { compId: comp.id, instId: insts[0]!.id }
  }

  return null
}

// ID de nœud lisible : nom seul si 1 instance, nom__zone si multi-zone
function nodeIdForInstance(comp: { nodeId: string }, zone: { name: string }, isMulti?: boolean): string {
  return isMulti ? `${comp.nodeId}__${toNodeId(zone.name)}` : comp.nodeId
}

// // Résout l'ID de nœud pour une extrémité de relation
// function resolveRelationNodeId(
//   compName: string,
//   instances: { networkZoneId: string }[],
//   zones: { id: string; name: string }[],
// ): string {
//   if (instances.length === 0) return toNodeId(compName)
//   if (instances.length === 1) return toNodeId(compName)
//   // Multi-zone : on ne peut pas deviner quelle instance — on utilise la première (l'architecte ajustera via TechnicalRelation)
//   const zone = zones.find((z) => z.id === instances[0]?.networkZoneId)
//   return zone ? `${toNodeId(compName)}__${toNodeId(zone.name)}` : toNodeId(compName)
// }

function sanitizeLabel(label: string): string {
  return label.replace(/[()[\]{}"]/g, '').trim()
}

function buildInstancesByComponent(tl: Dag['technicalLandscape']) {
  const m = new Map<string, typeof tl.instances>()
  for (const inst of tl.instances) {
    if (!m.has(inst.componentId)) m.set(inst.componentId, [])
    m.get(inst.componentId)!.push(inst)
  }
  return m
}

// // Construit la liste unifiée des relations logiques à rendre (manual + autoSync)
// function buildRelationsToRender(dag: Dag) {
//   const validIds = new Set(allComps(dag).filter((c) => c.name.trim() !== '').map((c) => c.id))
//   const manualKeys = new Set(dag.relations.map((r) => `${r.fromComponentId}->${r.toComponentId}`))
//   const result = [...dag.relations]

//   if (dag.landscape.autoSync) {
//     for (const flow of dag.applicationFlows) {
//       for (const step of flow.steps.filter((s) => !s.isReturn)) {
//         const key = `${step.fromComponentId}->${step.toComponentId}`
//         if (manualKeys.has(key)) continue
//         if (!validIds.has(step.fromComponentId) || !validIds.has(step.toComponentId)) continue
//         manualKeys.add(key)
//         result.push({
//           id: '', fromComponentId: step.fromComponentId, toComponentId: step.toComponentId,
//           protocol: step.protocol, label: step.label, source: 'manual',
//         })
//       }
//     }
//   }
//   return result.filter((r) => validIds.has(r.fromComponentId) && validIds.has(r.toComponentId))
// }

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

// Node IDs pour l'autocomplétion dans l'éditeur DSL
export function getCompletionNames(dag: Dag | undefined): string[]  {
  if (!dag) return []
  const instances = dag.technicalLandscape.instances
  const zones = allNetworkZones(dag.technicalLandscape)
  const countByComp = new Map<string, number>()
  for (const inst of instances) countByComp.set(inst.componentId, (countByComp.get(inst.componentId) ?? 0) + 1)
  const names: string[] = []
  const allComps = [...dag.components, ...dag.technicalComponents]
  for (const comp of allComps.filter((c) => c.name.trim() !== '')) {
    const count = countByComp.get(comp.id) ?? 0
    if (count === 0) continue
    if (count === 1) {
      names.push(comp.nodeId)
    } else {
      for (const inst of instances.filter((i) => i.componentId === comp.id)) {
        const zone = zones.find((z) => z.id === inst.networkZoneId)
        if (zone) names.push(`${comp.nodeId}__${toNodeId(zone.name)}`)
      }
    }
  }
  return names
} 
