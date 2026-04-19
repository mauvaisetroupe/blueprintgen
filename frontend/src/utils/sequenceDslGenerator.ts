import type { Dag, ApplicationFlow, FlowStep } from '@/types/dag'
import { toNodeId } from './landscapeDslGenerator'

// Reuse the same ID convention as the landscape generator
export { toNodeId as toParticipantId }

// --- Parse DSL body → FlowStep[] ---

// Parse le corps DSL d'un flow et retourne les steps structurés.
// Seules les flèches forward sont retenues (les -->> ne font pas de step).
// Les participants inconnus (pas dans le modèle) sont ignorés.
export function parseFlowSteps(body: string, dag: Dag): FlowStep[] {
  const FORWARD = /^([a-zA-Z_]\w*)\s*(->>[\+\-]?|-x|->[\+\-]?)\s*([a-zA-Z_]\w*)\s*:\s*(.+)$/
  const steps: FlowStep[] = []
  let order = 1
  for (const raw of body.split('\n')) {
    const m = raw.trim().match(FORWARD)
    if (!m) continue
    const fromComp = dag.components.find((c) => toNodeId(c.name) === m[1])
    const toComp   = dag.components.find((c) => toNodeId(c.name) === m[3])
    if (!fromComp || !toComp) continue
    steps.push({
      id:              crypto.randomUUID(),
      fromComponentId: fromComp.id,
      toComponentId:   toComp.id,
      label:           m[4].trim(),
      order:           order++,
    })
  }
  return steps
}

// --- Sequence relation extraction ---

export interface MissingLandscapeRelation {
  fromCompId: string
  toCompId: string
  fromName: string
  toName: string
}

// Only forward (request) arrows — dashed return arrows (-->>, -->, --x) are excluded
const REQUEST_ARROW_REGEX = /^([a-zA-Z_]\w*)\s*(?:->>[\+\-]?|-x|->[\+\-]?)\s*([a-zA-Z_]\w*)/
// All arrows including returns — used for participant detection only
const ANY_ARROW_REGEX = /^([a-zA-Z_]\w*)\s*(?:->>[\+\-]?|-->>[\+\-]?|-x|--x|->[\+\-]?|-->[\+\-]?)\s*([a-zA-Z_]\w*)/

// Collects all unique component-level relations across all application flows.
// Utilise flow.steps (source de vérité) ; fallback DSL si steps vide (anciens DAGs).
export function collectAllFlowRelations(dag: Dag): Array<{ fromComponentId: string; toComponentId: string }> {
  const seen = new Set<string>()
  const result: Array<{ fromComponentId: string; toComponentId: string }> = []

  for (const flow of dag.applicationFlows) {
    const steps = flow.steps.length > 0
      ? flow.steps
      : parseFlowSteps(flow.mermaidDsl ?? '', dag)   // fallback pour anciens DAGs

    for (const step of steps) {
      const key = `${step.fromComponentId}->${step.toComponentId}`
      if (seen.has(key)) continue
      seen.add(key)
      result.push({ fromComponentId: step.fromComponentId, toComponentId: step.toComponentId })
    }
  }
  return result
}

// Returns participant IDs used in arrows but not matching any known component
export function findUnknownParticipants(body: string, dag: Dag): string[] {
  const arrowRegex = ANY_ARROW_REGEX
  const knownIds = new Set(dag.components.filter((c) => c.name.trim() !== '').map((c) => toNodeId(c.name)))
  const unknown = new Set<string>()
  for (const raw of body.split('\n')) {
    const match = raw.trim().match(arrowRegex)
    if (!match) continue
    if (!knownIds.has(match[1])) unknown.add(match[1])
    if (!knownIds.has(match[2])) unknown.add(match[2])
  }
  return [...unknown]
}

// Retourne les relations du flow absentes du landscape.
// Utilise flow.steps ; fallback DSL si steps vide (anciens DAGs).
export function findMissingLandscapeRelations(flow: ApplicationFlow, dag: Dag): MissingLandscapeRelation[] {
  const steps = flow.steps.length > 0
    ? flow.steps
    : parseFlowSteps(flow.mermaidDsl ?? '', dag)

  const seen = new Set<string>()
  const missing: MissingLandscapeRelation[] = []

  for (const step of steps) {
    const key = `${step.fromComponentId}->${step.toComponentId}`
    if (seen.has(key)) continue
    seen.add(key)

    const exists = dag.relations.some(
      (r) => r.fromComponentId === step.fromComponentId && r.toComponentId === step.toComponentId,
    )
    if (!exists) {
      const fromComp = dag.components.find((c) => c.id === step.fromComponentId)
      const toComp   = dag.components.find((c) => c.id === step.toComponentId)
      if (!fromComp || !toComp) continue
      missing.push({
        fromCompId: step.fromComponentId,
        toCompId:   step.toComponentId,
        fromName:   fromComp.name,
        toName:     toComp.name,
      })
    }
  }
  return missing
}

// Initial body for a new flow (no boilerplate — participants are auto-injected at render time)
export function generateFlowSkeleton(): string {
  return '%% Add sequence steps below\n'
}

// Unicode circled digits — shared with pptxExporter
const CIRCLED_DIGITS = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩',
                        '⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳']

// Converts a sequence diagram body to an activity-style flowchart DSL.
// Only forward arrows (->>,->,- x) are kept and numbered with circled digits.
// Return arrows (-->>) are ignored (they're implied).
// Participant IDs are resolved to component display names for node labels.
export function buildActivityDsl(
  body: string,
  dag: Dag,
  useElk = true,
  subgraphCategoryIds: Set<string> = new Set(),
  showReturns = false,
): string {
  const FORWARD = /^([a-zA-Z_]\w*)\s*(->>[\+\-]?|-x|->[\+\-]?)\s*([a-zA-Z_]\w*)\s*:\s*(.+)$/
  const RETURN  = /^([a-zA-Z_]\w*)\s*(-->>[\+\-]?|-->[\+\-]?|--x)\s*([a-zA-Z_]\w*)\s*:\s*(.+)$/

  const componentMap = new Map(
    dag.components
      .filter((c) => c.name.trim() !== '')
      .map((c) => [toNodeId(c.name), c.name]),
  )

  const participantIds = new Set<string>()
  type Edge = { from: string; to: string; label: string; dashed: boolean; circle?: string }
  const edges: Edge[] = []
  let idx = 0

  for (const raw of body.split('\n')) {
    const line = raw.trim()
    const fwd = line.match(FORWARD)
    if (fwd) {
      participantIds.add(fwd[1])
      participantIds.add(fwd[3])
      edges.push({ from: fwd[1], to: fwd[3], label: fwd[4].trim(), dashed: false, circle: CIRCLED_DIGITS[idx++] ?? `${idx}.` })
      continue
    }
    if (showReturns) {
      const ret = line.match(RETURN)
      if (ret) {
        participantIds.add(ret[1])
        participantIds.add(ret[3])
        edges.push({ from: ret[1], to: ret[3], label: ret[4].trim(), dashed: true })
      }
    }
  }

  if (edges.length === 0) return ''

  const lines = ['---', 'config:', '    theme: neutral']
  if (useElk) lines.push('    layout: elk')
  lines.push('---', '', 'flowchart TB')

  // Grouper les participants par catégorie (subgraph) si demandé
  const byCategory = new Map<string, string[]>()
  const standalone: string[] = []

  for (const id of participantIds) {
    const comp = dag.components.find((c) => toNodeId(c.name) === id)
    if (comp && subgraphCategoryIds.has(comp.categoryId)) {
      if (!byCategory.has(comp.categoryId)) byCategory.set(comp.categoryId, [])
      byCategory.get(comp.categoryId)!.push(id)
    } else {
      standalone.push(id)
    }
  }

  // Subgraphs dans l'ordre des catégories
  const sortedCats = [...dag.categories].sort((a, b) => a.order - b.order)
  for (const cat of sortedCats) {
    const ids = byCategory.get(cat.id)
    if (!ids?.length) continue
    lines.push(`  subgraph ${cat.name}`)
    for (const id of ids) lines.push(`    ${id}["${componentMap.get(id) ?? id}"]`)
    lines.push('  end')
  }

  // Participants sans subgraph
  for (const id of standalone) lines.push(`  ${id}["${componentMap.get(id) ?? id}"]`)

  lines.push('')
  for (const e of edges) {
    const arrow = e.dashed ? `-. "${e.label}" .->` : `-->|"${e.circle} ${e.label}"|`
    lines.push(`  ${e.from} ${arrow} ${e.to}`)
  }

  return lines.join('\n')
}

// Builds the full Mermaid sequenceDiagram DSL from a body + the DAG model.
// Participant declarations are auto-injected for any component ID referenced in the body.
export function buildSequenceDsl(body: string, dag: Dag): string {
  // Map from participant ID → display name
  const componentMap = new Map(
    dag.components
      .filter((c) => c.name.trim() !== '')
      .map((c) => [toNodeId(c.name), c.name]),
  )

  // Collect referenced IDs in body order (Set preserves insertion order)
  const referencedIds = new Set<string>()
  const wordRegex = /\b([a-zA-Z_]\w*)\b/g
  let match: RegExpExecArray | null
  while ((match = wordRegex.exec(body)) !== null) {
    if (componentMap.has(match[1])) referencedIds.add(match[1])
  }

  const lines = ['sequenceDiagram']
  for (const id of referencedIds) {
    lines.push(`  participant ${id} as ${componentMap.get(id)}`)
  }
  if (body.trim()) lines.push(body)
  return lines.join('\n')
}
