import type { Dag, Component, NodeShape } from '@/types/dag'
import { DEFAULT_SHAPE_BY_NAME, allCategories } from '@/types/dag'

// Converts a component name to a valid Mermaid node ID
export function toNodeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
}

// Génère la syntaxe Mermaid du label de nœud selon la forme de la catégorie
function nodeLabel(name: string, shape?: NodeShape): string {
  switch (shape) {
    case 'cylinder': return `[("${name}")]`
    case 'rounded':  return `(["${name}"])`
    default:         return `["${name}"]`
  }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function validComponentIds(dag: Dag): Set<string> {
  return new Set(dag.components.filter((c) => c.name.trim() !== '').map((c) => c.id))
}

function sanitizeLabel(label: string): string {
  return label.replace(/[()[\]{}"]/g, '').trim()
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
  const safe = label ? sanitizeLabel(label) : ''
  return safe
    ? `${indent}${f} -->|${safe}| ${t}`
    : `${indent}${f} --> ${t}`
}

/**
 * Collecte les relations uniques de tous les flows (steps forward uniquement).
 * Implémenté localement pour éviter la dépendance circulaire avec sequenceDslGenerator.
 */
export function collectFlowRelations(dag: Dag): Array<{ fromComponentId: string; toComponentId: string }> {
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

/**
 * Toutes les relations effectives du landscape (dag.relations), dédupliquées par paire.
 */
export function allEffectiveLandscapeRelations(
  dag: Dag,
): Array<{ fromComponentId: string; toComponentId: string; label?: string; protocol?: string }> {
  const valid = validComponentIds(dag)
  const seen  = new Set<string>()
  const result: Array<{ fromComponentId: string; toComponentId: string; label?: string; protocol?: string }> = []

  for (const r of dag.relations) {
    if (!valid.has(r.fromComponentId) || !valid.has(r.toComponentId)) continue
    const key = `${r.fromComponentId}->${r.toComponentId}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ fromComponentId: r.fromComponentId, toComponentId: r.toComponentId, label: r.label, protocol: r.protocol })
  }

  return result
}

/** Frontmatter Mermaid + directive flowchart (partie read-only haute de l'éditeur) */
export function generateLandscapeHeader(dag: Dag): string {
  const lines = ['---', 'config:', '    theme: neutral']
  if (dag.landscape.useElk) lines.push('    layout: elk')
  lines.push('---', '', 'flowchart TB')
  return lines.join('\n')
}

/** Subgraphs + nodes uniquement — sans header ni flèches (zone read-only de l'éditeur DSL) */
export function generateComponentsBody(dag: Dag, forceCategory: boolean, addName: boolean, componentList?: Component[]): string {
  const lines: string[] = []
  const sortedCategories = allCategories(dag).sort((a, b) => a.order - b.order)
  const list = componentList ?? dag.components

  for (const category of sortedCategories) {
    const components = list.filter((c) => c.categoryId === category.id && c.name.trim() !== '')
    if (components.length === 0) continue

    const shape = DEFAULT_SHAPE_BY_NAME.get(category.name.toLowerCase())
    const nameSuffix = (comp: Component) => addName ? nodeLabel(comp.name, shape) : ''
    const showSubgraph = dag.landscape?.categorySubgraphs?.[category.id] ?? category.showSubgraph

    if (forceCategory || showSubgraph) {
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

/** DSL complet pour Mermaid, PPTX, draw.io. */
export function generateLandscapeDsl(dag: Dag): string {
  const parts: string[] = [generateLandscapeHeader(dag), generateComponentsBody(dag, false, true)]

  const manual = generateManualRelationsBody(dag)
  if (manual) parts.push(manual)

  return parts.join('\n')
}

export interface NumberedComponent {
  number: string
  name: string
  description: string
}

const CIRCLED_DIGITS_LANDSCAPE = [
  '①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩',
  '⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳',
]

function nodeLabelNumbered(name: string, num: string, shape?: NodeShape): string {
  switch (shape) {
    case 'cylinder': return `[("${num} ${name}")]`
    case 'rounded':  return `(["${num} ${name}"])`
    default:         return `["${num} ${name}"]`
  }
}

/**
 * Génère le DSL du landscape avec un chiffre cerclé dans chaque label de nœud,
 * et retourne la liste ordonnée des composants numérotés pour le panneau légende PPTX.
 */
export function generateNumberedLandscapeDsl(dag: Dag): { dsl: string; numbered: NumberedComponent[] } {
  const sortedCategories = allCategories(dag).sort((a, b) => a.order - b.order)
  const numbered: NumberedComponent[] = []
  const numMap = new Map<string, string>()

  let idx = 0
  for (const category of sortedCategories) {
    const comps = dag.components.filter((c) => c.categoryId === category.id && c.name.trim() !== '')
    for (const comp of comps) {
      const num = CIRCLED_DIGITS_LANDSCAPE[idx++] ?? `${idx}.`
      numMap.set(comp.id, num)
      numbered.push({ number: num, name: comp.name, description: comp.description ?? '' })
    }
  }

  const lines: string[] = []
  for (const category of sortedCategories) {
    const comps = dag.components.filter((c) => c.categoryId === category.id && c.name.trim() !== '')
    if (comps.length === 0) continue
    const shape = DEFAULT_SHAPE_BY_NAME.get(category.name.toLowerCase())
    const showSubgraph = dag.landscape?.categorySubgraphs?.[category.id] ?? category.showSubgraph
    if (showSubgraph) {
      lines.push(`  subgraph ${category.name}`)
      for (const comp of comps) lines.push(`    ${toNodeId(comp.name)}${nodeLabelNumbered(comp.name, numMap.get(comp.id) ?? '', shape)}`)
      lines.push('  end')
    } else {
      for (const comp of comps) lines.push(`    ${toNodeId(comp.name)}${nodeLabelNumbered(comp.name, numMap.get(comp.id) ?? '', shape)}`)
    }
  }

  const manual = generateManualRelationsBody(dag)
  const parts = [generateLandscapeHeader(dag), lines.join('\n')]
  if (manual) parts.push(manual)

  return { dsl: parts.join('\n'), numbered }
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
