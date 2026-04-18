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

  for (const node of parsed.nodes) {
    // Check component exists (match by label = component name)
    const component = dag.components.find((c) => c.name === node.label)

    if (!component) {
      issues.push({
        type: 'warning',
        message: `Component "${node.label}" is not in the model — it will be created on sync`,
      })
      // Check the target category too
      if (node.subgraph && !dag.categories.find((c) => c.name === node.subgraph) && !reportedCategories.has(node.subgraph)) {
        reportedCategories.add(node.subgraph)
        issues.push({
          type: 'warning',
          message: `Category "${node.subgraph}" is not in the model — it will be created on sync`,
        })
      }
      continue
    }

    // Check category placement
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

  return { issues, parsed }
}
