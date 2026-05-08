import type { Dag } from '@/types/dag'
import { allNetworkZones, allCategories } from '@/types/dag'
import { toNodeId } from '@/utils/landscapeDslGenerator'
import { buildSequenceBodyFromSteps, parseFlowSteps } from '@/utils/sequenceDslGenerator'

// ── YAML string helpers ───────────────────────────────────────────────────────

function yamlScalar(value: string): string {
  if (!value) return '""'
  if (/[:#\[\]{}&*!|>'"@`]/.test(value) || value.trim() !== value || value.startsWith('-')) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return value
}

function yamlBlock(value: string, indent: number): string {
  const pad = ' '.repeat(indent)
  const lines = value.trimEnd().split('\n')
  const indented = lines.map((l) => (l.trim() === '' ? '' : `${pad}${l}`)).join('\n')
  return `|\n${indented}`
}

// ── Arrow-only landscape (no subgraphs, no node declarations) ─────────────────

function generateLandscapeArrows(dag: Dag): string {
  const appComps = dag.components.filter((c) => c.name.trim())
  const validIds = new Set(appComps.map((c) => c.id))
  const arrows = dag.relations
    .filter((r) => validIds.has(r.fromComponentId) && validIds.has(r.toComponentId))
    .map((rel) => {
      const from  = appComps.find((c) => c.id === rel.fromComponentId)!
      const to    = appComps.find((c) => c.id === rel.toComponentId)!
      const label = [rel.protocol, rel.label].filter(Boolean).join(' — ')
      const fId   = toNodeId(from.name)
      const tId   = toNodeId(to.name)
      return label ? `${fId} -->|${label}| ${tId}` : `${fId} --> ${tId}`
    })
    .join('\n')
  return `flowchart TB\n${arrows}`
}

// ── Arrow-only technical landscape (component-level, no zone/instance info) ───

function generateTechnicalLandscapeArrows(dag: Dag): string {
  const allComps = [...dag.components, ...(dag.technicalComponents ?? [])]
  const arrows = (dag.technicalLandscape.technicalRelations ?? [])
    .map((rel) => {
      const from  = allComps.find((c) => c.id === rel.fromComponentId)
      const to    = allComps.find((c) => c.id === rel.toComponentId)
      if (!from || !to) return null
      const label = [rel.protocol, rel.label].filter(Boolean).join(' — ')
      const fId   = toNodeId(from.name)
      const tId   = toNodeId(to.name)
      return label ? `${fId} -->|${label}| ${tId}` : `${fId} --> ${tId}`
    })
    .filter((l): l is string => l !== null)
    .join('\n')
  return `flowchart TB\n${arrows}`
}

// ── Component entry block ─────────────────────────────────────────────────────

function componentEntryLines(
  comp: { name: string; description?: string; technology?: string; framework?: string; constraints?: string },
  catName: string | undefined,
  zoneNames: string[],
  keyIndent: number,
): string[] {
  const ki    = ' '.repeat(keyIndent)
  const lines: string[] = []
  lines.push(`${ki}name: ${yamlScalar(comp.name)}`)
  if (catName) lines.push(`${ki}category: ${yamlScalar(catName)}`)
  if (zoneNames.length > 0) lines.push(`${ki}zones: [${zoneNames.map(yamlScalar).join(', ')}]`)
  if (comp.description?.trim()) lines.push(`${ki}description: ${yamlBlock(comp.description, keyIndent + 2)}`)
  if (comp.technology?.trim())  lines.push(`${ki}technology: ${yamlScalar(comp.technology)}`)
  if (comp.framework?.trim())   lines.push(`${ki}framework: ${yamlScalar(comp.framework)}`)
  if (comp.constraints?.trim()) lines.push(`${ki}constraints: ${yamlBlock(comp.constraints, keyIndent + 2)}`)
  return lines
}

// ── Main export ───────────────────────────────────────────────────────────────

export function exportDagAsYaml(dag: Dag): string {
  const out: string[] = []

  const zones    = allNetworkZones(dag.technicalLandscape)
  const allCats  = allCategories(dag).sort((a, b) => a.order - b.order)
  const appComps = dag.components.filter((c) => c.name.trim())
  const techComps = (dag.technicalComponents ?? []).filter((c) => c.name.trim())

  // DAG metadata
  out.push(`name: ${yamlScalar(dag.name)}`)
  if (dag.description?.trim()) out.push(`description: ${yamlBlock(dag.description, 2)}`)

  // Categories — only those actually used by at least one component
  const usedCatIds = new Set([...appComps, ...techComps].map((c) => c.categoryId).filter(Boolean))
  const usedCats   = allCats.filter((c) => usedCatIds.has(c.id))
  if (usedCats.length > 0) {
    out.push('')
    out.push('categories:')
    for (const cat of usedCats) out.push(`  - ${yamlScalar(cat.name)}`)
  }

  // Network zones — only those used in at least one instance
  const usedZoneIds = new Set(dag.technicalLandscape.instances.map((i) => i.networkZoneId))
  const usedZones   = zones.filter((z) => usedZoneIds.has(z.id))
  if (usedZones.length > 0) {
    out.push('')
    out.push('network-zones:')
    for (const zone of usedZones) out.push(`  - ${yamlScalar(zone.name)}`)
  }

  // Application components
  if (appComps.length > 0) {
    out.push('')
    out.push('components:')
    for (const comp of appComps) {
      const cat       = allCats.find((c) => c.id === comp.categoryId)
      const zoneIds   = dag.technicalLandscape.instances.filter((i) => i.componentId === comp.id).map((i) => i.networkZoneId)
      const zoneNames = zones.filter((z) => zoneIds.includes(z.id)).map((z) => z.name)
      out.push(`  ${toNodeId(comp.name)}:`)
      out.push(...componentEntryLines(comp, cat?.name, zoneNames, 4))
    }
  }

  // Technical components
  if (techComps.length > 0) {
    out.push('')
    out.push('technical-components:')
    for (const comp of techComps) {
      const cat       = allCats.find((c) => c.id === comp.categoryId)
      const zoneIds   = dag.technicalLandscape.instances.filter((i) => i.componentId === comp.id).map((i) => i.networkZoneId)
      const zoneNames = zones.filter((z) => zoneIds.includes(z.id)).map((z) => z.name)
      out.push(`  ${toNodeId(comp.name)}:`)
      out.push(...componentEntryLines(comp, cat?.name, zoneNames, 4))
    }
  }

  // Technical services (cross-cutting, no category/zones)
  const services = (dag.technicalLandscape.technicalServices ?? []).filter((s) => s.name.trim())
  if (services.length > 0) {
    out.push('')
    out.push('technical-services:')
    for (const svc of services) {
      out.push(`  ${toNodeId(svc.name)}:`)
      out.push(`    name: ${yamlScalar(svc.name)}`)
      if (svc.description?.trim()) out.push(`    description: ${yamlBlock(svc.description, 6)}`)
    }
  }

  // Application landscape — arrows only
  const landscapeArrows = generateLandscapeArrows(dag)
  out.push('')
  out.push(`landscape: ${yamlBlock(landscapeArrows || '%% no relations yet', 2)}`)

  // Technical landscape — arrows only (only if there is technical content)
  const tl = dag.technicalLandscape
  const hasTechContent =
    tl.instances.length > 0 ||
    (tl.technicalRelations?.length ?? 0) > 0 ||
    (tl.technicalServices?.length ?? 0) > 0
  if (hasTechContent) {
    const techArrows = generateTechnicalLandscapeArrows(dag)
    out.push('')
    out.push(`technical-landscape: ${yamlBlock(techArrows || '%% no relations yet', 2)}`)
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
        out.push(`    diagram: ${yamlBlock(`sequenceDiagram\n${body}`, 6)}`)
      }
    }
  }

  return out.join('\n') + '\n'
}

export function downloadDagAsYaml(dag: Dag): void {
  const content = exportDagAsYaml(dag)
  const blob    = new Blob([content], { type: 'text/yaml' })
  const url     = URL.createObjectURL(blob)
  const a       = document.createElement('a')
  a.href        = url
  a.download    = `${dag.name.replace(/[^\w\s-]/g, '').trim()}.dag.yaml`
  a.click()
  URL.revokeObjectURL(url)
}
