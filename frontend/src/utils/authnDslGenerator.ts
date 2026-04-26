import type { Dag } from '@/types/dag'
import { allCategories, allNetworkZones } from '@/types/dag'

/** Génère un flowchart Mermaid représentant le schéma authn/authz. */
export function generateAuthnDsl(dag: Dag): string {
  const authn = dag.securityConfig?.authn
  if (!authn) return ''

  const { authGateways, identityStores, roleManagements, permissionManagements, roleToPermLinks } = authn

  const allUserIds      = [...new Set(authGateways.flatMap((gw) => gw.userComponentIds))]
  const allProtectedIds = [...new Set(authGateways.flatMap((gw) => gw.protectedComponentIds))]

  if (allUserIds.length === 0 && allProtectedIds.length === 0 && authGateways.length === 0) return ''

  const cats    = allCategories(dag)
  const tl      = dag.technicalLandscape
  const zones   = allNetworkZones(tl)
  const zoneById = new Map(zones.map((z) => [z.id, z]))

  // Résout un ID (component ou instance) → { nodeId, label, componentId }
  function resolveId(id: string): { nodeId: string; label: string; comp: typeof dag.components[0] } | null {
    // Cas 1 : ID direct d'un composant
    const directComp = dag.components.find((c) => c.id === id)
    if (directComp) return { nodeId: nid(id), label: directComp.name, comp: directComp }
    // Cas 2 : ID d'une instance de déploiement → on affiche "Composant (Zone)"
    const inst = tl.instances.find((i) => i.id === id)
    if (inst) {
      const comp = dag.components.find((c) => c.id === inst.componentId)
      if (!comp) return null
      const zone = zoneById.get(inst.networkZoneId)
      return { nodeId: nid(id), label: `${comp.name} (${zone?.name ?? inst.networkZoneId})`, comp }
    }
    return null
  }

  const lines: string[] = [
    '---',
    'config:',
    '  theme: neutral',
    '  layout: elk',
    '---',
    'flowchart LR',
  ]

  // ── Subgraph Users ──
  const userResolved = allUserIds.map(resolveId).filter(Boolean) as NonNullable<ReturnType<typeof resolveId>>[]
  if (userResolved.length > 0) {
    lines.push('  subgraph Users')
    for (const r of userResolved) lines.push(`    ${r.nodeId}["${r.label}"]`)
    lines.push('  end')
  }

  // ── Subgraph Auth Gateway ──
  if (authGateways.length > 0) {
    lines.push('  subgraph AuthGateway["Auth Gateway"]')
    for (const gw of authGateways)
      lines.push(`    ${gwNid(gw.id)}["${gw.product || 'Auth Gateway'}"]`)
    lines.push('  end')
  }

  // ── Subgraph IAM ──
  const hasIam = identityStores.length > 0 || roleManagements.length > 0 || permissionManagements.length > 0
  if (hasIam) {
    lines.push('  subgraph IAM')
    for (const s of identityStores)        lines.push(`    ${nid(s.id)}["${s.product || 'Identity Store'}"]`)
    for (const r of roleManagements)       lines.push(`    ${nid(r.id)}["${r.product || 'Role Management'}"]`)
    for (const p of permissionManagements) lines.push(`    ${nid(p.id)}["${p.product || 'Permission Management'}"]`)
    lines.push('  end')
  }

  // ── Subgraphs des composants/instances protégés, regroupés par catégorie réelle ──
  const protectedResolved = allProtectedIds.map(resolveId).filter(Boolean) as NonNullable<ReturnType<typeof resolveId>>[]
  const protectedCatIds   = [...new Set(protectedResolved.map((r) => r.comp.categoryId))]
  const orderedProtCats   = cats
    .filter((c) => protectedCatIds.includes(c.id))
    .sort((a, b) => a.order - b.order)

  for (const cat of orderedProtCats) {
    const items = protectedResolved.filter((r) => r.comp.categoryId === cat.id)
    lines.push(`  subgraph ${sgid(cat.id)}["${cat.name}"]`)
    for (const r of items) lines.push(`    ${r.nodeId}["${r.label}"]`)
    lines.push('  end')
  }

  // ── Flèches ──
  for (const gw of authGateways) {
    const gwNode = gwNid(gw.id)
    for (const uid of gw.userComponentIds) {
      const r = resolveId(uid)
      if (r) lines.push(`  ${r.nodeId} -->|authn| ${gwNode}`)
    }
    for (const sid of gw.identityStoreIds)      lines.push(`  ${gwNode} --> ${nid(sid)}`)
    for (const rid of gw.roleManagementIds)      lines.push(`  ${gwNode} --> ${nid(rid)}`)
    for (const pid of gw.protectedComponentIds) {
      const r = resolveId(pid)
      if (r) lines.push(`  ${gwNode} -->|authz| ${r.nodeId}`)
    }
  }

  for (const link of roleToPermLinks) {
    lines.push(`  ${nid(link.fromRoleId)} --> ${nid(link.toPermId)}`)
  }

  return lines.join('\n')
}

function nid(id: string): string {
  return `n_${id.replace(/[^a-zA-Z0-9_]/g, '_')}`
}

function gwNid(id: string): string {
  return `gw_${id.replace(/[^a-zA-Z0-9_]/g, '_')}`
}

function sgid(id: string): string {
  return `sg_${id.replace(/[^a-zA-Z0-9_]/g, '_')}`
}
