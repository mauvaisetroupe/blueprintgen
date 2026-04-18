import type { Dag } from '@/types/dag'

// Converts a component name to a valid Mermaid node ID
function toNodeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
}

export interface LandscapeOptions {
  useElk: boolean
}

export function generateLandscapeDsl(dag: Dag, options: LandscapeOptions): string {
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

  return lines.join('\n')
}
