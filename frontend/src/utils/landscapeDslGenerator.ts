import type { Dag } from '@/types/dag'

// Converts a component name to a valid Mermaid node ID
export function toNodeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
}

export interface LandscapeOptions {
  useElk: boolean
}

export function generateLandscapeDsl(
  dag: Dag,
  options: LandscapeOptions,
  relationsOverride?: Array<{ fromComponentId: string; toComponentId: string; label?: string }>,
): string {
  const lines: string[] = []

  // Frontmatter config
  lines.push('---')
  lines.push('config:')
  lines.push('    theme: neutral')
  if (options.useElk) {
    lines.push('    layout: elk')
  }
  lines.push('---')
  lines.push('')
  lines.push('flowchart TB')

  const sortedCategories = [...dag.categories].sort((a, b) => a.order - b.order)

  for (const category of sortedCategories) {
    const components = dag.components.filter((c) => c.categoryId === category.id && c.name.trim() !== '')
    if (components.length === 0) continue

    if (category.showSubgraph) {
      lines.push(`  subgraph ${category.name}`)
      for (const component of components) {
        const nodeId = toNodeId(component.name)
        lines.push(`    ${nodeId}["${component.name}"]`)
      }
      lines.push('  end')
    } else {
      for (const component of components) {
        const nodeId = toNodeId(component.name)
        lines.push(`  ${nodeId}["${component.name}"]`)
      }
    }
  }

  // Relations (arrows)
  const validComponentIds = new Set(
    dag.components.filter((c) => c.name.trim() !== '').map((c) => c.id),
  )

  for (const relation of (relationsOverride ?? dag.relations)) {
    if (!validComponentIds.has(relation.fromComponentId) || !validComponentIds.has(relation.toComponentId)) continue
    const from = dag.components.find((c) => c.id === relation.fromComponentId)!
    const to   = dag.components.find((c) => c.id === relation.toComponentId)!
    const fromId = toNodeId(from.name)
    const toId   = toNodeId(to.name)
    if (relation.label?.trim()) {
      lines.push(`  ${fromId} -->|${relation.label.trim()}| ${toId}`)
    } else {
      lines.push(`  ${fromId} --> ${toId}`)
    }
  }

  return lines.join('\n')
}
