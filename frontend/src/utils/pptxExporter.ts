import PptxGenJS from 'pptxgenjs'
import mermaid from 'mermaid'
import type { Dag, ApplicationFlow } from '@/types/dag'
import { generateLandscapeDsl } from './landscapeDslGenerator'
import { buildSequenceDsl, buildActivityDsl } from './sequenceDslGenerator'
import { inlineSvgStyles, injectHtmlLabelsFalse } from './svgInliner'
import { extractSequenceStepPositions, extractActivityStepPositions, addNumberOverlays } from './pptxSequenceOverlay'

// Widescreen 13.33" × 7.5"
const SLIDE_W = 13.33
const SLIDE_H = 7.5

// Corporate colours (neutral — adapt to template later)
const COLOR_TITLE_BG  = '1F3864'   // dark blue (landscape title bar)
const COLOR_TITLE_FG  = 'FFFFFF'
const COLOR_ACCENT    = '2D6FBF'   // blue for circled digits
const COLOR_LABEL     = '888888'   // grey for section labels
const COLOR_RULE      = 'BBBBBB'   // light grey for section rules

// ─── Mermaid → PNG via canvas ────────────────────────────────────────────────
//
// Strategy: SVG → canvas → PNG data URL.
// Why canvas instead of embedding SVG directly in PowerPoint:
//   • PowerPoint's SVG renderer ignores <style> blocks → CSS variables unresolved
//     → black cluster backgrounds, missing colours.
//   • Even with inlined styles, PowerPoint's renderer drops some SVG features
//     (e.g. some path/marker combinations used by Mermaid for arrows).
//   • Canvas rasterises exactly what the browser sees → pixel-perfect in PPT.
//
// Why htmlLabels: false is required:
//   • Mermaid flowcharts use <foreignObject> for node labels by default.
//   • Drawing an SVG containing <foreignObject> to a canvas taints it
//     (security restriction) → toDataURL() throws SecurityError.
//   • htmlLabels: false makes Mermaid use SVG <text> elements instead.
//   • Sequence diagrams already use <text> natively → unaffected.
//
// Resolution: 2× for crisp rendering on high-DPI screens.

const PNG_SCALE = 2

// Mermaid SVGs often have width/height as percentages or rely on max-width CSS,
// making img.naturalWidth unreliable (returns a small default like 0 or 100).
// This causes the canvas to be too small and only the top-left corner is drawn.
// Fix: read the viewBox and stamp explicit pixel width/height onto the SVG element.
interface PngResult {
  dataUrl:  string
  naturalW: number   // px — dimensions réelles du SVG source
  naturalH: number
  svgString: string  // SVG inliné avant rasterisation (pour extraction des positions overlay)
}

// Lit le viewBox pour obtenir les dimensions exactes du SVG et pose width/height en px.
// img.naturalWidth est peu fiable sur les SVG avec max-width CSS ou width en %.
function normalizeSvgDimensions(svgString: string): { svg: string; w: number; h: number } {
  const div = document.createElement('div')
  div.innerHTML = svgString
  const el = div.querySelector('svg')
  if (!el) return { svg: svgString, w: 1200, h: 700 }

  let w = 0, h = 0
  const vb = el.getAttribute('viewBox')
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number)
    if (parts.length >= 4 && (parts[2] ?? 0) > 0 && (parts[3] ?? 0) > 0) {
      w = parts[2] ?? 0; h = parts[3] ?? 0
    }
  }
  if (!w || !h) {
    w = parseFloat(el.getAttribute('width')  ?? '0') || 1200
    h = parseFloat(el.getAttribute('height') ?? '0') || 700
  }
  el.setAttribute('width',  String(w))
  el.setAttribute('height', String(h))
  el.style.maxWidth = ''
  return { svg: el.outerHTML, w, h }
}

function svgToPng(svgString: string): Promise<PngResult> {
  const { svg: normalized, w: naturalW, h: naturalH } = normalizeSvgDimensions(svgString)
  return new Promise((resolve, reject) => {
    const b64 = btoa(unescape(encodeURIComponent(normalized)))
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth  || naturalW
      const h = img.naturalHeight || naturalH
      const canvas = document.createElement('canvas')
      canvas.width  = w * PNG_SCALE
      canvas.height = h * PNG_SCALE
      const ctx = canvas.getContext('2d')!
      ctx.scale(PNG_SCALE, PNG_SCALE)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0)
      try {
        resolve({ dataUrl: canvas.toDataURL('image/png'), naturalW: w, naturalH: h, svgString })
      } catch (e) {
        reject(new Error(`Canvas tainted — SVG may contain cross-origin resources: ${e}`))
      }
    }
    img.onerror = (e) => reject(new Error(`Failed to load SVG into Image element: ${e}`))
    img.src = `data:image/svg+xml;base64,${b64}`
  })
}

async function renderMermaidToPng(dsl: string): Promise<PngResult> {
  const id = `pptx-mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const { svg } = await mermaid.render(id, injectHtmlLabelsFalse(dsl))
  return svgToPng(inlineSvgStyles(svg))
}

// Calcule les coordonnées exactes (en pouces) pour placer une image de naturalW×naturalH px
// dans le rectangle disponible, ratio préservé.
// vAlign: 'center' (défaut) ou 'top' (aligne en haut, pas de marge verticale)
function containRect(
  naturalW: number, naturalH: number,
  anchorX: number, anchorY: number,
  availW: number,  availH: number,
  vAlign: 'center' | 'top' = 'center',
): { x: number; y: number; w: number; h: number } {
  const scale = Math.min(availW / naturalW, availH / naturalH)
  const w = naturalW * scale
  const h = naturalH * scale
  return {
    x: anchorX + (availW - w) / 2,
    y: vAlign === 'top' ? anchorY : anchorY + (availH - h) / 2,
    w,
    h,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Retourne les labels de bullets depuis flow.steps (source de vérité).
// Fallback DSL si steps vide (anciens DAGs non migrés).
function extractFlowSteps(flow: ApplicationFlow, dag: Dag): string[] {
  const steps = flow.steps.length > 0
    ? flow.steps
    : (() => {
        const REQUEST_ARROW = /^([a-zA-Z_]\w*)\s*(->>[\+\-]?|-x|->[\+\-]?)\s*([a-zA-Z_]\w*)\s*:\s*(.+)$/
        return (flow.mermaidDsl ?? '').split('\n').flatMap((raw) => {
          const m = raw.trim().match(REQUEST_ARROW)
          return m ? [{ fromComponentId: m[1] ?? '', toComponentId: m[3] ?? '', label: (m[4] ?? '').trim(), id: '', order: 0, isReturn: false }] : []
        })
      })()

  return steps.filter((s) => !s.isReturn).map((s) => {
    const from = dag.components.find((c) => c.id === s.fromComponentId)?.name ?? s.fromComponentId
    const to   = dag.components.find((c) => c.id === s.toComponentId)?.name   ?? s.toComponentId
    return `${from} → ${to}: ${s.label}`
  })
}

// ─── Slide builders ───────────────────────────────────────────────────────────

function addTitleBar(slide: PptxGenJS.Slide, title: string) {
  slide.addShape('rect', {
    x: 0, y: 0, w: SLIDE_W, h: 0.55,
    fill: { color: COLOR_TITLE_BG },
    line: { color: COLOR_TITLE_BG },
  })
  slide.addText(title, {
    x: 0.3, y: 0, w: SLIDE_W - 0.6, h: 0.55,
    fontSize: 18, bold: true,
    color: COLOR_TITLE_FG,
    valign: 'middle',
  })
}

function resolveLandscapeDsl(dag: Dag): string {
  return generateLandscapeDsl(dag)
}

async function addLandscapeSlide(pptx: PptxGenJS, dag: Dag) {
  const slide = pptx.addSlide()
  addTitleBar(slide, dag.name + ' — Application Landscape')

  const dsl = resolveLandscapeDsl(dag)
  const { dataUrl, naturalW, naturalH } = await renderMermaidToPng(dsl)

  const anchorX = 0.2,  anchorY = 0.6
  const availW  = SLIDE_W - 0.4, availH = SLIDE_H - anchorY - 0.1
  const pos = containRect(naturalW, naturalH, anchorX, anchorY, availW, availH)
  slide.addImage({ data: dataUrl, ...pos })
}

// Unicode circled digits ①–⑳
const CIRCLED_DIGITS = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩',
                        '⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳']

// Préfixe chaque label de flèche forward (->>, -x, ->) avec le caractère cerclé correspondant.
// Les flèches retour (->>) ne sont pas numérotées.
// Utilisé uniquement pour le rendu PPTX — le DSL original n'est pas modifié.
const FORWARD_ARROW_RE = /^([a-zA-Z_]\w*)\s*(->>[\+\-]?|-x|->[\+\-]?)\s*([a-zA-Z_]\w*)\s*:\s*(.+)$/

function numberForwardArrows(dslBody: string): string {
  let idx = 0
  return dslBody.split('\n').map((line) => {
    const m = line.trim().match(FORWARD_ARROW_RE)
    if (!m) return line
    const circle = CIRCLED_DIGITS[idx++] ?? `${idx}.`
    // Préserve l'indentation d'origine
    const indent = line.match(/^(\s*)/)?.[1] ?? ''
    return `${indent}${m[1]} ${m[2]} ${m[3]}: ${circle} ${m[4]}`
  }).join('\n')
}

function addSectionHeader(
  slide: PptxGenJS.Slide,
  label: string,
  x: number, y: number, w: number,
) {
  const labelH = 0.28
  const ruleH  = 0.018
  slide.addText(label, {
    x, y, w, h: labelH,
    fontSize: 12, bold: true, color: COLOR_LABEL,
    valign: 'bottom',
  })
  slide.addShape('rect', {
    x, y: y + labelH, w, h: ruleH,
    fill: { color: COLOR_RULE },
    line: { color: COLOR_RULE },
  })
  return labelH + ruleH  // height consumed
}

async function addFlowSlide(pptx: PptxGenJS, dag: Dag, flow: ApplicationFlow) {
  const flowName        = flow.name
  const flowDescription = flow.description ?? ''
  const flowBody        = flow.mermaidDsl  ?? ''
  const slide = pptx.addSlide()
  addTitleBar(slide, flowName)

  // ── Layout ──────────────────────────────────────────────────────────────────
  const PAD    = 0.3
  const SPLIT  = 0.60
  const leftX  = PAD
  const leftW  = SLIDE_W * SPLIT - PAD
  const rightX = SLIDE_W * SPLIT + PAD * 0.5
  const rightW = SLIDE_W - rightX - PAD

  // ── Section headers ──────────────────────────────────────────────────────
  const headerY  = 0.65
  const consumed = addSectionHeader(slide, 'Conceptual view of the target Architecture', leftX,  headerY, leftW)
                   addSectionHeader(slide, 'Description',                                rightX, headerY, rightW)

  // ── Content area (below section headers) ────────────────────────────────
  const contentY = headerY + consumed + 0.12
  const contentH = SLIDE_H - contentY - 0.15

  // ── Sequence ou Activity diagram selon les préférences sauvegardées ──────
  const fv         = dag.flowsView ?? {}
  const isActivity = fv.diagramMode === 'activity'
  const fullDsl    = isActivity
    ? buildActivityDsl(
        flowBody, dag,
        fv.useElk          ?? true,
        new Set(fv.subgraphCategoryIds ?? dag.categories.map((c) => c.id)),
        fv.showReturns     ?? false,
      )
    : buildSequenceDsl(numberForwardArrows(flowBody), dag)
  const { dataUrl, naturalW, naturalH, svgString } = await renderMermaidToPng(fullDsl)
  const pos = containRect(naturalW, naturalH, leftX, contentY, leftW, contentH, 'top')
  slide.addImage({ data: dataUrl, ...pos })

  // Overlay des numéros cerclés (sequence ou activity)
  if (flow.steps.length > 0) {
    const forwardSteps = flow.steps.filter((s) => !s.isReturn)
    const positions = isActivity
      ? extractActivityStepPositions(svgString, forwardSteps.length)
      : extractSequenceStepPositions(svgString, flow.steps)
    addNumberOverlays(slide, positions, naturalW, naturalH, pos)
  }

  // ── Description + numbered steps — right panel ───────────────────────────
  const rows: PptxGenJS.TextProps[] = []

  if (flowDescription.trim()) {
    rows.push({
      text: flowDescription.trim() + '\n\n',
      options: { bold: true, fontSize: 12, color: '1A1A1A' },
    })
  }

  const steps = extractFlowSteps(flow, dag)
  for (let i = 0; i < steps.length; i++) {
    const circle = CIRCLED_DIGITS[i] ?? `${i + 1}.`
    rows.push({
      text: `${circle}  `,
      options: { bold: true, color: COLOR_ACCENT, fontSize: 11 },
    })
    rows.push({
      text: steps[i] + '\n',
      options: { bold: false, color: '333333', fontSize: 11 },
    })
  }

  if (rows.length > 0) {
    slide.addText(rows, {
      x: rightX, y: contentY, w: rightW, h: contentH,
      valign: 'top', wrap: true, lineSpacingMultiple: 1.4,
    })
  }
}

// ─── Main export entry point ──────────────────────────────────────────────────

export async function exportToPptx(dag: Dag): Promise<void> {
  const pptx = new PptxGenJS()
  pptx.layout  = 'LAYOUT_WIDE'   // 13.33" × 7.5"
  pptx.title   = dag.name
  pptx.subject = 'Application Architecture'

  // 1. Landscape slide
  await addLandscapeSlide(pptx, dag)

  // 2. One slide per application flow
  for (const flow of dag.applicationFlows) {
    if (!flow.mermaidDsl?.trim()) continue
    await addFlowSlide(pptx, dag, flow)
  }

  await pptx.writeFile({ fileName: `${dag.name.replace(/[^\w\s-]/g, '').trim()}.pptx` })
}
