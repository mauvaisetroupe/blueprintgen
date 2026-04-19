/**
 * drawioExporter — génère un fichier .drawio (XML mxGraphModel) depuis le landscape.
 *
 * Stratégie (Mode B) :
 *   1. On rend le DSL Mermaid en SVG via Mermaid.js (Dagre, sans ELK)
 *   2. On parse le SVG pour extraire les positions/tailles des nodes et clusters
 *      en utilisant les attributs id (fiables, dérivés du DSL) plutôt que du hit-test
 *   3. On génère le XML mxGraphModel avec :
 *      - Une mxCell "swimlane" par catégorie visible (showSubgraph=true)
 *      - Une mxCell "vertex" par composant (position relative au swimlane si applicable)
 *      - Une mxCell "edge" par relation (routing automatique draw.io)
 *   4. On télécharge le .drawio
 *
 * Pourquoi Dagre (useElk: false) pour l'export :
 *   - ELK produit un layout différent selon la version ; Dagre est plus stable pour
 *     la correspondance SVG → coordonnées mxGeometry
 *   - draw.io a son propre moteur de layout et peut re-layouter à la demande
 */

import mermaid from 'mermaid'
import type { Dag } from '@/types/dag'
import { generateLandscapeDsl, toNodeId } from './landscapeDslGenerator'
import { injectHtmlLabelsFalse } from './svgInliner'
import { collectAllFlowRelations } from './sequenceDslGenerator'

// Hauteur du titre dans un swimlane draw.io (startSize par défaut)
const SWIMLANE_TITLE_H = 30

interface Bounds { x: number; y: number; w: number; h: number }

// ─── SVG parsing ──────────────────────────────────────────────────────────────

function parseTranslate(transform: string | null): { x: number; y: number } {
  if (!transform) return { x: 0, y: 0 }
  const m = transform.match(/translate\(\s*([\d.+-]+)[\s,]+([\d.+-]+)\s*\)/)
  return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 }
}

/**
 * Extrait les bounds (top-left + w/h en coordonnées SVG absolues) de chaque node.
 * Clé : nodeId (= toNodeId(component.name)), dérivé de l'id SVG "flowchart-{nodeId}-{n}".
 */
function parseNodeBounds(svg: Element): Map<string, Bounds> {
  const result = new Map<string, Bounds>()

  // Mermaid v11 préfixe l'id du diagramme : "{diagramId}-flowchart-{nodeId}-{n}"
  svg.querySelectorAll<SVGGElement>('g.node[id*="-flowchart-"]').forEach((g) => {
    const rawId = g.getAttribute('id') ?? ''
    // "{diagramId}-flowchart-api_backend-3" → "api_backend"
    const nodeId = rawId.replace(/^.*-flowchart-/, '').replace(/-\d+$/, '')

    const { x: cx, y: cy } = parseTranslate(g.getAttribute('transform'))

    // Le premier <rect> enfant est la boîte du composant.
    // Ses attributs x/y sont relatifs au centre du nœud (valeurs négatives = -w/2, -h/2).
    const rect = g.querySelector<SVGRectElement>(':scope > rect, rect.basic, rect.label-container')
                 ?? g.querySelector<SVGRectElement>('rect')
    if (!rect) return

    const w  = parseFloat(rect.getAttribute('width')  ?? '0')
    const h  = parseFloat(rect.getAttribute('height') ?? '0')
    const rx = parseFloat(rect.getAttribute('x')      ?? '0')  // ≈ -w/2
    const ry = parseFloat(rect.getAttribute('y')      ?? '0')  // ≈ -h/2

    result.set(nodeId, { x: cx + rx, y: cy + ry, w, h })
  })

  return result
}

interface ClusterBounds extends Bounds {
  labelH: number   // hauteur réelle du titre dans le SVG Mermaid
}

/**
 * Extrait les bounds des clusters (subgraphs) Mermaid.
 * Clé : label du cluster = category.name (texte visible dans le SVG).
 * labelH = hauteur de la zone titre dans le SVG (utilisée pour l'offset draw.io).
 */
function parseClusterBounds(svg: Element): Map<string, ClusterBounds> {
  const result = new Map<string, ClusterBounds>()

  svg.querySelectorAll<SVGGElement>('g.cluster').forEach((g) => {
    // Label : htmlLabels:false → <text>, htmlLabels:true → foreignObject/div
    const textEl  = g.querySelector<SVGTextElement>('text')
    const divEl   = g.querySelector<HTMLElement>('foreignObject div, p')
    const label   = textEl?.textContent?.trim() ?? divEl?.textContent?.trim() ?? ''
    if (!label) return

    // Le cluster peut avoir un transform ou non — on l'ajoute aux coords du rect
    const { x: tx, y: ty } = parseTranslate(g.getAttribute('transform'))

    const rect = g.querySelector<SVGRectElement>('rect')
    if (!rect) return

    const x = tx + parseFloat(rect.getAttribute('x')      ?? '0')
    const y = ty + parseFloat(rect.getAttribute('y')      ?? '0')
    const w =      parseFloat(rect.getAttribute('width')  ?? '0')
    const h =      parseFloat(rect.getAttribute('height') ?? '0')

    // Hauteur réelle du titre : position du groupe .cluster-label dans le SVG
    const labelGroup = g.querySelector<SVGGElement>('.cluster-label')
    let labelH = 30  // fallback draw.io default
    if (labelGroup) {
      const { y: ly } = parseTranslate(labelGroup.getAttribute('transform'))
      const labelText = labelGroup.querySelector<SVGTextElement>('text')
      const textH = labelText
        ? parseFloat(labelText.getAttribute('font-size') ?? labelText.getBoundingClientRect?.()?.height?.toString() ?? '16') * 1.4
        : 20
      // ly = offset depuis le haut du cluster vers le centre du label
      // → hauteur occupée = ly + textH/2 + quelques px de padding
      labelH = Math.max(20, Math.round(ly + textH / 2 + 8))
    }

    result.set(label, { x, y, w, h, labelH })
  })

  return result
}

// ─── Génération XML draw.io ───────────────────────────────────────────────────

function xmlEsc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function px(n: number): string {
  return Math.round(n).toString()
}

function buildDrawioXml(
  dag: Dag,
  nodeBounds: Map<string, Bounds>,
  clusterBounds: Map<string, ClusterBounds>,
): string {
  const cells: string[] = []
  cells.push('<mxCell id="0" />')
  cells.push('<mxCell id="1" parent="0" />')

  // Catégorie → bounds du cluster SVG
  const catCluster = new Map<string, ClusterBounds>()
  for (const cat of dag.categories) {
    const cb = clusterBounds.get(cat.name)
    if (cb) catCluster.set(cat.id, cb)
  }

  // ── Swimlanes (catégories avec showSubgraph) ─────────────────────────────
  const sortedCats = [...dag.categories].sort((a, b) => a.order - b.order)
  for (const cat of sortedCats) {
    if (!cat.showSubgraph) continue
    const cb = catCluster.get(cat.id)
    if (!cb) continue
    const hasNodes = dag.components.some(
      (c) => c.categoryId === cat.id && nodeBounds.has(toNodeId(c.name)),
    )
    if (!hasNodes) continue

    cells.push(
      `<mxCell id="cat_${cat.id}" value="${xmlEsc(cat.name)}" ` +
      `style="rounded=1;whiteSpace=wrap;html=1;verticalAlign=top;fontStyle=1;` +
      `container=1;collapsible=0;fillColor=#dae8fc;strokeColor=#6c8ebf;" ` +
      `vertex="1" parent="1">` +
      `<mxGeometry x="${px(cb.x)}" y="${px(cb.y)}" width="${px(cb.w)}" height="${px(cb.h)}" as="geometry" />` +
      `</mxCell>`,
    )
  }

  // ── Composants (vertices) ────────────────────────────────────────────────
  for (const comp of dag.components) {
    const nodeId = toNodeId(comp.name)
    const nb = nodeBounds.get(nodeId)
    if (!nb) continue

    const cat = dag.categories.find((c) => c.id === comp.categoryId)
    const cb  = cat?.showSubgraph ? catCluster.get(comp.categoryId) : undefined

    let parentId = '1'
    let gx = nb.x
    let gy = nb.y

    if (cb) {
      // Position relative à la zone de contenu du swimlane (sous le titre)
      parentId = `cat_${comp.categoryId}`
      gx = nb.x - cb.x
      gy = nb.y - cb.y
    }

    cells.push(
      `<mxCell id="comp_${comp.id}" value="${xmlEsc(comp.name)}" ` +
      `style="rounded=1;whiteSpace=wrap;html=1;" ` +
      `vertex="1" parent="${parentId}">` +
      `<mxGeometry x="${px(gx)}" y="${px(gy)}" width="${px(nb.w)}" height="${px(nb.h)}" as="geometry" />` +
      `</mxCell>`,
    )
  }

  // ── Relations (edges) ────────────────────────────────────────────────────
  // Source de vérité selon le mode :
  //   guided / manual → dag.relations
  //   autosync        → collectAllFlowRelations (relations calculées depuis les flows)
  const mode = dag.landscape.mode ?? 'guided'
  const relations = mode === 'autosync'
    ? collectAllFlowRelations(dag).map((r, i) => ({
        id: `auto_${i}`,
        fromComponentId: r.fromComponentId,
        toComponentId:   r.toComponentId,
        label:           undefined as string | undefined,
      }))
    : dag.relations

  for (const rel of relations) {
    const fromComp = dag.components.find((c) => c.id === rel.fromComponentId)
    const toComp   = dag.components.find((c) => c.id === rel.toComponentId)
    if (!fromComp || !toComp) continue
    if (!nodeBounds.has(toNodeId(fromComp.name)) || !nodeBounds.has(toNodeId(toComp.name))) continue

    const label = rel.label?.trim() ?? ''
    cells.push(
      `<mxCell id="rel_${rel.id}" value="${xmlEsc(label)}" ` +
      `style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;" ` +
      `edge="1" source="comp_${rel.fromComponentId}" target="comp_${rel.toComponentId}" parent="1">` +
      `<mxGeometry relative="1" as="geometry" />` +
      `</mxCell>`,
    )
  }

  const body = cells.map((c) => `    ${c}`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<mxGraphModel>\n  <root>\n${body}\n  </root>\n</mxGraphModel>`
}

// ─── DSL à utiliser pour l'extraction de positions ────────────────────────────

/**
 * Résout le DSL landscape sans ELK (Dagre standard) pour l'extraction SVG.
 * Respecte le mode (guided/autosync/manual) mais force Dagre pour la stabilité
 * des coordonnées → mxGeometry.
 */
function resolveDslForDrawio(dag: Dag): string {
  const mode = dag.landscape.mode ?? 'guided'

  if (mode === 'manual' && dag.landscape.mermaidDsl?.trim()) {
    // On garde le DSL manuel mais on supprime la ligne ELK si présente
    return dag.landscape.mermaidDsl
      .split('\n')
      .filter((l) => !l.trim().startsWith('layout:') || !l.includes('elk'))
      .join('\n')
  }

  if (mode === 'autosync') {
    return generateLandscapeDsl(dag, { useElk: false }, collectAllFlowRelations(dag))
  }

  return generateLandscapeDsl(dag, { useElk: false })
}

// ─── Point d'entrée public ────────────────────────────────────────────────────

export async function exportToDrawio(dag: Dag): Promise<void> {
  const dsl = resolveDslForDrawio(dag)
  const id  = `drawio-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const { svg: svgString } = await mermaid.render(id, injectHtmlLabelsFalse(dsl))

  const div = document.createElement('div')
  div.innerHTML = svgString
  const svgEl = div.querySelector('svg')!

  // Debug — à supprimer après validation
  console.log('[drawio] SVG snippet:', svgString.slice(0, 800))
  console.log('[drawio] g.node count:', svgEl.querySelectorAll('g.node').length)
  console.log('[drawio] g[id^=flowchart] count:', svgEl.querySelectorAll('g[id^="flowchart-"]').length)
  console.log('[drawio] g.cluster count:', svgEl.querySelectorAll('g.cluster').length)
  console.log('[drawio] All g ids:', [...svgEl.querySelectorAll('g[id]')].map(g => g.id).slice(0, 20))

  const nodeBounds    = parseNodeBounds(svgEl)
  const clusterBounds = parseClusterBounds(svgEl)

  console.log('[drawio] nodeBounds:', [...nodeBounds.entries()])
  console.log('[drawio] clusterBounds:', [...clusterBounds.entries()])

  const xml  = buildDrawioXml(dag, nodeBounds, clusterBounds)
  const blob = new Blob([xml], { type: 'application/xml' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${dag.name.replace(/[^\w\s-]/g, '').trim()}.drawio`
  a.click()
  URL.revokeObjectURL(url)
}
