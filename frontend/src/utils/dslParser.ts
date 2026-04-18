// Parses a Mermaid flowchart DSL and extracts nodes and subgraphs

export interface ParsedNode {
  id: string
  label: string
  subgraph: string | null // null = not inside a subgraph
}

export interface ParsedDsl {
  nodes: ParsedNode[]
  subgraphs: string[]
}

export function parseDsl(dsl: string): ParsedDsl {
  const lines = dsl.split('\n').map((l) => l.trim())
  const nodes: ParsedNode[] = []
  const subgraphs: string[] = []
  let currentSubgraph: string | null = null
  let inFrontmatter = false

  for (const line of lines) {
    if (line === '---') { inFrontmatter = !inFrontmatter; continue }
    if (inFrontmatter) continue
    if (!line || line.startsWith('%%') || line.startsWith('flowchart') || line.startsWith('graph')) continue

    // Subgraph start: "subgraph Name" or 'subgraph "Name"'
    const subgraphMatch = line.match(/^subgraph\s+"?([^"]+)"?\s*$/)
    if (subgraphMatch && subgraphMatch[1]) {
      currentSubgraph = subgraphMatch[1].trim()
      if (!subgraphs.includes(currentSubgraph)) subgraphs.push(currentSubgraph)
      continue
    }

    if (line === 'end') { currentSubgraph = null; continue }

    // Skip arrows and style directives
    if (/-->|---|\.\->|==>|STYLE|CLASSD|CLICK|direction/.test(line)) continue

    // Node declaration: nodeId["label"] or nodeId(["label"]) etc.
    const nodeIdMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)[\[\(\{>]/)
    if (nodeIdMatch && nodeIdMatch[1]) {
      const id = nodeIdMatch[1]
      const labelMatch = line.match(/"([^"]*)"/)
      const label = (labelMatch?.[1]) ?? id
      // Avoid duplicates (a node may be referenced multiple times in arrows)
      if (!nodes.find((n) => n.id === id)) {
        nodes.push({ id, label, subgraph: currentSubgraph })
      }
      continue
    }
  }

  return { nodes, subgraphs }
}
