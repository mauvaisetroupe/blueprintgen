import type { Dag } from '@/types/dag'
import { allCategories, allNetworkZones } from '@/types/dag'

/** Génère un flowchart Mermaid depuis securityRelations[] (source de vérité unique). */
export function generateAuthnDsl(dag: Dag): string {
  const authn = dag.securityConfig?.authn
  if (!authn) return ''

  const { authGateways, iamInstances, securityRelations } = authn
  if (securityRelations.length === 0 && authGateways.length === 0) return ''

  const cats     = allCategories(dag)
  const tl       = dag.technicalLandscape
  const zones    = allNetworkZones(tl)
  const zoneById = new Map(zones.map((z) => [z.id, z]))
  const catById  = new Map(cats.map((c) => [c.id, c]))

  // ── Résolution d'un nœud (gateway | IAM | composant | instance de déploiement) ──
  type NodeInfo = { nodeId: string; label: string; group: string }

  function resolveNode(id: string): NodeInfo | null {
    const gw = authGateways.find((g) => g.id === id)
    if (gw) return { nodeId: `gw_${safe(id)}`, label: gw.product || 'Auth Gateway', group: 'grp_gateway' }

    const iam = iamInstances.find((i) => i.id === id)
    if (iam) return { nodeId: `n_${safe(id)}`, label: iam.product || 'IAM', group: 'grp_iam' }

    const comp = dag.components.find((c) => c.id === id)
    if (comp) {
      const cat = catById.get(comp.categoryId)
      return { nodeId: `n_${safe(id)}`, label: comp.name, group: comp.categoryId }
    }

    const inst = tl.instances.find((i) => i.id === id)
    if (inst) {
      const comp = dag.components.find((c) => c.id === inst.componentId)
      if (!comp) return null
      const zone = zoneById.get(inst.networkZoneId)
      return {
        nodeId: `n_${safe(id)}`,
        label:  `${comp.name} (${zone?.name ?? inst.networkZoneId})`,
        group:  comp.categoryId,
      }
    }
    return null
  }

  // Collecte tous les nœuds référencés
  const nodeMap = new Map<string, NodeInfo>()
  for (const rel of securityRelations) {
    for (const id of [rel.fromId, rel.toId]) {
      if (!nodeMap.has(id)) {
        const info = resolveNode(id)
        if (info) nodeMap.set(id, info)
      }
    }
  }
  // Inclure gateways/IAM même sans relations (pour les voir sur le diagramme)
  for (const gw of authGateways) {
    if (!nodeMap.has(gw.id)) {
      const info = resolveNode(gw.id)
      if (info) nodeMap.set(gw.id, info)
    }
  }

  if (nodeMap.size === 0) return ''

  const lines: string[] = ['---', 'config:', '  theme: neutral', '  layout: elk', '---', 'flowchart LR']

  // ── Subgraphs ──
  // Ordre : Users → Gateway → IAM → catégories applicatives (ordre du modèle)
  const groupOrder = ['cat__users', 'grp_gateway', 'grp_iam', ...cats.map((c) => c.id)]
  const groupLabel: Record<string, string> = {
    'grp_gateway': 'Auth Gateway',
    'grp_iam':     'IAM',
  }
  cats.forEach((c) => { groupLabel[c.id] = c.name })

  const byGroup = new Map<string, NodeInfo[]>()
  for (const info of nodeMap.values()) {
    const list = byGroup.get(info.group) ?? []
    list.push(info)
    byGroup.set(info.group, list)
  }

  let sgIdx = 0
  for (const groupId of groupOrder) {
    const nodes = byGroup.get(groupId)
    if (!nodes || nodes.length === 0) continue
    const label  = groupLabel[groupId] ?? groupId
    const sgId   = `sg${sgIdx++}`          // ID séquentiel — évite les doubles underscores
    lines.push(`  subgraph ${sgId}["${label}"]`)
    for (const n of nodes) lines.push(`    ${n.nodeId}["${n.label}"]`)
    lines.push('  end')
  }

  // ── Flèches ──
  for (const rel of securityRelations) {
    const from = nodeMap.get(rel.fromId)
    const to   = nodeMap.get(rel.toId)
    if (!from || !to) continue
    const arrow = rel.label ? `-->|${rel.label}|` : '-->'
    lines.push(`  ${from.nodeId} ${arrow} ${to.nodeId}`)
  }

  return lines.join('\n')
}

// ── Helpers ──

/** Tous les nœuds disponibles comme source/cible d'une relation, avec leur label et groupe. */
export function buildSecurityNodeOptions(dag: Dag): { id: string; label: string; group: string }[] {
  const authn  = dag.securityConfig?.authn
  if (!authn) return []

  const cats     = allCategories(dag)
  const tl       = dag.technicalLandscape
  const zones    = allNetworkZones(tl)
  const zoneById = new Map(zones.map((z) => [z.id, z]))
  const catById  = new Map(cats.map((c) => [c.id, c]))

  const result: { id: string; label: string; group: string }[] = []

  for (const gw of authn.authGateways)
    result.push({ id: gw.id, label: gw.product || 'Auth Gateway', group: 'Auth Gateway' })

  for (const iam of authn.iamInstances)
    result.push({ id: iam.id, label: iam.product || 'IAM', group: 'IAM' })

  const targetCatNames = new Set(['users', 'frontends', 'backends'])
  const targetCatIds   = cats.filter((c) => targetCatNames.has(c.name.toLowerCase())).map((c) => c.id)
  const targetComps    = dag.components.filter((c) => targetCatIds.includes(c.categoryId))

  for (const comp of targetComps) {
    const cat       = catById.get(comp.categoryId)
    const groupName = cat?.name ?? 'Other'
    const compInsts = tl.instances.filter((i) => i.componentId === comp.id)
    if (compInsts.length > 1) {
      for (const inst of compInsts) {
        const zone = zoneById.get(inst.networkZoneId)
        result.push({ id: inst.id, label: `${comp.name} (${zone?.name ?? inst.networkZoneId})`, group: groupName })
      }
    } else {
      result.push({ id: comp.id, label: comp.name, group: groupName })
    }
  }

  return result
}

function safe(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_')
}
