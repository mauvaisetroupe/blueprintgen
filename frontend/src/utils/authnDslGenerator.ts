import type { Dag } from '@/types/dag'
import { allCategories } from '@/types/dag'

/** Génère un flowchart Mermaid représentant le schéma authn/authz. */
export function generateAuthnDsl(dag: Dag): string {
  const authn = dag.securityConfig?.authn
  if (!authn) return ''

  const cats = allCategories(dag)
  const catById = new Map(cats.map((c) => [c.id, c]))

  const userComps = dag.components.filter((c) =>
    authn.userComponentIds.includes(c.id),
  )
  const protectedComps = dag.components.filter((c) =>
    authn.protectedComponentIds.includes(c.id),
  )

  if (userComps.length === 0 && protectedComps.length === 0) return ''

  const lines: string[] = [
    '---',
    'config:',
    '  theme: neutral',
    '  layout: elk',
    '---',
    'flowchart LR',
  ]

  // ── Subgraph Users ──
  if (userComps.length > 0) {
    lines.push('  subgraph Users')
    for (const c of userComps) {
      lines.push(`    ${nodeId(c.id)}["${c.name}"]`)
    }
    lines.push('  end')
  }

  // ── Subgraph Auth (Auth Gateway) ──
  if (authn.authGateway.enabled) {
    lines.push('  subgraph Auth["Auth Gateway"]')
    lines.push(`    authgw["${authn.authGateway.product || 'Auth Gateway'}"]`)
    lines.push('  end')
  }

  // ── Subgraph IAM ──
  const hasIam =
    authn.identityStore.enabled ||
    authn.roleManagement.enabled ||
    authn.permissionManagement.enabled

  if (hasIam) {
    lines.push('  subgraph IAM')
    if (authn.identityStore.enabled)
      lines.push(`    idstore["${authn.identityStore.product || 'Identity Store'}"]`)
    if (authn.roleManagement.enabled)
      lines.push(`    rolemgmt["${authn.roleManagement.product || 'Role Management'}"]`)
    if (authn.permissionManagement.enabled)
      lines.push(`    permmgmt["${authn.permissionManagement.product || 'Permission Management'}"]`)
    lines.push('  end')
  }

  // ── Subgraph Application ──
  if (protectedComps.length > 0) {
    lines.push('  subgraph Application')
    for (const c of protectedComps) {
      const cat = catById.get(c.categoryId)
      const label = cat ? `${c.name}\\n${cat.name}` : c.name
      lines.push(`    ${nodeId(c.id)}["${label}"]`)
    }
    lines.push('  end')
  }

  // ── Arrows ──
  // Users → Auth Gateway or Identity Store
  for (const c of userComps) {
    if (authn.authGateway.enabled) {
      lines.push(`  ${nodeId(c.id)} -->|authn| authgw`)
    } else if (authn.identityStore.enabled) {
      lines.push(`  ${nodeId(c.id)} --> idstore`)
    }
  }

  // Auth Gateway → Identity Store + Role Management
  if (authn.authGateway.enabled) {
    if (authn.identityStore.enabled)
      lines.push('  authgw --> idstore')
    if (authn.roleManagement.enabled)
      lines.push('  authgw --> rolemgmt')
  }

  // Role Management → Permission Management
  if (authn.roleManagement.enabled && authn.permissionManagement.enabled) {
    lines.push('  rolemgmt --> permmgmt')
  }

  // Auth Gateway → Protected components (authz)
  if (authn.authGateway.enabled) {
    for (const c of protectedComps) {
      lines.push(`  authgw -->|authz| ${nodeId(c.id)}`)
    }
  }

  return lines.join('\n')
}

function nodeId(id: string): string {
  return `node_${id.replace(/[^a-zA-Z0-9_]/g, '_')}`
}
