import type { Dag } from '@/types/dag'
import { allNetworkZones, allCategories } from '@/types/dag'
import { toNodeId } from '@/utils/landscapeDslGenerator'
import { buildSequenceBodyFromSteps, parseFlowSteps } from '@/utils/sequenceDslGenerator'

// ── YAML string helpers ───────────────────────────────────────────────────────

// Returns a safe YAML plain scalar, or a double-quoted string if special chars are present.
function yamlScalar(value: string): string {
  if (!value) return '""'
  // Quote if the value contains chars that would break a YAML plain scalar
  if (/[:#\[\]{}&*!|>'"@`]/.test(value) || value.trim() !== value || value.startsWith('-')) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return value
}

// Returns a YAML block scalar (`|`) for multi-line or free-text content.
// indent = number of spaces prepended to each content line.
function yamlBlock(value: string, indent: number): string {
  const pad = ' '.repeat(indent)
  const lines = value.trimEnd().split('\n')
  const indented = lines.map((l) => (l.trim() === '' ? '' : `${pad}${l}`)).join('\n')
  return `|\n${indented}`
}

// ── Landscape Mermaid (sans frontmatter visuel) ───────────────────────────────

function generateLandscapeMermaid(dag: Dag): string {
  const cats = allCategories(dag).sort((a, b) => a.order - b.order)
  const validIds = new Set(dag.components.filter((c) => c.name.trim()).map((c) => c.id))
  const lines: string[] = ['flowchart TB']

  for (const cat of cats) {
    const comps = dag.components.filter((c) => c.categoryId === cat.id && c.name.trim())
    if (comps.length === 0) continue
    lines.push(`  subgraph ${cat.name}`)
    for (const comp of comps) lines.push(`    ${toNodeId(comp.name)}["${comp.name}"]`)
    lines.push('  end')
  }

  const relations = dag.relations.filter(
    (r) => validIds.has(r.fromComponentId) && validIds.has(r.toComponentId),
  )
  if (relations.length > 0) {
    lines.push('')
    for (const rel of relations) {
      const from = dag.components.find((c) => c.id === rel.fromComponentId)!
      const to   = dag.components.find((c) => c.id === rel.toComponentId)!
      const label = [rel.protocol, rel.label].filter(Boolean).join(' — ')
      const fromId = toNodeId(from.name)
      const toId   = toNodeId(to.name)
      lines.push(label ? `  ${fromId} -->|${label}| ${toId}` : `  ${fromId} --> ${toId}`)
    }
  }

  return lines.join('\n')
}

// ── Technical landscape Mermaid (zones comme subgraphs) ──────────────────────

function generateTechnicalLandscapeMermaid(dag: Dag): string {
  const tl       = dag.technicalLandscape
  const zones    = allNetworkZones(tl)
  const allComps = [...dag.components, ...(dag.technicalComponents ?? [])]
  const lines: string[] = ['flowchart TB']

  // Zones as subgraphs — only those with at least one instance
  for (const zone of zones) {
    const instances = tl.instances.filter((i) => i.networkZoneId === zone.id)
    if (instances.length === 0) continue
    lines.push(`  subgraph ${zone.name}`)
    for (const inst of instances) {
      const comp = allComps.find((c) => c.id === inst.componentId)
      if (!comp?.name.trim()) continue
      lines.push(`    ${toNodeId(comp.name)}["${comp.name}"]`)
    }
    lines.push('  end')
  }

  // Technical services in their own subgraph
  const services = tl.technicalServices ?? []
  if (services.length > 0) {
    lines.push('  subgraph Technical Services')
    for (const svc of services) {
      if (!svc.name.trim()) continue
      lines.push(`    ${toNodeId(svc.name)}["${svc.name}"]`)
    }
    lines.push('  end')
  }

  // Technical relations as arrows
  const techRels = tl.technicalRelations ?? []
  if (techRels.length > 0) {
    lines.push('')
    for (const rel of techRels) {
      const fromInst = tl.instances.find((i) => i.id === rel.fromInstanceId)
      const toInst   = tl.instances.find((i) => i.id === rel.toInstanceId)
      if (!fromInst || !toInst) continue
      const fromComp = allComps.find((c) => c.id === fromInst.componentId)
      const toComp   = allComps.find((c) => c.id === toInst.componentId)
      if (!fromComp || !toComp) continue
      const fromId = toNodeId(fromComp.name)
      const toId   = toNodeId(toComp.name)
      const label  = [rel.protocol, rel.label].filter(Boolean).join(' — ')
      lines.push(label ? `  ${fromId} -->|${label}| ${toId}` : `  ${fromId} --> ${toId}`)
    }
  }

  return lines.join('\n')
}

// ── Component metadata block ──────────────────────────────────────────────────

function componentMetaLines(comp: { name: string; description?: string; technology?: string; framework?: string; constraints?: string }, keyIndent: number): string[] {
  const lines: string[] = []
  const ki = ' '.repeat(keyIndent)
  if (comp.description?.trim()) lines.push(`${ki}description: ${yamlBlock(comp.description, keyIndent + 2)}`)
  if (comp.technology?.trim())  lines.push(`${ki}technology: ${yamlScalar(comp.technology)}`)
  if (comp.framework?.trim())   lines.push(`${ki}framework: ${yamlScalar(comp.framework)}`)
  if (comp.constraints?.trim()) lines.push(`${ki}constraints: ${yamlBlock(comp.constraints, keyIndent + 2)}`)
  return lines
}

// ── Main export ───────────────────────────────────────────────────────────────

export function exportDagAsYaml(dag: Dag): string {
  const out: string[] = []

  // DAG-level metadata
  out.push(`name: ${yamlScalar(dag.name)}`)
  if (dag.description?.trim()) out.push(`description: ${yamlBlock(dag.description, 2)}`)

  // Application components metadata
  const appComps = dag.components.filter((c) => c.name.trim())
  if (appComps.length > 0) {
    out.push('')
    out.push('components:')
    for (const comp of appComps) {
      out.push(`  ${toNodeId(comp.name)}:`)
      out.push(...componentMetaLines(comp, 4))
    }
  }

  // Technical components metadata
  const techComps = (dag.technicalComponents ?? []).filter((c) => c.name.trim())
  if (techComps.length > 0) {
    out.push('')
    out.push('technical-components:')
    for (const comp of techComps) {
      out.push(`  ${toNodeId(comp.name)}:`)
      out.push(...componentMetaLines(comp, 4))
    }
  }

  // Technical services metadata
  const services = (dag.technicalLandscape.technicalServices ?? []).filter((s) => s.name.trim())
  if (services.length > 0) {
    out.push('')
    out.push('technical-services:')
    for (const svc of services) {
      out.push(`  ${toNodeId(svc.name)}:`)
      if (svc.description?.trim()) out.push(`    description: ${yamlBlock(svc.description, 6)}`)
    }
  }

  // Application landscape
  out.push('')
  out.push(`landscape: ${yamlBlock(generateLandscapeMermaid(dag), 2)}`)

  // Technical landscape (only if content exists)
  const tl = dag.technicalLandscape
  const hasTechContent =
    tl.instances.length > 0 ||
    (tl.technicalRelations?.length ?? 0) > 0 ||
    (tl.technicalServices?.length ?? 0) > 0
  if (hasTechContent) {
    out.push('')
    out.push(`technical-landscape: ${yamlBlock(generateTechnicalLandscapeMermaid(dag), 2)}`)
  }

  // Application flows
  const flows = dag.applicationFlows.filter((f) => f.name.trim())
  if (flows.length > 0) {
    out.push('')
    out.push('flows:')
    for (const flow of flows) {
      out.push(`  - name: ${yamlScalar(flow.name)}`)
      if (flow.description?.trim()) out.push(`    description: ${yamlBlock(flow.description, 6)}`)
      const body = flow.steps.length > 0
        ? buildSequenceBodyFromSteps(flow.steps, dag)
        : parseFlowSteps(flow.mermaidDsl ?? '', dag).length > 0
          ? (flow.mermaidDsl ?? '')
          : ''
      if (body.trim()) {
        const diagram = `sequenceDiagram\n${body}`
        out.push(`    diagram: ${yamlBlock(diagram, 6)}`)
      }
    }
  }

  return out.join('\n') + '\n'
}

export function downloadDagAsYaml(dag: Dag): void {
  const content = exportDagAsYaml(dag)
  const blob = new Blob([content], { type: 'text/yaml' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${dag.name.replace(/[^\w\s-]/g, '').trim()}.dag.yaml`
  a.click()
  URL.revokeObjectURL(url)
}
