import PptxGenJS from 'pptxgenjs'
import mermaid from 'mermaid'
import type { Dag } from '@/types/dag'
import { generateLandscapeDsl } from './landscapeDslGenerator'
import { buildSequenceDsl, collectAllFlowRelations } from './sequenceDslGenerator'
import { inlineSvgStyles, injectHtmlLabelsFalse } from './svgInliner'

// Widescreen 13.33" × 7.5"
const SLIDE_W = 13.33
const SLIDE_H = 7.5

// Corporate colours (neutral — adapt to template later)
const COLOR_TITLE_BG  = '1F3864'   // dark blue
const COLOR_TITLE_FG  = 'FFFFFF'
const COLOR_ACCENT    = 'F5C400'   // yellow for step bullets

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
    if (parts.length >= 4 && parts[2] > 0 && parts[3] > 0) {
      w = parts[2]; h = parts[3]
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
        resolve({ dataUrl: canvas.toDataURL('image/png'), naturalW: w, naturalH: h })
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
// dans le rectangle disponible (anchorX, anchorY, availW, availH), centrée, ratio préservé.
function containRect(
  naturalW: number, naturalH: number,
  anchorX: number, anchorY: number,
  availW: number,  availH: number,
): { x: number; y: number; w: number; h: number } {
  const scale = Math.min(availW / naturalW, availH / naturalH)
  const w = naturalW * scale
  const h = naturalH * scale
  return {
    x: anchorX + (availW - w) / 2,
    y: anchorY + (availH - h) / 2,
    w,
    h,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Extracts forward-arrow steps from a sequence body DSL
// Returns strings like "A → B: label"
function extractFlowSteps(body: string): string[] {
  const REQUEST_ARROW = /^([a-zA-Z_]\w*)\s*(->>[\+\-]?|-x|->[\+\-]?)\s*([a-zA-Z_]\w*)\s*:\s*(.+)$/
  const steps: string[] = []
  for (const raw of body.split('\n')) {
    const m = raw.trim().match(REQUEST_ARROW)
    if (m) steps.push(`${m[1]} → ${m[3]}: ${m[4].trim()}`)
  }
  return steps
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
  const mode   = dag.landscape.mode   ?? 'guided'
  const useElk = dag.landscape.useElk ?? false

  if (mode === 'manual' && dag.landscape.mermaidDsl?.trim()) {
    // Stored DSL may be body-only or full DSL — ensure it has a header
    const stored = dag.landscape.mermaidDsl.trim()
    if (stored.startsWith('---') || /^(?:flowchart|graph)\s/m.test(stored)) {
      return stored
    }
    return `---\nconfig:\n    theme: neutral\n---\n\nflowchart TB\n${stored}`
  }

  if (mode === 'autosync') {
    return generateLandscapeDsl(dag, { useElk }, collectAllFlowRelations(dag))
  }

  // guided (default)
  return generateLandscapeDsl(dag, { useElk })
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

async function addFlowSlide(pptx: PptxGenJS, dag: Dag, flowName: string, flowBody: string) {
  const slide = pptx.addSlide()
  addTitleBar(slide, flowName)

  const fullDsl = buildSequenceDsl(flowBody, dag)
  const { dataUrl, naturalW, naturalH } = await renderMermaidToPng(fullDsl)

  const contentY = 0.65
  const contentH = SLIDE_H - contentY - 0.1
  const imgW     = SLIDE_W * 0.63
  const bulletsX = imgW + 0.4
  const bulletsW = SLIDE_W - bulletsX - 0.2

  // Sequence diagram — left panel, ratio préservé
  const pos = containRect(naturalW, naturalH, 0.15, contentY, imgW, contentH)
  slide.addImage({ data: dataUrl, ...pos })

  // Numbered steps — right panel
  const steps = extractFlowSteps(flowBody)
  if (steps.length > 0) {
    const bulletRows: PptxGenJS.TextProps[] = steps.flatMap((step, i) => [
      {
        text: `${i + 1}. `,
        options: { bold: true, color: COLOR_ACCENT, fontSize: 11 },
      },
      {
        text: step + '\n',
        options: { bold: false, color: '333333', fontSize: 11 },
      },
    ])
    slide.addText(bulletRows, {
      x: bulletsX, y: contentY, w: bulletsW, h: contentH,
      valign: 'top',
      wrap: true,
      lineSpacingMultiple: 1.3,
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
    await addFlowSlide(pptx, dag, flow.name, flow.mermaidDsl)
  }

  await pptx.writeFile({ fileName: `${dag.name.replace(/[^\w\s-]/g, '').trim()}.pptx` })
}
