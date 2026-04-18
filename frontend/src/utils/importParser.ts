// Parses a combined DSL format:
//   - A flowchart section (landscape: subgraphs + nodes)
//   - Sequence flow sections separated by "%% Flow name" comments
//
// Example:
//   flowchart TB
//   subgraph Users
//     internet_user["Internet user"]
//   end
//
//   %% Browse catalog
//   internet_user ->> webfrontend: Browse catalog
//   ...

export interface ImportedFlow {
  name: string
  mermaidDsl: string
}

export interface ImportResult {
  landscapeBody: string   // subgraph/node lines without the flowchart header
  flows: ImportedFlow[]
}

export function parseImportDsl(input: string): ImportResult {
  const lines = input.split('\n')

  const landscapeLines: string[] = []
  const flows: Array<{ name: string; lines: string[] }> = []
  let currentFlow: { name: string; lines: string[] } | null = null
  let inLandscape = true

  for (const line of lines) {
    const trimmed = line.trim()

    // "%% Flow name" marks the start of a new sequence flow section
    const commentMatch = trimmed.match(/^%%\s*(.*)$/)
    if (commentMatch) {
      if (currentFlow) flows.push(currentFlow)
      const flowName = commentMatch[1].trim()
      currentFlow = { name: flowName || `Flow ${flows.length + 1}`, lines: [] }
      inLandscape = false
      continue
    }

    if (inLandscape) {
      // Skip the flowchart/graph directive and frontmatter lines
      if (/^(?:flowchart|graph)\s/i.test(trimmed)) continue
      if (trimmed === '---') continue
      landscapeLines.push(line)
    } else if (currentFlow) {
      currentFlow.lines.push(line)
    }
  }

  if (currentFlow) flows.push(currentFlow)

  return {
    landscapeBody: landscapeLines.join('\n').trim(),
    flows: flows
      .filter((f) => f.lines.some((l) => l.trim() !== ''))
      .map((f) => ({
        name: f.name,
        mermaidDsl: f.lines.join('\n').trim(),
      })),
  }
}
