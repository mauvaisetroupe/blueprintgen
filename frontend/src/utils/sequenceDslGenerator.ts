import type { Dag } from '@/types/dag'
import { toNodeId } from './landscapeDslGenerator'

// Reuse the same ID convention as the landscape generator
export { toNodeId as toParticipantId }

// --- Sequence relation extraction ---

export interface MissingLandscapeRelation {
  fromCompId: string
  toCompId: string
  fromName: string
  toName: string
}

// Collects all unique component-level relations across all application flows
export function collectAllFlowRelations(dag: Dag): Array<{ fromComponentId: string; toComponentId: string }> {
  const seen = new Set<string>()
  const result: Array<{ fromComponentId: string; toComponentId: string }> = []
  const arrowRegex = /^([a-zA-Z_]\w*)\s*(?:->>[\+\-]?|-->>[\+\-]?|-x|--x|->[\+\-]?|-->[\+\-]?)\s*([a-zA-Z_]\w*)/

  for (const flow of dag.applicationFlows) {
    if (!flow.mermaidDsl?.trim()) continue
    for (const raw of flow.mermaidDsl.split('\n')) {
      const match = raw.trim().match(arrowRegex)
      if (!match) continue
      const fromComp = dag.components.find((c) => toNodeId(c.name) === match[1])
      const toComp   = dag.components.find((c) => toNodeId(c.name) === match[2])
      if (!fromComp || !toComp) continue
      const key = `${fromComp.id}->${toComp.id}`
      if (seen.has(key)) continue
      seen.add(key)
      result.push({ fromComponentId: fromComp.id, toComponentId: toComp.id })
    }
  }
  return result
}

// Parses sequence diagram body and returns relations missing from the landscape model
export function findMissingLandscapeRelations(body: string, dag: Dag): MissingLandscapeRelation[] {
  // Matches: participantA ->> participantB, A --> B, A -x B, A ->>+ B, etc.
  const arrowRegex = /^([a-zA-Z_]\w*)\s*(?:->>[\+\-]?|-->>[\+\-]?|-x|--x|->[\+\-]?|-->[\+\-]?)\s*([a-zA-Z_]\w*)/

  const seen = new Set<string>()
  const missing: MissingLandscapeRelation[] = []

  for (const raw of body.split('\n')) {
    const line = raw.trim()
    const match = line.match(arrowRegex)
    if (!match) continue

    const fromId = match[1]
    const toId   = match[2]
    const key    = `${fromId}->${toId}`
    if (seen.has(key)) continue
    seen.add(key)

    // Resolve IDs to model components
    const fromComp = dag.components.find((c) => toNodeId(c.name) === fromId)
    const toComp   = dag.components.find((c) => toNodeId(c.name) === toId)
    if (!fromComp || !toComp) continue // not model components — skip

    // Check if relation already exists in landscape
    const exists = dag.relations.some(
      (r) => r.fromComponentId === fromComp.id && r.toComponentId === toComp.id,
    )
    if (!exists) {
      missing.push({
        fromCompId: fromComp.id,
        toCompId:   toComp.id,
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
