import type { Dag } from '@/types/dag'
import { toNodeId } from './landscapeDslGenerator'

// Reuse the same ID convention as the landscape generator
export { toNodeId as toParticipantId }

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
