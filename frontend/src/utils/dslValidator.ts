import type { Dag } from '@/types/dag'
import { parseDsl, type ParsedDsl } from './dslParser'

export type IssueType = 'error' | 'warning'

export interface ValidationIssue {
  type: IssueType
  message: string
}

export interface DslValidationResult {
  issues: ValidationIssue[]
  parsed: ParsedDsl
}

export function validateDslAgainstModel(dsl: string, dag: Dag): DslValidationResult {
  const parsed = parseDsl(dsl)
  const issues: ValidationIssue[] = []
  const reportedCategories = new Set<string>()

  // --- Node / component validation ---
  for (const node of parsed.nodes) {
    const component = dag.components.find((c) => c.name === node.label)

    if (!component) {
      issues.push({
        type: 'warning',
        message: `Component "${node.label}" is not in the model — it will be created on sync`,
      })
      if (node.subgraph && !dag.categories.find((c) => c.name === node.subgraph) && !reportedCategories.has(node.subgraph)) {
        reportedCategories.add(node.subgraph)
        issues.push({
          type: 'warning',
          message: `Category "${node.subgraph}" is not in the model — it will be created on sync`,
        })
      }
      continue
    }

    if (node.subgraph) {
      const targetCategory = dag.categories.find((c) => c.name === node.subgraph)
      if (!targetCategory) {
        if (!reportedCategories.has(node.subgraph)) {
          reportedCategories.add(node.subgraph)
          issues.push({
            type: 'warning',
            message: `Category "${node.subgraph}" is not in the model — it will be created on sync`,
          })
        }
      } else {
        const currentCategory = dag.categories.find((c) => c.id === component.categoryId)
        if (component.categoryId !== targetCategory.id) {
          issues.push({
            type: 'warning',
            message: `"${node.label}" is currently in "${currentCategory?.name ?? 'no category'}" → will move to "${node.subgraph}" on sync`,
          })
        }
      }
    }
  }

  // --- Relation / arrow validation ---
  // Build a map nodeId → component for quick lookup
  const nodeToComponent = new Map(
    parsed.nodes.map((n) => [n.id, dag.components.find((c) => c.name === n.label)])
  )

  for (const rel of parsed.relations) {
    const fromComp = nodeToComponent.get(rel.fromId)
    const toComp   = nodeToComponent.get(rel.toId)

    if (!fromComp) {
      issues.push({
        type: 'warning',
        message: `Arrow: source node "${rel.fromId}" has no matching component in the model`,
      })
      continue
    }
    if (!toComp) {
      issues.push({
        type: 'warning',
        message: `Arrow: target node "${rel.toId}" has no matching component in the model`,
      })
      continue
    }

    // Check if relation already exists in model
    const exists = dag.relations.some(
      (r) => r.fromComponentId === fromComp.id && r.toComponentId === toComp.id,
    )
    if (!exists) {
      const label = rel.label ? ` (${rel.label})` : ''
      issues.push({
        type: 'warning',
        message: `New relation "${fromComp.name}" → "${toComp.name}"${label} will be added on sync`,
      })
    }
  }

  return { issues, parsed }
}
