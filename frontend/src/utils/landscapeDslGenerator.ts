import type { Dag } from '@/types/dag'

// Converts a component name to a valid Mermaid node ID
export function toNodeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function validComponentIds(dag: Dag): Set<string> {
  return new Set(dag.components.filter((c) => c.name.trim() !== '').map((c) => c.id))
}

function relationLine(
  dag: Dag,
  fromId: string,
  toId: string,
  label?: string,
  indent = '  ',
): string {
  const from = dag.components.find((c) => c.id === fromId)!
  const to   = dag.components.find((c) => c.id === toId)!
  const f = toNodeId(from.name)
  const t = toNodeId(to.name)
  return label?.trim()
    ? `${indent}${f} -->|${label.trim()}| ${t}`
    : `${indent}${f} --> ${t}`
}

/**
 * Collecte les relations uniques de tous les flows (steps forward uniquement).
 * Implémenté localement pour éviter la dépendance circulaire avec sequenceDslGenerator.
 */
function collectFlowRelations(dag: Dag): Array<{ fromComponentId: string; toComponentId: string }> {
  const seen = new Set<string>()
  const result: Array<{ fromComponentId: string; toComponentId: string }> = []
  for (const flow of dag.applicationFlows) {
    for (const step of flow.steps.filter((s) => !s.isReturn)) {
      const key = `${step.fromComponentId}->${step.toComponentId}`
      if (seen.has(key)) continue
      seen.add(key)
      result.push({ fromComponentId: step.fromComponentId, toComponentId: step.toComponentId })
    }
  }
  return result
}

// ─── Public building blocks ───────────────────────────────────────────────────

/** Frontmatter Mermaid + directive flowchart (partie read-only haute de l'éditeur) */
export function generateLandscapeHeader(dag: Dag): string {
  const lines = ['---', 'config:', '    theme: neutral']
  if (dag.landscape.useElk) lines.push('    layout: elk')
  lines.push('---', '', 'flowchart TB')
  return lines.join('\n')
}

/** Subgraphs + nodes uniquement — sans header ni flèches (zone read-only de l'éditeur DSL) */
export function generateComponentsBody(dag: Dag, forceCategory: boolean, addName: boolean): string {
  const lines: string[] = []
  const sortedCategories = [...dag.categories].sort((a, b) => a.order - b.order)

  for (const category of sortedCategories) {
    const components = dag.components.filter((c) => c.categoryId === category.id && c.name.trim() !== '')
    if (components.length === 0) continue

    const nameSuffix = (comp: any) => addName ? `["${comp.name}"]` : ''

    if (forceCategory || category.showSubgraph) {
      lines.push(`  subgraph ${category.name}`)
      for (const comp of components) lines.push(`    ${toNodeId(comp.name)}${nameSuffix(comp)}`)
      lines.push('  end')
    } else {
      for (const comp of components) lines.push(`    ${toNodeId(comp.name)}${nameSuffix(comp)}`)
    }
  }
  return lines.join('\n')
}

/** Relations manuelles (dag.relations) formatées en DSL (zone éditable de l'éditeur DSL) */
export function generateManualRelationsBody(dag: Dag): string {
  const valid = validComponentIds(dag)
  return dag.relations
    .filter((r) => valid.has(r.fromComponentId) && valid.has(r.toComponentId))
    .map((r) => relationLine(dag, r.fromComponentId, r.toComponentId, r.label))
    .join('\n')
}

/**
 * Relations issues des flows, dédupliquées contre dag.relations
 * (zone read-only basse de l'éditeur DSL, affichée uniquement si autoSync activé)
 */
export function generateAutoSyncRelationsBody(dag: Dag): string {
  const valid      = validComponentIds(dag)
  const manualKeys = new Set(dag.relations.map((r) => `${r.fromComponentId}->${r.toComponentId}`))

  return collectFlowRelations(dag)
    .filter((r) => valid.has(r.fromComponentId) && valid.has(r.toComponentId))
    .filter((r) => !manualKeys.has(`${r.fromComponentId}->${r.toComponentId}`))
    .map((r) => relationLine(dag, r.fromComponentId, r.toComponentId))
    .join('\n')
}

/**
 * DSL complet pour Mermaid, PPTX, draw.io.
 * Lit toutes les options depuis dag.landscape (useElk, autoSync).
 */
export function generateLandscapeDsl(dag: Dag): string {
  const parts: string[] = [generateLandscapeHeader(dag), generateComponentsBody(dag, false, true)]

  const manual = generateManualRelationsBody(dag)
  if (manual) parts.push(manual)

  if (dag.landscape.autoSync) {
    const auto = generateAutoSyncRelationsBody(dag)
    if (auto) parts.push(auto)
  }

  return parts.join('\n')
}

/**
 * Analyse les lignes de flèches DSL saisies par l'architecte et retourne
 * les relations correspondantes (fromComponentId / toComponentId / label).
 * Les lignes non reconnues ou référençant des nodes inconnus sont ignorées.
 */
export function parseRelationsBody(
  body: string,
  dag: Dag,
): Array<{ fromComponentId: string; toComponentId: string; label?: string }> {
  const ARROW_RE = /^\s*(\w+)\s*-->(?:\|([^|]*)\|)?\s*(\w+)\s*$/
  const result: Array<{ fromComponentId: string; toComponentId: string; label?: string }> = []

  for (const line of body.split('\n')) {
    const m = line.match(ARROW_RE)
    if (!m) continue
    const fromComp = dag.components.find((c) => toNodeId(c.name) === m[1])
    const toComp   = dag.components.find((c) => toNodeId(c.name) === m[3])
    if (!fromComp || !toComp) continue
    result.push({
      fromComponentId: fromComp.id,
      toComponentId:   toComp.id,
      label:           m[2]?.trim() || undefined,
    })
  }

  return result
}
