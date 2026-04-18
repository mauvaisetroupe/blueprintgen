// Parses a Mermaid flowchart DSL and extracts nodes, subgraphs and relations

export interface ParsedNode {
  id: string
  label: string
  subgraph: string | null // null = not inside a subgraph
}

export interface ParsedRelation {
  fromId: string  // node ID (not component ID)
  toId: string
  label?: string
}

export interface ParsedDsl {
  nodes: ParsedNode[]
  subgraphs: string[]
  relations: ParsedRelation[]
}

export function parseDsl(dsl: string): ParsedDsl {
  const lines = dsl.split('\n').map((l) => l.trim())
  const nodes: ParsedNode[] = []
  const subgraphs: string[] = []
  const relations: ParsedRelation[] = []
  let currentSubgraph: string | null = null
  let inFrontmatter = false

  for (const line of lines) {
    if (line === '---') { inFrontmatter = !inFrontmatter; continue }
    if (inFrontmatter) continue
    if (!line || line.startsWith('%%') || line.startsWith('flowchart') || line.startsWith('graph')) continue

    // Subgraph start
    const subgraphMatch = line.match(/^subgraph\s+"?([^"]+)"?\s*$/)
    if (subgraphMatch && subgraphMatch[1]) {
      currentSubgraph = subgraphMatch[1].trim()
      if (!subgraphs.includes(currentSubgraph)) subgraphs.push(currentSubgraph)
      continue
    }

    if (line === 'end') { currentSubgraph = null; continue }

    // Skip style directives
    if (/^(STYLE|CLASSD|CLICK|direction|linkStyle|classDef)/i.test(line)) continue

    // Arrow: nodeA -->|label| nodeB  or  nodeA --> nodeB
    // Covers -->, -.->,-.->, ==>, --
    const arrowMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:--|\.\.|-[-.]+>|={1,2}>|--[->]+)(?:\|([^|]*)\|)?\s*([a-zA-Z_][a-zA-Z0-9_]*)/)
    if (arrowMatch && arrowMatch[1] && arrowMatch[3]) {
      relations.push({
        fromId: arrowMatch[1],
        toId: arrowMatch[3],
        label: arrowMatch[2]?.trim() || undefined,
      })
      continue
    }

    // Node declaration: nodeId["label"] or nodeId(["label"]) etc.
    const nodeIdMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)[\[\(\{>]/)
    if (nodeIdMatch && nodeIdMatch[1]) {
      const id = nodeIdMatch[1]
      const labelMatch = line.match(/"([^"]*)"/)
      const label = labelMatch?.[1] ?? id
      if (!nodes.find((n) => n.id === id)) {
        nodes.push({ id, label, subgraph: currentSubgraph })
      }
    }
  }

  return { nodes, subgraphs, relations }
}
