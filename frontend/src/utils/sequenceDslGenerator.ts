import type { Dag } from '@/types/dag'
import { toNodeId } from './landscapeDslGenerator'

// Reuse the same ID convention as the landscape generator
export { toNodeId as toParticipantId }

// Generates a skeleton sequenceDiagram DSL pre-populated with all model components
export function generateFlowSkeleton(dag: Dag): string {
  const components = dag.components.filter((c) => c.name.trim() !== '')
  const lines = ['sequenceDiagram']
  for (const comp of components) {
    const id = toNodeId(comp.name)
    lines.push(`  participant ${id} as ${comp.name}`)
  }
  lines.push('')
  lines.push('  %% Add sequence steps below')
  return lines.join('\n')
}
